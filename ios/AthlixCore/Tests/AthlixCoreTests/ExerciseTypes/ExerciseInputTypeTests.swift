import Testing
@testable import AthlixCore

// MARK: - fieldKinds

@Test func fieldKindsWeightReps() {
    let kinds = ExerciseInputType.weightReps.fieldKinds
    #expect(kinds.primary == .weight)
    #expect(kinds.secondary == .reps)
}

@Test func fieldKindsDistanceTime() {
    let kinds = ExerciseInputType.distanceTime.fieldKinds
    #expect(kinds.primary == .distance)
    #expect(kinds.secondary == .minutes)
}

@Test func fieldKindsTimeOnly() {
    let kinds = ExerciseInputType.timeOnly.fieldKinds
    #expect(kinds.primary == .minutes)
    #expect(kinds.secondary == .seconds)
}

@Test func fieldKindsDistanceOnlyHasNoSecondary() {
    let kinds = ExerciseInputType.distanceOnly.fieldKinds
    #expect(kinds.primary == .distance)
    #expect(kinds.secondary == nil)
}

@Test func fieldKindsRepsOnlyHasNoSecondary() {
    let kinds = ExerciseInputType.repsOnly.fieldKinds
    #expect(kinds.primary == .reps)
    #expect(kinds.secondary == nil)
}

@Test func fieldKindsHeightReps() {
    let kinds = ExerciseInputType.heightReps.fieldKinds
    #expect(kinds.primary == .height)
    #expect(kinds.secondary == .reps)
}

@Test func fieldKindsCaloriesTime() {
    let kinds = ExerciseInputType.caloriesTime.fieldKinds
    #expect(kinds.primary == .calories)
    #expect(kinds.secondary == .minutes)
}

// MARK: - defaultSetValues

@Test func defaultSetValuesWeightReps() {
    let defaults = ExerciseInputType.weightReps.defaultSetValues
    #expect(defaults.primary == 0)
    #expect(defaults.secondary == 0)
}

@Test func defaultSetValuesDistanceTime() {
    let defaults = ExerciseInputType.distanceTime.defaultSetValues
    #expect(defaults.primary == 0)
    #expect(defaults.secondary == 5)
}

@Test func defaultSetValuesTimeOnly() {
    let defaults = ExerciseInputType.timeOnly.defaultSetValues
    #expect(defaults.primary == 2)
    #expect(defaults.secondary == 0)
}

@Test func defaultSetValuesDistanceOnly() {
    let defaults = ExerciseInputType.distanceOnly.defaultSetValues
    #expect(defaults.primary == 0)
    #expect(defaults.secondary == 0)
}

@Test func defaultSetValuesRepsOnly() {
    let defaults = ExerciseInputType.repsOnly.defaultSetValues
    #expect(defaults.primary == 0)
    #expect(defaults.secondary == 10)
}

@Test func defaultSetValuesHeightReps() {
    let defaults = ExerciseInputType.heightReps.defaultSetValues
    #expect(defaults.primary == 0)
    #expect(defaults.secondary == 8)
}

@Test func defaultSetValuesCaloriesTime() {
    let defaults = ExerciseInputType.caloriesTime.defaultSetValues
    #expect(defaults.primary == 0)
    #expect(defaults.secondary == 5)
}

// MARK: - hasSecondaryField

@Test func hasSecondaryFieldTrueForWeightReps() {
    #expect(ExerciseInputType.weightReps.hasSecondaryField)
}

@Test func hasSecondaryFieldTrueForDistanceTime() {
    #expect(ExerciseInputType.distanceTime.hasSecondaryField)
}

@Test func hasSecondaryFieldTrueForTimeOnly() {
    #expect(ExerciseInputType.timeOnly.hasSecondaryField)
}

@Test func hasSecondaryFieldTrueForHeightReps() {
    #expect(ExerciseInputType.heightReps.hasSecondaryField)
}

@Test func hasSecondaryFieldTrueForCaloriesTime() {
    #expect(ExerciseInputType.caloriesTime.hasSecondaryField)
}

@Test func hasSecondaryFieldFalseForDistanceOnly() {
    #expect(!ExerciseInputType.distanceOnly.hasSecondaryField)
}

@Test func hasSecondaryFieldFalseForRepsOnly() {
    #expect(!ExerciseInputType.repsOnly.hasSecondaryField)
}

// MARK: - isDistanceExerciseType

@Test func isDistanceExerciseTypeTrueForDistanceTime() {
    #expect(ExerciseInputType.distanceTime.isDistanceExerciseType)
}

@Test func isDistanceExerciseTypeTrueForDistanceOnly() {
    #expect(ExerciseInputType.distanceOnly.isDistanceExerciseType)
}

@Test func isDistanceExerciseTypeFalseForOthers() {
    #expect(!ExerciseInputType.weightReps.isDistanceExerciseType)
    #expect(!ExerciseInputType.timeOnly.isDistanceExerciseType)
    #expect(!ExerciseInputType.repsOnly.isDistanceExerciseType)
    #expect(!ExerciseInputType.heightReps.isDistanceExerciseType)
    #expect(!ExerciseInputType.caloriesTime.isDistanceExerciseType)
}

// MARK: - isWeightExerciseType

@Test func isWeightExerciseTypeTrueForWeightReps() {
    #expect(ExerciseInputType.weightReps.isWeightExerciseType)
}

@Test func isWeightExerciseTypeTrueForHeightReps() {
    #expect(ExerciseInputType.heightReps.isWeightExerciseType)
}

@Test func isWeightExerciseTypeFalseForOthers() {
    #expect(!ExerciseInputType.distanceTime.isWeightExerciseType)
    #expect(!ExerciseInputType.timeOnly.isWeightExerciseType)
    #expect(!ExerciseInputType.distanceOnly.isWeightExerciseType)
    #expect(!ExerciseInputType.repsOnly.isWeightExerciseType)
    #expect(!ExerciseInputType.caloriesTime.isWeightExerciseType)
}

// MARK: - raw values / CaseIterable sanity

@Test func allCasesCountIsSeven() {
    #expect(ExerciseInputType.allCases.count == 7)
}

@Test func rawValuesMatchTsStrings() {
    #expect(ExerciseInputType.weightReps.rawValue == "weight_reps")
    #expect(ExerciseInputType.distanceTime.rawValue == "distance_time")
    #expect(ExerciseInputType.timeOnly.rawValue == "time_only")
    #expect(ExerciseInputType.distanceOnly.rawValue == "distance_only")
    #expect(ExerciseInputType.repsOnly.rawValue == "reps_only")
    #expect(ExerciseInputType.heightReps.rawValue == "height_reps")
    #expect(ExerciseInputType.caloriesTime.rawValue == "calories_time")
}
