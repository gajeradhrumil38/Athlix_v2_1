import Foundation

/// Label/unit-display helpers and set-value formatting.
/// Mirrors `INPUT_LABELS`, `getInputLabels`, `getUnitDisplay`, and `formatSetValue`
/// from `src/lib/exerciseTypes.ts`.
public enum ExerciseTypeLabels {
    public static func baseLabels(for type: ExerciseInputType) -> (primary: String, secondary: String?) {
        switch type {
        case .weightReps: return ("KG", "REPS")
        case .distanceTime: return ("KM", "MIN")
        case .timeOnly: return ("MIN", "SEC")
        case .distanceOnly: return ("KM", nil)
        case .repsOnly: return ("REPS", nil)
        case .heightReps: return ("CM", "REPS")
        case .caloriesTime: return ("CAL", "MIN")
        }
    }

    public static func inputLabels(
        for type: ExerciseInputType,
        weightUnit: WeightUnit = .lbs,
        distanceUnit: String = "km"
    ) -> (primary: String, secondary: String?) {
        let base = baseLabels(for: type)
        if type == .weightReps { return (weightUnit.rawValue.uppercased(), base.secondary) }
        if type == .distanceTime || type == .distanceOnly { return (distanceUnit.uppercased(), base.secondary) }
        return base
    }

    public static func unitDisplay(
        for type: ExerciseInputType,
        weightUnit: WeightUnit = .lbs,
        distanceUnit: String = "km"
    ) -> String {
        switch type {
        case .weightReps: return weightUnit.rawValue.uppercased()
        case .distanceTime, .distanceOnly: return distanceUnit.uppercased()
        case .heightReps: return "CM"
        case .caloriesTime: return "CAL"
        case .repsOnly: return "REPS"
        case .timeOnly: return "MIN"
        }
    }

    public static func formatSetValue(kind: DialFieldKind, value: Double) -> String {
        switch kind {
        case .weight, .distance: return String(format: "%.1f", value)
        default: return String(Int(value.rounded()))
        }
    }
}
