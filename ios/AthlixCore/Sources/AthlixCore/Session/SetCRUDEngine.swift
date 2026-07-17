import Foundation

/// Pure set/exercise CRUD logic extracted from the web app's `ActiveWorkout.tsx`
/// handlers (`handleAddSet`, `handleCopySet`, `handleRemoveSet`, and the
/// exercise-dedupe check inside `handleAddExercise`). No SwiftUI/view-model
/// dependencies — every function takes its input array and returns a new
/// array, so it's independently unit-testable and safe to drive from a
/// session state-machine view model.
public enum SetCRUDEngine {
    /// Matches the web app's hard cap on sets per exercise.
    public static let maxSetsPerExercise = 20

    /// Appends a new set seeded from the last existing set's weight/reps (a
    /// starting point for the user to adjust), with `done`/`isPR` reset and no
    /// planned values. No-op once at `maxSetsPerExercise`.
    public static func addSet(to sets: [LoggedSet], newId: String) -> [LoggedSet] {
        guard sets.count < maxSetsPerExercise else { return sets }
        let seed = sets.last
        var result = sets
        result.append(
            LoggedSet(
                id: newId,
                weight: seed?.weight,
                reps: seed?.reps,
                done: false,
                isPR: false,
                plannedWeight: nil,
                plannedReps: nil
            )
        )
        return result
    }

    /// Duplicates the set at `index`, inserting the duplicate immediately after
    /// it. Unlike `addSet`, the duplicate also carries over the source's
    /// planned weight/reps (it's cloning an existing set including its plan),
    /// but always resets `done`/`isPR` regardless of the source's state.
    /// No-op if `index` is out of bounds or the exercise is already at
    /// `maxSetsPerExercise`.
    public static func copySet(in sets: [LoggedSet], at index: Int, newId: String) -> [LoggedSet] {
        guard sets.indices.contains(index), sets.count < maxSetsPerExercise else { return sets }
        let source = sets[index]
        let copy = LoggedSet(
            id: newId,
            weight: source.weight,
            reps: source.reps,
            done: false,
            isPR: false,
            plannedWeight: source.plannedWeight,
            plannedReps: source.plannedReps
        )
        var result = sets
        result.insert(copy, at: index + 1)
        return result
    }

    /// Removes the set at `index`. Refuses to go below 1 set — a single-set
    /// exercise is unchanged. No-op if `index` is out of bounds.
    public static func removeSet(from sets: [LoggedSet], at index: Int) -> [LoggedSet] {
        guard sets.count > 1, sets.indices.contains(index) else { return sets }
        var result = sets
        result.remove(at: index)
        return result
    }

    /// Finds the index of an existing exercise whose name matches `name`
    /// case-insensitively, so a duplicate add-exercise can navigate to the
    /// existing entry instead of creating a second one. Returns the first
    /// match if more than one exists.
    public static func findExistingExerciseIndex(in exercises: [ExerciseEntry], matchingName name: String) -> Int? {
        let normalized = name.lowercased()
        return exercises.firstIndex { $0.name.lowercased() == normalized }
    }
}
