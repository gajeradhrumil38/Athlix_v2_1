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

    // body_weight_unit has no NOT NULL constraint in the DB (its CHECK constraint
    // doesn't block NULL under SQL three-valued logic), so a null or missing value
    // is schema-legal. Fall back to .lbs to match the web client's defensive
    // handling in supabaseData.ts rather than failing to decode the whole Profile.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        fullName = try container.decodeIfPresent(String.self, forKey: .fullName)
        unitPreference = try container.decode(WeightUnit.self, forKey: .unitPreference)
        themePreference = try container.decode(String.self, forKey: .themePreference)
        bodyWeight = try container.decodeIfPresent(Double.self, forKey: .bodyWeight)
        bodyWeightUnit = (try? container.decodeIfPresent(WeightUnit.self, forKey: .bodyWeightUnit)) ?? .lbs
        heightFeet = try container.decodeIfPresent(Int.self, forKey: .heightFeet)
        heightInches = try container.decodeIfPresent(Int.self, forKey: .heightInches)
    }
}
