import Foundation

public struct TemplateExercise: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let templateId: String
    public var name: String
    public var muscleGroup: String?
    public var defaultSets: Int
    public var defaultReps: Int
    public var defaultWeight: Double
    public var orderIndex: Int
    public var exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case templateId = "template_id"
        case name
        case muscleGroup = "muscle_group"
        case defaultSets = "default_sets"
        case defaultReps = "default_reps"
        case defaultWeight = "default_weight"
        case orderIndex = "order_index"
        case exerciseDbId = "exercise_db_id"
    }

    public init(id: String, templateId: String, name: String, muscleGroup: String?, defaultSets: Int, defaultReps: Int, defaultWeight: Double, orderIndex: Int, exerciseDbId: String?) {
        self.id = id
        self.templateId = templateId
        self.name = name
        self.muscleGroup = muscleGroup
        self.defaultSets = defaultSets
        self.defaultReps = defaultReps
        self.defaultWeight = defaultWeight
        self.orderIndex = orderIndex
        self.exerciseDbId = exerciseDbId
    }
}

public struct Template: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public var title: String
    public let createdAt: String
    public var exercises: [TemplateExercise]

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title
        case createdAt = "created_at"
        case exercises = "template_exercises"
    }

    public init(id: String, userId: String, title: String, createdAt: String, exercises: [TemplateExercise]) {
        self.id = id
        self.userId = userId
        self.title = title
        self.createdAt = createdAt
        self.exercises = exercises
    }
}
