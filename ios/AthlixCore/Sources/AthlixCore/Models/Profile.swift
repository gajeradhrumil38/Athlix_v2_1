import Foundation

public struct Profile: Codable, Equatable, Sendable {
    public let id: String
    public let fullName: String?
    public let unitPreference: WeightUnit
    public let themePreference: String
    public let bodyWeight: Double?
    public let heightFeet: Int?
    public let heightInches: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case unitPreference = "unit_preference"
        case themePreference = "theme_preference"
        case bodyWeight = "body_weight"
        case heightFeet = "height_feet"
        case heightInches = "height_inches"
    }
}
