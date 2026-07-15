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

    private let workoutRepository: WorkoutRepository
    private let personalRecordRepository: PersonalRecordRepository
    private let userId: String
    private let modelContext: ModelContext

    init(
        workoutRepository: WorkoutRepository,
        personalRecordRepository: PersonalRecordRepository,
        userId: String,
        modelContext: ModelContext
    ) {
        self.workoutRepository = workoutRepository
        self.personalRecordRepository = personalRecordRepository
        self.userId = userId
        self.modelContext = modelContext
    }

    /// Reads the SwiftData cache immediately (for instant display), then
    /// fetches fresh data from the network and writes it through to the
    /// cache. Errors are only surfaced if BOTH the cache read produced
    /// nothing AND the network fetch failed -- a stale cache hit is always
    /// preferable to an error state while a background refresh is pending.
    func loadWorkouts(from: Date, to: Date) async {
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
            workouts = fresh
            writeThroughWorkoutsCache(fresh, fromString: fromString, toString: toString)
        } catch {
            if workouts.isEmpty {
                workoutsErrorMessage = "Couldn't load workouts."
            }
        }
        isLoadingWorkouts = false
    }

    func loadPersonalRecords() async {
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
            personalRecords = fresh
            writeThroughPersonalRecordsCache(fresh)
        } catch {
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

    /// Per-muscle-slug training load for the current `workouts`, using
    /// ExerciseMuscleMapper to translate each workout's muscle_groups into
    /// weighted per-slug contributions (workouts fetched via this milestone's
    /// repository don't include nested exercise-level detail, so this uses
    /// each workout's coarser `muscle_groups` array as the fallback-group
    /// input to ExerciseMuscleMapper, weighted equally per group).
    var muscleLoadBySlug: [String: Double] {
        var totals: [String: Double] = [:]
        for workout in workouts {
            for group in workout.muscleGroups ?? [] {
                let profile = ExerciseMuscleMapper.profile(forExerciseName: "", fallbackMuscleGroup: group)
                for target in profile.targets {
                    totals[target.slug, default: 0] += target.weight
                }
            }
        }
        return totals
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
}
