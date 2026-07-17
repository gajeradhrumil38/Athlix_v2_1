import Testing
@testable import AthlixCore
import Foundation

// MARK: - Helpers

private func makeSet(
    id: String,
    weight: Double? = nil,
    reps: Int? = nil,
    done: Bool = false,
    isPR: Bool = false,
    plannedWeight: Double? = nil,
    plannedReps: Int? = nil
) -> LoggedSet {
    LoggedSet(id: id, weight: weight, reps: reps, done: done, isPR: isPR, plannedWeight: plannedWeight, plannedReps: plannedReps)
}

private func makeExercise(id: String, name: String, sets: [LoggedSet] = []) -> ExerciseEntry {
    ExerciseEntry(
        id: id,
        name: name,
        muscleGroup: "Chest",
        exerciseDbId: nil,
        sets: sets,
        optionalWeight: nil,
        inputTypeOverride: nil,
        lastSession: nil
    )
}

private func makeSets(count: Int) -> [LoggedSet] {
    (0..<count).map { makeSet(id: "s\($0)", weight: Double($0), reps: $0) }
}

// MARK: - isAtCap

@Test func isAtCapIsFalseJustBelowCap() {
    #expect(SetCRUDEngine.isAtCap(makeSets(count: 19)) == false)
}

@Test func isAtCapIsTrueAtCap() {
    #expect(SetCRUDEngine.isAtCap(makeSets(count: 20)) == true)
}

// MARK: - addSet

@Test func addSetSeedsFromLastSetWeightAndReps() {
    let sets = [
        makeSet(id: "s1", weight: 100, reps: 8, done: true),
        makeSet(id: "s2", weight: 110, reps: 6, done: true, plannedWeight: 105, plannedReps: 7),
    ]
    let result = SetCRUDEngine.addSet(to: sets, newId: "new")
    #expect(result.count == 3)
    #expect(result.last?.id == "new")
    #expect(result.last?.weight == 110)
    #expect(result.last?.reps == 6)
}

@Test func addSetNewSetHasDoneFalseIsPRFalseAndNoPlannedValues() {
    let sets = [makeSet(id: "s1", weight: 100, reps: 8, done: true, isPR: true, plannedWeight: 95, plannedReps: 8)]
    let result = SetCRUDEngine.addSet(to: sets, newId: "new")
    let added = result.last!
    #expect(added.done == false)
    #expect(added.isPR == false)
    #expect(added.plannedWeight == nil)
    #expect(added.plannedReps == nil)
}

@Test func addSetOnEmptySetsProducesNilSeededValues() {
    let result = SetCRUDEngine.addSet(to: [], newId: "new")
    #expect(result.count == 1)
    #expect(result[0].weight == nil)
    #expect(result[0].reps == nil)
}

@Test func addSetIsNoOpAtCapOfTwenty() {
    let sets = makeSets(count: 20)
    let result = SetCRUDEngine.addSet(to: sets, newId: "new")
    #expect(result.count == 20)
    #expect(result == sets)
}

@Test func addSetSucceedsJustBelowCap() {
    let sets = makeSets(count: 19)
    let result = SetCRUDEngine.addSet(to: sets, newId: "new")
    #expect(result.count == 20)
}

// MARK: - copySet

@Test func copySetInsertsImmediatelyAfterSourceIndex() {
    let sets = [
        makeSet(id: "s0", weight: 10, reps: 10),
        makeSet(id: "s1", weight: 20, reps: 8),
        makeSet(id: "s2", weight: 30, reps: 6),
    ]
    let result = SetCRUDEngine.copySet(in: sets, at: 0, newId: "copy")
    #expect(result.count == 4)
    #expect(result.map(\.id) == ["s0", "copy", "s1", "s2"])
}

@Test func copySetOfMiddleSetInsertsAtCorrectPositionAndShiftsRest() {
    let sets = [
        makeSet(id: "s0", weight: 10, reps: 10),
        makeSet(id: "s1", weight: 20, reps: 8),
        makeSet(id: "s2", weight: 30, reps: 6),
        makeSet(id: "s3", weight: 40, reps: 4),
    ]
    let result = SetCRUDEngine.copySet(in: sets, at: 1, newId: "copy")
    #expect(result.map(\.id) == ["s0", "s1", "copy", "s2", "s3"])
    // sets after the insertion point shift correctly
    #expect(result[3].id == "s2")
    #expect(result[3].weight == 30)
    #expect(result[4].id == "s3")
    #expect(result[4].weight == 40)
}

@Test func copySetGivesNewIdDifferentFromSource() {
    let sets = [makeSet(id: "s0", weight: 10, reps: 10)]
    let result = SetCRUDEngine.copySet(in: sets, at: 0, newId: "copy-id")
    #expect(result[1].id == "copy-id")
    #expect(result[1].id != result[0].id)
}

@Test func copySetCopiesWeightRepsAndPlannedValues() {
    let source = makeSet(id: "s0", weight: 135, reps: 8, done: true, isPR: true, plannedWeight: 130, plannedReps: 8)
    let result = SetCRUDEngine.copySet(in: [source], at: 0, newId: "copy")
    let copy = result[1]
    #expect(copy.weight == 135)
    #expect(copy.reps == 8)
    #expect(copy.plannedWeight == 130)
    #expect(copy.plannedReps == 8)
}

@Test func copySetResetsDoneAndIsPROnCopyRegardlessOfSourceState() {
    let doneSource = makeSet(id: "s0", weight: 135, reps: 8, done: true, isPR: true)
    let result1 = SetCRUDEngine.copySet(in: [doneSource], at: 0, newId: "copy1")
    #expect(result1[1].done == false)
    #expect(result1[1].isPR == false)

    let notDoneSource = makeSet(id: "s1", weight: 100, reps: 5, done: false, isPR: false)
    let result2 = SetCRUDEngine.copySet(in: [notDoneSource], at: 0, newId: "copy2")
    #expect(result2[1].done == false)
    #expect(result2[1].isPR == false)
}

@Test func copySetIsNoOpAtCapOfTwenty() {
    let sets = makeSets(count: 20)
    let result = SetCRUDEngine.copySet(in: sets, at: 0, newId: "copy")
    #expect(result.count == 20)
    #expect(result == sets)
}

@Test func copySetSucceedsJustBelowCap() {
    let sets = makeSets(count: 19)
    let result = SetCRUDEngine.copySet(in: sets, at: 0, newId: "copy")
    #expect(result.count == 20)
}

@Test func copySetOutOfBoundsIndexIsNoOp() {
    let sets = makeSets(count: 3)
    let result = SetCRUDEngine.copySet(in: sets, at: 99, newId: "copy")
    #expect(result == sets)
}

// MARK: - removeSet

@Test func removeSetRefusesBelowOneSet() {
    let sets = [makeSet(id: "s0", weight: 100, reps: 10)]
    let result = SetCRUDEngine.removeSet(from: sets, at: 0)
    #expect(result.count == 1)
    #expect(result == sets)
}

@Test func removeSetRemovesFirstIndex() {
    let sets = [
        makeSet(id: "s0", weight: 10, reps: 10),
        makeSet(id: "s1", weight: 20, reps: 8),
        makeSet(id: "s2", weight: 30, reps: 6),
    ]
    let result = SetCRUDEngine.removeSet(from: sets, at: 0)
    #expect(result.map(\.id) == ["s1", "s2"])
}

@Test func removeSetRemovesMiddleIndex() {
    let sets = [
        makeSet(id: "s0", weight: 10, reps: 10),
        makeSet(id: "s1", weight: 20, reps: 8),
        makeSet(id: "s2", weight: 30, reps: 6),
    ]
    let result = SetCRUDEngine.removeSet(from: sets, at: 1)
    #expect(result.map(\.id) == ["s0", "s2"])
}

@Test func removeSetRemovesLastIndex() {
    let sets = [
        makeSet(id: "s0", weight: 10, reps: 10),
        makeSet(id: "s1", weight: 20, reps: 8),
        makeSet(id: "s2", weight: 30, reps: 6),
    ]
    let result = SetCRUDEngine.removeSet(from: sets, at: 2)
    #expect(result.map(\.id) == ["s0", "s1"])
}

@Test func removeSetOutOfBoundsIndexIsNoOp() {
    let sets = [
        makeSet(id: "s0", weight: 10, reps: 10),
        makeSet(id: "s1", weight: 20, reps: 8),
    ]
    let result = SetCRUDEngine.removeSet(from: sets, at: 99)
    #expect(result == sets)
}

// MARK: - findExistingExerciseIndex

@Test func findExistingExerciseIndexMatchesCaseInsensitively() {
    let exercises = [
        makeExercise(id: "e0", name: "Bench Press"),
        makeExercise(id: "e1", name: "Squat"),
    ]
    #expect(SetCRUDEngine.findExistingExerciseIndex(in: exercises, matchingName: "bench press") == 0)
    #expect(SetCRUDEngine.findExistingExerciseIndex(in: exercises, matchingName: "SQUAT") == 1)
}

@Test func findExistingExerciseIndexReturnsNilWhenNoMatch() {
    let exercises = [makeExercise(id: "e0", name: "Bench Press")]
    #expect(SetCRUDEngine.findExistingExerciseIndex(in: exercises, matchingName: "Deadlift") == nil)
}

@Test func findExistingExerciseIndexReturnsFirstMatchAmongDuplicates() {
    let exercises = [
        makeExercise(id: "e0", name: "Bench Press"),
        makeExercise(id: "e1", name: "bench press"),
        makeExercise(id: "e2", name: "BENCH PRESS"),
    ]
    #expect(SetCRUDEngine.findExistingExerciseIndex(in: exercises, matchingName: "Bench Press") == 0)
}

@Test func findExistingExerciseIndexOnEmptyListReturnsNil() {
    #expect(SetCRUDEngine.findExistingExerciseIndex(in: [], matchingName: "Anything") == nil)
}
