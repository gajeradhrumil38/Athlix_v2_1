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

    func testNormalizeTargetsBreaksTiesByFirstOccurrenceOrder() {
        // Two targets with identical weight: whichever appears FIRST in the
        // input array must appear first in the output when weights tie,
        // matching the original TypeScript Map + stable-sort semantics.
        let targets = [
            ExerciseMuscleTarget(slug: "triceps", weight: 0.26),
            ExerciseMuscleTarget(slug: "gluteal", weight: 0.26),
        ]
        let result = ExerciseMuscleMapper.normalizeTargets(targets)
        XCTAssertEqual(result.map(\.slug), ["triceps", "gluteal"])

        // Reversed input order should reverse the tie-break too, proving this
        // isn't accidentally still order-independent.
        let reversed = [
            ExerciseMuscleTarget(slug: "gluteal", weight: 0.26),
            ExerciseMuscleTarget(slug: "triceps", weight: 0.26),
        ]
        let reversedResult = ExerciseMuscleMapper.normalizeTargets(reversed)
        XCTAssertEqual(reversedResult.map(\.slug), ["gluteal", "triceps"])
    }

    func testAssaultBikeTiedWeightsAreDeterministicAcrossRepeatedCalls() {
        // "Assault Bike" has triceps and gluteal both at weight 0.26 in the real
        // pattern data -- run the full profile lookup many times and confirm
        // the tie always resolves the same way (regression guard against the
        // Dictionary-iteration-order bug this fix addresses).
        let results = (0..<20).map { _ in
            ExerciseMuscleMapper.profile(forExerciseName: "Assault Bike").targets.map(\.slug)
        }
        let distinctOrders = Set(results.map { $0.joined(separator: ",") })
        XCTAssertTrue(results.allSatisfy { $0 == results[0] }, "Tie-break order must be deterministic across repeated calls, got varying orders: \(distinctOrders)")
    }
}
