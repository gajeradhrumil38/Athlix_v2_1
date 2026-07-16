import XCTest
@testable import AthlixCore

actor MockWorkoutRepository: WorkoutRepository {
    var stubbedWorkouts: [Workout] = []
    var shouldThrow = false

    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        if shouldThrow { throw RepositoryError.network }
        return stubbedWorkouts
    }

    // Unused by this file's tests -- present only to satisfy the WorkoutRepository protocol.
    // See WorkoutRepositorySaveTests.swift for meaningful coverage of these methods.
    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout {
        if shouldThrow { throw RepositoryError.network }
        return stubbedWorkouts.first ?? Workout(
            id: "stub", userId: userId, title: input.title, date: input.date,
            durationMinutes: input.durationMinutes, notes: input.notes, muscleGroups: nil, createdAt: ""
        )
    }

    func deleteWorkout(userId: String, workoutId: String) async throws {
        if shouldThrow { throw RepositoryError.network }
    }

    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws {
        if shouldThrow { throw RepositoryError.network }
    }

    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String]) {
        if shouldThrow { throw RepositoryError.network }
        return ([], [])
    }
}

extension MockWorkoutRepository {
    func setStubbedWorkouts(_ workouts: [Workout]) { self.stubbedWorkouts = workouts }
    func setShouldThrow(_ value: Bool) { self.shouldThrow = value }
}

actor MockPersonalRecordRepository: PersonalRecordRepository {
    var stubbedRecords: [PersonalRecord] = []

    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord] {
        stubbedRecords
    }
}

extension MockPersonalRecordRepository {
    func setStubbedRecords(_ records: [PersonalRecord]) { self.stubbedRecords = records }
}

actor MockBodyWeightRepository: BodyWeightRepository {
    var stubbedLogs: [BodyWeightLog] = []

    func fetchBodyWeightLogs(userId: String) async throws -> [BodyWeightLog] {
        stubbedLogs
    }
}

extension MockBodyWeightRepository {
    func setStubbedLogs(_ logs: [BodyWeightLog]) { self.stubbedLogs = logs }
}

final class RepositoryTests: XCTestCase {
    func testWorkoutRepositoryReturnsStubbedData() async throws {
        let workout = Workout(
            id: "1", userId: "u1", title: "Leg Day", date: "2026-07-10",
            durationMinutes: 50, notes: nil, muscleGroups: ["Legs"], createdAt: "2026-07-10T00:00:00Z"
        )
        let mock = MockWorkoutRepository()
        await mock.setStubbedWorkouts([workout])

        let result = try await mock.fetchWorkouts(userId: "u1", from: Date(), to: Date())
        XCTAssertEqual(result, [workout])
    }

    func testWorkoutRepositoryPropagatesErrors() async {
        let mock = MockWorkoutRepository()
        await mock.setShouldThrow(true)

        do {
            _ = try await mock.fetchWorkouts(userId: "u1", from: Date(), to: Date())
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(error as? RepositoryError, .network)
        }
    }

    func testPersonalRecordRepositoryReturnsStubbedData() async throws {
        let pr = PersonalRecord(
            id: "1", userId: "u1", exerciseName: "Squat", bestWeight: 315,
            bestReps: 5, achievedDate: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", exerciseDbId: nil
        )
        let mock = MockPersonalRecordRepository()
        await mock.setStubbedRecords([pr])

        let result = try await mock.fetchPersonalRecords(userId: "u1")
        XCTAssertEqual(result, [pr])
    }

    func testBodyWeightRepositoryReturnsStubbedData() async throws {
        let log = BodyWeightLog(
            id: "1", userId: "u1", date: "2026-07-10", weight: 180,
            unit: .lbs, notes: nil, createdAt: "2026-07-10T00:00:00Z"
        )
        let mock = MockBodyWeightRepository()
        await mock.setStubbedLogs([log])

        let result = try await mock.fetchBodyWeightLogs(userId: "u1")
        XCTAssertEqual(result, [log])
    }
}
