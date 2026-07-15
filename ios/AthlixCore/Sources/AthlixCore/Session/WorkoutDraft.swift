import Foundation

/// A single in-progress set within an `ExerciseEntry`, before it is persisted
/// as a saved `ExerciseSet` row. Distinct from `Models/ExerciseSet.swift`,
/// which represents a completed set already stored in Supabase.
public struct LoggedSet: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public var weight: Double?
    public var reps: Int?
    public var done: Bool
    public var isPR: Bool
    public var plannedWeight: Double?
    public var plannedReps: Int?

    public init(id: String, weight: Double?, reps: Int?, done: Bool, isPR: Bool, plannedWeight: Double?, plannedReps: Int?) {
        self.id = id
        self.weight = weight
        self.reps = reps
        self.done = done
        self.isPR = isPR
        self.plannedWeight = plannedWeight
        self.plannedReps = plannedReps
    }
}

/// Snapshot of the user's previous session for a given exercise, shown as a
/// reference while logging the current one.
public struct LastSessionSummary: Codable, Equatable, Sendable {
    public let date: String
    public let sets: Int
    public let reps: Int
    public let weight: Double
    public let totalVolume: Double
    public let perSetData: [PerSetDatum]

    public struct PerSetDatum: Codable, Equatable, Sendable {
        public let weight: Double
        public let reps: Int

        public init(weight: Double, reps: Int) {
            self.weight = weight
            self.reps = reps
        }
    }

    public init(date: String, sets: Int, reps: Int, weight: Double, totalVolume: Double, perSetData: [PerSetDatum]) {
        self.date = date
        self.sets = sets
        self.reps = reps
        self.weight = weight
        self.totalVolume = totalVolume
        self.perSetData = perSetData
    }
}

/// A single exercise block within an in-progress `WorkoutDraft`, grouping
/// multiple `LoggedSet`s before they are ever saved.
public struct ExerciseEntry: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public var name: String
    public var muscleGroup: String
    public var exerciseDbId: String?
    public var sets: [LoggedSet]
    public var optionalWeight: Bool?
    public var inputTypeOverride: ExerciseInputType?
    public var lastSession: LastSessionSummary?

    public init(id: String, name: String, muscleGroup: String, exerciseDbId: String?, sets: [LoggedSet],
                optionalWeight: Bool?, inputTypeOverride: ExerciseInputType?, lastSession: LastSessionSummary? = nil) {
        self.id = id
        self.name = name
        self.muscleGroup = muscleGroup
        self.exerciseDbId = exerciseDbId
        self.sets = sets
        self.optionalWeight = optionalWeight
        self.inputTypeOverride = inputTypeOverride
        self.lastSession = lastSession
    }
}

/// An ACTIVE (not-yet-saved) workout session, kept in memory/on-disk as a
/// recoverable draft. Distinct from a persisted workout row in Supabase.
public struct WorkoutDraft: Codable, Equatable, Sendable {
    public var id: String?
    public var title: String
    public var startAt: Date
    public var elapsedSeconds: Int
    public var exercises: [ExerciseEntry]
    public var notes: String?
    public var savedAt: Date

    public init(id: String?, title: String, startAt: Date, elapsedSeconds: Int, exercises: [ExerciseEntry], notes: String?, savedAt: Date) {
        self.id = id
        self.title = title
        self.startAt = startAt
        self.elapsedSeconds = elapsedSeconds
        self.exercises = exercises
        self.notes = notes
        self.savedAt = savedAt
    }

    /// Strictly greater-than: a draft exactly `ttl` seconds old is NOT expired yet
    /// (matches web's sessionStorage draft TTL check semantics).
    public func isExpired(now: Date, ttl: TimeInterval) -> Bool {
        now.timeIntervalSince(savedAt) > ttl
    }
}
