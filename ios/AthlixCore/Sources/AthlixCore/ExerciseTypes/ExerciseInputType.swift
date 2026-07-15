import Foundation

public enum ExerciseInputType: String, Codable, Sendable, CaseIterable {
    case weightReps = "weight_reps"
    case distanceTime = "distance_time"
    case timeOnly = "time_only"
    case distanceOnly = "distance_only"
    case repsOnly = "reps_only"
    case heightReps = "height_reps"
    case caloriesTime = "calories_time"

    public var fieldKinds: (primary: DialFieldKind, secondary: DialFieldKind?) {
        switch self {
        case .weightReps: return (.weight, .reps)
        case .distanceTime: return (.distance, .minutes)
        case .timeOnly: return (.minutes, .seconds)
        case .distanceOnly: return (.distance, nil)
        case .repsOnly: return (.reps, nil)
        case .heightReps: return (.height, .reps)
        case .caloriesTime: return (.calories, .minutes)
        }
    }

    public var defaultSetValues: (primary: Double, secondary: Int) {
        switch self {
        case .distanceTime: return (0, 5)
        case .timeOnly: return (2, 0)
        case .caloriesTime: return (0, 5)
        case .repsOnly: return (0, 10)
        case .distanceOnly: return (0, 0)
        case .heightReps: return (0, 8)
        case .weightReps: return (0, 0)
        }
    }

    public var hasSecondaryField: Bool { fieldKinds.secondary != nil }
    public var isDistanceExerciseType: Bool { self == .distanceTime || self == .distanceOnly }
    public var isWeightExerciseType: Bool { self == .weightReps || self == .heightReps }
}

public enum DialFieldKind: String, Codable, Sendable {
    case weight, reps, distance, minutes, seconds, height, calories
}
