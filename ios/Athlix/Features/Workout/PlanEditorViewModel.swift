import Foundation
import Observation
import AthlixCore

/// A single planned set within a `PlannedExercise` -- just a weight/reps
/// target, no `done`/`id` the way `LoggedSet` has. Plan authoring only ever
/// deals with targets, never with in-progress completion state, so this is
/// deliberately a simpler shape than `LoggedSet`.
public struct PlannedSet: Equatable, Sendable, Identifiable {
    public let id: String
    public var weight: Double
    public var reps: Int
    public init(id: String, weight: Double, reps: Int) {
        self.id = id
        self.weight = weight
        self.reps = reps
    }
}

/// One exercise within a plan/template being authored, holding a list of
/// PLANNED sets (targets only). Distinct from `ExerciseEntry`, which holds
/// live `LoggedSet`s during an actual logging session.
public struct PlannedExercise: Equatable, Sendable, Identifiable {
    public let id: String
    public var name: String
    public var muscleGroup: String
    public var exerciseDbId: String?
    public var sets: [PlannedSet]
    public init(id: String, name: String, muscleGroup: String, exerciseDbId: String?, sets: [PlannedSet]) {
        self.id = id
        self.name = name
        self.muscleGroup = muscleGroup
        self.exerciseDbId = exerciseDbId
        self.sets = sets
    }
}

/// The user's answer to the "you added an exercise while a plan is loaded
/// mid-session" prompt (`PlanPendingDecision.awaitingUpdateOrSessionOnly`).
/// Resolution of `.sessionOnly`/`.cancel` is only partially handled here --
/// see `resolvePendingDecision`'s doc for the split of responsibility with
/// `ActiveWorkoutViewModel`.
enum PlanDecisionChoice {
    case updatePlan
    case sessionOnly
    case cancel
}

/// State for the 3-way "update the plan, or just this session?" prompt shown
/// when an exercise is added while a plan is loaded mid-session (the actual
/// UI wiring into `ActiveWorkoutView` is a later task -- this only models the
/// state transition and its resolution).
enum PlanPendingDecision: Equatable {
    case none
    case awaitingUpdateOrSessionOnly(exerciseName: String, muscleGroup: String, exerciseDbId: String?)
}

/// Shared editor for BOTH the standalone "Templates" editor screen and the
/// "editing a loaded plan mid-session" inline flow (both UIs are later
/// tasks). Consolidates logic web hand-duplicates across
/// `PlanTodaySheet.tsx` (standalone) and `ActiveWorkout.tsx` (inline plan
/// editing) -- per the milestone's design spec, this single shared view
/// model is an explicit improvement over web's duplication, not something to
/// replicate as two separate implementations.
@Observable
@MainActor
final class PlanEditorViewModel {
    private(set) var templateId: String?
    var title: String
    private(set) var exercises: [PlannedExercise]
    private(set) var isDirty: Bool = false
    private(set) var pendingDecision: PlanPendingDecision = .none
    /// Set by `checkNameCollisionAndSave()` when `TemplateRepository.checkNameExists`
    /// reports a collision, so the caller can react (e.g. prompt to rename)
    /// rather than the save silently overwriting or throwing an opaque error.
    /// Cleared at the start of every `checkNameCollisionAndSave()` call and on
    /// a subsequent successful save.
    private(set) var nameCollisionDetected: Bool = false

    private let templateRepository: TemplateRepository
    private let userId: String

    /// - Parameter existing: pass the `Template` being edited to start the
    ///   editor pre-populated and CLEAN (`isDirty == false`); omit (or pass
    ///   `nil`) to start a brand-new, blank, also-clean plan -- see
    ///   `testStartsCleanForBrandNewTemplate` for the reasoning: dirty means
    ///   "differs from what would currently be persisted," and a fresh blank
    ///   plan with zero edits has nothing yet to save.
    ///
    ///   RECONSTITUTION DECISION: each `TemplateExercise` (which only stores
    ///   flattened `defaultSets`/`defaultReps`/`defaultWeight` averages, per
    ///   `buildTemplateExercises`'s explicit fidelity loss) expands back into
    ///   `defaultSets` copies of a single `PlannedSet(weight: defaultWeight,
    ///   reps: defaultReps)`. This mirrors web's existing behavior/fidelity
    ///   loss exactly: per-set variation within a template is never
    ///   recoverable once saved, by design -- not something to "fix" here.
    init(userId: String, templateRepository: TemplateRepository, existing: Template? = nil) {
        self.userId = userId
        self.templateRepository = templateRepository

        if let existing {
            self.templateId = existing.id
            self.title = existing.title
            self.exercises = existing.exercises.map { ex in
                let sets = (0..<max(ex.defaultSets, 0)).map { _ in
                    PlannedSet(id: UUID().uuidString.lowercased(), weight: ex.defaultWeight, reps: ex.defaultReps)
                }
                return PlannedExercise(
                    id: UUID().uuidString.lowercased(), name: ex.name,
                    muscleGroup: ex.muscleGroup ?? "", exerciseDbId: ex.exerciseDbId, sets: sets
                )
            }
        } else {
            self.templateId = nil
            self.title = ""
            self.exercises = []
        }
    }

    // MARK: - Editing

    func setTitle(_ newTitle: String) {
        title = newTitle
        isDirty = true
    }

    /// Adds a new blank exercise to the plan with a single empty planned set
    /// (`weight: 0, reps: 0`) -- a reasonable starting point for the user to
    /// fill in. Unlike `ActiveWorkoutViewModel.addExercise`, no
    /// last-session-prefill logic applies here: that's an active-session
    /// concern, not a plan-authoring one.
    func addExercise(name: String, muscleGroup: String, exerciseDbId: String?) {
        let entry = PlannedExercise(
            id: UUID().uuidString.lowercased(), name: name, muscleGroup: muscleGroup,
            exerciseDbId: exerciseDbId, sets: [PlannedSet(id: UUID().uuidString.lowercased(), weight: 0, reps: 0)]
        )
        exercises.append(entry)
        isDirty = true
    }

    /// Id-based, matching this codebase's established convention (see
    /// `ActiveWorkoutViewModel.removeSet`/`removeExercise`) to avoid stale-index
    /// bugs from a captured `Int`.
    func removeExercise(exerciseId: String) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        exercises.remove(at: idx)
        isDirty = true
    }

    /// Appends a fresh blank `PlannedSet(weight: 0, reps: 0)` to the given
    /// exercise. Not part of the original sketch, but a necessary companion
    /// to `updateSet`: without a way to grow the sets list, no plan could
    /// ever have more than the one seeded set from `addExercise`.
    func addPlannedSet(exerciseId: String) {
        guard let idx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        exercises[idx].sets.append(PlannedSet(id: UUID().uuidString.lowercased(), weight: 0, reps: 0))
        isDirty = true
    }

    /// Id-based, matching `ActiveWorkoutViewModel`'s exact convention (see
    /// `updateSet`/`copySet`/`removeSet` there). REVISED from an earlier
    /// index-based design: the risk this convention guards against is a
    /// captured POSITION going stale at the VIEW layer before it's consumed
    /// (e.g. a `ForEach(sets.enumerated(), id: \.offset)` row's `TextField`
    /// capturing `index` by value), not whether the model itself has async
    /// side effects -- that risk exists here too, especially once a
    /// `removeSet`/reorder method lands and a `TextField` edit could race a
    /// delete. Resolving `setId` to an index internally, same as
    /// `ActiveWorkoutViewModel`.
    func updateSet(exerciseId: String, setId: String, weight: Double, reps: Int) {
        guard let exIdx = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        guard let setIdx = exercises[exIdx].sets.firstIndex(where: { $0.id == setId }) else { return }
        exercises[exIdx].sets[setIdx] = PlannedSet(id: setId, weight: weight, reps: reps)
        isDirty = true
    }

    // MARK: - Save

    /// Checks for a name collision (via `TemplateRepository.checkNameExists`,
    /// excluding this editor's own `templateId` when editing an existing
    /// template so renaming-to-itself doesn't false-positive) before saving.
    /// On collision, sets `nameCollisionDetected = true` and returns WITHOUT
    /// calling `saveTemplate` -- the caller is expected to react (e.g. prompt
    /// the user to pick a different name) rather than this silently
    /// overwriting or throwing an opaque error.
    func checkNameCollisionAndSave() async throws {
        nameCollisionDetected = false

        let exists = try await templateRepository.checkNameExists(
            userId: userId, title: title, excludeId: templateId
        )
        if exists {
            nameCollisionDetected = true
            return
        }

        let payload = buildTemplateExercises()
        let savedId = try await templateRepository.saveTemplate(
            userId: userId, templateId: templateId, title: title, exercises: payload
        )
        templateId = savedId
        isDirty = false
    }

    /// Flattens per-set progression into simple averages, matching web's
    /// existing behavior/fidelity loss exactly (per this milestone's explicit,
    /// approved design decision -- not something to "fix"):
    /// `defaultSets = sets.count`, `defaultReps`/`defaultWeight` = arithmetic
    /// mean of the sets' reps/weight. Reps are rounded to the nearest int
    /// using Swift's default `.rounded()` rule (round-half-away-from-zero).
    func buildTemplateExercises() -> [TemplateExercise] {
        exercises.enumerated().map { index, exercise in
            let count = exercise.sets.count
            let avgWeight = count > 0 ? exercise.sets.reduce(0) { $0 + $1.weight } / Double(count) : 0
            let avgReps = count > 0 ? Double(exercise.sets.reduce(0) { $0 + $1.reps }) / Double(count) : 0
            return TemplateExercise(
                id: UUID().uuidString.lowercased(), templateId: templateId ?? "",
                name: exercise.name, muscleGroup: exercise.muscleGroup.isEmpty ? nil : exercise.muscleGroup,
                defaultSets: count, defaultReps: Int(avgReps.rounded()), defaultWeight: avgWeight,
                orderIndex: index, exerciseDbId: exercise.exerciseDbId
            )
        }
    }

    // MARK: - Start session

    /// Converts the plan's `[PlannedExercise]` into `[ExerciseEntry]` for
    /// handing off to `ActiveWorkoutViewModel` when the user taps "Start" on
    /// a plan -- one `LoggedSet` per `PlannedSet`, `done: false`. BOTH the
    /// live `weight`/`reps` fields AND `plannedWeight`/`plannedReps` are
    /// populated from the same planned value: the live fields start
    /// pre-filled with the target as a convenience, while `plannedWeight`/
    /// `plannedReps` stick around so a future `SetRowView` "Target: ..." hint
    /// has something to show even after the user edits the live fields.
    func startSession() -> [ExerciseEntry] {
        exercises.map { exercise in
            let sets = exercise.sets.map { planned in
                LoggedSet(
                    id: UUID().uuidString.lowercased(), weight: planned.weight, reps: planned.reps,
                    done: false, isPR: false, plannedWeight: planned.weight, plannedReps: planned.reps
                )
            }
            return ExerciseEntry(
                id: UUID().uuidString.lowercased(), name: exercise.name, muscleGroup: exercise.muscleGroup,
                exerciseDbId: exercise.exerciseDbId, sets: sets,
                optionalWeight: nil, inputTypeOverride: nil, lastSession: nil
            )
        }
    }

    // MARK: - Mid-session pending decision

    /// Transitions into the "update the plan, or just this session?" prompt
    /// state when an exercise is added while a plan is loaded mid-session.
    /// Stores the full `name`/`muscleGroup`/`exerciseDbId` triple (not just
    /// the name) so `resolvePendingDecision` can act on it directly without
    /// requiring the caller to re-stash/re-supply the same data a second
    /// time -- and without risking a caller passing back a mismatched name.
    /// The actual UI trigger for this (from `ActiveWorkoutView`) is wired up
    /// in a later task; this only builds the state representation.
    func handleAddedExerciseWhilePlanLoaded(exerciseName: String, muscleGroup: String, exerciseDbId: String?) {
        pendingDecision = .awaitingUpdateOrSessionOnly(
            exerciseName: exerciseName, muscleGroup: muscleGroup, exerciseDbId: exerciseDbId
        )
    }

    /// Resolves the pending 3-way decision, always clearing `pendingDecision`.
    /// Reads the exercise's name/muscleGroup/exerciseDbId directly off the
    /// stored `pendingDecision` rather than requiring the caller to re-supply
    /// them. Only `.updatePlan` mutates this view model's own `exercises`
    /// (adding the exercise to the plan for future sessions too). For
    /// `.sessionOnly` and `.cancel`, the exercise deliberately does NOT get
    /// added here -- the actual "add to just this session" behavior lives in
    /// `ActiveWorkoutViewModel`, out of scope for this view model. A no-op if
    /// there's no pending decision to resolve.
    func resolvePendingDecision(_ choice: PlanDecisionChoice) {
        guard case .awaitingUpdateOrSessionOnly(let name, let muscleGroup, let exerciseDbId) = pendingDecision else {
            pendingDecision = .none
            return
        }
        pendingDecision = .none
        switch choice {
        case .updatePlan:
            addExercise(name: name, muscleGroup: muscleGroup, exerciseDbId: exerciseDbId)
        case .sessionOnly, .cancel:
            break
        }
    }
}
