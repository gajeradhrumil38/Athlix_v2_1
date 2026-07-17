import Foundation
import Observation
import AthlixCore

/// How the current `ActiveWorkoutViewModel` session came to exist, mirroring
/// the routing web does across `Log.tsx` (entry resolution) and
/// `ActiveWorkout.tsx` (session state). Used by the view layer to decide
/// what chrome/prompts to show (e.g. a "resumed" banner).
enum WorkoutEntryMode: Equatable {
    case resumedDraft
    case blankAddExercise
    case planToday
    case pastDateEdit(date: String)
    case quickStart
    case blank
}

/// The deep-link-equivalent intents that can drive entry resolution, mirroring
/// web's `?add=1` / `?plan=1` / `?date=YYYY-MM-DD` query params on `/log`.
///
/// NOTE (scope decision): web's fourth entry path -- an interstitial
/// "Quick Start" sheet shown when there's no draft and no deep link -- is
/// intentionally NOT modeled as a resolvable state here. Building the sheet's
/// trigger logic into this view model would conflate "what session state do
/// we have" with "what UI flow should the caller present before session state
/// even exists." Instead, `resolveEntry` always resolves to `.blank` in the
/// no-draft/no-deep-link case, and the calling view is expected to decide
/// whether to show a quick-start sheet BEFORE calling `resolveEntry`, driving
/// its own choice into a `DeepLinkIntent` (or none) once the user picks.
/// `.quickStart` remains on `WorkoutEntryMode` for the view layer to assign
/// directly, but this view model never assigns it itself. Full quick-start UI
/// is a later task.
enum DeepLinkIntent: Equatable {
    case addExercise
    case planToday
    case pastDate(String)
}

/// Session state machine for the active workout-logging screen, consolidating
/// what the web app splits across `Log.tsx` (entry routing) and
/// `ActiveWorkout.tsx` (session state: elapsed timer, rest timer, set/exercise
/// CRUD). Lives in the app target (not `AthlixCore`) since it orchestrates
/// app-level concerns (`UserDefaults`, the on-disk draft store) alongside
/// AthlixCore's pure logic (`SetCRUDEngine`, `ExerciseTypeResolver`,
/// `SetCompletionRules`) and repositories.
@Observable
@MainActor
final class ActiveWorkoutViewModel {
    private(set) var title: String
    private(set) var startAt: Date
    private(set) var elapsedSeconds: Int = 0
    private(set) var isPaused: Bool = true
    private(set) var exercises: [ExerciseEntry] = []
    var notes: String?
    private(set) var restSecondsLeft: Int?
    private(set) var entryMode: WorkoutEntryMode = .blank
    /// Transient "max 20 sets" message. Caller-visible; set by `addSet`/`copySet`
    /// when `SetCRUDEngine.isAtCap` rejects the operation. Not auto-cleared --
    /// the view layer is expected to dismiss it (e.g. after showing a toast).
    private(set) var setCapMessage: String?
    /// Set whenever `changeDate` rejects a future date, so the view layer can
    /// surface an inline message. Not auto-cleared, same rationale as
    /// `setCapMessage`.
    private(set) var isFutureDateBlocked: Bool = false
    /// Signal for the view layer when `addExercise` deduped against an
    /// existing entry (or just added a new one) -- lets the caller scroll to /
    /// highlight the relevant exercise without this view model owning any
    /// navigation logic itself.
    private(set) var focusedExerciseId: String?

    private let workoutRepository: WorkoutRepository
    private let exerciseLibraryRepository: ExerciseLibraryRepository
    private let draftStore: WorkoutDraftStore
    private let userId: String
    private let unitPreference: WeightUnit

    private var elapsedTimerTask: Task<Void, Never>?
    private var restTimerTask: Task<Void, Never>?
    /// The id of the `LoggedSet` that triggered the currently-running rest
    /// timer. Tracked (rather than just stopping/restarting on ANY un-mark)
    /// so that un-marking a DIFFERENT set than the one that started the timer
    /// doesn't stop an unrelated, still-relevant countdown -- matches the
    /// task's "same set" wording precisely rather than the looser
    /// "any un-mark" alternative.
    private var restTimerSetId: String?

    init(
        userId: String,
        workoutRepository: WorkoutRepository,
        exerciseLibraryRepository: ExerciseLibraryRepository,
        draftStore: WorkoutDraftStore,
        title: String = "Workout",
        startAt: Date = Date(),
        unitPreference: WeightUnit = .lbs
    ) {
        self.userId = userId
        self.workoutRepository = workoutRepository
        self.exerciseLibraryRepository = exerciseLibraryRepository
        self.draftStore = draftStore
        self.title = title
        self.startAt = startAt
        self.unitPreference = unitPreference
    }

    // No explicit `deinit` cancellation: `deinit` on a `@MainActor` class is
    // itself nonisolated, so it cannot touch these actor-isolated `Task`
    // properties directly (and hopping to the main actor from `deinit` isn't
    // guaranteed to run before dealloc completes). Both timer loops already
    // capture `self` weakly and check `while let self` each iteration, so
    // once this instance deallocates, each loop exits on its next wake
    // (within ~1s) instead of retaining/looping forever.

    // MARK: - Entry resolution

    /// Resolves how this session should start, in priority order:
    /// 1. A valid (non-expired, `WorkoutDraftStore.load()` already enforces
    ///    the 8hr TTL) local draft whose `startAt` falls on today -- resumed.
    ///    (DECISION: "still relevant" is interpreted as same-calendar-day as
    ///    now, in the user's current calendar/timezone. The web equivalent
    ///    keys entirely off the 8hr sessionStorage TTL with no separate date
    ///    check; iOS additionally requires same-day so that a draft started
    ///    late one night and resumed just after midnight doesn't silently
    ///    resume into a workout dated "yesterday" without the user noticing --
    ///    a same-day check is a reasonable, conservative tightening given the
    ///    underlying TTL is already fairly generous at 8 hours.)
    /// 2. `.addExercise` deep link -> blank session, `.blankAddExercise`.
    /// 3. `.planToday` deep link -> blank session, `.planToday`.
    /// 4. `.pastDate(date)` deep link -> fetch that date's saved workout and
    ///    reconstruct exercises (see caveat in `loadPastDate`).
    /// 5. Otherwise -> blank session, `.blank` (see `DeepLinkIntent` doc for
    ///    the quick-start-sheet scope decision).
    func resolveEntry(deepLink: DeepLinkIntent?) async {
        if let draft = draftStore.load(), isDraftResumable(draft) {
            applyDraft(draft)
            entryMode = .resumedDraft
            return
        }

        switch deepLink {
        case .addExercise:
            entryMode = .blankAddExercise
        case .planToday:
            entryMode = .planToday
        case .pastDate(let date):
            await loadPastDate(date)
        case nil:
            entryMode = .blank
        }
    }

    private func isDraftResumable(_ draft: WorkoutDraft) -> Bool {
        Calendar.current.isDate(draft.startAt, inSameDayAs: Date())
    }

    private func applyDraft(_ draft: WorkoutDraft) {
        title = draft.title
        startAt = draft.startAt
        elapsedSeconds = draft.elapsedSeconds
        exercises = draft.exercises
        notes = draft.notes
        isPaused = true
    }

    /// Fetches the given date's saved workout (via `fetchWorkouts` scoped to
    /// that single day) and, if one exists, its flat `exercises` table rows
    /// (via `fetchWorkoutExercises`), then reconstructs `[ExerciseEntry]` by
    /// grouping same-named rows in their existing `order_index` order -- one
    /// `LoggedSet` per row, `done: true` since these are already-completed
    /// sets from a saved workout. Each group's `ExerciseEntry` takes its
    /// `muscleGroup`/`exerciseDbId` from its first row (rows for the same
    /// exercise name are expected to share the same muscle group/db id,
    /// matching how `saveWorkout` originally wrote them).
    private func loadPastDate(_ dateString: String) async {
        entryMode = .pastDateEdit(date: dateString)
        exercises = []

        guard let date = Self.parseISODate(dateString) else { return }

        do {
            let workouts = try await workoutRepository.fetchWorkouts(userId: userId, from: date, to: date)
            guard let workout = workouts.first else { return }
            title = workout.title
            notes = workout.notes
            startAt = date
            elapsedSeconds = (workout.durationMinutes ?? 0) * 60
            isPaused = true

            let rows = try await workoutRepository.fetchWorkoutExercises(userId: userId, workoutId: workout.id)
            exercises = Self.groupExerciseRows(rows)
        } catch {
            // Fetch failure: leave the blank pastDateEdit state in place
            // rather than propagating -- per-action isolation, matching the
            // design spec's "Error Handling" stance (a failed lookup here
            // shouldn't crash session entry; the user can still log fresh
            // sets for the date).
        }
    }

    /// Groups flat `ExerciseSet` rows (already ordered by `order_index`
    /// ascending, per `fetchWorkoutExercises`'s contract) into `[ExerciseEntry]`
    /// by exact `name` match, preserving first-seen order of each name.
    private static func groupExerciseRows(_ rows: [ExerciseSet]) -> [ExerciseEntry] {
        var order: [String] = []
        var byName: [String: [ExerciseSet]] = [:]
        for row in rows {
            if byName[row.name] == nil { order.append(row.name) }
            byName[row.name, default: []].append(row)
        }

        return order.map { name in
            let rowsForName = byName[name] ?? []
            let sets = rowsForName.map { row in
                LoggedSet(
                    id: row.id, weight: row.weight, reps: row.reps, done: true,
                    isPR: false, plannedWeight: nil, plannedReps: nil
                )
            }
            let first = rowsForName[0]
            return ExerciseEntry(
                id: UUID().uuidString, name: name, muscleGroup: first.muscleGroup ?? "",
                exerciseDbId: first.exerciseDbId, sets: sets,
                optionalWeight: nil, inputTypeOverride: nil, lastSession: nil
            )
        }
    }

    private static func parseISODate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return formatter.date(from: value)
    }

    // MARK: - Elapsed timer

    func togglePause() {
        isPaused.toggle()
        if isPaused {
            elapsedTimerTask?.cancel()
            elapsedTimerTask = nil
        } else {
            startElapsedTimerLoop()
        }
    }

    private func startElapsedTimerLoop() {
        elapsedTimerTask?.cancel()
        elapsedTimerTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                self.tick()
            }
        }
    }

    /// Directly callable (not private) so tests can drive the elapsed timer
    /// deterministically without real wall-clock sleeping.
    ///
    /// Also piggybacks the ~30s periodic draft autosave onto this same tick
    /// loop (every 30th tick) rather than running a second independent timer
    /// task, per the task's "or piggyback on the same tick loop" allowance --
    /// one fewer background task to manage/cancel, and it's already only
    /// ticking while the session is actively unpaused (autosaving while
    /// paused adds little value since nothing is changing).
    func tick() {
        guard !isPaused else { return }
        elapsedSeconds += 1
        if elapsedSeconds % 30 == 0 {
            persistDraft()
        }
    }

    // MARK: - Rest timer

    private func startRestTimer(forSetId setId: String) {
        let stored = UserDefaults.standard.integer(forKey: "athlix_default_rest_secs")
        let seconds = stored > 0 ? stored : 90
        restTimerSetId = setId
        restSecondsLeft = seconds

        restTimerTask?.cancel()
        restTimerTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { return }
                self.restTick()
            }
        }
    }

    /// Directly callable (not private) so tests can drive the rest-timer
    /// countdown deterministically without real wall-clock sleeping.
    func restTick() {
        guard let left = restSecondsLeft else { return }
        if left <= 1 {
            stopRestTimer()
        } else {
            restSecondsLeft = left - 1
        }
    }

    private func stopRestTimer() {
        restTimerTask?.cancel()
        restTimerTask = nil
        restSecondsLeft = nil
        restTimerSetId = nil
    }

    // MARK: - Set CRUD

    func addSet(exerciseId: String) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        if SetCRUDEngine.isAtCap(exercises[idx].sets) {
            setCapMessage = "Maximum 20 sets per exercise"
            return
        }
        exercises[idx].sets = SetCRUDEngine.addSet(to: exercises[idx].sets, newId: UUID().uuidString)
        persistDraft()
    }

    /// Id-based (not index-based) to avoid the classic stale-index bug: a
    /// view-layer closure that captured a raw `Int` index could act on the
    /// wrong set if an async operation (rest timer completion, autosave,
    /// another mutation) reorders/removes items before the closure fires.
    /// Resolves `setId` to `SetCRUDEngine.copySet`'s required index
    /// internally -- `SetCRUDEngine`'s own signature stays index-based since
    /// it's a pure array function; only this view model's public wrapper
    /// needed to change.
    func copySet(exerciseId: String, setId: String) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        guard let setIdx = exercises[idx].sets.firstIndex(where: { $0.id == setId }) else { return }
        if SetCRUDEngine.isAtCap(exercises[idx].sets) {
            setCapMessage = "Maximum 20 sets per exercise"
            return
        }
        exercises[idx].sets = SetCRUDEngine.copySet(in: exercises[idx].sets, at: setIdx, newId: UUID().uuidString)
        persistDraft()
    }

    /// Id-based for the same stale-index reason as `copySet`.
    func removeSet(exerciseId: String, setId: String) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        guard let setIdx = exercises[idx].sets.firstIndex(where: { $0.id == setId }) else { return }
        exercises[idx].sets = SetCRUDEngine.removeSet(from: exercises[idx].sets, at: setIdx)
        persistDraft()
    }

    /// Updates a specific set's weight/reps values (e.g. from the value-box
    /// picker described in the design spec's `SetRowView`/`SetValuePicker`).
    /// Not explicitly itemized in this task's required surface, but a
    /// necessary companion to `markSetDone`'s readiness gate -- without a way
    /// to edit a set's values after creation, no set could ever become
    /// "ready" post-seeding. Exposed as a normal method (not `private`) both
    /// for the real UI and so tests can set up specific weight/reps fixtures
    /// without reaching into `exercises`' storage directly.
    func updateSet(exerciseId: String, setId: String, weight: Double?, reps: Int?) {
        guard let exIdx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        guard let setIdx = exercises[exIdx].sets.firstIndex(where: { $0.id == setId }) else { return }
        exercises[exIdx].sets[setIdx].weight = weight
        exercises[exIdx].sets[setIdx].reps = reps
    }

    func markSetDone(exerciseId: String, setId: String) {
        guard let exIdx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        guard let setIdx = exercises[exIdx].sets.firstIndex(where: { $0.id == setId }) else { return }

        var set = exercises[exIdx].sets[setIdx]

        if set.done {
            // Un-marking is always allowed (no readiness gate on the way out).
            set.done = false
            exercises[exIdx].sets[setIdx] = set
            if restTimerSetId == setId {
                stopRestTimer()
            }
            return
        }

        let inputType = exercises[exIdx].inputTypeOverride ?? ExerciseTypeResolver.resolve(exercises[exIdx].name)
        let ready = SetCompletionRules.isReady(type: inputType, weight: set.weight ?? 0, reps: set.reps ?? 0)
        guard ready else { return }

        set.done = true
        exercises[exIdx].sets[setIdx] = set
        startRestTimer(forSetId: setId)
    }

    // MARK: - Exercise CRUD

    /// Adds a new exercise, deduping case-insensitively against the current
    /// session's exercises. If a match already exists, no second entry is
    /// created -- `focusedExerciseId` is set to the EXISTING entry's id so
    /// the view layer can scroll/highlight it (this view model has no
    /// navigation concerns of its own). Returns the (possibly pre-existing)
    /// exercise's id.
    ///
    /// SEEDING DECISION: `ExerciseInputType.defaultSetValues` is a
    /// `(primary: Double, secondary: Int)` pair. `LoggedSet` only has two
    /// numeric slots -- `weight: Double?` and `reps: Int?` -- full stop, for
    /// every input type; the DIAL UI (not built in this task) is what
    /// reinterprets those two slots per `DialFieldKind` (e.g. for
    /// `.timeOnly`, `weight` holds minutes and `reps` holds seconds; for
    /// `.distanceOnly`, `weight` holds distance and `reps` is unused). Given
    /// that `LoggedSet` has exactly two numeric fields and
    /// `defaultSetValues` already returns exactly a `(Double, Int)` pair in
    /// that same order, the natural, UNAMBIGUOUS mapping is simply
    /// `primary -> weight`, `secondary -> reps`, universally, regardless of
    /// what those slots semantically represent for a given type. This isn't
    /// a "reasonable approximation" -- it's the only mapping that doesn't
    /// require inventing new storage on `LoggedSet` (out of scope; that type
    /// is owned by `AthlixCore` and already committed).
    @discardableResult
    func addExercise(name: String, muscleGroup: String, exerciseDbId: String?) -> String {
        if let existingIndex = SetCRUDEngine.findExistingExerciseIndex(in: exercises, matchingName: name) {
            let existingId = exercises[existingIndex].id
            focusedExerciseId = existingId
            return existingId
        }

        let inputType = ExerciseTypeResolver.resolve(name)
        let defaults = inputType.defaultSetValues
        let seededWeight = defaults.primary
        let seededReps = defaults.secondary

        let newExerciseId = UUID().uuidString
        let firstSet = LoggedSet(
            id: UUID().uuidString, weight: seededWeight, reps: seededReps,
            done: false, isPR: false, plannedWeight: nil, plannedReps: nil
        )
        let entry = ExerciseEntry(
            id: newExerciseId, name: name, muscleGroup: muscleGroup, exerciseDbId: exerciseDbId,
            sets: [firstSet], optionalWeight: nil, inputTypeOverride: nil, lastSession: nil
        )
        exercises.append(entry)
        focusedExerciseId = newExerciseId
        persistDraft()

        // Non-blocking background patch-in of last-session data, matching the
        // "optimistic UI ... with a non-blocking background fetch patch-in"
        // behavior from the design spec. Only applied if the user hasn't
        // already started editing this exercise's sets by the time it
        // resolves (see `patchLastSession`'s "untouched" check).
        let capturedUserId = userId
        Task { [weak self] in
            guard let self else { return }
            guard let summary = try? await self.exerciseLibraryRepository.lastSession(userId: capturedUserId, exerciseName: name) else { return }
            self.patchLastSession(exerciseId: newExerciseId, summary: summary, seededWeight: seededWeight, seededReps: seededReps)
        }

        return newExerciseId
    }

    private func patchLastSession(exerciseId: String, summary: LastSessionSummary, seededWeight: Double, seededReps: Int) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        let sets = exercises[idx].sets
        let untouched = sets.count == 1
            && sets[0].done == false
            && sets[0].weight == seededWeight
            && sets[0].reps == seededReps
        guard untouched else { return }
        exercises[idx].lastSession = summary
    }

    /// Id-based for the same stale-index reason as `copySet`/`removeSet`.
    func removeExercise(exerciseId: String) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        exercises.remove(at: idx)
        persistDraft()
    }

    /// 3-way toggle between `.timeOnly` / `.weightReps` / `.repsOnly`, or
    /// jumps directly to `forced` if provided. Resets the exercise's sets to
    /// the new type's defaults (clearing `done`), matching web's
    /// destructive-but-current behavior noted in the design spec.
    ///
    /// If the exercise's current resolved type isn't one of the three cycled
    /// types (e.g. `.distanceTime`), cycling starts over at `.timeOnly` --
    /// a reasonable fallback since there's no well-defined "next" step
    /// outside the 3-way cycle.
    func cycleInputType(exerciseId: String, forced: ExerciseInputType? = nil) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        let cycle: [ExerciseInputType] = [.timeOnly, .weightReps, .repsOnly]
        let current = exercises[idx].inputTypeOverride ?? ExerciseTypeResolver.resolve(exercises[idx].name)

        let next: ExerciseInputType
        if let forced {
            next = forced
        } else if let currentIdx = cycle.firstIndex(of: current) {
            next = cycle[(currentIdx + 1) % cycle.count]
        } else {
            next = cycle[0]
        }

        exercises[idx].inputTypeOverride = next
        let defaults = next.defaultSetValues
        exercises[idx].sets = exercises[idx].sets.map { set in
            LoggedSet(
                id: set.id, weight: defaults.primary, reps: defaults.secondary,
                done: false, isPR: false, plannedWeight: nil, plannedReps: nil
            )
        }
        persistDraft()
    }

    // MARK: - Date editing

    /// Rejects future dates (no-op, `isFutureDateBlocked = true`), compared
    /// at day granularity so "today" is always allowed regardless of
    /// time-of-day. Otherwise updates `startAt` to the new date and resets
    /// the elapsed timer.
    ///
    /// TIME-OF-DAY DECISION: preserves the current `startAt`'s time-of-day
    /// component, only swapping the year/month/day -- e.g. moving a
    /// 7:03pm-started session to yesterday keeps it at 7:03pm yesterday,
    /// rather than snapping to "now." This matches the mental model of
    /// "I meant to log this on a different day" (a pure date correction)
    /// rather than "I'm restarting the clock," and avoids a confusing jump
    /// if the user changes the date mid-session.
    func changeDate(to newDate: Date) {
        let calendar = Calendar.current
        if calendar.compare(newDate, to: Date(), toGranularity: .day) == .orderedDescending {
            isFutureDateBlocked = true
            return
        }
        isFutureDateBlocked = false

        let time = calendar.dateComponents([.hour, .minute, .second], from: startAt)
        var combined = calendar.dateComponents([.year, .month, .day], from: newDate)
        combined.hour = time.hour
        combined.minute = time.minute
        combined.second = time.second
        startAt = calendar.date(from: combined) ?? newDate

        elapsedSeconds = 0
        isPaused = true
        elapsedTimerTask?.cancel()
        elapsedTimerTask = nil
        persistDraft()
    }

    // MARK: - Draft persistence

    private func persistDraft() {
        let draft = WorkoutDraft(
            id: nil, title: title, startAt: startAt, elapsedSeconds: elapsedSeconds,
            exercises: exercises, notes: notes, savedAt: Date()
        )
        draftStore.save(draft)
    }

    // MARK: - Save

    func save() async throws -> Workout {
        let dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withFullDate]
        let dateString = dateFormatter.string(from: startAt)

        let newExercises: [NewWorkoutExercise] = exercises.map { exercise in
            // Only done sets with a nonzero weight or reps survive -- matching
            // WorkoutRepository.saveWorkout's own internal filter. Passing a
            // few extras through here is harmless since the repository
            // re-filters identically, but doing it here too keeps the
            // NewWorkoutInput this view model builds an honest reflection of
            // "what will actually be saved" for anything inspecting it
            // (e.g. a Finish-sheet stats preview) before the repository call.
            let completedSets = exercise.sets
                .filter { $0.done && (($0.weight ?? 0) > 0 || ($0.reps ?? 0) > 0) }
                .map { CompletedSetInput(reps: $0.reps ?? 0, weight: $0.weight ?? 0, unit: unitPreference.rawValue) }
            return NewWorkoutExercise(
                name: exercise.name, muscleGroup: exercise.muscleGroup,
                exerciseDbId: exercise.exerciseDbId, completedSets: completedSets
            )
        }

        let input = NewWorkoutInput(
            title: title, date: dateString, durationMinutes: elapsedSeconds / 60,
            notes: notes, exercises: newExercises
        )

        let workout = try await workoutRepository.saveWorkout(userId: userId, input: input)
        draftStore.clear()
        return workout
    }
}
