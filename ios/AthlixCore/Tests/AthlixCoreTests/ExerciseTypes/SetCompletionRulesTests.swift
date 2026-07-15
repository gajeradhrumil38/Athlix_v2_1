import Testing
@testable import AthlixCore

@Suite("SetCompletionRules")
struct SetCompletionRulesTests {

    // weight_reps: ready iff reps > 0, regardless of weight
    @Test func weightRepsReadyWithZeroWeightIfRepsPositive() {
        #expect(SetCompletionRules.isReady(type: .weightReps, weight: 0, reps: 5))
    }

    @Test func weightRepsNotReadyWithZeroReps() {
        #expect(!SetCompletionRules.isReady(type: .weightReps, weight: 100, reps: 0))
    }

    // distance_time: ready iff weight > 0 || reps > 0
    @Test func distanceTimeReadyWithPositiveWeightOnly() {
        #expect(SetCompletionRules.isReady(type: .distanceTime, weight: 5, reps: 0))
    }

    @Test func distanceTimeReadyWithPositiveRepsOnly() {
        #expect(SetCompletionRules.isReady(type: .distanceTime, weight: 0, reps: 5))
    }

    @Test func distanceTimeNotReadyWithBothZero() {
        #expect(!SetCompletionRules.isReady(type: .distanceTime, weight: 0, reps: 0))
    }

    // time_only: ready iff weight > 0 || reps > 0
    @Test func timeOnlyReadyWithPositiveWeightOnly() {
        #expect(SetCompletionRules.isReady(type: .timeOnly, weight: 2, reps: 0))
    }

    @Test func timeOnlyReadyWithPositiveRepsOnly() {
        #expect(SetCompletionRules.isReady(type: .timeOnly, weight: 0, reps: 30))
    }

    @Test func timeOnlyNotReadyWithBothZero() {
        #expect(!SetCompletionRules.isReady(type: .timeOnly, weight: 0, reps: 0))
    }

    // distance_only: ready iff weight > 0 (distance stored in weight slot)
    @Test func distanceOnlyReadyWithPositiveWeight() {
        #expect(SetCompletionRules.isReady(type: .distanceOnly, weight: 1.5, reps: 0))
    }

    @Test func distanceOnlyNotReadyWithZeroWeight() {
        #expect(!SetCompletionRules.isReady(type: .distanceOnly, weight: 0, reps: 0))
    }

    @Test func distanceOnlyNotReadyWithZeroWeightEvenIfRepsPositive() {
        #expect(!SetCompletionRules.isReady(type: .distanceOnly, weight: 0, reps: 10))
    }

    // reps_only: ready iff reps > 0
    @Test func repsOnlyReadyWithPositiveReps() {
        #expect(SetCompletionRules.isReady(type: .repsOnly, weight: 0, reps: 10))
    }

    @Test func repsOnlyNotReadyWithZeroReps() {
        #expect(!SetCompletionRules.isReady(type: .repsOnly, weight: 0, reps: 0))
    }

    // height_reps: ready iff reps > 0
    @Test func heightRepsReadyWithZeroHeightIfRepsPositive() {
        #expect(SetCompletionRules.isReady(type: .heightReps, weight: 0, reps: 8))
    }

    @Test func heightRepsNotReadyWithZeroReps() {
        #expect(!SetCompletionRules.isReady(type: .heightReps, weight: 180, reps: 0))
    }

    // calories_time: ready iff weight > 0 || reps > 0
    @Test func caloriesTimeReadyWithPositiveWeightOnly() {
        #expect(SetCompletionRules.isReady(type: .caloriesTime, weight: 100, reps: 0))
    }

    @Test func caloriesTimeReadyWithPositiveRepsOnly() {
        #expect(SetCompletionRules.isReady(type: .caloriesTime, weight: 0, reps: 5))
    }

    @Test func caloriesTimeNotReadyWithBothZero() {
        #expect(!SetCompletionRules.isReady(type: .caloriesTime, weight: 0, reps: 0))
    }
}
