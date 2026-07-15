import XCTest
@testable import AthlixCore

final class ExerciseMuscleMapperTests: XCTestCase {
    func testBenchPressMapsToChestTricepsDeltoids() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Bench Press")
        let slugs = Set(profile.targets.map(\.slug))
        XCTAssertTrue(slugs.contains("chest"))
        XCTAssertTrue(slugs.contains("triceps"))
        XCTAssertTrue(slugs.contains("deltoids"))
        let chestWeight = profile.targets.first { $0.slug == "chest" }?.weight ?? 0
        let tricepsWeight = profile.targets.first { $0.slug == "triceps" }?.weight ?? 0
        XCTAssertGreaterThan(chestWeight, tricepsWeight)
    }

    func testInclinePressMatchesBeforeGenericBenchPress() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Incline Bench Press")
        let chestWeight = profile.targets.first { $0.slug == "chest" }?.weight ?? 0
        XCTAssertEqual(chestWeight, 0.88, accuracy: 0.001)
    }

    func testSquatMapsToLegsWithQuadsAsPrimary() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Barbell Squat")
        XCTAssertTrue(profile.primary.contains("Legs"))
        let quadWeight = profile.targets.first { $0.slug == "quadriceps" }?.weight ?? 0
        XCTAssertEqual(quadWeight, 0.88, accuracy: 0.001)
    }

    func testUnknownExerciseNameFallsBackToMuscleGroup() {
        let profile = ExerciseMuscleMapper.profile(
            forExerciseName: "Some Made Up Exercise Name",
            fallbackMuscleGroup: "Biceps"
        )
        let slugs = Set(profile.targets.map(\.slug))
        XCTAssertTrue(slugs.contains("biceps"))
        XCTAssertTrue(profile.primary.contains("Biceps"))
    }

    func testUnknownExerciseNoFallbackGroupDefaultsToCore() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Totally Unrecognized")
        XCTAssertTrue(profile.primary.contains("Core"))
    }

    func testExplicitMuscleSlugsOverridePatternMatching() {
        let profile = ExerciseMuscleMapper.profile(
            forExerciseName: "Bench Press",
            muscleSlugs: [(slug: "biceps", type: .primary)]
        )
        XCTAssertEqual(profile.targets.map(\.slug), ["biceps"])
        XCTAssertTrue(profile.primary.contains("Biceps"))
    }

    func testNormalizeTargetsMergesDuplicateSlugsAndSortsDescending() {
        let merged = ExerciseMuscleMapper.normalizeTargets([
            ExerciseMuscleTarget(slug: "chest", weight: 0.5),
            ExerciseMuscleTarget(slug: "triceps", weight: 0.3),
            ExerciseMuscleTarget(slug: "chest", weight: 0.5),
        ])
        XCTAssertEqual(merged.count, 2)
        XCTAssertEqual(merged.first?.slug, "chest")
        XCTAssertEqual(merged.first?.weight ?? 0, 1.0, accuracy: 0.001)
    }

    func testPatternCountMatchesSourceFile() {
        // Verified via counting "patterns:" occurrences in exerciseMuscles.ts
        // minus 1 (the interface field declaration, not an array entry).
        XCTAssertEqual(ExerciseMuscleMapper.patterns.count, 73)
    }

    func testDeadliftMatchesGenericRuleNotRomanianDeadlift() {
        // "Deadlift" alone should match the generic /deadlift/i rule (order
        // position ~20), not the earlier /romanian deadlift/i rule, since it
        // doesn't contain "romanian". Confirms pattern-order fidelity for a
        // second, independent case beyond the incline-press example.
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Deadlift")
        let gluteWeight = profile.targets.first { $0.slug == "gluteal" }?.weight ?? 0
        XCTAssertEqual(gluteWeight, 0.75, accuracy: 0.001)
    }
}
