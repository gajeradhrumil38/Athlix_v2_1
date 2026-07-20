import Foundation
import SwiftData
import AthlixCore
import Observation

@Observable
@MainActor
final class DashboardViewModel {
    private(set) var workouts: [Workout] = []
    private(set) var personalRecords: [PersonalRecord] = []
    private(set) var isLoadingWorkouts = false
    private(set) var isLoadingRecords = false
    private(set) var workoutsErrorMessage: String?
    private(set) var recordsErrorMessage: String?

    // Weekly-goal data is deliberately scoped to a fixed Monday-start week, independent of the
    // Date Navigator's `viewMode` (day/week/month) that drives `workouts`/`loadWorkouts`. It is
    // NOT cached in SwiftData like `workouts`/`personalRecords` -- a single week-scoped fetch is
    // cheap, and (unlike the main dashboard range) is expected to change every time a set is
    // logged, so an offline cache would mostly just serve stale goal-progress data. Judgment call
    // per Task 6 spec: skip a dedicated cache model here.
    private(set) var weeklyGoalWorkouts: [Workout] = []
    private(set) var weeklyGoalReferenceDate: Date = Date()

    private(set) var profile: Profile?
    private(set) var exercisesInRange: [ExerciseSet] = []

    // Stored, not computed: MuscleLoadCalculator.loadBySlug (via
    // ExerciseMuscleMapper.profile(forExerciseName:)) recompiles several regexes per call with no
    // internal caching. This @Observable class is read by SwiftUI, which may re-evaluate computed
    // properties on every render pass -- so this is populated ONCE per data reload (in
    // recomputeMuscleLoad(), called from loadExercisesInRange()) rather than a `var { ... }` block
    // that would silently redo that expensive work on every access.
    private(set) var muscleLoadBySlug: [String: Double] = [:]

    private(set) var goalDays: Int

    // Generation token for Date Navigator reload cancellation-safety (Task 9 code review fix).
    // Owned HERE, not by the View, because the race this guards against is a mutation race
    // INSIDE each load method (see beginReload() doc comment) -- a View-level generation check
    // run only between awaited steps cannot stop a slower, superseded call from unconditionally
    // overwriting state the instant its own await resolves, since that overwrite happens inside
    // the very step the View is waiting on, not between steps.
    private(set) var reloadGeneration = 0

    private let workoutRepository: WorkoutRepository
    private let personalRecordRepository: PersonalRecordRepository
    private let profileRepository: ProfileRepository
    private let userId: String
    private let modelContext: ModelContext

    private static let goalDaysDefaultsKey = "athlix_weekly_goal_days"

    private static func loadGoalDays() -> Int {
        let stored = UserDefaults.standard.integer(forKey: goalDaysDefaultsKey)
        return (1...7).contains(stored) ? stored : 4
    }

    init(
        workoutRepository: WorkoutRepository,
        personalRecordRepository: PersonalRecordRepository,
        profileRepository: ProfileRepository,
        userId: String,
        modelContext: ModelContext
    ) {
        self.workoutRepository = workoutRepository
        self.personalRecordRepository = personalRecordRepository
        self.profileRepository = profileRepository
        self.userId = userId
        self.modelContext = modelContext
        self.goalDays = Self.loadGoalDays()
    }

    /// Call once at the start of a reload chain (e.g. `DashboardView.reloadData`) to obtain a
    /// token for that chain. Increments the generation so any PRIOR chain's still-in-flight
    /// `load...(generation:)` calls will find their captured token stale the next time they
    /// check it (immediately after their own await, right before their mutation).
    func beginReload() -> Int {
        reloadGeneration += 1
        return reloadGeneration
    }

    /// Reads the SwiftData cache immediately (for instant display), then
    /// fetches fresh data from the network and writes it through to the
    /// cache. Errors are only surfaced if BOTH the cache read produced
    /// nothing AND the network fetch failed -- a stale cache hit is always
    /// preferable to an error state while a background refresh is pending.
    ///
    /// `generation`, when non-nil, must match `reloadGeneration` at the instant the network
    /// fetch resolves, checked immediately before the `workouts =` write below -- that is the
    /// actual race window (see Task 9 code review). `nil` (the default) skips the check
    /// entirely, so direct test/call-site usage that doesn't care about reload cancellation is
    /// unaffected.
    func loadWorkouts(from: Date, to: Date, generation: Int? = nil) async {
        let cachedUserId = userId
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        let fromString = formatter.string(from: from)
        let toString = formatter.string(from: to)

        let cached = (try? modelContext.fetch(
            FetchDescriptor<CachedWorkout>(predicate: #Predicate { workout in
                workout.userId == cachedUserId && workout.date >= fromString && workout.date <= toString
            })
        )) ?? []
        if !cached.isEmpty {
            workouts = cached.map(\.asWorkout)
        }

        isLoadingWorkouts = true
        workoutsErrorMessage = nil
        do {
            let fresh = try await workoutRepository.fetchWorkouts(userId: userId, from: from, to: to)
            if let generation, generation != reloadGeneration { return }
            workouts = fresh
            writeThroughWorkoutsCache(fresh, fromString: fromString, toString: toString)
        } catch {
            if let generation, generation != reloadGeneration { return }
            if workouts.isEmpty {
                workoutsErrorMessage = "Couldn't load workouts."
            }
        }
        isLoadingWorkouts = false
    }

    /// See `loadWorkouts`'s doc comment for the `generation` contract.
    func loadPersonalRecords(generation: Int? = nil) async {
        let cachedUserId = userId
        let cached = (try? modelContext.fetch(
            FetchDescriptor<CachedPersonalRecord>(predicate: #Predicate { $0.userId == cachedUserId })
        )) ?? []
        if !cached.isEmpty {
            personalRecords = cached.map(\.asPersonalRecord)
        }

        isLoadingRecords = true
        recordsErrorMessage = nil
        do {
            let fresh = try await personalRecordRepository.fetchPersonalRecords(userId: userId)
            if let generation, generation != reloadGeneration { return }
            personalRecords = fresh
            writeThroughPersonalRecordsCache(fresh)
        } catch {
            if let generation, generation != reloadGeneration { return }
            if personalRecords.isEmpty {
                recordsErrorMessage = "Couldn't load personal records."
            }
        }
        isLoadingRecords = false
    }

    /// Fetch-then-update-or-insert per record, rather than a blind insert,
    /// since SwiftData's @Attribute(.unique) dedup-on-insert behavior isn't
    /// reliable enough across OS versions to trust for upserts.
    private func writeThroughWorkoutsCache(_ fresh: [Workout], fromString: String, toString: String) {
        let cachedUserId = userId
        let freshIds = Set(fresh.map(\.id))

        for workout in fresh {
            let workoutId = workout.id
            let existing = try? modelContext.fetch(
                FetchDescriptor<CachedWorkout>(predicate: #Predicate { $0.id == workoutId })
            )
            if let match = existing?.first {
                match.title = workout.title
                match.date = workout.date
                match.durationMinutes = workout.durationMinutes
                match.notes = workout.notes
                match.muscleGroups = workout.muscleGroups
                match.createdAt = workout.createdAt
                match.cachedAt = Date()
            } else {
                modelContext.insert(CachedWorkout(from: workout))
            }
        }

        // Evict cached rows in this date range that are no longer present in the
        // fresh network result (handles server-side deletions and prevents the
        // cache from accumulating stale rows within a range we've now confirmed
        // is authoritative).
        let staleInRange = (try? modelContext.fetch(
            FetchDescriptor<CachedWorkout>(predicate: #Predicate { entry in
                entry.userId == cachedUserId && entry.date >= fromString && entry.date <= toString
            })
        )) ?? []
        for entry in staleInRange where !freshIds.contains(entry.id) {
            modelContext.delete(entry)
        }

        try? modelContext.save()
    }

    private func writeThroughPersonalRecordsCache(_ fresh: [PersonalRecord]) {
        for record in fresh {
            let recordId = record.id
            let existing = try? modelContext.fetch(
                FetchDescriptor<CachedPersonalRecord>(predicate: #Predicate { $0.id == recordId })
            )
            if let match = existing?.first {
                match.exerciseName = record.exerciseName
                match.bestWeight = record.bestWeight
                match.bestReps = record.bestReps
                match.achievedDate = record.achievedDate
                match.createdAt = record.createdAt
                match.exerciseDbId = record.exerciseDbId
                match.cachedAt = Date()
            } else {
                modelContext.insert(CachedPersonalRecord(from: record))
            }
        }
        try? modelContext.save()
    }

    // MARK: - Weekly goal data (Monday-start week, independent of viewMode)

    /// See `loadWorkouts`'s doc comment for the `generation` contract. `weeklyGoalReferenceDate`
    /// is written alongside `weeklyGoalWorkouts` (both gated together) rather than unconditionally
    /// up front, since the boundary math below reads the `date` parameter directly, not the
    /// stored property -- so deferring the property write doesn't affect this call's own
    /// correctness, and avoids a superseded chain clobbering the reference date a newer chain
    /// already moved past.
    func loadWeeklyGoalData(for date: Date, generation: Int? = nil) async {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        // Same Monday-start week boundary math as TrainedDaysCalculator.weekDays (that
        // calculator's offset logic is private to its own file, so it's duplicated here --
        // this MUST stay in sync, since weekDays/trainedDaysCount below combine
        // TrainedDaysCalculator's day-labeling with the workouts fetched here; a mismatch
        // between the two would fetch one week's workouts but label a different week's days.
        let dateStart = utcCalendar.startOfDay(for: date)
        let weekday = utcCalendar.component(.weekday, from: dateStart) // 1 = Sunday ... 7 = Saturday
        let daysFromMonday = (weekday + 5) % 7
        let weekStart = utcCalendar.date(byAdding: .day, value: -daysFromMonday, to: dateStart) ?? dateStart
        let weekEnd = utcCalendar.date(byAdding: .day, value: 6, to: weekStart) ?? dateStart

        do {
            let fresh = try await workoutRepository.fetchWorkouts(userId: userId, from: weekStart, to: weekEnd)
            if let generation, generation != reloadGeneration { return }
            weeklyGoalReferenceDate = date
            weeklyGoalWorkouts = fresh
        } catch {
            if let generation, generation != reloadGeneration { return }
            // Per-widget isolation: leave weeklyGoalWorkouts at its last-known value on failure,
            // matching loadWorkouts'/loadPersonalRecords' don't-clear-on-error behavior. The
            // reference date still advances on failure (matching prior unconditional behavior).
            weeklyGoalReferenceDate = date
        }
    }

    var weekDays: [WeekDayInfo] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(identifier: "UTC")!
        let workoutDateStrings = Set(weeklyGoalWorkouts.map(\.date))
        return TrainedDaysCalculator.weekDays(containing: weeklyGoalReferenceDate, workoutDates: workoutDateStrings)
    }

    var trainedDaysCount: Int { TrainedDaysCalculator.trainedDaysCount(weekDays) }

    // MARK: - Profile

    /// See `loadWorkouts`'s doc comment for the `generation` contract.
    func loadProfile(generation: Int? = nil) async {
        do {
            let fresh = try await profileRepository.fetchProfile(userId: userId)
            if let generation, generation != reloadGeneration { return }
            profile = fresh
        } catch {
            // Per-widget isolation: leave `profile` at its last-known value (nil if never loaded).
            // No mutation on this path, so no generation check is needed here.
        }
    }

    // MARK: - Weekly goal days (UserDefaults-backed)

    func setGoalDays(_ days: Int) {
        let clamped = min(max(days, 1), 7)
        goalDays = clamped
        UserDefaults.standard.set(clamped, forKey: Self.goalDaysDefaultsKey)
    }

    // MARK: - Real per-exercise data / muscle load

    // Call AFTER loadWorkouts has populated `workouts` (this reads workouts.map(\.id)). Ideally
    // called after loadProfile too, since recomputeMuscleLoad() reads `profile` for unit
    // conversion and body-weight-relative normalization -- if loadProfile hasn't finished yet,
    // this falls back to displaying in .lbs and skipping relative-load normalization, which is a
    // reasonable one-frame degradation rather than a bug.
    /// See `loadWorkouts`'s doc comment for the `generation` contract. `recomputeMuscleLoad()` is
    /// itself gated by extension -- it's only reached at all when this call's write to
    /// `exercisesInRange` wasn't skipped as stale, so a superseded chain can't recompute
    /// `muscleLoadBySlug` off of workouts/exercises a newer chain has already moved past either.
    func loadExercisesInRange(generation: Int? = nil) async {
        do {
            let fresh = try await workoutRepository.fetchExercisesForWorkouts(userId: userId, workoutIds: workouts.map(\.id))
            if let generation, generation != reloadGeneration { return }
            exercisesInRange = fresh
        } catch {
            if let generation, generation != reloadGeneration { return }
            exercisesInRange = []
        }
        recomputeMuscleLoad()
    }

    private func recomputeMuscleLoad() {
        // Judgment call (documented per Task 6 spec): only "kg"/"lbs" rows represent an actual
        // weight. A distance-type exercise (e.g. a run logged via the flat `exercises` table)
        // stores its distance in the same `weight` column with unit "km"/"mi" -- feeding that into
        // MuscleLoadCalculator.loadBySlug (weight * reps * sets) would produce a nonsensical
        // "volume" number for muscles that did no resistance work. Such rows are excluded here.
        let weightUnitExercises = exercisesInRange.compactMap { exercise -> MuscleLoadCalculator.ExerciseInput? in
            guard let unit = WeightUnit(rawValue: exercise.unit) else { return nil }
            return MuscleLoadCalculator.ExerciseInput(
                name: exercise.name, muscleGroup: exercise.muscleGroup, weight: exercise.weight,
                reps: exercise.reps, sets: exercise.sets, unit: unit
            )
        }
        let displayUnit = profile?.unitPreference ?? .lbs
        let rawLoad = MuscleLoadCalculator.loadBySlug(exercises: weightUnitExercises, displayUnit: displayUnit)
        let bodyWeightKg: Double? = profile?.bodyWeight.map {
            WeightUnit.convert($0, from: profile?.bodyWeightUnit ?? .lbs, to: .kg)
        }
        muscleLoadBySlug = MuscleLoadCalculator.relativeLoadBySlug(rawLoad: rawLoad, bodyWeightKg: bodyWeightKg)
    }

    var muscleIntensityBySlug: [String: Int] {
        let loads = muscleLoadBySlug
        let maxLoad = loads.values.max() ?? 0
        return loads.mapValues { MuscleIntensity.tier(load: $0, maxLoad: maxLoad) }
    }

    var currentStreak: Int {
        let dates = workouts.compactMap { workout -> Date? in
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            return formatter.date(from: workout.date)
        }
        return StreakCalculator.calculateStreak(workoutDates: dates, today: Date())
    }

    /// Builds a UTC-anchored [start, end] date range for "the last 7 days,"
    /// used as `loadWorkouts`'s from/to arguments. Uses a UTC calendar
    /// (not `Calendar.current`) so the resulting day boundaries match what
    /// `WorkoutRepository.fetchWorkouts` formats with its UTC-anchored
    /// `ISO8601DateFormatter` -- using `Calendar.current` here could shift
    /// the boundary by a day in non-UTC timezones relative to what the
    /// repository actually queries against the Postgres `DATE` column.
    static func lastSevenDaysRangeUTC(now: Date = Date()) -> (from: Date, to: Date) {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let todayStart = utcCalendar.startOfDay(for: now)
        let weekAgo = utcCalendar.date(byAdding: .day, value: -7, to: todayStart) ?? todayStart
        return (from: weekAgo, to: todayStart)
    }

    /// Builds a UTC-anchored [start, end] date range for the given `date` and
    /// `viewMode` (Day: just that day; Week: the 7 days ending on `date`;
    /// Month: the 30 days ending on `date`) -- mirrors lastSevenDaysRangeUTC's
    /// UTC-anchoring rationale (must match WorkoutRepository's UTC-formatted
    /// query boundaries).
    static func rangeUTC(for date: Date, viewMode: DashboardViewMode) -> (from: Date, to: Date) {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let dayStart = utcCalendar.startOfDay(for: date)
        let daysBack: Int
        switch viewMode {
        case .day: daysBack = 0
        case .week: daysBack = 7
        case .month: daysBack = 30
        }
        let start = utcCalendar.date(byAdding: .day, value: -daysBack, to: dayStart) ?? dayStart
        return (from: start, to: dayStart)
    }
}
