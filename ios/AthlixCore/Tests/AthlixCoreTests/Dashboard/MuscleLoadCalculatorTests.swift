import XCTest
@testable import AthlixCore

final class MuscleLoadCalculatorTests: XCTestCase {

    // MARK: - loadBySlug: accumulation across two exercises sharing a slug

    // "Bench Press" -> chest:1, triceps:0.55, deltoids:0.42 (ExerciseMuscleMapper patterns).
    // "Push-ups" -> chest:0.82, triceps:0.45, deltoids:0.35, abs:0.18.
    // Both target "chest" -- proves accumulation (would fail under `=` instead of `+=`).
    func testLoadBySlugAccumulatesAcrossTwoExercisesTargetingSameSlug() {
        let benchPress = MuscleLoadCalculator.ExerciseInput(
            name: "Bench Press", muscleGroup: nil,
            weight: 100, reps: 10, sets: 3, unit: .kg
        )
        let pushUps = MuscleLoadCalculator.ExerciseInput(
            name: "Push-ups", muscleGroup: nil,
            weight: 50, reps: 10, sets: 3, unit: .kg
        )

        let result = MuscleLoadCalculator.loadBySlug(exercises: [benchPress, pushUps], displayUnit: .kg)

        let benchLoad = 100.0 * 10 * 3 // 3000
        let pushLoad = 50.0 * 10 * 3   // 1500
        let expectedChest = benchLoad * 1.0 + pushLoad * 0.82
        let expectedTriceps = benchLoad * 0.55 + pushLoad * 0.45
        let expectedDeltoids = benchLoad * 0.42 + pushLoad * 0.35
        let expectedAbs = pushLoad * 0.18

        XCTAssertEqual(result["chest"] ?? 0, expectedChest, accuracy: 0.001)
        XCTAssertEqual(result["triceps"] ?? 0, expectedTriceps, accuracy: 0.001)
        XCTAssertEqual(result["deltoids"] ?? 0, expectedDeltoids, accuracy: 0.001)
        XCTAssertEqual(result["abs"] ?? 0, expectedAbs, accuracy: 0.001)
    }

    // MARK: - loadBySlug: unit conversion

    // Exercise logged in kg, displayed in lbs -- uses the real WeightUnit.convert
    // factor, not a hardcoded assumed constant.
    func testLoadBySlugConvertsUnitsWhenLoggedInKgAndDisplayedInLbs() {
        let squat = MuscleLoadCalculator.ExerciseInput(
            name: "Barbell Squat", muscleGroup: nil,
            weight: 100, reps: 5, sets: 4, unit: .kg
        )

        let result = MuscleLoadCalculator.loadBySlug(exercises: [squat], displayUnit: .lbs)

        let displayWeight = WeightUnit.convert(100, from: .kg, to: .lbs)
        let exerciseLoad = displayWeight * 5 * 4
        let expectedQuadriceps = exerciseLoad * 0.88 // ExerciseMuscleMapper quadriceps weight for squat

        XCTAssertEqual(result["quadriceps"] ?? 0, expectedQuadriceps, accuracy: 0.001)
        // Sanity: converted load must differ from the unconverted (kg-numeric) value.
        XCTAssertNotEqual(result["quadriceps"] ?? 0, 100.0 * 5 * 4 * 0.88, accuracy: 0.001)
    }

    // MARK: - setCountsBySlug

    // "Bench Press" -> chest:1, triceps:0.55, deltoids:0.42 (same fractional weights as
    // loadBySlug's accumulation test above). 3 sets * weight per target, NOT weight*reps*sets --
    // proves setCountsBySlug accumulates raw sets (fractionally split across muscles), not
    // volume.
    func testSetCountsBySlugWeightsRawSetsBySlugFraction() {
        let benchPress = MuscleLoadCalculator.ExerciseInput(
            name: "Bench Press", muscleGroup: nil,
            weight: 100, reps: 10, sets: 3, unit: .kg
        )

        let result = MuscleLoadCalculator.setCountsBySlug(exercises: [benchPress])

        XCTAssertEqual(result["chest"] ?? 0, 3.0, accuracy: 0.001)
        XCTAssertEqual(result["triceps"] ?? 0, 1.65, accuracy: 0.001)
        XCTAssertEqual(result["deltoids"] ?? 0, 1.26, accuracy: 0.001)
    }

    // MARK: - relativeLoadBySlug

    func testRelativeLoadBySlugReturnsRawLoadWhenBodyWeightIsNil() {
        let rawLoad = ["chest": 300.0, "triceps": 150.0]

        let result = MuscleLoadCalculator.relativeLoadBySlug(rawLoad: rawLoad, bodyWeightKg: nil)

        XCTAssertEqual(result, rawLoad)
    }

    func testRelativeLoadBySlugDividesByBodyWeightWhenPositive() {
        let rawLoad = ["chest": 300.0, "triceps": 150.0]

        let result = MuscleLoadCalculator.relativeLoadBySlug(rawLoad: rawLoad, bodyWeightKg: 75)

        XCTAssertEqual(result["chest"] ?? 0, 4.0, accuracy: 0.0001)
        XCTAssertEqual(result["triceps"] ?? 0, 2.0, accuracy: 0.0001)
    }

    func testRelativeLoadBySlugFallsBackToRawLoadWhenBodyWeightIsZero() {
        let rawLoad = ["chest": 300.0, "triceps": 150.0]

        let result = MuscleLoadCalculator.relativeLoadBySlug(rawLoad: rawLoad, bodyWeightKg: 0)

        XCTAssertEqual(result, rawLoad)
    }

    func testRelativeLoadBySlugFallsBackToRawLoadWhenBodyWeightIsNegative() {
        let rawLoad = ["chest": 300.0, "triceps": 150.0]

        let result = MuscleLoadCalculator.relativeLoadBySlug(rawLoad: rawLoad, bodyWeightKg: -10)

        XCTAssertEqual(result, rawLoad)
    }
}
