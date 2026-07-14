import Foundation

public struct Profile: Codable, Equatable, Sendable {
    public let id: String
    public let fullName: String?
    public let unitPreference: WeightUnit
    public let themePreference: String
    public let bodyWeight: Double?
    public let heightCm: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case unitPreference = "unit_preference"
        case themePreference = "theme_preference"
        case bodyWeight = "body_weight"
        case heightCm = "height_cm"
    }
}
