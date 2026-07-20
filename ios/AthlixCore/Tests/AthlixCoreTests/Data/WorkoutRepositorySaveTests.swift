import XCTest
@testable import AthlixCore

// In-memory reimplementation of the web's saveWorkout/deleteWorkout/renameWorkout/updateWorkoutSets
// logic (src/lib/supabaseData.ts ~L1571-1826), following this codebase's established convention
// (see TemplateRepositoryTests) of testing repository contracts via a hand-written mock actor
// rather than the real Live* implementation against a network layer.
actor InMemoryWorkoutRepository: WorkoutRepository {
    var workouts: [String: Workout] = [:]
    var exerciseRows: [String: [ExerciseSet]] = [:] // keyed by workoutId
    var personalRecords: [String: PersonalRecord] = [:] // keyed by exerciseName

    var rpcShouldFail = false
    var rpcSucceedsButFetchFails = false
    var rpcWorkoutId = "rpc-workout-id"

    var deleteCalls: [(workoutId: String, userId: String)] = []
    var renameCalls: [(workoutId: String, userId: String, title: String)] = []
    var networkCallCount = 0
    var directPathCallCount = 0 // tracks how many times saveWorkoutDirect's insert path ran
    var fetchExercisesForWorkoutsCallCount = 0

    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        workouts.values.filter { $0.userId == userId }
    }

    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout {
        let validExercises: [(exercise: NewWorkoutExercise, sets: [CompletedSetInput])] =
            input.exercises.compactMap { ex in
                let sets = ex.completedSets.filter { $0.reps > 0 || $0.weight > 0 }
                return sets.isEmpty ? nil : (ex, sets)
            }
        if validExercises.isEmpty {
            throw RepositoryError.unknown("Complete at least one set before saving.")
        }

        networkCallCount += 1

        // RPC succeeded but the follow-up fetch failed: this must throw directly and must NOT
        // fall through to the direct insert path (that would silently duplicate the workout the
        // RPC already wrote server-side). Mirrors the split-scope fix in LiveWorkoutRepository.
        if rpcSucceedsButFetchFails {
            throw RepositoryError.unknown("Workout saved, but failed to fetch it.")
        }

        if !rpcShouldFail {
            let workout = Workout(
                id: rpcWorkoutId, userId: userId, title: input.title, date: input.date,
                durationMinutes: input.durationMinutes, notes: input.notes, muscleGroups: nil,
                createdAt: "2026-07-15T00:00:00Z"
            )
            workouts[workout.id] = workout
            return workout
        }

        // Fallback direct path
        directPathCallCount += 1
        let workoutId = UUID().uuidString.lowercased()
        let muscleGroups = Array(Set(validExercises.compactMap { $0.exercise.muscleGroup }.filter { !$0.isEmpty }))
        let workout = Workout(
            id: workoutId, userId: userId, title: input.title, date: input.date,
            durationMinutes: input.durationMinutes, notes: input.notes, muscleGroups: muscleGroups,
            createdAt: "2026-07-15T00:00:00Z"
        )
        workouts[workoutId] = workout

        var rows: [ExerciseSet] = []
        var order = 0
        var bestFromNewWorkout: [String: (weight: Double, reps: Int, exerciseDbId: String?)] = [:]

        for pair in validExercises {
            for set in pair.sets {
                rows.append(ExerciseSet(
                    id: UUID().uuidString.lowercased(), workoutId: workoutId, name: pair.exercise.name,
                    muscleGroup: pair.exercise.muscleGroup, sets: 1, reps: set.reps, weight: set.weight,
                    unit: set.unit, orderIndex: order, exerciseDbId: pair.exercise.exerciseDbId
                ))
                order += 1

                let candidate = (weight: set.weight, reps: set.reps, exerciseDbId: pair.exercise.exerciseDbId)
                if let existing = bestFromNewWorkout[pair.exercise.name] {
                    if LiveWorkoutRepository.isBetterRecord(
                        candidateWeight: candidate.weight, candidateReps: candidate.reps,
                        existingWeight: existing.weight, existingReps: existing.reps
                    ) {
                        bestFromNewWorkout[pair.exercise.name] = candidate
                    }
                } else {
                    bestFromNewWorkout[pair.exercise.name] = candidate
                }
            }
        }
        exerciseRows[workoutId] = rows

        for (exerciseName, candidate) in bestFromNewWorkout {
            let existing = personalRecords[exerciseName]
            let shouldReplace = existing == nil || LiveWorkoutRepository.isBetterRecord(
                candidateWeight: candidate.weight, candidateReps: candidate.reps,
                existingWeight: existing!.bestWeight, existingReps: existing!.bestReps
            )
            if !shouldReplace { continue }
            personalRecords[exerciseName] = PersonalRecord(
                id: existing?.id ?? UUID().uuidString.lowercased(), userId: userId, exerciseName: exerciseName,
                bestWeight: candidate.weight, bestReps: candidate.reps, achievedDate: input.date,
                createdAt: existing?.createdAt ?? "2026-07-15T00:00:00Z", exerciseDbId: candidate.exerciseDbId ?? existing?.exerciseDbId
            )
        }

        return workout
    }

    func deleteWorkout(userId: String, workoutId: String) async throws {
        deleteCalls.append((workoutId, userId))
        workouts.removeValue(forKey: workoutId)
    }

    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws {
        let trimmed = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return }
        renameCalls.append((workoutId, userId, trimmed))
        if let existing = workouts[workoutId] {
            workouts[workoutId] = Workout(
                id: existing.id, userId: existing.userId, title: trimmed, date: existing.date,
                durationMinutes: existing.durationMinutes, notes: existing.notes,
                muscleGroups: existing.muscleGroups, createdAt: existing.createdAt
            )
        }
    }

    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String]) {
        guard let owned = workouts[workoutId], owned.userId == userId else {
            throw RepositoryError.unknown("Workout not found.")
        }

        let valid = exercises.compactMap { ex -> (exercise: NewWorkoutExercise, sets: [CompletedSetInput])? in
            let sets = ex.completedSets.filter { $0.reps > 0 || $0.weight > 0 }
            return sets.isEmpty ? nil : (ex, sets)
        }
        if valid.isEmpty {
            throw RepositoryError.unknown("Keep at least one set, or delete the workout instead.")
        }

        var rows: [ExerciseSet] = []
        var order = 0
        for pair in valid {
            for set in pair.sets {
                rows.append(ExerciseSet(
                    id: UUID().uuidString.lowercased(), workoutId: workoutId, name: pair.exercise.name,
                    muscleGroup: pair.exercise.muscleGroup, sets: 1, reps: set.reps, weight: set.weight,
                    unit: set.unit, orderIndex: order, exerciseDbId: pair.exercise.exerciseDbId
                ))
                order += 1
            }
        }
        exerciseRows[workoutId] = rows

        let muscleGroups = Array(Set(valid.compactMap { $0.exercise.muscleGroup }.filter { !$0.isEmpty }))
        workouts[workoutId] = Workout(
            id: owned.id, userId: owned.userId, title: owned.title, date: owned.date,
            durationMinutes: owned.durationMinutes, notes: owned.notes, muscleGroups: muscleGroups,
            createdAt: owned.createdAt
        )

        return (rows, muscleGroups)
    }

    func fetchWorkoutExercises(userId: String, workoutId: String) async throws -> [ExerciseSet] {
        guard let owned = workouts[workoutId], owned.userId == userId else {
            throw RepositoryError.unknown("Workout not found.")
        }
        return (exerciseRows[workoutId] ?? []).sorted { $0.orderIndex < $1.orderIndex }
    }

    // Batched read across many workout ids at once, mirroring LiveWorkoutRepository's
    // fetchExercisesForWorkouts: no per-id ownership check (workoutIds are expected to already
    // come from an authenticated, userId-scoped fetchWorkouts() call), and a genuine
    // no-call-at-all short-circuit on an empty workoutIds array (tracked via the call counter
    // above, not just the returned value), matching the empty-array guard convention used
    // elsewhere in this file (see testSaveWorkoutThrowsBeforeNetworkCallWhenNoValidSets).
    func fetchExercisesForWorkouts(userId: String, workoutIds: [String]) async throws -> [ExerciseSet] {
        guard !workoutIds.isEmpty else { return [] }
        fetchExercisesForWorkoutsCallCount += 1
        return workoutIds.flatMap { exerciseRows[$0] ?? [] }
    }
}

extension InMemoryWorkoutRepository {
    func seedWorkout(_ workout: Workout) { workouts[workout.id] = workout }
    func seedExerciseRows(_ rows: [ExerciseSet], forWorkoutId workoutId: String) { exerciseRows[workoutId] = rows }
    func seedPersonalRecord(_ record: PersonalRecord) { personalRecords[record.exerciseName] = record }
    func setRpcShouldFail(_ value: Bool) { rpcShouldFail = value }
    func setRpcSucceedsButFetchFails(_ value: Bool) { rpcSucceedsButFetchFails = value }
}

final class WorkoutRepositorySaveTests: XCTestCase {
    private func sets(_ values: [(reps: Int, weight: Double, unit: String)]) -> [CompletedSetInput] {
        values.map { CompletedSetInput(reps: $0.reps, weight: $0.weight, unit: $0.unit) }
    }

    private func exercise(
        name: String = "Bench Press",
        muscleGroup: String? = "Chest",
        exerciseDbId: String? = nil,
        completedSets: [CompletedSetInput] = [CompletedSetInput(reps: 8, weight: 135, unit: "lbs")]
    ) -> NewWorkoutExercise {
        NewWorkoutExercise(name: name, muscleGroup: muscleGroup, exerciseDbId: exerciseDbId, completedSets: completedSets)
    }

    // MARK: - saveWorkout: zero valid sets

    func testSaveWorkoutThrowsBeforeNetworkCallWhenNoValidSets() async throws {
        let mock = InMemoryWorkoutRepository()
        let input = NewWorkoutInput(
            title: "Empty Day", date: "2026-07-15", durationMinutes: 30, notes: nil,
            exercises: [exercise(completedSets: sets([(reps: 0, weight: 0, unit: "lbs")]))]
        )

        do {
            _ = try await mock.saveWorkout(userId: "u1", input: input)
            XCTFail("Expected save to throw")
        } catch {
            if case RepositoryError.unknown(let message) = error as! RepositoryError {
                XCTAssertEqual(message, "Complete at least one set before saving.")
            } else {
                XCTFail("Unexpected error type: \(error)")
            }
        }

        let calls = await mock.networkCallCount
        XCTAssertEqual(calls, 0, "No network call should be attempted when nothing survives filtering")
    }

    // MARK: - saveWorkout: RPC happy path

    func testSaveWorkoutHappyPathViaRPCReturnsFetchedWorkout() async throws {
        let mock = InMemoryWorkoutRepository()
        let input = NewWorkoutInput(
            title: "Push Day", date: "2026-07-15", durationMinutes: 45, notes: "Felt strong",
            exercises: [exercise()]
        )

        let result = try await mock.saveWorkout(userId: "u1", input: input)

        XCTAssertEqual(result.id, "rpc-workout-id")
        XCTAssertEqual(result.title, "Push Day")
        XCTAssertEqual(result.userId, "u1")
        let stored = await mock.workouts["rpc-workout-id"]
        XCTAssertEqual(stored, result)
    }

    // MARK: - saveWorkout: RPC succeeds but fetch-back fails (must NOT duplicate-write)

    func testSaveWorkoutThrowsWhenRPCSucceedsButFetchBackFailsAndDoesNotFallBackToDirectInsert() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.setRpcSucceedsButFetchFails(true)
        let input = NewWorkoutInput(
            title: "Push Day", date: "2026-07-15", durationMinutes: 45, notes: nil,
            exercises: [exercise()]
        )

        do {
            _ = try await mock.saveWorkout(userId: "u1", input: input)
            XCTFail("Expected fetch-back failure to throw")
        } catch {
            if case RepositoryError.unknown(let message) = error as! RepositoryError {
                XCTAssertEqual(message, "Workout saved, but failed to fetch it.")
            } else {
                XCTFail("Unexpected error type: \(error)")
            }
        }

        let directCalls = await mock.directPathCallCount
        XCTAssertEqual(directCalls, 0, "A fetch-back failure after a successful RPC must not fall through to the direct insert path (would duplicate-write)")
    }

    // MARK: - saveWorkout: fallback path + PR best-of logic

    func testSaveWorkoutFallbackCreatesNewPRWhenNoneExists() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.setRpcShouldFail(true)
        let input = NewWorkoutInput(
            title: "Push Day", date: "2026-07-15", durationMinutes: 45, notes: nil,
            exercises: [exercise(name: "Overhead Press", completedSets: sets([(reps: 5, weight: 95, unit: "lbs")]))]
        )

        _ = try await mock.saveWorkout(userId: "u1", input: input)

        let pr = await mock.personalRecords["Overhead Press"]
        XCTAssertEqual(pr?.bestWeight, 95)
        XCTAssertEqual(pr?.bestReps, 5)
        let directCalls = await mock.directPathCallCount
        XCTAssertEqual(directCalls, 1)
    }

    func testSaveWorkoutFallbackReplacesPRWhenExistingIsLowerWeight() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.setRpcShouldFail(true)
        await mock.seedPersonalRecord(PersonalRecord(
            id: "pr-1", userId: "u1", exerciseName: "Squat", bestWeight: 225, bestReps: 5,
            achievedDate: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", exerciseDbId: nil
        ))
        let input = NewWorkoutInput(
            title: "Leg Day", date: "2026-07-15", durationMinutes: 45, notes: nil,
            exercises: [exercise(name: "Squat", completedSets: sets([(reps: 5, weight: 275, unit: "lbs")]))]
        )

        _ = try await mock.saveWorkout(userId: "u1", input: input)

        let pr = await mock.personalRecords["Squat"]
        XCTAssertEqual(pr?.bestWeight, 275)
        XCTAssertEqual(pr?.id, "pr-1", "Should update the existing PR row, not create a new one")
    }

    func testSaveWorkoutFallbackDoesNotReplacePRWhenExistingIsHigherWeight() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.setRpcShouldFail(true)
        await mock.seedPersonalRecord(PersonalRecord(
            id: "pr-1", userId: "u1", exerciseName: "Squat", bestWeight: 315, bestReps: 3,
            achievedDate: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", exerciseDbId: nil
        ))
        let input = NewWorkoutInput(
            title: "Leg Day", date: "2026-07-15", durationMinutes: 45, notes: nil,
            exercises: [exercise(name: "Squat", completedSets: sets([(reps: 5, weight: 275, unit: "lbs")]))]
        )

        _ = try await mock.saveWorkout(userId: "u1", input: input)

        let pr = await mock.personalRecords["Squat"]
        XCTAssertEqual(pr?.bestWeight, 315)
        XCTAssertEqual(pr?.bestReps, 3)
    }

    func testSaveWorkoutFallbackReplacesPRWhenEqualWeightMoreReps() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.setRpcShouldFail(true)
        await mock.seedPersonalRecord(PersonalRecord(
            id: "pr-1", userId: "u1", exerciseName: "Deadlift", bestWeight: 315, bestReps: 3,
            achievedDate: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", exerciseDbId: nil
        ))
        let input = NewWorkoutInput(
            title: "Pull Day", date: "2026-07-15", durationMinutes: 45, notes: nil,
            exercises: [exercise(name: "Deadlift", completedSets: sets([(reps: 5, weight: 315, unit: "lbs")]))]
        )

        _ = try await mock.saveWorkout(userId: "u1", input: input)

        let pr = await mock.personalRecords["Deadlift"]
        XCTAssertEqual(pr?.bestReps, 5)
    }

    func testSaveWorkoutFallbackDoesNotReplacePRWhenEqualWeightFewerOrEqualReps() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.setRpcShouldFail(true)
        await mock.seedPersonalRecord(PersonalRecord(
            id: "pr-1", userId: "u1", exerciseName: "Deadlift", bestWeight: 315, bestReps: 5,
            achievedDate: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", exerciseDbId: nil
        ))
        let input = NewWorkoutInput(
            title: "Pull Day", date: "2026-07-15", durationMinutes: 45, notes: nil,
            exercises: [exercise(name: "Deadlift", completedSets: sets([(reps: 3, weight: 315, unit: "lbs")]))]
        )

        _ = try await mock.saveWorkout(userId: "u1", input: input)

        let pr = await mock.personalRecords["Deadlift"]
        XCTAssertEqual(pr?.bestReps, 5, "Equal weight with fewer reps should not replace the existing PR")
        XCTAssertEqual(pr?.id, "pr-1")
    }

    // MARK: - LiveWorkoutRepository.isBetterRecord: direct unit tests
    //
    // These call the real production comparison function directly (not a hand-copied
    // reimplementation), so a future regression there (e.g. `>` silently becoming `>=`) is
    // caught here even if the higher-level mock-based tests above happen to still pass.

    func testIsBetterRecordTrueForNewExerciseWithNoExistingRecord() {
        // "No existing record" is modeled by the caller as `existing == nil`, short-circuiting
        // before this comparison runs; this call demonstrates any candidate beats a 0/0 baseline.
        XCTAssertTrue(LiveWorkoutRepository.isBetterRecord(candidateWeight: 95, candidateReps: 5, existingWeight: 0, existingReps: 0))
    }

    func testIsBetterRecordTrueWhenExistingIsLowerWeight() {
        XCTAssertTrue(LiveWorkoutRepository.isBetterRecord(candidateWeight: 275, candidateReps: 5, existingWeight: 225, existingReps: 5))
    }

    func testIsBetterRecordFalseWhenExistingIsHigherWeight() {
        XCTAssertFalse(LiveWorkoutRepository.isBetterRecord(candidateWeight: 275, candidateReps: 5, existingWeight: 315, existingReps: 3))
    }

    func testIsBetterRecordTrueWhenEqualWeightAndMoreReps() {
        XCTAssertTrue(LiveWorkoutRepository.isBetterRecord(candidateWeight: 315, candidateReps: 5, existingWeight: 315, existingReps: 3))
    }

    func testIsBetterRecordFalseWhenEqualWeightAndFewerOrEqualReps() {
        XCTAssertFalse(LiveWorkoutRepository.isBetterRecord(candidateWeight: 315, candidateReps: 3, existingWeight: 315, existingReps: 5))
        XCTAssertFalse(LiveWorkoutRepository.isBetterRecord(candidateWeight: 315, candidateReps: 5, existingWeight: 315, existingReps: 5))
    }

    // MARK: - deleteWorkout

    func testDeleteWorkoutScopesToIdAndUserId() async throws {
        let mock = InMemoryWorkoutRepository()

        try await mock.deleteWorkout(userId: "u1", workoutId: "w1")

        let calls = await mock.deleteCalls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.workoutId, "w1")
        XCTAssertEqual(calls.first?.userId, "u1")
    }

    // MARK: - renameWorkout

    func testRenameWorkoutNoOpsOnBlankTitle() async throws {
        let mock = InMemoryWorkoutRepository()

        try await mock.renameWorkout(userId: "u1", workoutId: "w1", newTitle: "   ")

        let calls = await mock.renameCalls
        XCTAssertTrue(calls.isEmpty, "No network call should happen for a blank title")
    }

    func testRenameWorkoutUpdatesOnValidTitle() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "u1", title: "Old Title", date: "2026-07-15",
            durationMinutes: 30, notes: nil, muscleGroups: nil, createdAt: "2026-07-15T00:00:00Z"
        ))

        try await mock.renameWorkout(userId: "u1", workoutId: "w1", newTitle: "  New Title  ")

        let calls = await mock.renameCalls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.title, "New Title")
        let updated = await mock.workouts["w1"]
        XCTAssertEqual(updated?.title, "New Title")
    }

    // MARK: - updateWorkoutSets

    func testUpdateWorkoutSetsThrowsWhenNotOwned() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "someone-else", title: "T", date: "2026-07-15",
            durationMinutes: 30, notes: nil, muscleGroups: nil, createdAt: "2026-07-15T00:00:00Z"
        ))

        do {
            _ = try await mock.updateWorkoutSets(userId: "u1", workoutId: "w1", exercises: [exercise()])
            XCTFail("Expected ownership failure")
        } catch {
            if case RepositoryError.unknown(let message) = error as! RepositoryError {
                XCTAssertEqual(message, "Workout not found.")
            } else {
                XCTFail("Unexpected error type: \(error)")
            }
        }
    }

    func testUpdateWorkoutSetsThrowsWhenNothingSurvivesFiltering() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "u1", title: "T", date: "2026-07-15",
            durationMinutes: 30, notes: nil, muscleGroups: nil, createdAt: "2026-07-15T00:00:00Z"
        ))

        do {
            _ = try await mock.updateWorkoutSets(
                userId: "u1", workoutId: "w1",
                exercises: [exercise(completedSets: sets([(reps: 0, weight: 0, unit: "lbs")]))]
            )
            XCTFail("Expected filtering failure")
        } catch {
            if case RepositoryError.unknown(let message) = error as! RepositoryError {
                XCTAssertEqual(message, "Keep at least one set, or delete the workout instead.")
            } else {
                XCTFail("Unexpected error type: \(error)")
            }
        }
    }

    func testUpdateWorkoutSetsReplacesExercisesAndRecomputesMuscleGroups() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "u1", title: "Full Body", date: "2026-07-15",
            durationMinutes: 30, notes: nil, muscleGroups: ["Old Group"], createdAt: "2026-07-15T00:00:00Z"
        ))

        let result = try await mock.updateWorkoutSets(
            userId: "u1", workoutId: "w1",
            exercises: [
                exercise(name: "Bench Press", muscleGroup: "Chest", completedSets: sets([(reps: 8, weight: 135, unit: "lbs")])),
                exercise(name: "Squat", muscleGroup: "Legs", completedSets: sets([(reps: 5, weight: 225, unit: "lbs")])),
                exercise(name: "Plank", muscleGroup: nil, completedSets: sets([(reps: 1, weight: 0, unit: "lbs")])),
                exercise(name: "Curl", muscleGroup: "", completedSets: sets([(reps: 10, weight: 25, unit: "lbs")])),
            ]
        )

        XCTAssertEqual(result.exercises.count, 4)
        XCTAssertEqual(Set(result.muscleGroups), Set(["Chest", "Legs"]))

        let updatedWorkout = await mock.workouts["w1"]
        XCTAssertEqual(Set(updatedWorkout?.muscleGroups ?? []), Set(["Chest", "Legs"]))
        let storedExercises = await mock.exerciseRows["w1"]
        XCTAssertEqual(storedExercises?.count, 4)
    }

    // MARK: - fetchWorkoutExercises

    func testFetchWorkoutExercisesReturnsRowsOrderedByOrderIndex() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "u1", title: "Push Day", date: "2026-07-15",
            durationMinutes: 45, notes: nil, muscleGroups: ["Chest"], createdAt: "2026-07-15T00:00:00Z"
        ))
        let rows = [
            ExerciseSet(id: "e2", workoutId: "w1", name: "Bench Press", muscleGroup: "Chest", sets: 1, reps: 6, weight: 145, unit: "lbs", orderIndex: 1, exerciseDbId: nil),
            ExerciseSet(id: "e1", workoutId: "w1", name: "Bench Press", muscleGroup: "Chest", sets: 1, reps: 8, weight: 135, unit: "lbs", orderIndex: 0, exerciseDbId: nil),
            ExerciseSet(id: "e3", workoutId: "w1", name: "Overhead Press", muscleGroup: "Shoulders", sets: 1, reps: 8, weight: 65, unit: "lbs", orderIndex: 2, exerciseDbId: nil),
        ]
        await mock.seedExerciseRows(rows, forWorkoutId: "w1")

        let result = try await mock.fetchWorkoutExercises(userId: "u1", workoutId: "w1")

        XCTAssertEqual(result.map(\.id), ["e1", "e2", "e3"], "should be ordered by order_index ascending")
    }

    func testFetchWorkoutExercisesThrowsWhenNotOwnedByUser() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "someone-else", title: "Push Day", date: "2026-07-15",
            durationMinutes: 45, notes: nil, muscleGroups: nil, createdAt: "2026-07-15T00:00:00Z"
        ))

        do {
            _ = try await mock.fetchWorkoutExercises(userId: "u1", workoutId: "w1")
            XCTFail("Expected fetch to throw for unowned workout")
        } catch {
            if case RepositoryError.unknown(let message) = error as! RepositoryError {
                XCTAssertEqual(message, "Workout not found.")
            } else {
                XCTFail("Unexpected error type: \(error)")
            }
        }
    }

    func testFetchWorkoutExercisesThrowsWhenWorkoutDoesNotExist() async throws {
        let mock = InMemoryWorkoutRepository()

        do {
            _ = try await mock.fetchWorkoutExercises(userId: "u1", workoutId: "missing")
            XCTFail("Expected fetch to throw for a nonexistent workout")
        } catch {
            XCTAssertEqual(error as? RepositoryError, .unknown("Workout not found."))
        }
    }

    func testFetchWorkoutExercisesReturnsEmptyArrayWhenWorkoutHasNoExerciseRows() async throws {
        let mock = InMemoryWorkoutRepository()
        await mock.seedWorkout(Workout(
            id: "w1", userId: "u1", title: "Empty Day", date: "2026-07-15",
            durationMinutes: 0, notes: nil, muscleGroups: nil, createdAt: "2026-07-15T00:00:00Z"
        ))

        let result = try await mock.fetchWorkoutExercises(userId: "u1", workoutId: "w1")

        XCTAssertEqual(result, [])
    }

    // MARK: - fetchExercisesForWorkouts

    func testFetchExercisesForWorkoutsReturnsRowsAcrossMultipleWorkoutIds() async throws {
        let mock = InMemoryWorkoutRepository()
        let w1Rows = [
            ExerciseSet(id: "e1", workoutId: "w1", name: "Bench Press", muscleGroup: "Chest", sets: 1, reps: 8, weight: 135, unit: "lbs", orderIndex: 0, exerciseDbId: nil),
        ]
        let w2Rows = [
            ExerciseSet(id: "e2", workoutId: "w2", name: "Squat", muscleGroup: "Legs", sets: 1, reps: 5, weight: 225, unit: "lbs", orderIndex: 0, exerciseDbId: nil),
        ]
        await mock.seedExerciseRows(w1Rows, forWorkoutId: "w1")
        await mock.seedExerciseRows(w2Rows, forWorkoutId: "w2")

        let result = try await mock.fetchExercisesForWorkouts(userId: "u1", workoutIds: ["w1", "w2"])

        XCTAssertEqual(Set(result.map(\.id)), Set(["e1", "e2"]))
        let callCount = await mock.fetchExercisesForWorkoutsCallCount
        XCTAssertEqual(callCount, 1)
    }

    func testFetchExercisesForWorkoutsReturnsEmptyWithoutCallWhenWorkoutIdsIsEmpty() async throws {
        let mock = InMemoryWorkoutRepository()

        let result = try await mock.fetchExercisesForWorkouts(userId: "u1", workoutIds: [])

        XCTAssertEqual(result, [])
        let callCount = await mock.fetchExercisesForWorkoutsCallCount
        XCTAssertEqual(callCount, 0, "An empty workoutIds array must short-circuit before any mock/network call")
    }
}
