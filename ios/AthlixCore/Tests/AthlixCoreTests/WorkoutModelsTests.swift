import XCTest
@testable import AthlixCore

final class WorkoutModelsTests: XCTestCase {
    func testDecodesWorkoutFromSupabaseJSON() throws {
        let json = """
        {
            "id": "a1111111-1111-1111-1111-111111111111",
            "user_id": "b2222222-2222-2222-2222-222222222222",
            "title": "Push Day",
            "date": "2026-07-10",
            "duration_minutes": 62,
            "notes": null,
            "muscle_groups": ["Chest", "Triceps"],
            "created_at": "2026-07-10T14:00:00+00:00"
        }
        """.data(using: .utf8)!
        let workout = try JSONDecoder().decode(Workout.self, from: json)
        XCTAssertEqual(workout.title, "Push Day")
        XCTAssertEqual(workout.durationMinutes, 62)
        XCTAssertEqual(workout.muscleGroups, ["Chest", "Triceps"])
        XCTAssertNil(workout.notes)
    }

    func testDecodesExerciseSetFromSupabaseJSON() throws {
        let json = """
        {
            "id": "c3333333-3333-3333-3333-333333333333",
            "workout_id": "a1111111-1111-1111-1111-111111111111",
            "name": "Bench Press",
            "muscle_group": "Chest",
            "sets": 4,
            "reps": 8,
            "weight": 185.0,
            "unit": "lbs",
            "order_index": 0,
            "exercise_db_id": null
        }
        """.data(using: .utf8)!
        let exercise = try JSONDecoder().decode(ExerciseSet.self, from: json)
        XCTAssertEqual(exercise.name, "Bench Press")
        XCTAssertEqual(exercise.unit, "lbs")
        XCTAssertEqual(exercise.weight, 185.0)
    }

    func testDecodesPersonalRecordFromSupabaseJSON() throws {
        let json = """
        {
            "id": "d4444444-4444-4444-4444-444444444444",
            "user_id": "b2222222-2222-2222-2222-222222222222",
            "exercise_name": "Deadlift",
            "best_weight": 315.0,
            "best_reps": 3,
            "achieved_date": "2026-07-08",
            "created_at": "2026-07-08T10:00:00+00:00",
            "exercise_db_id": null
        }
        """.data(using: .utf8)!
        let pr = try JSONDecoder().decode(PersonalRecord.self, from: json)
        XCTAssertEqual(pr.exerciseName, "Deadlift")
        XCTAssertEqual(pr.bestWeight, 315.0)
        XCTAssertEqual(pr.bestReps, 3)
    }

    func testDecodesBodyWeightLogFromSupabaseJSON() throws {
        let json = """
        {
            "id": "e5555555-5555-5555-5555-555555555555",
            "user_id": "b2222222-2222-2222-2222-222222222222",
            "date": "2026-07-09",
            "weight": 180.5,
            "unit": "lbs",
            "notes": null,
            "created_at": "2026-07-09T08:00:00+00:00"
        }
        """.data(using: .utf8)!
        let log = try JSONDecoder().decode(BodyWeightLog.self, from: json)
        XCTAssertEqual(log.weight, 180.5)
        XCTAssertEqual(log.unit, .lbs)
    }
}
