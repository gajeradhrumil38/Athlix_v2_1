import XCTest
@testable import Athlix
import AthlixCore

// MARK: - Mocks

actor MockWorkoutRepository: WorkoutRepository {
    var stubbedWorkouts: [Workout] = []
    var stubbedSaveResult: Workout?
    var stubbedExerciseRows: [ExerciseSet] = []
    // Keyed override for tests that need DIFFERENT rows returned per workoutId (e.g. verifying
    // loadPastDate merges exercises across multiple same-date workouts) -- `stubbedExerciseRows`
    // alone can't distinguish calls, since it's a single flat list returned regardless of which
    // workoutId was requested. Falls back to `stubbedExerciseRows` when a given workoutId has no
    // keyed entry, so existing single-workout tests are unaffected.
    var stubbedExerciseRowsByWorkoutId: [String: [ExerciseSet]] = [:]
    var shouldThrowOnFetch = false
    var shouldThrowOnSave = false
    var shouldThrowOnFetchExercises = false
    private(set) var lastSaveInput: NewWorkoutInput?
    private(set) var lastFetchRange: (from: Date, to: Date)?
    private(set) var lastFetchExercisesWorkoutId: String?

    func setStubbedWorkouts(_ workouts: [Workout]) { stubbedWorkouts = workouts }
    func setStubbedSaveResult(_ workout: Workout) { stubbedSaveResult = workout }
    func setStubbedExerciseRows(_ rows: [ExerciseSet]) { stubbedExerciseRows = rows }
    func setStubbedExerciseRows(_ rows: [ExerciseSet], forWorkoutId workoutId: String) {
        stubbedExerciseRowsByWorkoutId[workoutId] = rows
    }
    func setShouldThrowOnFetch(_ value: Bool) { shouldThrowOnFetch = value }
    func setShouldThrowOnSave(_ value: Bool) { shouldThrowOnSave = value }
    func setShouldThrowOnFetchExercises(_ value: Bool) { shouldThrowOnFetchExercises = value }
    func getLastSaveInput() -> NewWorkoutInput? { lastSaveInput }

    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        lastFetchRange = (from, to)
        if shouldThrowOnFetch { throw RepositoryError.network }
        return stubbedWorkouts
    }

    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout {
        lastSaveInput = input
        if shouldThrowOnSave { throw RepositoryError.network }
        return stubbedSaveResult ?? Workout(
            id: "saved-1", userId: userId, title: input.title, date: input.date,
            durationMinutes: input.durationMinutes, notes: input.notes, muscleGroups: nil,
            createdAt: "2026-07-14T00:00:00Z"
        )
    }

    func deleteWorkout(userId: String, workoutId: String) async throws {}
    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws {}
    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String]) {
        ([], [])
    }

    func fetchWorkoutExercises(userId: String, workoutId: String) async throws -> [ExerciseSet] {
        lastFetchExercisesWorkoutId = workoutId
        if shouldThrowOnFetchExercises { throw RepositoryError.network }
        return stubbedExerciseRowsByWorkoutId[workoutId] ?? stubbedExerciseRows
    }

    // Stub added alongside WorkoutRepository.fetchExercisesForWorkouts (batched) -- this mock
    // predates that protocol method and isn't exercised by any test in this file, so it just
    // returns the same stubbed rows as fetchWorkoutExercises for conformance.
    func fetchExercisesForWorkouts(userId: String, workoutIds: [String]) async throws -> [ExerciseSet] {
        stubbedExerciseRows
    }
}

actor MockExerciseLibraryRepository: ExerciseLibraryRepository {
    var stubbedLastSession: LastSessionSummary?

    func setStubbedLastSession(_ summary: LastSessionSummary?) { stubbedLastSession = summary }

    func searchLibrary(userId: String, query: String) async throws -> [ExerciseLibraryItem] { [] }
    func libraryByGroup(userId: String, muscleGroup: String) async throws -> [ExerciseLibraryItem] { [] }
    func lastSession(userId: String, exerciseName: String) async throws -> LastSessionSummary? {
        stubbedLastSession
    }
    func recentExerciseOptions(userId: String) async throws -> [RecentExerciseOption] { [] }
    func renameExerciseEverywhere(userId: String, oldName: String, newName: String, exerciseDbId: String?) async throws {}
    func addCustomExercise(userId: String, name: String, muscleGroup: String) async throws -> ExerciseLibraryItem {
        ExerciseLibraryItem(id: "x", name: name, muscleGroup: muscleGroup, isCustom: true, userId: userId, exerciseDbId: nil)
    }
}

// NOTE: `MockProfileRepository` is NOT redeclared here -- `ActiveWorkoutViewModelTests.swift`
// and `DashboardViewModelTests.swift` both compile into the single `AthlixTests` module (unlike
// separate SPM test targets), so a second file-scope declaration of the same type name is an
// invalid redeclaration, not a legitimately separate conformance. The existing actor declared in
// `DashboardViewModelTests.swift` is reused as-is.

// MARK: - Test suite

@MainActor
final class ActiveWorkoutViewModelTests: XCTestCase {
    var tempDir: URL!
    var workoutRepo: MockWorkoutRepository!
    var libraryRepo: MockExerciseLibraryRepository!
    var profileRepo: MockProfileRepository!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        workoutRepo = MockWorkoutRepository()
        libraryRepo = MockExerciseLibraryRepository()
        profileRepo = MockProfileRepository()
        UserDefaults.standard.removeObject(forKey: "athlix_default_rest_secs")
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        tempDir = nil
        UserDefaults.standard.removeObject(forKey: "athlix_default_rest_secs")
        super.tearDown()
    }

    private func makeSUT(
        title: String = "Workout",
        startAt: Date = Date()
    ) -> ActiveWorkoutViewModel {
        ActiveWorkoutViewModel(
            userId: "user-1",
            workoutRepository: workoutRepo,
            exerciseLibraryRepository: libraryRepo,
            profileRepository: profileRepo,
            draftStore: WorkoutDraftStore(directory: tempDir),
            title: title,
            startAt: startAt
        )
    }

    private func makeExerciseEntry(
        id: String = UUID().uuidString,
        name: String = "Bench Press",
        sets: [LoggedSet] = []
    ) -> ExerciseEntry {
        ExerciseEntry(
            id: id, name: name, muscleGroup: "Chest", exerciseDbId: nil,
            sets: sets, optionalWeight: nil, inputTypeOverride: nil, lastSession: nil
        )
    }

    private func makeSet(
        id: String = UUID().uuidString,
        weight: Double? = nil,
        reps: Int? = nil,
        done: Bool = false
    ) -> LoggedSet {
        LoggedSet(id: id, weight: weight, reps: reps, done: done, isPR: false, plannedWeight: nil, plannedReps: nil)
    }

    private func makeExerciseSetRow(
        id: String, workoutId: String, name: String, muscleGroup: String?,
        reps: Int, weight: Double, orderIndex: Int, exerciseDbId: String?, unit: String = "lbs"
    ) -> ExerciseSet {
        ExerciseSet(
            id: id, workoutId: workoutId, name: name, muscleGroup: muscleGroup,
            sets: 1, reps: reps, weight: weight, unit: unit,
            orderIndex: orderIndex, exerciseDbId: exerciseDbId
        )
    }

    // MARK: - Entry resolution

    func testResolveEntryResumesValidDraftOverAnyDeepLink() async {
        let store = WorkoutDraftStore(directory: tempDir)
        let draft = WorkoutDraft(
            id: nil, title: "Resumed Workout", startAt: Date(), elapsedSeconds: 300,
            exercises: [makeExerciseEntry(name: "Squat")], notes: "resume notes", savedAt: Date()
        )
        store.save(draft)

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .addExercise)

        XCTAssertEqual(sut.entryMode, .resumedDraft)
        XCTAssertEqual(sut.title, "Resumed Workout")
        XCTAssertEqual(sut.elapsedSeconds, 300)
        XCTAssertEqual(sut.exercises.map(\.name), ["Squat"])
    }

    /// The store's TTL is measured from `savedAt` (see `WorkoutDraft.isExpired`),
    /// so a draft last saved over 8hrs ago is correctly ignored regardless of
    /// calendar day -- this is the real (TTL-only) resumability boundary now
    /// that the extra same-day restriction is gone.
    func testResolveEntryIgnoresExpiredDraft() async {
        let store = WorkoutDraftStore(directory: tempDir)
        let longAgo = Date().addingTimeInterval(-(8 * 3600 + 60))
        let draft = WorkoutDraft(
            id: nil, title: "Old Workout", startAt: longAgo, elapsedSeconds: 300,
            exercises: [makeExerciseEntry(name: "Squat")], notes: nil, savedAt: longAgo
        )
        store.save(draft)

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: nil)

        XCTAssertEqual(sut.entryMode, .blank)
        XCTAssertTrue(sut.exercises.isEmpty)
    }

    /// Regression guard for the fix that removes `isDraftResumable`'s extra
    /// same-calendar-day restriction, matching web's behavior of relying on
    /// the draft store's 8hr TTL alone with no day-boundary check. Replaces
    /// (and inverts the assertion of) the old `testResolveEntryIgnoresDraftFromADifferentDay`,
    /// which directly encoded the over-restrictive behavior now removed.
    ///
    /// `WorkoutDraftStore.load()` calls `Date()` directly with no injectable
    /// clock, so this can't literally wait for/straddle a real wall-clock
    /// midnight. Instead it forces a day-boundary crossing deterministically:
    /// `startAt` is set a full calendar day back via `Calendar` day-granularity
    /// arithmetic (guaranteed to land on a different calendar date than "now",
    /// regardless of what time of day the test happens to run), while
    /// `savedAt: Date()` keeps the draft within the store's 8hr TTL (the TTL
    /// is measured from `savedAt`, not `startAt` -- see `WorkoutDraft.isExpired`).
    /// This genuinely discriminates the fix from the old code: the OLD
    /// same-day check would reject this (different calendar day) regardless
    /// of the TTL being satisfied; only the fix (TTL alone, no day check)
    /// resumes it. Verified empirically -- see task report -- by running this
    /// exact assertion against the pre-fix code and confirming it failed.
    func testDraftResumableAcrossMidnightWithinEightHourTTL() async {
        let store = WorkoutDraftStore(directory: tempDir)
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        let draft = WorkoutDraft(
            id: nil, title: "Late Night Workout", startAt: yesterday, elapsedSeconds: 120,
            exercises: [makeExerciseEntry(name: "Deadlift")], notes: nil, savedAt: Date()
        )
        store.save(draft)

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: nil)

        XCTAssertEqual(sut.entryMode, .resumedDraft)
        XCTAssertEqual(sut.title, "Late Night Workout")
    }

    func testResolveEntryAddExerciseDeepLinkWithNoDraft() async {
        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .addExercise)

        XCTAssertEqual(sut.entryMode, .blankAddExercise)
        XCTAssertTrue(sut.exercises.isEmpty)
    }

    func testResolveEntryPlanTodayDeepLinkWithNoDraft() async {
        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .planToday)

        XCTAssertEqual(sut.entryMode, .planToday)
    }

    func testResolveEntryPastDateDeepLinkFetchesAndSetsTitle() async {
        let workout = Workout(
            id: "w1", userId: "user-1", title: "Leg Day", date: "2026-07-01",
            durationMinutes: 45, notes: "past notes", muscleGroups: ["Legs"],
            createdAt: "2026-07-01T00:00:00Z"
        )
        await workoutRepo.setStubbedWorkouts([workout])

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .pastDate("2026-07-01"))

        XCTAssertEqual(sut.entryMode, .pastDateEdit(date: "2026-07-01"))
        XCTAssertEqual(sut.title, "Leg Day")
        XCTAssertEqual(sut.notes, "past notes")
        XCTAssertEqual(sut.elapsedSeconds, 45 * 60)
    }

    func testResolveEntryPastDateReconstructsExercisesGroupedByName() async {
        let workout = Workout(
            id: "w1", userId: "user-1", title: "Leg Day", date: "2026-07-01",
            durationMinutes: 45, notes: nil, muscleGroups: ["Legs"],
            createdAt: "2026-07-01T00:00:00Z"
        )
        await workoutRepo.setStubbedWorkouts([workout])
        let rows = [
            makeExerciseSetRow(id: "r1", workoutId: "w1", name: "Squat", muscleGroup: "Legs", reps: 8, weight: 225, orderIndex: 0, exerciseDbId: "db-squat"),
            makeExerciseSetRow(id: "r2", workoutId: "w1", name: "Squat", muscleGroup: "Legs", reps: 6, weight: 235, orderIndex: 1, exerciseDbId: "db-squat"),
            makeExerciseSetRow(id: "r3", workoutId: "w1", name: "Leg Press", muscleGroup: "Legs", reps: 10, weight: 315, orderIndex: 2, exerciseDbId: nil),
        ]
        await workoutRepo.setStubbedExerciseRows(rows)

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .pastDate("2026-07-01"))

        XCTAssertEqual(sut.exercises.map(\.name), ["Squat", "Leg Press"])
        XCTAssertEqual(sut.exercises[0].sets.count, 2)
        XCTAssertEqual(sut.exercises[0].sets.map(\.weight), [225, 235])
        XCTAssertEqual(sut.exercises[0].sets.map(\.reps), [8, 6])
        XCTAssertTrue(sut.exercises[0].sets.allSatisfy(\.done), "reconstructed sets from a saved workout should be marked done")
        XCTAssertEqual(sut.exercises[0].exerciseDbId, "db-squat")
        XCTAssertEqual(sut.exercises[1].sets.count, 1)
        XCTAssertEqual(sut.exercises[1].sets[0].weight, 315)

        let fetchedWorkoutId = await workoutRepo.lastFetchExercisesWorkoutId
        XCTAssertEqual(fetchedWorkoutId, "w1")
    }

    func testResolveEntryPastDateWithNoSavedWorkoutLeavesExercisesEmpty() async {
        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .pastDate("2026-07-01"))

        XCTAssertEqual(sut.entryMode, .pastDateEdit(date: "2026-07-01"))
        XCTAssertTrue(sut.exercises.isEmpty)
    }

    /// Web's `Log.tsx` `forcedWorkoutDate` path merges exercises from EVERY workout saved on
    /// the target date (`allSaved.flatMap`), not just the first -- someone can save more than
    /// one workout on the same calendar date (e.g. a morning and evening session). Regression
    /// guard for `loadPastDate`'s prior `workouts.first` shortcut, which silently dropped any
    /// additional same-date workouts' exercises.
    func testLoadPastDateMergesExercisesFromAllWorkoutsSavedThatDate() async {
        let morningWorkout = Workout(
            id: "wA", userId: "user-1", title: "Morning Session", date: "2026-07-01",
            durationMinutes: 30, notes: nil, muscleGroups: ["Legs"],
            createdAt: "2026-07-01T08:00:00Z"
        )
        let eveningWorkout = Workout(
            id: "wB", userId: "user-1", title: "Evening Session", date: "2026-07-01",
            durationMinutes: 20, notes: nil, muscleGroups: ["Chest"],
            createdAt: "2026-07-01T18:00:00Z"
        )
        await workoutRepo.setStubbedWorkouts([morningWorkout, eveningWorkout])
        await workoutRepo.setStubbedExerciseRows(
            [makeExerciseSetRow(id: "r1", workoutId: "wA", name: "Squat", muscleGroup: "Legs", reps: 8, weight: 225, orderIndex: 0, exerciseDbId: "db-squat")],
            forWorkoutId: "wA"
        )
        await workoutRepo.setStubbedExerciseRows(
            [makeExerciseSetRow(id: "r2", workoutId: "wB", name: "Bench Press", muscleGroup: "Chest", reps: 10, weight: 135, orderIndex: 0, exerciseDbId: "db-bench")],
            forWorkoutId: "wB"
        )

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: .pastDate("2026-07-01"))

        XCTAssertEqual(sut.entryMode, .pastDateEdit(date: "2026-07-01"))
        XCTAssertEqual(Set(sut.exercises.map(\.name)), Set(["Squat", "Bench Press"]), "exercises from BOTH workouts saved on the date should be present, not just the first")
        XCTAssertTrue(sut.exercises.contains(where: { $0.name == "Squat" && $0.sets.first?.weight == 225 }))
        XCTAssertTrue(sut.exercises.contains(where: { $0.name == "Bench Press" && $0.sets.first?.weight == 135 }))
    }

    func testResolveEntryNothingFallsBackToBlank() async {
        let sut = makeSUT()
        await sut.resolveEntry(deepLink: nil)

        XCTAssertEqual(sut.entryMode, .blank)
    }

    // MARK: - Elapsed timer

    func testElapsedTimerStartsPaused() {
        let sut = makeSUT()
        XCTAssertTrue(sut.isPaused)
        XCTAssertEqual(sut.elapsedSeconds, 0)
    }

    func testTogglePauseFlipsPausedState() {
        let sut = makeSUT()
        sut.togglePause()
        XCTAssertFalse(sut.isPaused)
        sut.togglePause()
        XCTAssertTrue(sut.isPaused)
    }

    func testTickOnlyIncrementsWhileUnpaused() {
        let sut = makeSUT()
        sut.tick()
        XCTAssertEqual(sut.elapsedSeconds, 0, "should not tick while paused")

        sut.togglePause()
        sut.tick()
        sut.tick()
        XCTAssertEqual(sut.elapsedSeconds, 2)

        sut.togglePause()
        sut.tick()
        XCTAssertEqual(sut.elapsedSeconds, 2, "should not tick once paused again")
    }

    // MARK: - Rest timer

    func testMarkSetDoneStartsRestTimerForReadySet() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 100, reps: 8)

        sut.markSetDone(exerciseId: exerciseId, setId: setId)

        XCTAssertTrue(sut.exercises[0].sets[0].done)
        XCTAssertNotNil(sut.restSecondsLeft)
    }

    func testMarkSetDoneDoesNotStartRestTimerForUnreadySet() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        // "Bench Press" resolves to .weightReps, whose seeded defaults are
        // weight=0/reps=0 -- reps>0 is required for readiness, so this set is
        // unready without any further setup.

        sut.markSetDone(exerciseId: exerciseId, setId: setId)

        XCTAssertFalse(sut.exercises[0].sets[0].done)
        XCTAssertNil(sut.restSecondsLeft)
    }

    func testMarkSetDoneUnmarkStopsRestTimerForSameSet() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 100, reps: 8)

        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        XCTAssertNotNil(sut.restSecondsLeft)

        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        XCTAssertFalse(sut.exercises[0].sets[0].done)
        XCTAssertNil(sut.restSecondsLeft)
    }

    func testRestTickCountsDownAndClearsAtZero() {
        UserDefaults.standard.set(3, forKey: "athlix_default_rest_secs")
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 100, reps: 8)

        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        XCTAssertEqual(sut.restSecondsLeft, 3)

        sut.restTick()
        XCTAssertEqual(sut.restSecondsLeft, 2)
        sut.restTick()
        XCTAssertEqual(sut.restSecondsLeft, 1)
        sut.restTick()
        XCTAssertNil(sut.restSecondsLeft)
    }

    // MARK: - Set CRUD cap

    func testAddSetRespectsCapAndSetsMessage() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        for _ in 0..<19 { sut.addSet(exerciseId: exerciseId) } // 1 seeded + 19 = 20
        XCTAssertEqual(sut.exercises[0].sets.count, 20)

        sut.addSet(exerciseId: exerciseId)

        XCTAssertEqual(sut.exercises[0].sets.count, 20)
        XCTAssertEqual(sut.setCapMessage, "Maximum 20 sets per exercise")
    }

    func testAddSetBelowCapAppendsSet() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let originalCount = sut.exercises[0].sets.count

        sut.addSet(exerciseId: exerciseId)

        XCTAssertEqual(sut.exercises[0].sets.count, originalCount + 1)
        XCTAssertNil(sut.setCapMessage)
    }

    func testCopySetRespectsCap() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        for _ in 0..<19 { sut.addSet(exerciseId: exerciseId) } // 1 seeded + 19 = 20
        XCTAssertEqual(sut.exercises[0].sets.count, 20)
        let firstSetId = sut.exercises[0].sets[0].id

        sut.copySet(exerciseId: exerciseId, setId: firstSetId)

        XCTAssertEqual(sut.exercises[0].sets.count, 20)
        XCTAssertEqual(sut.setCapMessage, "Maximum 20 sets per exercise")
    }

    func testCopySetInsertsDuplicateAfterSourceById() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.addSet(exerciseId: exerciseId) // now 2 sets
        let originalIds = sut.exercises[0].sets.map(\.id)
        let sourceId = originalIds[0]

        sut.copySet(exerciseId: exerciseId, setId: sourceId)

        let newIds = sut.exercises[0].sets.map(\.id)
        XCTAssertEqual(newIds.count, 3)
        XCTAssertEqual(newIds[0], sourceId)
        XCTAssertEqual(newIds[2], originalIds[1], "copy should be inserted immediately after the source, not appended")
    }

    func testRemoveSetById() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.addSet(exerciseId: exerciseId) // now 2 sets
        let ids = sut.exercises[0].sets.map(\.id)

        sut.removeSet(exerciseId: exerciseId, setId: ids[0])

        XCTAssertEqual(sut.exercises[0].sets.map(\.id), [ids[1]])
    }

    func testRemoveExerciseById() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        sut.addExercise(name: "Squat", muscleGroup: "Legs", exerciseDbId: nil)
        let benchId = sut.exercises[0].id
        let squatId = sut.exercises[1].id

        sut.removeExercise(exerciseId: benchId)

        XCTAssertEqual(sut.exercises.map(\.id), [squatId])
    }

    // MARK: - Exercise CRUD dedupe

    func testAddExerciseDedupesCaseInsensitively() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        XCTAssertEqual(sut.exercises.count, 1)

        sut.addExercise(name: "bench press", muscleGroup: "Chest", exerciseDbId: nil)

        XCTAssertEqual(sut.exercises.count, 1, "should not create a duplicate entry")
    }

    func testAddExerciseFocusesExistingEntryOnDuplicate() {
        let sut = makeSUT()
        let firstId = sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)

        let returnedId = sut.addExercise(name: "BENCH PRESS", muscleGroup: "Chest", exerciseDbId: nil)

        XCTAssertEqual(returnedId, firstId)
        XCTAssertEqual(sut.focusedExerciseId, firstId)
    }

    // MARK: - cycleInputType

    func testCycleInputTypeResetsSetsAndClearsDone() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 135, reps: 8)
        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        XCTAssertTrue(sut.exercises[0].sets[0].done)

        sut.cycleInputType(exerciseId: exerciseId)

        let updated = sut.exercises[0]
        XCTAssertFalse(updated.sets[0].done)
        // weightReps was the resolved default for "Bench Press", so the cycle
        // should move to the next entry after .weightReps, i.e. .repsOnly.
        XCTAssertEqual(updated.inputTypeOverride, .repsOnly)
        XCTAssertEqual(updated.sets[0].weight, ExerciseInputType.repsOnly.defaultSetValues.primary)
        XCTAssertEqual(updated.sets[0].reps, ExerciseInputType.repsOnly.defaultSetValues.secondary)
    }

    func testCycleInputTypeForcedJumpsDirectly() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id

        sut.cycleInputType(exerciseId: exerciseId, forced: .timeOnly)

        XCTAssertEqual(sut.exercises[0].inputTypeOverride, .timeOnly)
    }

    // MARK: - clearPrefill

    /// Mirrors web's `handleClearPrefill`: resets ALL of the exercise's sets'
    /// weight/reps back to the resolved input type's `defaultSetValues`
    /// (not zero/nil), marks them all not-done, and permanently records the
    /// exercise's id in `hiddenPrefillExerciseIds` -- the parent-level state
    /// that lets the "Last session" banner stay hidden even if the user
    /// navigates away from and back to this exercise within the same session.
    func testClearPrefillResetsSetsToDefaultsMarksUndoneAndHidesBanner() {
        let sut = makeSUT()
        let exercise = makeExerciseEntry(
            name: "Deadlift", // resolves to .weightReps (no exact/pattern match, falls to default)
            sets: [
                makeSet(weight: 225, reps: 5, done: true),
                makeSet(weight: 245, reps: 3, done: true),
            ]
        )
        sut.loadExercises([exercise])
        let exerciseId = exercise.id
        XCTAssertFalse(sut.hiddenPrefillExerciseIds.contains(exerciseId))

        sut.clearPrefill(exerciseId: exerciseId)

        let updated = sut.exercises[0]
        let defaults = ExerciseInputType.weightReps.defaultSetValues
        for set in updated.sets {
            XCTAssertEqual(set.weight, defaults.primary)
            XCTAssertEqual(set.reps, defaults.secondary)
            XCTAssertFalse(set.done)
        }
        XCTAssertTrue(sut.hiddenPrefillExerciseIds.contains(exerciseId))
    }

    /// Guards against a stale-id no-op silently corrupting unrelated state --
    /// same defensive shape as the other id-based mutators in this suite.
    func testClearPrefillWithUnknownExerciseIdIsNoOp() {
        let sut = makeSUT()
        let exercise = makeExerciseEntry(name: "Squat", sets: [makeSet(weight: 100, reps: 5, done: true)])
        sut.loadExercises([exercise])

        sut.clearPrefill(exerciseId: "does-not-exist")

        XCTAssertEqual(sut.exercises[0].sets[0].weight, 100)
        XCTAssertTrue(sut.exercises[0].sets[0].done)
        XCTAssertTrue(sut.hiddenPrefillExerciseIds.isEmpty)
    }

    // MARK: - setOptionalWeight

    func testSetOptionalWeightUpdatesExerciseEntryFlag() {
        let sut = makeSUT()
        sut.addExercise(name: "Push-ups", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.cycleInputType(exerciseId: exerciseId, forced: .repsOnly)
        XCTAssertNil(sut.exercises.first(where: { $0.id == exerciseId })?.optionalWeight)

        sut.setOptionalWeight(exerciseId: exerciseId, enabled: true)

        XCTAssertEqual(sut.exercises.first(where: { $0.id == exerciseId })?.optionalWeight, true)
    }

    // MARK: - setLoadedPlan

    func testSetLoadedPlanUpdatesLoadedPlanState() {
        let sut = makeSUT()
        XCTAssertNil(sut.loadedPlan)

        sut.setLoadedPlan(id: "plan-1", title: "Push Day")

        XCTAssertEqual(sut.loadedPlan, LoadedPlanInfo(id: "plan-1", title: "Push Day"))
    }

    // MARK: - setUnitPreference

    func testSetUnitPreferenceUpdatesLocalStateAndPersistsViaProfileRepository() async {
        let sut = makeSUT()
        await profileRepo.setStubbedProfile(
            Profile(
                id: "user-1", fullName: nil, unitPreference: .kg, themePreference: "dark",
                bodyWeight: nil, bodyWeightUnit: .kg, heightFeet: nil, heightInches: nil
            )
        )

        await sut.setUnitPreference(.kg)

        XCTAssertEqual(sut.unitPreference, .kg, "local display unit should update immediately")
        let lastUpdate = await profileRepo.lastUpdate
        XCTAssertEqual(lastUpdate?.unitPreference, .kg)
        let fetchCount = await profileRepo.fetchCount
        XCTAssertEqual(fetchCount, 0, "setUnitPreference should only write, never re-fetch")
    }

    /// Per this milestone's established error-handling pattern (see
    /// `testSaveFailureDoesNotClearDraft`-adjacent design intent for the save
    /// path, and `setUnitPreference`'s own doc comment): a failed background
    /// persist must not roll back the in-session value the user just picked --
    /// it should only fail to survive to the NEXT session, not interrupt the
    /// current one.
    func testSetUnitPreferenceKeepsLocalChangeEvenIfPersistFails() async {
        let sut = makeSUT()
        await profileRepo.setShouldThrow(true)

        await sut.setUnitPreference(.kg)

        XCTAssertEqual(sut.unitPreference, .kg, "local state must still update even though the persist call throws")
        let lastUpdate = await profileRepo.lastUpdate
        XCTAssertEqual(lastUpdate?.unitPreference, .kg, "the repository should still have been called with the new value before throwing")
    }

    // MARK: - changeDate

    func testChangeDateRejectsFutureDates() {
        let sut = makeSUT()
        let originalStart = sut.startAt
        let future = Calendar.current.date(byAdding: .day, value: 5, to: Date())!

        sut.changeDate(to: future)

        XCTAssertEqual(sut.startAt, originalStart)
        XCTAssertTrue(sut.isFutureDateBlocked)
    }

    func testChangeDateResetsElapsedTimeOnValidChange() {
        let sut = makeSUT()
        sut.togglePause()
        sut.tick()
        sut.tick()
        XCTAssertEqual(sut.elapsedSeconds, 2)

        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        sut.changeDate(to: yesterday)

        XCTAssertEqual(sut.elapsedSeconds, 0)
        XCTAssertTrue(sut.isPaused)
        XCTAssertFalse(sut.isFutureDateBlocked)
        XCTAssertTrue(Calendar.current.isDate(sut.startAt, inSameDayAs: yesterday))
    }

    // MARK: - save()

    func testSaveBuildsCorrectInputAndClearsDraft() async throws {
        let store = WorkoutDraftStore(directory: tempDir)
        let sut = ActiveWorkoutViewModel(
            userId: "user-1", workoutRepository: workoutRepo, exerciseLibraryRepository: libraryRepo,
            profileRepository: profileRepo, draftStore: store, title: "Push Day", startAt: Date()
        )
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.addSet(exerciseId: exerciseId)
        sut.addSet(exerciseId: exerciseId)
        let setIds = sut.exercises[0].sets.map(\.id)
        XCTAssertEqual(setIds.count, 3)

        sut.updateSet(exerciseId: exerciseId, setId: setIds[0], weight: 135, reps: 8)
        sut.markSetDone(exerciseId: exerciseId, setId: setIds[0])
        // setIds[1] left at its seeded weight=0/reps=0, not marked done -- must be excluded.
        sut.updateSet(exerciseId: exerciseId, setId: setIds[2], weight: 145, reps: 6)
        sut.markSetDone(exerciseId: exerciseId, setId: setIds[2])

        sut.togglePause()
        sut.tick()
        sut.tick()
        sut.tick() // 3 seconds elapsed -> 0 minutes

        // Ensure a draft file exists before saving, so we can assert it's cleared after.
        store.save(WorkoutDraft(id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil, savedAt: Date()))
        XCTAssertNotNil(store.load())

        let result = try await sut.save()

        XCTAssertEqual(result.title, "Push Day")
        let input = await workoutRepo.getLastSaveInput()
        XCTAssertEqual(input?.exercises.count, 1)
        XCTAssertEqual(input?.exercises.first?.completedSets.count, 2, "only done sets survive")
        XCTAssertEqual(input?.durationMinutes, 0)
        XCTAssertNil(store.load(), "draft should be cleared after a successful save")

        _ = exerciseId
    }

    func testSaveComputesDurationFromElapsedSeconds() async throws {
        let sut = makeSUT()
        sut.addExercise(name: "Squat", muscleGroup: "Legs", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 225, reps: 5)
        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        sut.togglePause()
        for _ in 0..<125 { sut.tick() } // 125s -> 2 minutes

        _ = try await sut.save()

        let input = await workoutRepo.getLastSaveInput()
        XCTAssertEqual(input?.durationMinutes, 2)
    }

    func testSaveFailureDoesNotClearDraft() async {
        let store = WorkoutDraftStore(directory: tempDir)
        let sut = ActiveWorkoutViewModel(
            userId: "user-1", workoutRepository: workoutRepo, exerciseLibraryRepository: libraryRepo,
            profileRepository: profileRepo, draftStore: store, title: "Push Day", startAt: Date()
        )
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 135, reps: 8)
        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        await workoutRepo.setShouldThrowOnSave(true)

        // addExercise already persisted a draft (exercises.count changed).
        XCTAssertNotNil(store.load())

        do {
            _ = try await sut.save()
            XCTFail("Expected save() to throw when the repository throws")
        } catch {
            // expected
        }

        XCTAssertNotNil(store.load(), "draft must survive a failed save -- clear() must only run on success")
    }

    // MARK: - Regression: changeDate time-of-day preservation

    func testChangeDatePreservesTimeOfDay() {
        var components = DateComponents()
        components.year = 2026
        components.month = 7
        components.day = 14
        components.hour = 19
        components.minute = 3
        components.second = 27
        let originalStart = Calendar.current.date(from: components)!

        let sut = makeSUT(startAt: originalStart)
        let originalTimeComponents = Calendar.current.dateComponents([.hour, .minute, .second], from: originalStart)

        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        sut.changeDate(to: yesterday)

        let newTimeComponents = Calendar.current.dateComponents([.hour, .minute, .second], from: sut.startAt)
        XCTAssertEqual(newTimeComponents.hour, originalTimeComponents.hour)
        XCTAssertEqual(newTimeComponents.minute, originalTimeComponents.minute)
        XCTAssertEqual(newTimeComponents.second, originalTimeComponents.second)
        XCTAssertTrue(Calendar.current.isDate(sut.startAt, inSameDayAs: yesterday), "the DAY should still change")
    }

    // MARK: - Regression: rest timer isolation between sets

    func testMarkSetDoneUnmarkingADifferentSetDoesNotStopRestTimer() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.addSet(exerciseId: exerciseId) // now 2 sets: A, B
        let ids = sut.exercises[0].sets.map(\.id)
        let setAId = ids[0]
        let setBId = ids[1]

        sut.updateSet(exerciseId: exerciseId, setId: setAId, weight: 100, reps: 8)
        sut.updateSet(exerciseId: exerciseId, setId: setBId, weight: 100, reps: 8)

        // Mark B done first -- starts the (single, shared) rest timer,
        // tracked against B's id.
        sut.markSetDone(exerciseId: exerciseId, setId: setBId)
        XCTAssertNotNil(sut.restSecondsLeft)

        // Mark A done -- this legitimately RESTARTS the shared timer and
        // retargets it to A (marking any new set done always (re)starts the
        // rest timer, per the design spec). From this point on, A -- not B
        // -- is the timer's owner.
        sut.markSetDone(exerciseId: exerciseId, setId: setAId)
        XCTAssertNotNil(sut.restSecondsLeft)
        let secondsAfterRetargetingToA = sut.restSecondsLeft

        // Advance the timer partway so we can prove it wasn't reset/stopped
        // by the next step.
        sut.restTick()
        let secondsAfterOneTick = sut.restSecondsLeft
        XCTAssertEqual(secondsAfterOneTick, secondsAfterRetargetingToA.map { $0 - 1 })

        // Now un-mark B (still `done: true` from the first step). B is NOT
        // the timer's current owner (A is, since A was marked done more
        // recently) -- this is the actual regression case: un-marking a set
        // that isn't the timer's owner must leave the running timer alone.
        sut.markSetDone(exerciseId: exerciseId, setId: setBId)

        XCTAssertFalse(sut.exercises[0].sets.first(where: { $0.id == setBId })!.done, "B itself should still un-mark correctly")
        XCTAssertNotNil(sut.restSecondsLeft, "un-marking a set that isn't the timer's owner must not stop A's rest timer")
        XCTAssertEqual(sut.restSecondsLeft, secondsAfterOneTick, "the timer must be untouched, not reset or stopped")
        XCTAssertTrue(sut.exercises[0].sets.first(where: { $0.id == setAId })!.done, "A should still be marked done")
    }

    // MARK: - Regression: markSetDone persistence

    /// Regression test for a real bug: `markSetDone` previously mutated
    /// in-memory state without calling `persistDraft()`, so toggling a set's
    /// done status silently reverted after navigating away and back (the
    /// on-disk draft never reflected the change). Verifies directly against
    /// a real `WorkoutDraftStore` backed by a temp directory that marking a
    /// set done actually writes through to disk, not just updates
    /// `sut.exercises`.
    ///
    /// Baseline correctness: `addExercise` persists a draft with the new
    /// set's `done` seeded `false` (see `SetCRUDEngine.addSet`), and
    /// `updateSet` -- called next to make the set "ready" -- does NOT persist
    /// (it only mutates weight/reps in memory). So the on-disk draft is
    /// guaranteed to still show `done == false` right up until `markSetDone`
    /// is called, regardless of the bug -- discriminating this test from one
    /// that could pass by coincidence on stale disk state.
    func testMarkSetDonePersistsToDraftStore() {
        let sut = makeSUT()
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 135, reps: 8)

        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        XCTAssertTrue(sut.exercises[0].sets[0].done, "sanity: in-memory state toggled to done")

        // Genuinely separate read: a FRESH WorkoutDraftStore instance backed
        // by the same temp directory, not sut's own draftStore reference.
        let freshStore = WorkoutDraftStore(directory: tempDir)
        let loaded = freshStore.load()
        XCTAssertNotNil(loaded, "markSetDone must persist a draft to disk")
        let persistedSet = loaded?.exercises.first(where: { $0.id == exerciseId })?.sets.first(where: { $0.id == setId })
        XCTAssertEqual(persistedSet?.done, true, "the on-disk draft must reflect the set being marked done, not just sut.exercises in memory")
    }

    /// Companion to the above for the un-mark branch, which had the
    /// identical bug (missing `persistDraft()` right before its early
    /// `return`). To genuinely isolate the un-mark branch -- rather than
    /// accidentally passing because the disk state happened to already be
    /// stale/false from before -- this forces a KNOWN on-disk baseline of
    /// `done == true` directly through the store (bypassing whether the
    /// mark-done call above persisted correctly), then asserts the
    /// un-mark call flips it to `false` on disk.
    func testUnmarkSetDonePersistsToDraftStore() {
        let store = WorkoutDraftStore(directory: tempDir)
        let sut = ActiveWorkoutViewModel(
            userId: "user-1", workoutRepository: workoutRepo, exerciseLibraryRepository: libraryRepo,
            profileRepository: profileRepo, draftStore: store, title: "Push Day", startAt: Date()
        )
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 135, reps: 8)
        sut.markSetDone(exerciseId: exerciseId, setId: setId)
        XCTAssertTrue(sut.exercises[0].sets[0].done, "sanity: marked done in memory")

        // Force a known on-disk baseline of done == true, independent of
        // whether the mark-done call above happened to persist.
        let doneDraft = WorkoutDraft(
            id: nil, title: sut.title, startAt: sut.startAt, elapsedSeconds: sut.elapsedSeconds,
            exercises: sut.exercises, notes: sut.notes, savedAt: Date()
        )
        store.save(doneDraft)
        XCTAssertEqual(
            WorkoutDraftStore(directory: tempDir).load()?.exercises.first?.sets.first?.done, true,
            "sanity: on-disk baseline seeded as done before the un-mark call under test"
        )

        sut.markSetDone(exerciseId: exerciseId, setId: setId) // un-mark
        XCTAssertFalse(sut.exercises[0].sets[0].done, "sanity: in-memory state toggled back to not-done")

        let freshStore = WorkoutDraftStore(directory: tempDir)
        let loaded = freshStore.load()
        XCTAssertNotNil(loaded)
        let persistedSet = loaded?.exercises.first(where: { $0.id == exerciseId })?.sets.first(where: { $0.id == setId })
        XCTAssertEqual(persistedSet?.done, false, "the on-disk draft must reflect the set being un-marked, not stay stuck at done=true")
    }

    // MARK: - Regression: 30-tick periodic autosave

    func testThirtyTicksTriggersPeriodicAutosave() {
        let store = WorkoutDraftStore(directory: tempDir)
        let sut = ActiveWorkoutViewModel(
            userId: "user-1", workoutRepository: workoutRepo, exerciseLibraryRepository: libraryRepo,
            profileRepository: profileRepo, draftStore: store, title: "Autosave Test", startAt: Date()
        )
        // No exercises added, so the exercises-count-changed autosave path
        // never fires -- isolates this test to the periodic tick-driven path.
        XCTAssertNil(store.load(), "no draft should exist yet")

        sut.togglePause()
        for _ in 0..<30 { sut.tick() }

        let loaded = store.load()
        XCTAssertNotNil(loaded, "the 30th tick should have persisted a draft")
        XCTAssertEqual(loaded?.title, "Autosave Test")
        XCTAssertEqual(loaded?.elapsedSeconds, 30)
    }
}
