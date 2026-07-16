import Testing
@testable import AthlixCore
import Foundation

// MARK: - Helpers

private func makeEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .secondsSince1970
    return encoder
}

private func makeDecoder() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .secondsSince1970
    return decoder
}

private func makeNontrivialDraft() -> WorkoutDraft {
    let benchLastSession = LastSessionSummary(
        date: "2026-07-01",
        sets: 3,
        reps: 24,
        weight: 135,
        totalVolume: 3240,
        perSetData: [
            .init(weight: 135, reps: 8),
            .init(weight: 135, reps: 8),
            .init(weight: 135, reps: 8),
        ]
    )

    let bench = ExerciseEntry(
        id: "ex-1",
        name: "Bench Press",
        muscleGroup: "Chest",
        exerciseDbId: "bench-press-barbell",
        sets: [
            LoggedSet(id: "s1", weight: 135, reps: 8, done: true, isPR: false, plannedWeight: 135, plannedReps: 8),
            LoggedSet(id: "s2", weight: 145, reps: 6, done: true, isPR: true, plannedWeight: 140, plannedReps: 8),
            LoggedSet(id: "s3", weight: nil, reps: nil, done: false, isPR: false, plannedWeight: 145, plannedReps: 6),
        ],
        optionalWeight: false,
        inputTypeOverride: .weightReps,
        lastSession: benchLastSession
    )

    let plank = ExerciseEntry(
        id: "ex-2",
        name: "Plank",
        muscleGroup: "Core",
        exerciseDbId: nil,
        sets: [
            LoggedSet(id: "s4", weight: nil, reps: nil, done: false, isPR: false, plannedWeight: nil, plannedReps: nil),
        ],
        optionalWeight: nil,
        inputTypeOverride: .timeOnly,
        lastSession: nil
    )

    return WorkoutDraft(
        id: "draft-abc",
        title: "Push Day",
        startAt: Date(timeIntervalSince1970: 1_752_000_000),
        elapsedSeconds: 754,
        exercises: [bench, plank],
        notes: "Felt strong today",
        savedAt: Date(timeIntervalSince1970: 1_752_000_754)
    )
}

// MARK: - Codable round-trip

@Test func draftRoundTripsThroughJSON() throws {
    let draft = makeNontrivialDraft()
    let data = try makeEncoder().encode(draft)
    let decoded = try makeDecoder().decode(WorkoutDraft.self, from: data)
    #expect(decoded == draft)
}

@Test func draftRoundTripsReliablyAcrossMultipleRuns() throws {
    // Guard against Date-precision flakiness by repeating the round trip.
    for _ in 0..<5 {
        let draft = makeNontrivialDraft()
        let data = try makeEncoder().encode(draft)
        let decoded = try makeDecoder().decode(WorkoutDraft.self, from: data)
        #expect(decoded == draft)
    }
}

@Test func draftRoundTripWithOptionalWeightTrue() throws {
    // Covers the third state of ExerciseEntry.optionalWeight (nil/false already
    // exercised by makeNontrivialDraft) — weighted push-ups opting in to
    // tracking added weight alongside their normal reps-only fields.
    let weightedPushUps = ExerciseEntry(
        id: "ex-3",
        name: "Weighted Push-Ups",
        muscleGroup: "Chest",
        exerciseDbId: "weighted-push-ups",
        sets: [
            LoggedSet(id: "s5", weight: 25, reps: 12, done: true, isPR: false, plannedWeight: 25, plannedReps: 12),
        ],
        optionalWeight: true,
        inputTypeOverride: .repsOnly,
        lastSession: nil
    )

    let draft = WorkoutDraft(
        id: "draft-def",
        title: "Bodyweight Day",
        startAt: Date(timeIntervalSince1970: 1_752_100_000),
        elapsedSeconds: 300,
        exercises: [weightedPushUps],
        notes: nil,
        savedAt: Date(timeIntervalSince1970: 1_752_100_300)
    )

    let data = try makeEncoder().encode(draft)
    let decoded = try makeDecoder().decode(WorkoutDraft.self, from: data)
    #expect(decoded == draft)
    #expect(decoded.exercises[0].optionalWeight == true)
}

@Test func draftRoundTripWithNoExercisesAndNilFields() throws {
    let draft = WorkoutDraft(
        id: nil,
        title: "Empty",
        startAt: Date(timeIntervalSince1970: 1_752_000_000),
        elapsedSeconds: 0,
        exercises: [],
        notes: nil,
        savedAt: Date(timeIntervalSince1970: 1_752_000_000)
    )
    let data = try makeEncoder().encode(draft)
    let decoded = try makeDecoder().decode(WorkoutDraft.self, from: data)
    #expect(decoded == draft)
}

@Test func loggedSetRoundTripsIndividually() throws {
    let set = LoggedSet(id: "s1", weight: 100.5, reps: 10, done: true, isPR: true, plannedWeight: 95, plannedReps: 10)
    let data = try JSONEncoder().encode(set)
    let decoded = try JSONDecoder().decode(LoggedSet.self, from: data)
    #expect(decoded == set)
}

@Test func lastSessionSummaryRoundTripsIndividually() throws {
    let summary = LastSessionSummary(
        date: "2026-07-01", sets: 2, reps: 16, weight: 100, totalVolume: 1600,
        perSetData: [.init(weight: 100, reps: 8), .init(weight: 100, reps: 8)]
    )
    let data = try JSONEncoder().encode(summary)
    let decoded = try JSONDecoder().decode(LastSessionSummary.self, from: data)
    #expect(decoded == summary)
}

// MARK: - isExpired

@Test func draftExpiresAfterTTL() {
    let old = WorkoutDraft(
        id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil,
        savedAt: Date().addingTimeInterval(-9 * 3600)
    )
    #expect(old.isExpired(now: Date(), ttl: 8 * 3600))
}

@Test func draftNotExpiredWithinTTL() {
    let fresh = WorkoutDraft(
        id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil,
        savedAt: Date().addingTimeInterval(-1 * 3600)
    )
    #expect(!fresh.isExpired(now: Date(), ttl: 8 * 3600))
}

@Test func draftNotExpiredWellWithinTTL() {
    let veryFresh = WorkoutDraft(
        id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil,
        savedAt: Date()
    )
    #expect(!veryFresh.isExpired(now: Date(), ttl: 8 * 3600))
}

@Test func draftAtExactTTLBoundaryIsNotExpired() {
    // Strict "greater than" semantics: a draft exactly `ttl` seconds old has not
    // yet crossed the expiry threshold.
    let now = Date()
    let ttl: TimeInterval = 8 * 3600
    let boundary = WorkoutDraft(
        id: nil, title: "x", startAt: now, elapsedSeconds: 0, exercises: [], notes: nil,
        savedAt: now.addingTimeInterval(-ttl)
    )
    #expect(!boundary.isExpired(now: now, ttl: ttl))
}

@Test func draftJustPastTTLBoundaryIsExpired() {
    let now = Date()
    let ttl: TimeInterval = 8 * 3600
    let justOver = WorkoutDraft(
        id: nil, title: "x", startAt: now, elapsedSeconds: 0, exercises: [], notes: nil,
        savedAt: now.addingTimeInterval(-ttl - 1)
    )
    #expect(justOver.isExpired(now: now, ttl: ttl))
}
