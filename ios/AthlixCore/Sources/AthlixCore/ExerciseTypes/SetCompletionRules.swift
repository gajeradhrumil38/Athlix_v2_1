import Foundation

/// Gate deciding whether a logged set can be marked "done".
/// Mirrors `isSetReadyForCompletion` from `src/lib/exerciseTypes.ts`.
public enum SetCompletionRules {
    public static func isReady(type: ExerciseInputType, weight: Double, reps: Int) -> Bool {
        switch type {
        case .weightReps: return reps > 0
        case .distanceTime: return weight > 0 || reps > 0
        case .timeOnly: return weight > 0 || reps > 0
        case .distanceOnly: return weight > 0
        case .repsOnly: return reps > 0
        case .heightReps: return reps > 0
        case .caloriesTime: return weight > 0 || reps > 0
        }
    }
}
