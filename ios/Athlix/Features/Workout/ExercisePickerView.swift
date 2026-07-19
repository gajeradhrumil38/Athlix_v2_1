import SwiftUI
import AthlixCore

/// A source-agnostic exercise pick, unifying the three different row shapes
/// this view renders (`ExerciseLibraryItem` from Search/Muscle,
/// `RecentExerciseOption` from History, and a freshly-created custom
/// exercise) into the one shape the selection callbacks actually need.
/// Deliberately NOT `ExerciseLibraryItem` itself: callers of
/// `onSelectExercise`/`onSelectMultiple` only ever want name/muscleGroup/
/// exerciseDbId (see `ActiveWorkoutView`'s wiring), and `ExerciseLibraryItem`
/// carries `id`/`isCustom`/`userId` fields that are irrelevant off of a
/// `RecentExerciseOption` row, which has no such fields to begin with.
struct ExercisePickerSelection: Identifiable, Equatable {
    var id: String { name.lowercased() }
    let name: String
    let muscleGroup: String
    let exerciseDbId: String?
}

/// Full-screen sheet for adding an exercise to an active session (or, in
/// multi-select mode, for a later plan-authoring use case), mirroring web's
/// exercise picker: a top search field that overrides three tabs (History /
/// Muscle / My Plans) when non-empty.
///
/// SELECTION MODES: `isMultiSelect == false` (this task's only exercised
/// path, wired from `ActiveWorkoutView`) makes every row tap immediately
/// call `onSelectExercise` and dismiss. `isMultiSelect == true` switches rows
/// to a checkbox affordance plus a sticky "Add N Exercises" footer that calls
/// `onSelectMultiple` -- built now per the original design spec for a later
/// `PlanEditorViewModel` multi-add use case, though nothing exercises it yet.
///
/// "Start" on a My Plans template is a separate, bulk operation (an entire
/// plan's worth of exercises becoming live `LoggedSet`s) and always goes
/// through the distinct `onStartPlan` callback, regardless of
/// `isMultiSelect` -- it is never routed through `onSelectExercise`/
/// `onSelectMultiple`, which only ever carry single already-existing-library
/// exercises.
struct ExercisePickerView: View {
    let userId: String
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let templateRepository: TemplateRepository
    var isMultiSelect: Bool = false
    var onSelectExercise: (ExercisePickerSelection) -> Void = { _ in }
    var onSelectMultiple: ([ExercisePickerSelection]) -> Void = { _ in }
    var onStartPlan: ([ExerciseEntry]) -> Void = { _ in }

    private enum Tab: String, CaseIterable {
        case history = "History"
        case muscle = "Muscle"
        case myPlans = "My Plans"
    }

    /// Static per the design research -- not fetched, not user-editable.
    static let muscleGroups = [
        "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Cardio", "Yoga"
    ]

    @Environment(\.dismiss) private var dismiss

    @State private var tab: Tab = .history
    @State private var searchText = ""
    @State private var searchResults: [ExerciseLibraryItem] = []
    @State private var searchTask: Task<Void, Never>?

    @State private var recentOptions: [RecentExerciseOption] = []
    @State private var isLoadingHistory = false

    @State private var selectedMuscleGroup: String?
    @State private var muscleGroupResults: [ExerciseLibraryItem] = []
    @State private var isLoadingMuscleGroup = false

    @State private var templates: [Template] = []
    @State private var isLoadingTemplates = false

    /// Keyed by `ExercisePickerSelection.id` (lowercased name) so the same
    /// exercise appearing on both a search result and, say, the history list
    /// can't be double-added if the user searches after already toggling it.
    @State private var multiSelection: [String: ExercisePickerSelection] = [:]

    @State private var showingCreateCustom = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchField

                if searchText.trimmingCharacters(in: .whitespaces).isEmpty {
                    tabPicker
                    tabContent
                } else {
                    searchResultsList
                }

                if isMultiSelect && !multiSelection.isEmpty {
                    addSelectedFooter
                }
            }
            .background(ColorTokens.bgBase)
            .navigationTitle("Add Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $showingCreateCustom) {
                CreateCustomExerciseView(
                    exerciseLibraryRepository: exerciseLibraryRepository,
                    userId: userId,
                    onCreated: { item in
                        handleTap(ExercisePickerSelection(name: item.name, muscleGroup: item.muscleGroup, exerciseDbId: item.exerciseDbId))
                    }
                )
            }
        }
        .task {
            await loadHistory()
            await loadTemplates()
        }
    }

    // MARK: - Search

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(ColorTokens.textMuted)
            TextField("Search exercises", text: $searchText)
                .foregroundStyle(ColorTokens.textPrimary)
                .onChange(of: searchText) { _, newValue in
                    scheduleSearch(newValue)
                }
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                    searchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(ColorTokens.textMuted)
                }
            }
        }
        .padding(10)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(16)
    }

    /// Debounced (250ms) so every keystroke doesn't fire its own network
    /// request -- cancels any still-in-flight search task before starting a
    /// new one.
    private func scheduleSearch(_ query: String) {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            searchResults = []
            return
        }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            do {
                let results = try await exerciseLibraryRepository.searchLibrary(userId: userId, query: trimmed)
                guard !Task.isCancelled else { return }
                searchResults = results
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = "Couldn't search exercises."
            }
        }
    }

    private var searchResultsList: some View {
        List {
            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(ColorTokens.red)
                    .listRowBackground(ColorTokens.bgBase)
            }
            if searchResults.isEmpty {
                Text("No exercises found.")
                    .font(.subheadline)
                    .foregroundStyle(ColorTokens.textMuted)
                    .listRowBackground(ColorTokens.bgBase)
            } else {
                ForEach(searchResults) { item in
                    row(for: ExercisePickerSelection(name: item.name, muscleGroup: item.muscleGroup, exerciseDbId: item.exerciseDbId))
                }
            }
            createCustomRow
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ColorTokens.bgBase)
    }

    // MARK: - Tabs

    private var tabPicker: some View {
        Picker("Tab", selection: $tab) {
            ForEach(Tab.allCases, id: \.self) { tab in
                Text(tab.rawValue).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var tabContent: some View {
        switch tab {
        case .history:
            historyTab
        case .muscle:
            muscleTab
        case .myPlans:
            myPlansTab
        }
    }

    // MARK: - History tab

    private var historyTab: some View {
        Group {
            if isLoadingHistory {
                ProgressView().tint(ColorTokens.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if recentOptions.isEmpty {
                emptyState(text: "No exercise history yet.")
            } else {
                List {
                    ForEach(recentOptions) { option in
                        row(
                            for: ExercisePickerSelection(name: option.name, muscleGroup: option.muscleGroup, exerciseDbId: option.exerciseDbId),
                            subtitle: lastSessionSubtitle(option.lastSession)
                        )
                    }
                    createCustomRow
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(ColorTokens.bgBase)
    }

    private func lastSessionSubtitle(_ summary: LastSessionSummary) -> String {
        "\(summary.sets) sets \u{00B7} \(WeightUnit.format(summary.weight, unit: .lbs))"
    }

    private func loadHistory() async {
        isLoadingHistory = true
        defer { isLoadingHistory = false }
        do {
            recentOptions = try await exerciseLibraryRepository.recentExerciseOptions(userId: userId)
        } catch {
            errorMessage = "Couldn't load recent exercises."
        }
    }

    // MARK: - Muscle tab

    private var muscleTab: some View {
        Group {
            if let selectedMuscleGroup {
                muscleGroupDrilldown(selectedMuscleGroup)
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(Self.muscleGroups, id: \.self) { group in
                            Button {
                                selectMuscleGroup(group)
                            } label: {
                                Text(group)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ColorTokens.textPrimary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 24)
                                    .background(ColorTokens.bgSurface)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .background(ColorTokens.bgBase)
    }

    private func selectMuscleGroup(_ group: String) {
        selectedMuscleGroup = group
        Task {
            isLoadingMuscleGroup = true
            defer { isLoadingMuscleGroup = false }
            do {
                muscleGroupResults = try await exerciseLibraryRepository.libraryByGroup(userId: userId, muscleGroup: group)
            } catch {
                errorMessage = "Couldn't load \(group) exercises."
            }
        }
    }

    private func muscleGroupDrilldown(_ group: String) -> some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    selectedMuscleGroup = nil
                    muscleGroupResults = []
                } label: {
                    Label("Muscle Groups", systemImage: "chevron.left")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ColorTokens.accent)
                }
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 4)

            if isLoadingMuscleGroup {
                ProgressView().tint(ColorTokens.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if muscleGroupResults.isEmpty {
                emptyState(text: "No \(group) exercises yet.")
            } else {
                List {
                    ForEach(muscleGroupResults) { item in
                        row(for: ExercisePickerSelection(name: item.name, muscleGroup: item.muscleGroup, exerciseDbId: item.exerciseDbId))
                    }
                    createCustomRow
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    // MARK: - My Plans tab

    private var myPlansTab: some View {
        Group {
            if isLoadingTemplates {
                ProgressView().tint(ColorTokens.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if templates.isEmpty {
                emptyState(text: "No saved plans yet.")
            } else {
                List {
                    ForEach(templates) { template in
                        templateRow(template)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(ColorTokens.bgBase)
    }

    private func templateRow(_ template: Template) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(template.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                Text("\(template.exercises.count) exercises")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textSecondary)
            }

            Spacer()

            // STUB: real template editing is Task 17's `Templates.tsx`-equivalent
            // editor screen, which doesn't exist yet in this app target. This
            // button is a placeholder affordance only -- intentionally a no-op
            // rather than presenting a half-built editor.
            Button {
                // no-op: Task 17
            } label: {
                Image(systemName: "pencil")
                    .foregroundStyle(ColorTokens.textMuted)
            }
            .buttonStyle(.plain)

            Button(role: .destructive) {
                deleteTemplate(template)
            } label: {
                Image(systemName: "trash")
                    .foregroundStyle(ColorTokens.red)
            }
            .buttonStyle(.plain)

            Button {
                startPlan(template)
            } label: {
                Text("Start")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.bgBase)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(ColorTokens.accent)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
        .listRowBackground(ColorTokens.bgBase)
    }

    private func startPlan(_ template: Template) {
        let editor = PlanEditorViewModel(userId: userId, templateRepository: templateRepository, existing: template)
        let entries = editor.startSession()
        onStartPlan(entries)
        dismiss()
    }

    private func deleteTemplate(_ template: Template) {
        templates.removeAll { $0.id == template.id }
        Task {
            do {
                try await templateRepository.deleteTemplate(userId: userId, templateId: template.id)
            } catch {
                errorMessage = "Couldn't delete \(template.title)."
                await loadTemplates()
            }
        }
    }

    private func loadTemplates() async {
        isLoadingTemplates = true
        defer { isLoadingTemplates = false }
        do {
            templates = try await templateRepository.fetchTemplates(userId: userId)
        } catch {
            errorMessage = "Couldn't load plans."
        }
    }

    // MARK: - Shared row rendering

    private func row(for selection: ExercisePickerSelection, subtitle: String? = nil) -> some View {
        Button {
            handleTap(selection)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: muscleGroupIcon(selection.muscleGroup))
                    .foregroundStyle(ColorTokens.accent)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(selection.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ColorTokens.textPrimary)
                    Text(subtitle ?? selection.muscleGroup)
                        .font(.caption)
                        .foregroundStyle(ColorTokens.textSecondary)
                }

                Spacer()

                if isMultiSelect {
                    Image(systemName: multiSelection[selection.id] != nil ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(multiSelection[selection.id] != nil ? ColorTokens.accent : ColorTokens.textMuted)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ColorTokens.textMuted)
                }
            }
        }
        .buttonStyle(.plain)
        .listRowBackground(ColorTokens.bgBase)
    }

    private var createCustomRow: some View {
        Button {
            showingCreateCustom = true
        } label: {
            Label("Create Custom Exercise", systemImage: "plus.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.accent)
        }
        .listRowBackground(ColorTokens.bgBase)
    }

    /// No icon registry exists in this app target (per CLAUDE.md that
    /// convention -- "use AppIcon from src/config/icons.tsx" -- is a WEB-only
    /// rule; this file uses SF Symbols directly via `Image(systemName:)`,
    /// which is the native iOS equivalent). Purely decorative, so an
    /// unrecognized muscle group falls back to a generic dumbbell rather than
    /// failing/crashing.
    private func muscleGroupIcon(_ group: String) -> String {
        switch group {
        case "Chest": return "figure.strengthtraining.traditional"
        case "Back": return "figure.rower"
        case "Shoulders": return "figure.arms.open"
        case "Biceps", "Triceps": return "dumbbell"
        case "Legs": return "figure.walk"
        case "Core": return "figure.core.training"
        case "Cardio": return "heart.fill"
        case "Yoga": return "figure.yoga"
        default: return "dumbbell"
        }
    }

    private func emptyState(text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.subheadline)
                .foregroundStyle(ColorTokens.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Selection handling

    private func handleTap(_ selection: ExercisePickerSelection) {
        if isMultiSelect {
            toggleMultiSelection(selection)
        } else {
            onSelectExercise(selection)
            dismiss()
        }
    }

    private func toggleMultiSelection(_ selection: ExercisePickerSelection) {
        if multiSelection[selection.id] != nil {
            multiSelection.removeValue(forKey: selection.id)
        } else {
            multiSelection[selection.id] = selection
        }
    }

    private var addSelectedFooter: some View {
        Button {
            onSelectMultiple(Array(multiSelection.values))
            dismiss()
        } label: {
            Text("Add \(multiSelection.count) Exercise\(multiSelection.count == 1 ? "" : "s")")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.bgBase)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(ColorTokens.accent)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(16)
        .background(ColorTokens.bgElevated)
    }
}

/// Sheet-within-a-sheet for creating a custom exercise: name field + muscle
/// group picker + Create button. Kept as its own small view (rather than an
/// inline expandable section within `ExercisePickerView`) so its own
/// in-flight/error state doesn't have to live alongside the parent's larger
/// tab/search state.
private struct CreateCustomExerciseView: View {
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let userId: String
    let onCreated: (ExerciseLibraryItem) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var muscleGroup = ExercisePickerView.muscleGroups[0]
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. Cable Crossover", text: $name)
                }
                Section("Muscle Group") {
                    Picker("Muscle Group", selection: $muscleGroup) {
                        ForEach(ExercisePickerView.muscleGroups, id: \.self) { group in
                            Text(group).tag(group)
                        }
                    }
                    .pickerStyle(.menu)
                }
                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(ColorTokens.red)
                }
            }
            .navigationTitle("Custom Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { createExercise() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func createExercise() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            do {
                let item = try await exerciseLibraryRepository.addCustomExercise(userId: userId, name: trimmed, muscleGroup: muscleGroup)
                onCreated(item)
                dismiss()
            } catch {
                errorMessage = "Couldn't create exercise."
            }
        }
    }
}
