import XCTest
@testable import Athlix
import AthlixCore

// MARK: - Mock

actor MockTemplateRepositoryForPlanEditor: TemplateRepository {
    var stubbedNameExists = false
    var stubbedSaveId = "saved-template-id"
    var shouldThrowOnSave = false
    private(set) var lastCheckNameTitle: String?
    private(set) var lastCheckNameExcludeId: String?
    private(set) var checkNameCallCount = 0
    private(set) var lastSaveUserId: String?
    private(set) var lastSaveTemplateId: String?
    private(set) var lastSaveTitle: String?
    private(set) var lastSaveExercises: [TemplateExercise]?
    private(set) var saveCallCount = 0

    func setStubbedNameExists(_ value: Bool) { stubbedNameExists = value }
    func setStubbedSaveId(_ value: String) { stubbedSaveId = value }
    func setShouldThrowOnSave(_ value: Bool) { shouldThrowOnSave = value }

    func fetchTemplates(userId: String) async throws -> [Template] { [] }

    func checkNameExists(userId: String, title: String, excludeId: String?) async throws -> Bool {
        lastCheckNameTitle = title
        lastCheckNameExcludeId = excludeId
        checkNameCallCount += 1
        return stubbedNameExists
    }

    func saveTemplate(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String {
        lastSaveUserId = userId
        lastSaveTemplateId = templateId
        lastSaveTitle = title
        lastSaveExercises = exercises
        saveCallCount += 1
        if shouldThrowOnSave { throw RepositoryError.network }
        return stubbedSaveId
    }

    func deleteTemplate(userId: String, templateId: String) async throws {}
}

// MARK: - Test suite

@MainActor
final class PlanEditorViewModelTests: XCTestCase {
    var repo: MockTemplateRepositoryForPlanEditor!

    override func setUp() {
        super.setUp()
        repo = MockTemplateRepositoryForPlanEditor()
    }

    private func makeSUT(existing: Template? = nil) -> PlanEditorViewModel {
        PlanEditorViewModel(userId: "user-1", templateRepository: repo, existing: existing)
    }

    private func makeExistingTemplate(
        id: String = "t1",
        title: String = "Push Day",
        exercises: [TemplateExercise] = []
    ) -> Template {
        Template(id: id, userId: "user-1", title: title, createdAt: "2026-07-01T00:00:00Z", exercises: exercises)
    }

    private func makeTemplateExercise(
        id: String = "te-1", templateId: String = "t1", name: String = "Bench Press",
        defaultSets: Int = 3, defaultReps: Int = 8, defaultWeight: Double = 135, orderIndex: Int = 0
    ) -> TemplateExercise {
        TemplateExercise(
            id: id, templateId: templateId, name: name, muscleGroup: "Chest",
            defaultSets: defaultSets, defaultReps: defaultReps, defaultWeight: defaultWeight,
            orderIndex: orderIndex, exerciseDbId: nil
        )
    }

    // MARK: - Dirty tracking

    func testStartsCleanWhenInitializedFromExistingTemplate() {
        let existing = makeExistingTemplate(exercises: [makeTemplateExercise()])
        let sut = makeSUT(existing: existing)

        XCTAssertFalse(sut.isDirty)
    }

    func testStartsCleanForBrandNewTemplate() {
        // DECISION: a brand-new (never-saved) template starts clean, not dirty --
        // there is nothing yet to "save" until the user actually makes an edit
        // (adds an exercise, types a title, etc). Mirrors the existing-template
        // case: dirty means "differs from what would currently be persisted."
        let sut = makeSUT(existing: nil)

        XCTAssertFalse(sut.isDirty)
    }

    func testExistingTemplateReconstructsMultipleIdenticalPlannedSets() {
        // Guards the flattened-average reconstitution path: a TemplateExercise
        // with defaultSets: 3 must expand into exactly 3 PlannedSets, each
        // carrying the SAME defaultWeight/defaultReps values (this is the exact
        // spot most likely to hide an off-by-one or field-swap bug).
        let exercise = makeTemplateExercise(defaultSets: 3, defaultReps: 8, defaultWeight: 135)
        let existing = makeExistingTemplate(exercises: [exercise])

        let sut = makeSUT(existing: existing)

        XCTAssertEqual(sut.exercises.count, 1)
        XCTAssertEqual(sut.exercises[0].sets.count, 3)
        // Each reconstituted PlannedSet gets its OWN minted id (so it's a
        // valid ForEach/TextField binding target), so we can't compare the
        // sets array directly via Equatable against fixed-id literals --
        // instead assert weight/reps match on every set, and that the ids
        // are distinct (proving 3 genuinely separate sets, not 3 references
        // to the same one).
        XCTAssertTrue(sut.exercises[0].sets.allSatisfy { $0.weight == 135 && $0.reps == 8 })
        XCTAssertEqual(Set(sut.exercises[0].sets.map(\.id)).count, 3, "each reconstituted set should have a distinct id")
    }

    func testSetTitleMarksDirty() {
        let sut = makeSUT(existing: makeExistingTemplate())
        sut.setTitle("New Title")
        XCTAssertTrue(sut.isDirty)
    }

    func testAddExerciseMarksDirty() {
        let sut = makeSUT(existing: makeExistingTemplate())
        sut.addExercise(name: "Squat", muscleGroup: "Legs", exerciseDbId: nil)
        XCTAssertTrue(sut.isDirty)
    }

    func testRemoveExerciseMarksDirty() {
        let existing = makeExistingTemplate(exercises: [makeTemplateExercise()])
        let sut = makeSUT(existing: existing)
        let exerciseId = sut.exercises[0].id

        sut.removeExercise(exerciseId: exerciseId)

        XCTAssertTrue(sut.isDirty)
    }

    func testUpdateSetMarksDirty() {
        let existing = makeExistingTemplate(exercises: [makeTemplateExercise()])
        let sut = makeSUT(existing: existing)
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id

        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 200, reps: 5)

        XCTAssertTrue(sut.isDirty)
    }

    func testAddPlannedSetMarksDirty() {
        let existing = makeExistingTemplate(exercises: [makeTemplateExercise()])
        let sut = makeSUT(existing: existing)
        let exerciseId = sut.exercises[0].id
        XCTAssertFalse(sut.isDirty)

        sut.addPlannedSet(exerciseId: exerciseId)

        XCTAssertTrue(sut.isDirty)
    }

    // MARK: - Duplicate-name guard

    func testCheckNameCollisionAndSaveCallsCheckNameExistsWithTitleAndExcludeId() async throws {
        let existing = makeExistingTemplate(id: "t1", title: "Push Day")
        let sut = makeSUT(existing: existing)
        sut.setTitle("Push Day v2")

        try await sut.checkNameCollisionAndSave()

        let title = await repo.lastCheckNameTitle
        let excludeId = await repo.lastCheckNameExcludeId
        XCTAssertEqual(title, "Push Day v2")
        XCTAssertEqual(excludeId, "t1")
    }

    func testCheckNameCollisionAndSaveExcludeIdIsNilForNewTemplate() async throws {
        let sut = makeSUT(existing: nil)
        sut.setTitle("Brand New")

        try await sut.checkNameCollisionAndSave()

        let excludeId = await repo.lastCheckNameExcludeId
        XCTAssertNil(excludeId)
    }

    func testCollisionPreventsSaveAndExposesCollisionState() async throws {
        await repo.setStubbedNameExists(true)
        let sut = makeSUT(existing: nil)
        sut.setTitle("Duplicate Name")

        try await sut.checkNameCollisionAndSave()

        let saveCallCount = await repo.saveCallCount
        XCTAssertEqual(saveCallCount, 0, "saveTemplate must not be called on a name collision")
        XCTAssertTrue(sut.nameCollisionDetected)
        XCTAssertTrue(sut.isDirty, "an unsaved collision must leave the editor dirty")
    }

    func testSuccessfulSaveCallsSaveTemplateAndClearsDirtyFlag() async throws {
        let sut = makeSUT(existing: nil)
        sut.setTitle("Fresh Plan")
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        XCTAssertTrue(sut.isDirty)

        try await sut.checkNameCollisionAndSave()

        let saveCallCount = await repo.saveCallCount
        XCTAssertEqual(saveCallCount, 1)
        let savedTitle = await repo.lastSaveTitle
        XCTAssertEqual(savedTitle, "Fresh Plan")
        XCTAssertFalse(sut.isDirty, "successful save should clear the dirty flag")
        XCTAssertFalse(sut.nameCollisionDetected)
    }

    func testSuccessfulSavePassesCorrectlyBuiltExercisesPayload() async throws {
        let sut = makeSUT(existing: nil)
        sut.setTitle("Leg Day")
        sut.addExercise(name: "Squat", muscleGroup: "Legs", exerciseDbId: "db-squat")
        let exerciseId = sut.exercises[0].id
        let setId = sut.exercises[0].sets[0].id
        sut.updateSet(exerciseId: exerciseId, setId: setId, weight: 225, reps: 5)

        try await sut.checkNameCollisionAndSave()

        let savedExercises = await repo.lastSaveExercises
        XCTAssertEqual(savedExercises?.count, 1)
        XCTAssertEqual(savedExercises?[0].name, "Squat")
        XCTAssertEqual(savedExercises?[0].defaultSets, 1)
        XCTAssertEqual(savedExercises?[0].defaultReps, 5)
        XCTAssertEqual(savedExercises?[0].defaultWeight, 225)
        XCTAssertEqual(savedExercises?[0].exerciseDbId, "db-squat")
    }

    func testSaveFailurePropagatesErrorAndLeavesStateIntact() async throws {
        await repo.setShouldThrowOnSave(true)
        let sut = makeSUT(existing: nil)
        sut.setTitle("Leg Day")
        sut.addExercise(name: "Squat", muscleGroup: "Legs", exerciseDbId: nil)
        XCTAssertTrue(sut.isDirty)

        do {
            try await sut.checkNameCollisionAndSave()
            XCTFail("Expected checkNameCollisionAndSave() to throw when saveTemplate throws")
        } catch {
            // expected
        }

        let saveCallCount = await repo.saveCallCount
        XCTAssertEqual(saveCallCount, 1, "saveTemplate should have been attempted (no collision)")
        XCTAssertTrue(sut.isDirty, "a failed save must NOT clear the dirty flag")
        XCTAssertNil(sut.templateId, "a failed save must NOT adopt a saved id")
        XCTAssertFalse(sut.nameCollisionDetected, "a save-time failure is not a name collision")
    }

    // MARK: - buildTemplateExercises averaging

    func testBuildTemplateExercisesComputesSetsCountAndExactAverages() {
        let sut = makeSUT(existing: nil)
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.updateSet(exerciseId: exerciseId, setId: sut.exercises[0].sets[0].id, weight: 100, reps: 10)
        // seed 2 extra sets to make 3 total
        sut.addPlannedSet(exerciseId: exerciseId)
        sut.addPlannedSet(exerciseId: exerciseId)
        let setIds = sut.exercises[0].sets.map(\.id)
        sut.updateSet(exerciseId: exerciseId, setId: setIds[1], weight: 110, reps: 10)
        sut.updateSet(exerciseId: exerciseId, setId: setIds[2], weight: 120, reps: 10)

        let result = sut.buildTemplateExercises()

        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].defaultSets, 3)
        XCTAssertEqual(result[0].defaultReps, 10)
        XCTAssertEqual(result[0].defaultWeight, 110, accuracy: 0.0001, "average of 100, 110, 120 is exactly 110")
    }

    func testBuildTemplateExercisesRoundsRepsToNearestInt() {
        // reps [8, 9, 9] -> mean 8.666... -> rounds to 9 (Swift's default
        // `.rounded()` rule: round-half-away-from-zero, though this case isn't
        // exactly at the .5 boundary so any standard rounding rule agrees).
        let sut = makeSUT(existing: nil)
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        let exerciseId = sut.exercises[0].id
        sut.addPlannedSet(exerciseId: exerciseId)
        sut.addPlannedSet(exerciseId: exerciseId)
        let setIds = sut.exercises[0].sets.map(\.id)
        sut.updateSet(exerciseId: exerciseId, setId: setIds[0], weight: 100, reps: 8)
        sut.updateSet(exerciseId: exerciseId, setId: setIds[1], weight: 100, reps: 9)
        sut.updateSet(exerciseId: exerciseId, setId: setIds[2], weight: 100, reps: 9)

        let result = sut.buildTemplateExercises()

        XCTAssertEqual(result[0].defaultReps, 9)
    }

    // MARK: - startSession

    func testStartSessionBuildsExerciseEntriesWithMatchingPlannedAndLiveValues() {
        let sut = makeSUT(existing: nil)
        sut.addExercise(name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil)
        sut.addExercise(name: "Squat", muscleGroup: "Legs", exerciseDbId: nil)
        let benchId = sut.exercises[0].id
        let squatId = sut.exercises[1].id
        sut.updateSet(exerciseId: benchId, setId: sut.exercises[0].sets[0].id, weight: 135, reps: 8)
        sut.addPlannedSet(exerciseId: squatId)
        let squatSetIds = sut.exercises[1].sets.map(\.id)
        sut.updateSet(exerciseId: squatId, setId: squatSetIds[0], weight: 225, reps: 5)
        sut.updateSet(exerciseId: squatId, setId: squatSetIds[1], weight: 225, reps: 5)

        let entries = sut.startSession()

        XCTAssertEqual(entries.count, 2)
        XCTAssertEqual(entries[0].sets.count, 1)
        XCTAssertEqual(entries[1].sets.count, 2)

        for entry in entries {
            for set in entry.sets {
                XCTAssertFalse(set.done)
                XCTAssertEqual(set.weight, set.plannedWeight)
                XCTAssertEqual(set.reps, set.plannedReps)
            }
        }

        XCTAssertEqual(entries[0].sets[0].weight, 135)
        XCTAssertEqual(entries[0].sets[0].plannedWeight, 135)
        XCTAssertEqual(entries[0].sets[0].reps, 8)
        XCTAssertEqual(entries[0].sets[0].plannedReps, 8)
    }

    // MARK: - Pending decision (mid-session plan editing prompt)

    func testHandleAddedExerciseWhilePlanLoadedSetsPendingDecision() {
        let sut = makeSUT(existing: nil)

        sut.handleAddedExerciseWhilePlanLoaded(exerciseName: "Deadlift", muscleGroup: "Back", exerciseDbId: "db-deadlift")

        XCTAssertEqual(
            sut.pendingDecision,
            .awaitingUpdateOrSessionOnly(exerciseName: "Deadlift", muscleGroup: "Back", exerciseDbId: "db-deadlift")
        )
    }

    func testResolvePendingDecisionUpdatePlanAddsExerciseAndClearsPending() {
        let sut = makeSUT(existing: nil)
        sut.handleAddedExerciseWhilePlanLoaded(exerciseName: "Deadlift", muscleGroup: "Back", exerciseDbId: nil)

        sut.resolvePendingDecision(.updatePlan)

        XCTAssertEqual(sut.pendingDecision, .none)
        XCTAssertEqual(sut.exercises.map(\.name), ["Deadlift"])
        XCTAssertEqual(sut.exercises.map(\.muscleGroup), ["Back"], "muscleGroup should be read off the stored pending state, not re-supplied by the caller")
    }

    func testResolvePendingDecisionSessionOnlyClearsPendingWithoutAddingExercise() {
        let sut = makeSUT(existing: nil)
        sut.handleAddedExerciseWhilePlanLoaded(exerciseName: "Deadlift", muscleGroup: "Back", exerciseDbId: nil)

        sut.resolvePendingDecision(.sessionOnly)

        XCTAssertEqual(sut.pendingDecision, .none)
        XCTAssertTrue(sut.exercises.isEmpty)
    }

    func testResolvePendingDecisionCancelClearsPendingWithoutAddingExercise() {
        let sut = makeSUT(existing: nil)
        sut.handleAddedExerciseWhilePlanLoaded(exerciseName: "Deadlift", muscleGroup: "Back", exerciseDbId: nil)

        sut.resolvePendingDecision(.cancel)

        XCTAssertEqual(sut.pendingDecision, .none)
        XCTAssertTrue(sut.exercises.isEmpty)
    }
}
