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
}
