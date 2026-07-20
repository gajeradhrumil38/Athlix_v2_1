import Foundation

/// Real per-exercise training volume aggregated per muscle slug, plus
/// body-weight-relative normalization. Ports web's `muscleMapData` reduce
/// (src/pages/Home.tsx:301-327).
public enum MuscleLoadCalculator {
    public struct ExerciseInput: Sendable {
        public let name: String
        public let muscleGroup: String?
        public let weight: Double
        public let reps: Int
        public let sets: Int
        public let unit: WeightUnit

        public init(name: String, muscleGroup: String?, weight: Double, reps: Int, sets: Int, unit: WeightUnit) {
            self.name = name
            self.muscleGroup = muscleGroup
            self.weight = weight
            self.reps = reps
            self.sets = sets
            self.unit = unit
        }
    }

    /// Real per-exercise training volume (weight * reps * sets, converted to
    /// `displayUnit`) aggregated per muscle slug via `ExerciseMuscleMapper`'s
    /// real name-based targeting. Matches web's `muscleMapData` per-exercise
    /// reduce (src/pages/Home.tsx:301-327).
    public static func loadBySlug(exercises: [ExerciseInput], displayUnit: WeightUnit) -> [String: Double] {
        var totals: [String: Double] = [:]
        for exercise in exercises {
            let displayWeight = WeightUnit.convert(exercise.weight, from: exercise.unit, to: displayUnit)
            let exerciseLoad = displayWeight * Double(exercise.reps) * Double(exercise.sets)
            let profile = ExerciseMuscleMapper.profile(forExerciseName: exercise.name, fallbackMuscleGroup: exercise.muscleGroup)
            for target in profile.targets {
                totals[target.slug, default: 0] += exerciseLoad * target.weight
            }
        }
        return totals
    }

    /// Converts raw per-slug load into body-weight-relative load when
    /// `bodyWeightKg` is present and strictly positive -- unconditionally,
    /// matching web's `if (bodyWeightKg && bodyWeightKg > 0)` branch. Falls
    /// back to raw load when no body weight is on file OR it's <= 0.
    public static func relativeLoadBySlug(rawLoad: [String: Double], bodyWeightKg: Double?) -> [String: Double] {
        guard let bodyWeightKg, bodyWeightKg > 0 else { return rawLoad }
        return rawLoad.mapValues { $0 / bodyWeightKg }
    }
}
