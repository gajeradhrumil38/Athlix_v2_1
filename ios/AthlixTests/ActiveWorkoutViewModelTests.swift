import XCTest
@testable import Athlix
import AthlixCore

// MARK: - Mocks

actor MockWorkoutRepository: WorkoutRepository {
    var stubbedWorkouts: [Workout] = []
    var stubbedSaveResult: Workout?
    var shouldThrowOnFetch = false
    var shouldThrowOnSave = false
    private(set) var lastSaveInput: NewWorkoutInput?
    private(set) var lastFetchRange: (from: Date, to: Date)?

    func setStubbedWorkouts(_ workouts: [Workout]) { stubbedWorkouts = workouts }
    func setStubbedSaveResult(_ workout: Workout) { stubbedSaveResult = workout }
    func setShouldThrowOnFetch(_ value: Bool) { shouldThrowOnFetch = value }
    func setShouldThrowOnSave(_ value: Bool) { shouldThrowOnSave = value }
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

// MARK: - Test suite

@MainActor
final class ActiveWorkoutViewModelTests: XCTestCase {
    var tempDir: URL!
    var workoutRepo: MockWorkoutRepository!
    var libraryRepo: MockExerciseLibraryRepository!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        workoutRepo = MockWorkoutRepository()
        libraryRepo = MockExerciseLibraryRepository()
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

    func testResolveEntryIgnoresDraftFromADifferentDay() async {
        let store = WorkoutDraftStore(directory: tempDir)
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
        let draft = WorkoutDraft(
            id: nil, title: "Old Workout", startAt: yesterday, elapsedSeconds: 300,
            exercises: [makeExerciseEntry(name: "Squat")], notes: nil, savedAt: Date()
        )
        store.save(draft)

        let sut = makeSUT()
        await sut.resolveEntry(deepLink: nil)

        XCTAssertEqual(sut.entryMode, .blank)
        XCTAssertTrue(sut.exercises.isEmpty)
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

        sut.copySet(exerciseId: exerciseId, at: 0)

        XCTAssertEqual(sut.exercises[0].sets.count, 20)
        XCTAssertEqual(sut.setCapMessage, "Maximum 20 sets per exercise")
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
            draftStore: store, title: "Push Day", startAt: Date()
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
}
