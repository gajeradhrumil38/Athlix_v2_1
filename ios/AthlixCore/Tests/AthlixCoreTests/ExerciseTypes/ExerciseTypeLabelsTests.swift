import Foundation
import Testing
@testable import AthlixCore

@Suite("ExerciseTypeLabels")
struct ExerciseTypeLabelsTests {

    // MARK: - inputLabels

    @Test func weightRepsLabelsUseWeightUnit() {
        let labels = ExerciseTypeLabels.inputLabels(for: .weightReps, weightUnit: .kg)
        #expect(labels.primary == "KG")
        #expect(labels.secondary == "REPS")
    }

    @Test func weightRepsLabelsUseLbsWeightUnit() {
        let labels = ExerciseTypeLabels.inputLabels(for: .weightReps, weightUnit: .lbs)
        #expect(labels.primary == "LBS")
        #expect(labels.secondary == "REPS")
    }

    @Test func distanceOnlyLabelsUseDistanceUnit() {
        let labels = ExerciseTypeLabels.inputLabels(for: .distanceOnly, distanceUnit: "mi")
        #expect(labels.primary == "MI")
        #expect(labels.secondary == nil)
    }

    @Test func distanceTimeLabelsUseDistanceUnit() {
        let labels = ExerciseTypeLabels.inputLabels(for: .distanceTime, distanceUnit: "km")
        #expect(labels.primary == "KM")
        #expect(labels.secondary == "MIN")
    }

    @Test func timeOnlyLabelsAreFixed() {
        let labels = ExerciseTypeLabels.inputLabels(for: .timeOnly)
        #expect(labels.primary == "MIN")
        #expect(labels.secondary == "SEC")
    }

    @Test func repsOnlyLabelsAreFixed() {
        let labels = ExerciseTypeLabels.inputLabels(for: .repsOnly)
        #expect(labels.primary == "REPS")
        #expect(labels.secondary == nil)
    }

    @Test func heightRepsLabelsAreFixed() {
        let labels = ExerciseTypeLabels.inputLabels(for: .heightReps)
        #expect(labels.primary == "CM")
        #expect(labels.secondary == "REPS")
    }

    @Test func caloriesTimeLabelsAreFixed() {
        let labels = ExerciseTypeLabels.inputLabels(for: .caloriesTime)
        #expect(labels.primary == "CAL")
        #expect(labels.secondary == "MIN")
    }

    // MARK: - unitDisplay

    @Test func unitDisplayWeightReps() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .weightReps, weightUnit: .kg) == "KG")
    }

    @Test func unitDisplayDistanceTime() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .distanceTime, distanceUnit: "mi") == "MI")
    }

    @Test func unitDisplayDistanceOnly() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .distanceOnly, distanceUnit: "km") == "KM")
    }

    @Test func unitDisplayHeightReps() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .heightReps) == "CM")
    }

    @Test func unitDisplayCaloriesTime() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .caloriesTime) == "CAL")
    }

    @Test func unitDisplayRepsOnly() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .repsOnly) == "REPS")
    }

    @Test func unitDisplayTimeOnly() {
        #expect(ExerciseTypeLabels.unitDisplay(for: .timeOnly) == "MIN")
    }

    // MARK: - formatSetValue

    @Test func formatWeightRoundsToOneDecimal() {
        #expect(ExerciseTypeLabels.formatSetValue(kind: .weight, value: 72.46) == "72.5")
    }

    @Test func formatDistanceRoundsToOneDecimal() {
        #expect(ExerciseTypeLabels.formatSetValue(kind: .distance, value: 5.04) == "5.0")
    }

    @Test func formatRepsRoundsToInteger() {
        #expect(ExerciseTypeLabels.formatSetValue(kind: .reps, value: 8.0) == "8")
    }

    @Test func formatRepsRoundsUpFromDecimal() {
        #expect(ExerciseTypeLabels.formatSetValue(kind: .reps, value: 8.6) == "9")
    }

    @Test func formatRepsRoundsHalfAwayFromZero() {
        #expect(ExerciseTypeLabels.formatSetValue(kind: .reps, value: 8.5) == "9")
    }

    @Test func formatMinutesRoundsToInteger() {
        #expect(ExerciseTypeLabels.formatSetValue(kind: .minutes, value: 4.0) == "4")
    }

    // Regression: formatSetValue must force "." as the decimal separator regardless of the
    // device's current locale. Swift Testing doesn't let us swap Locale.current mid-test, so
    // this instead proves the bug scenario is real (fr_FR genuinely renders "%.1f" with a
    // comma when the locale isn't pinned) and then asserts production code does NOT exhibit
    // that behavior — this fails if formatSetValue is ever reverted to rely on Locale.current
    // on a machine whose default locale uses a comma separator, and the plain "no comma"
    // checks below catch it on any locale.
    @Test func formatWeightForcesPosixDecimalSeparatorRegardlessOfSystemLocale() {
        // Sanity check: fr_FR really would produce a comma if the locale weren't pinned.
        let localeUnsafeOutput = String(format: "%.1f", locale: Locale(identifier: "fr_FR"), 72.5)
        #expect(localeUnsafeOutput == "72,5")

        // Production code must not reproduce that locale-dependent behavior.
        let result = ExerciseTypeLabels.formatSetValue(kind: .weight, value: 72.5)
        #expect(result == "72.5")
        #expect(!result.contains(","))
        #expect(result.contains("."))
    }

    @Test func formatDistanceNeverUsesCommaDecimalSeparator() {
        let result = ExerciseTypeLabels.formatSetValue(kind: .distance, value: 5.04)
        #expect(result == "5.0")
        #expect(!result.contains(","))
    }
}
