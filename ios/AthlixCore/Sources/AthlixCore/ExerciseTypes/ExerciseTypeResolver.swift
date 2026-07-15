import Foundation

/// Ports `resolveExerciseInputType` from `src/lib/exerciseTypes.ts`.
/// Resolution order: exact-name lookup, then ordered regex pattern groups
/// (first group with any matching pattern wins), then a `.weightReps` default.
public enum ExerciseTypeResolver {
    public static func resolve(_ exerciseName: String) -> ExerciseInputType {
        let normalized = normalizeKey(exerciseName)

        if let exact = ExerciseTypeResolverData.exactMatches[normalized] {
            return exact
        }

        for group in ExerciseTypeResolverData.patternGroups {
            let range = NSRange(normalized.startIndex..., in: normalized)
            if group.patterns.contains(where: { $0.firstMatch(in: normalized, range: range) != nil }) {
                return group.type
            }
        }

        return .weightReps
    }

    private static func normalizeKey(_ value: String) -> String {
        var result = value.lowercased()
        result = result.replacingOccurrences(of: "(", with: "")
        result = result.replacingOccurrences(of: ")", with: "")
        while result.contains("  ") {
            result = result.replacingOccurrences(of: "  ", with: " ")
        }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
