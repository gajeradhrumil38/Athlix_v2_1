import Foundation

public struct Profile: Codable, Equatable, Sendable {
    public let id: String
    public let fullName: String?
    public let unitPreference: WeightUnit
    public let themePreference: String
    public let bodyWeight: Double?
    public let bodyWeightUnit: WeightUnit
    public let heightFeet: Int?
    public let heightInches: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case unitPreference = "unit_preference"
        case themePreference = "theme_preference"
        case bodyWeight = "body_weight"
        case bodyWeightUnit = "body_weight_unit"
        case heightFeet = "height_feet"
        case heightInches = "height_inches"
    }

    public init(id: String, fullName: String?, unitPreference: WeightUnit, themePreference: String, bodyWeight: Double?, bodyWeightUnit: WeightUnit, heightFeet: Int?, heightInches: Int?) {
        self.id = id
        self.fullName = fullName
        self.unitPreference = unitPreference
        self.themePreference = themePreference
        self.bodyWeight = bodyWeight
        self.bodyWeightUnit = bodyWeightUnit
        self.heightFeet = heightFeet
        self.heightInches = heightInches
    }
}
