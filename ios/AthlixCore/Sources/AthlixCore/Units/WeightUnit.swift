import Foundation

public enum WeightUnit: String, Codable, CaseIterable, Sendable {
    case kg
    case lbs

    private static let kgToLbs = 2.2046226218

    public static func convert(_ value: Double, from: WeightUnit, to: WeightUnit) -> Double {
        guard value.isFinite else { return 0 }
        guard from != to else { return value }
        switch (from, to) {
        case (.kg, .lbs):
            return value * kgToLbs
        case (.lbs, .kg):
            return value / kgToLbs
        default:
            return value
        }
    }

    public static func format(_ value: Double, unit: WeightUnit) -> String {
        (NSString(format: "%.1f %@" as NSString, locale: Locale(identifier: "en_US_POSIX"), value, unit.rawValue) as String)
    }
}
