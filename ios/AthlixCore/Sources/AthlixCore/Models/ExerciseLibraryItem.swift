import Foundation

/// A row from the `exercise_library` table -- either one of the shipped default
/// exercises (`isCustom == false`) or a user-created custom exercise.
public struct ExerciseLibraryItem: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let muscleGroup: String
    public let isCustom: Bool
    public let userId: String?
    public let exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case muscleGroup = "muscle_group"
        case isCustom = "is_custom"
        case userId = "user_id"
        case exerciseDbId = "exercise_db_id"
    }

    public init(id: String, name: String, muscleGroup: String, isCustom: Bool, userId: String?, exerciseDbId: String?) {
        self.id = id
        self.name = name
        self.muscleGroup = muscleGroup
        self.isCustom = isCustom
        self.userId = userId
        self.exerciseDbId = exerciseDbId
    }
}

/// A unique exercise the user has logged before, surfaced in the Exercise Picker's
/// History tab, carrying that exercise's own most-recent session for reference.
public struct RecentExerciseOption: Sendable, Equatable, Identifiable {
    public var id: String { name }
    public let name: String
    public let muscleGroup: String
    public let exerciseDbId: String?
    public let lastSession: LastSessionSummary

    public init(name: String, muscleGroup: String, exerciseDbId: String?, lastSession: LastSessionSummary) {
        self.name = name
        self.muscleGroup = muscleGroup
        self.exerciseDbId = exerciseDbId
        self.lastSession = lastSession
    }
}
