import XCTest
@testable import AthlixCore

final class ExerciseTypeResolverTests: XCTestCase {
    // MARK: - Exact match

    func testExactMatch_treadmill() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Treadmill"), .distanceTime)
    }

    func testExactMatch_treadmill_extraWhitespaceAndMixedCase() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("  Treadmill  "), .distanceTime)
        XCTAssertEqual(ExerciseTypeResolver.resolve("TrEaDmIlL"), .distanceTime)
    }

    // MARK: - False-positive prevention (word-boundary safety)

    func testExactMatch_bicycleCrunch_doesNotFalsePositiveAsCycling() {
        // "bicycle crunch" is itself an EXACT_TYPE_MAP entry (reps_only) — it must
        // resolve correctly and must NOT be caught by the "cycle" substring inside
        // the distance_time pattern group's \bcycl(e|es|ing|ist)\b pattern.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Bicycle Crunch"), .repsOnly)
    }

    func testExactMatch_crunches_doesNotFalsePositiveAsRun() {
        // "crunches" contains "run" as a substring (c-RUN-ches) but must not match
        // the word-boundary \brun(s|ning|ner)?\b pattern.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Crunches"), .repsOnly)
    }

    func testExactMatch_walkingLunge_winsBeforePatternWalkingGuard() {
        // Exact map has 'walking lunge': weight_reps — this must win before the
        // pattern-based /\bwalking\b(?!\s+lunge)/i guard is ever reached.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Walking Lunge"), .weightReps)
    }

    // MARK: - Default fallback

    func testDefaultFallback_benchPress() {
        // No exact match, no pattern match at all — must fall through to the
        // weight_reps default.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Bench Press"), .weightReps)
    }

    // MARK: - Spot checks across categories (exact-map entries, traced from TS source)

    func testSpotCheck_ellipticalTrainer() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Elliptical Trainer"), .distanceTime)
    }

    func testSpotCheck_assaultBike() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Assault Bike"), .distanceTime)
    }

    func testSpotCheck_rowingMachine() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Rowing Machine"), .distanceTime)
    }

    func testSpotCheck_swimming() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Swimming"), .distanceOnly)
    }

    func testSpotCheck_plank() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Plank"), .timeOnly)
    }

    func testSpotCheck_downwardDog() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Downward Dog"), .repsOnly)
    }

    func testSpotCheck_warriorII() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Warrior II"), .repsOnly)
    }

    func testSpotCheck_pullUps_hyphenated() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Pull-Ups"), .repsOnly)
    }

    func testSpotCheck_pushUps_spaced() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Push Ups"), .repsOnly)
    }

    func testSpotCheck_burpees() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Burpees"), .repsOnly)
    }

    func testSpotCheck_russianTwist() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Russian Twist"), .repsOnly)
    }

    func testSpotCheck_boxJump() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Box Jump"), .heightReps)
    }

    func testSpotCheck_foamRolling() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Foam Rolling"), .timeOnly)
    }

    func testSpotCheck_calfStretch() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Calf Stretch"), .timeOnly)
    }

    func testSpotCheck_hipFlexorStretch() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Hip Flexor Stretch"), .timeOnly)
    }

    func testSpotCheck_wristRoller() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Wrist Roller"), .repsOnly)
    }

    func testSpotCheck_gobletSquat() {
        XCTAssertEqual(ExerciseTypeResolver.resolve("Goblet Squat"), .weightReps)
    }

    // MARK: - Pattern-only matches (name not itself an EXACT_TYPE_MAP key)

    func testPatternMatch_yoga_notInExactMapAlone() {
        // "yoga" alone is not an EXACT_TYPE_MAP key (only compound keys like
        // 'power yoga', 'yin yoga' are) — must fall through to the yoga pattern
        // group's /\byoga\b/i.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Yoga"), .repsOnly)
    }

    func testPatternMatch_sprinter_notInExactMap() {
        // "sprinter" is not an EXACT_TYPE_MAP key (only 'sprinting' is) — must
        // fall through to the distance_time pattern group's
        // /\bsprint(s|ing|er)?\b/i.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Sprinter"), .distanceTime)
    }

    func testPatternMatch_swimmer_notInExactMap() {
        // "swimmer" is not an EXACT_TYPE_MAP key (only 'swimming'/'swim' are) —
        // must fall through to the distance_only pattern group's
        // /\bswim(s|ming|mer)?\b/i.
        XCTAssertEqual(ExerciseTypeResolver.resolve("Swimmer"), .distanceOnly)
    }

    // MARK: - Whitespace normalization (all runs, not just repeated ASCII spaces)

    func testNormalizeKeyCollapsesAllWhitespaceNotJustAsciiSpaces() {
        // Web's TS source: name.replace(/\s+/g, ' ') -- collapses ANY whitespace
        // run (tabs, newlines, multiple spaces) into one space, not just repeated
        // ASCII spaces. "Elliptical\tTrainer" and "Elliptical Trainer" must
        // resolve identically. "elliptical trainer" is an EXACT_TYPE_MAP key
        // (-> distanceTime) that is NOT independently caught by any pattern
        // group (the ported "elliptical" pattern is a mistranslated
        // \brilliant?ical\b regex), so a tab that fails to normalize to a
        // single space breaks the exact-match lookup and falls through to the
        // weightReps default -- a genuinely different result, not a
        // coincidental match via regex \s.
        let spaceResult = ExerciseTypeResolver.resolve("Elliptical Trainer")
        XCTAssertEqual(spaceResult, .distanceTime)

        let tabResult = ExerciseTypeResolver.resolve("Elliptical\tTrainer")
        XCTAssertEqual(tabResult, spaceResult)

        let newlineResult = ExerciseTypeResolver.resolve("Elliptical\n\nTrainer")
        XCTAssertEqual(newlineResult, spaceResult)
    }

    func testPatternMatch_walkingGuard_notFollowedByLunge() {
        // "walking outdoors" is not an EXACT_TYPE_MAP key. The pattern
        // /\bwalking\b(?!\s+lunge)/i should match since "walking" here is NOT
        // followed by "lunge", confirming the negative lookahead is honored
        // (only excludes the specific "walking lunge" phrase).
        XCTAssertEqual(ExerciseTypeResolver.resolve("Walking Outdoors"), .distanceOnly)
    }
}
