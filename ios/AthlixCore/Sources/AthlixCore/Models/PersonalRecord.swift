import Foundation

public struct PersonalRecord: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let exerciseName: String
    public let bestWeight: Double
    public let bestReps: Int
    public let achievedDate: String
    public let createdAt: String
    public let exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case exerciseName = "exercise_name"
        case bestWeight = "best_weight"
        case bestReps = "best_reps"
        case achievedDate = "achieved_date"
        case createdAt = "created_at"
        case exerciseDbId = "exercise_db_id"
    }

    public init(id: String, userId: String, exerciseName: String, bestWeight: Double, bestReps: Int, achievedDate: String, createdAt: String, exerciseDbId: String?) {
        self.id = id
        self.userId = userId
        self.exerciseName = exerciseName
        self.bestWeight = bestWeight
        self.bestReps = bestReps
        self.achievedDate = achievedDate
        self.createdAt = createdAt
        self.exerciseDbId = exerciseDbId
    }
}
