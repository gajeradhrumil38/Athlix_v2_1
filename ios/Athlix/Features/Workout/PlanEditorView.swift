import SwiftUI
import AthlixCore

/// Create/edit screen for a single `Template`, backed by `PlanEditorViewModel`.
/// Used two ways: pushed/presented standalone from `TemplatesListView` for
/// create/edit, and presented from `ExercisePickerView`'s My Plans tab "Edit"
/// button (see that view's `templateRow`).
///
/// OWNERSHIP: the view model is created once via `@State` in `init` (matching
/// `DashboardView`'s pattern of a locally-owned `@Observable` view model,
/// since `PlanEditorViewModel` has no natural owner further up the tree the
/// way `ActiveWorkoutViewModel` does) rather than passed in from a caller --
/// both call sites (`TemplatesListView`, `ExercisePickerView`) only have the
/// raw `Template?`/dependencies, not a pre-built view model.
///
/// SCOPE DECISION: `pendingDecision`/`resolvePendingDecision` is deliberately
/// left unwired here. It's only ever set by
/// `handleAddedExerciseWhilePlanLoaded`, and nothing in the app calls that
/// method yet (no caller exists in `ActiveWorkoutView` today) -- building a
/// `.confirmationDialog` for a state nothing can currently produce would be
/// dead code with no way to exercise or verify it. Left for whichever future
/// task wires `ActiveWorkoutView`'s "add exercise while a plan is loaded"
/// flow into calling `handleAddedExerciseWhilePlanLoaded`.
struct PlanEditorView: View {
    let userId: String
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let templateRepository: TemplateRepository

    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: PlanEditorViewModel

    @State private var showingExercisePicker = false
    @State private var showingCollisionAlert = false
    @State private var showingDiscardConfirm = false
    @State private var isSaving = false
    @State private var saveErrorMessage: String?

    init(userId: String, exerciseLibraryRepository: ExerciseLibraryRepository, templateRepository: TemplateRepository, existing: Template? = nil) {
        self.userId = userId
        self.exerciseLibraryRepository = exerciseLibraryRepository
        self.templateRepository = templateRepository
        _viewModel = State(initialValue: PlanEditorViewModel(userId: userId, templateRepository: templateRepository, existing: existing))
    }

    var body: some View {
        NavigationStack {
            List {
                titleSection
                exercisesSection
                addExerciseSection
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(ColorTokens.bgBase)
            .navigationTitle(viewModel.templateId == nil ? "New Template" : "Edit Template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        save()
                    } label: {
                        if isSaving {
                            ProgressView().tint(ColorTokens.accent)
                        } else {
                            Text("Save")
                        }
                    }
                    .disabled(isSaving || viewModel.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .sheet(isPresented: $showingExercisePicker) {
                ExercisePickerView(
                    userId: userId,
                    exerciseLibraryRepository: exerciseLibraryRepository,
                    templateRepository: templateRepository,
                    isMultiSelect: true,
                    onSelectMultiple: { selections in
                        for selection in selections {
                            viewModel.addExercise(name: selection.name, muscleGroup: selection.muscleGroup, exerciseDbId: selection.exerciseDbId)
                        }
                    }
                )
            }
            .alert("Name Already Used", isPresented: $showingCollisionAlert) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Another plan already uses this name. Choose a different title.")
            }
        }
    }

    // MARK: - Title

    private var titleSection: some View {
        Section("Title") {
            TextField("Plan title", text: Binding(
                get: { viewModel.title },
                set: { viewModel.setTitle($0) }
            ))
            .foregroundStyle(ColorTokens.textPrimary)
        }
        .listRowBackground(ColorTokens.bgSurface)
    }

    // MARK: - Exercises

    private var exercisesSection: some View {
        Section("Exercises") {
            if viewModel.exercises.isEmpty {
                Text("No exercises yet. Add one below.")
                    .font(.subheadline)
                    .foregroundStyle(ColorTokens.textMuted)
                    .listRowBackground(ColorTokens.bgSurface)
            } else {
                ForEach(viewModel.exercises) { exercise in
                    exerciseGroup(exercise)
                }
            }

            if let saveErrorMessage {
                Text(saveErrorMessage)
                    .font(.caption)
                    .foregroundStyle(ColorTokens.red)
                    .listRowBackground(ColorTokens.bgSurface)
            }
        }
    }

    private func exerciseGroup(_ exercise: PlannedExercise) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ColorTokens.textPrimary)
                    Text(exercise.muscleGroup)
                        .font(.caption)
                        .foregroundStyle(ColorTokens.textSecondary)
                }
                Spacer()
            }

            ForEach(exercise.sets) { set in
                plannedSetRow(exerciseId: exercise.id, set: set)
            }

            Button {
                viewModel.addPlannedSet(exerciseId: exercise.id)
            } label: {
                Label("Add Set", systemImage: "plus")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.accent)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .listRowBackground(ColorTokens.bgSurface)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                viewModel.removeExercise(exerciseId: exercise.id)
            } label: {
                Label("Remove", systemImage: "trash")
            }
        }
    }

    /// A plain `TextField`/`.numberPad`/`.decimalPad` pair is a reasonable,
    /// simpler stand-in for the full `SetRowView`/`WeightRepsPicker` dial
    /// machinery -- these are just numeric plan targets, not live logged
    /// sets with done/PR state.
    private func plannedSetRow(exerciseId: String, set: PlannedSet) -> some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                TextField("Weight", value: Binding(
                    get: { set.weight },
                    set: { viewModel.updateSet(exerciseId: exerciseId, setId: set.id, weight: $0, reps: set.reps) }
                ), format: .number)
                .keyboardType(.decimalPad)
                .foregroundStyle(ColorTokens.textPrimary)
                Text("lb")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textMuted)
            }

            HStack(spacing: 4) {
                TextField("Reps", value: Binding(
                    get: { set.reps },
                    set: { viewModel.updateSet(exerciseId: exerciseId, setId: set.id, weight: set.weight, reps: $0) }
                ), format: .number)
                .keyboardType(.numberPad)
                .foregroundStyle(ColorTokens.textPrimary)
                Text("reps")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textMuted)
            }
        }
        .padding(8)
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Add exercise

    private var addExerciseSection: some View {
        Section {
            Button {
                showingExercisePicker = true
            } label: {
                Label("Add Exercise", systemImage: "plus.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.accent)
            }
            .listRowBackground(ColorTokens.bgSurface)
        }
    }

    // MARK: - Save

    private func save() {
        isSaving = true
        saveErrorMessage = nil
        Task {
            defer { isSaving = false }
            do {
                try await viewModel.checkNameCollisionAndSave()
                if viewModel.nameCollisionDetected {
                    showingCollisionAlert = true
                    return
                }
                dismiss()
            } catch {
                saveErrorMessage = "Couldn't save plan. Try again."
            }
        }
    }
}
