import Foundation

public struct Workout: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let title: String
    public let date: String // ISO date string (YYYY-MM-DD), parsed on demand
    public let durationMinutes: Int?
    public let notes: String?
    public let muscleGroups: [String]?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title
        case date
        case durationMinutes = "duration_minutes"
        case notes
        case muscleGroups = "muscle_groups"
        case createdAt = "created_at"
    }

    public init(id: String, userId: String, title: String, date: String, durationMinutes: Int?, notes: String?, muscleGroups: [String]?, createdAt: String) {
        self.id = id
        self.userId = userId
        self.title = title
        self.date = date
        self.durationMinutes = durationMinutes
        self.notes = notes
        self.muscleGroups = muscleGroups
        self.createdAt = createdAt
    }
}
