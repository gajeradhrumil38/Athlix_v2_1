import XCTest
@testable import AthlixCore

// Covers countNewPRs, the fix for the web app's dead-code "0 PRs" bug in the Finish sheet: the
// server-side RPC correctly upserts personal_records, but the web client's isPR flag never
// reflects it. Swift instead re-queries personal_records after a save and counts how many of the
// touched exercises now have a record dated exactly on the save's workout date -- following this
// codebase's established convention (see WorkoutRepositorySaveTests) of testing repository
// contracts via a hand-written in-memory mock actor rather than the real Live* implementation.
actor InMemoryPersonalRecordRepository: PersonalRecordRepository {
    var stubbedRecords: [PersonalRecord] = []
    var countNewPRsCallCount = 0

    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord] {
        stubbedRecords.filter { $0.userId == userId }
    }

    func countNewPRs(userId: String, exerciseNames: [String], achievedOn date: String) async throws -> Int {
        guard !exerciseNames.isEmpty else { return 0 }
        countNewPRsCallCount += 1
        return stubbedRecords.filter {
            $0.userId == userId && exerciseNames.contains($0.exerciseName) && $0.achievedDate == date
        }.count
    }
}

extension InMemoryPersonalRecordRepository {
    func setStubbedRecords(_ records: [PersonalRecord]) { self.stubbedRecords = records }
}

final class PersonalRecordRepositoryTests: XCTestCase {
    private func makeRecord(exerciseName: String, achievedDate: String) -> PersonalRecord {
        PersonalRecord(
            id: UUID().uuidString, userId: "u1", exerciseName: exerciseName,
            bestWeight: 135, bestReps: 8, achievedDate: achievedDate,
            createdAt: "2026-07-10T00:00:00Z", exerciseDbId: nil
        )
    }

    func testCountNewPRsCountsOnlyExercisesAchievedOnTargetDate() async throws {
        let repo = InMemoryPersonalRecordRepository()
        await repo.setStubbedRecords([
            makeRecord(exerciseName: "Bench Press", achievedDate: "2026-07-16"),
            makeRecord(exerciseName: "Squat", achievedDate: "2026-07-01"), // older PR, not beaten today
            makeRecord(exerciseName: "Deadlift", achievedDate: "2026-07-16"),
        ])

        let count = try await repo.countNewPRs(
            userId: "u1", exerciseNames: ["Bench Press", "Squat", "Deadlift"], achievedOn: "2026-07-16"
        )
        XCTAssertEqual(count, 2)
    }

    func testCountNewPRsShortCircuitsOnEmptyExerciseNames() async throws {
        let repo = InMemoryPersonalRecordRepository()
        await repo.setStubbedRecords([
            makeRecord(exerciseName: "Bench Press", achievedDate: "2026-07-16"),
        ])

        let count = try await repo.countNewPRs(userId: "u1", exerciseNames: [], achievedOn: "2026-07-16")

        XCTAssertEqual(count, 0)
        let callCount = await repo.countNewPRsCallCount
        XCTAssertEqual(callCount, 0, "empty exerciseNames must short-circuit without hitting the mock's counting path")
    }

    func testCountNewPRsReturnsZeroWhenNoRecordsMatchTargetDate() async throws {
        let repo = InMemoryPersonalRecordRepository()
        await repo.setStubbedRecords([
            makeRecord(exerciseName: "Bench Press", achievedDate: "2026-07-01"),
            makeRecord(exerciseName: "Squat", achievedDate: "2026-06-15"),
        ])

        let count = try await repo.countNewPRs(
            userId: "u1", exerciseNames: ["Bench Press", "Squat"], achievedOn: "2026-07-16"
        )
        XCTAssertEqual(count, 0)
    }

    func testCountNewPRsReturnsFullCountWhenAllTouchedExercisesImproved() async throws {
        let repo = InMemoryPersonalRecordRepository()
        await repo.setStubbedRecords([
            makeRecord(exerciseName: "Bench Press", achievedDate: "2026-07-16"),
            makeRecord(exerciseName: "Squat", achievedDate: "2026-07-16"),
            makeRecord(exerciseName: "Deadlift", achievedDate: "2026-07-16"),
        ])

        let count = try await repo.countNewPRs(
            userId: "u1", exerciseNames: ["Bench Press", "Squat", "Deadlift"], achievedOn: "2026-07-16"
        )
        XCTAssertEqual(count, 3)
    }
}
