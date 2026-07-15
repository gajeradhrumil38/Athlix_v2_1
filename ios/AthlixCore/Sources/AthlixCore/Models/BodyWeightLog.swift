import Foundation

public struct BodyWeightLog: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let date: String
    public let weight: Double
    public let unit: WeightUnit
    public let notes: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case date, weight, unit, notes
        case createdAt = "created_at"
    }
}
