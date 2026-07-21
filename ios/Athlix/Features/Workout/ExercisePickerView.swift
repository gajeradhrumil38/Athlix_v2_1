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
///
/// CONTENT SWAP (known gap #7): tapping "Edit" on a My Plans template used to
/// stack a second `PlanEditorView` sheet on top of this already-presented
/// one. Instead, `pickerContent` swaps this view's own body in place between
/// the normal browsing UI and an embedded `PlanEditorView` -- still a single
/// sheet presentation throughout. See `PickerContent` below and
/// `PlanEditorView`'s `onFinished`/`cancelLabel` parameters, which exist
/// specifically to let this embedded case return to browsing instead of
/// dismissing the whole sheet.
struct ExercisePickerView: View {
    let userId: String
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let templateRepository: TemplateRepository
    /// Required, not defaulted -- this drives real weight-unit display
    /// correctness (see `lastSessionSubtitle`), so every call site must pass
    /// its actual user/session preference rather than silently getting a
    /// possibly-wrong default.
    let weightUnit: WeightUnit
    var isMultiSelect: Bool = false
    var onSelectExercise: (ExercisePickerSelection) -> Void = { _ in }
    var onSelectMultiple: ([ExercisePickerSelection]) -> Void = { _ in }
    var onStartPlan: (Template, [ExerciseEntry]) -> Void = { _, _ in }

    private enum Tab: String, CaseIterable {
        case history = "History"
        case muscle = "Muscle"
        case myPlans = "My Plans"
    }

    /// Static per the design research -- not fetched, not user-editable.
    static let muscleGroups = [
        "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Core", "Cardio", "Yoga"
    ]

    /// Which content this single sheet is currently showing. See the type
    /// doc comment above for why this replaced a second stacked `.sheet`.
    private enum PickerContent: Equatable {
        case browsing
        case editingTemplate(Template)
    }

    @Environment(\.dismiss) private var dismiss

    @State private var pickerContent: PickerContent = .browsing

    @State private var tab: Tab = .history
    @State private var searchText = ""
    @State private var searchResults: [ExerciseLibraryItem] = []
    @State private var searchTask: Task<Void, Never>?
    /// Each async path below gets its own error slot rather than sharing one
    /// `errorMessage` -- a single shared property was only ever rendered in
    /// `searchResultsList`, so a failed `loadHistory`/`selectMuscleGroup`/
    /// `loadTemplates` silently produced an empty-state indistinguishable
    /// from a genuine empty result, and (being written by four independent
    /// async paths with no shared clearing point) could linger stale across
    /// tab switches. Each one is cleared at the START of its owning fetch
    /// (before the `await`), so a stale error never survives a subsequent
    /// successful load.
    @State private var searchErrorMessage: String?

    @State private var recentOptions: [RecentExerciseOption] = []
    @State private var isLoadingHistory = false
    @State private var historyErrorMessage: String?
    /// Muscle-group filter for the History tab's chip row (nil == "All").
    /// Reset whenever the user switches tabs, matching web's tab-switch
    /// handler which explicitly clears `filterMuscle` alongside `search`/
    /// `selectedMuscle` (`ExercisePicker.tsx` line ~450).
    @State private var historyMuscleFilter: String?

    @State private var selectedMuscleGroup: String?
    @State private var muscleGroupResults: [ExerciseLibraryItem] = []
    @State private var isLoadingMuscleGroup = false
    @State private var muscleErrorMessage: String?

    @State private var templates: [Template] = []
    @State private var isLoadingTemplates = false
    @State private var templatesErrorMessage: String?

    /// Keyed by `ExercisePickerSelection.id` (lowercased name) so the same
    /// exercise appearing on both a search result and, say, the history list
    /// can't be double-added if the user searches after already toggling it.
    @State private var multiSelection: [String: ExercisePickerSelection] = [:]

    @State private var showingCreateCustom = false

    var body: some View {
        // `.task` is attached out here (not inside either switch branch) so
        // switching `pickerContent` back and forth doesn't re-trigger these
        // loads -- only the sheet's very first appearance does.
        pickerContentView
            .task {
                await loadHistory()
                await loadTemplates()
            }
    }

    /// Deliberately its own `@ViewBuilder` property (matching `tabContent`
    /// below) rather than inlined as `Group { switch ... }` in `body` --
    /// wrapping a bare `switch` directly in `Group` there hits a real Swift
    /// compiler ambiguity between `Group`'s ViewBuilder and TableColumnBuilder
    /// initializer overloads ("generic parameter 'R'/'C' could not be
    /// inferred"). A `@ViewBuilder`-attributed property sidesteps that
    /// entirely, same as this file already does for `tabContent`.
    @ViewBuilder
    private var pickerContentView: some View {
        switch pickerContent {
        case .browsing:
            browsingView
        case .editingTemplate(let template):
            PlanEditorView(
                userId: userId,
                exerciseLibraryRepository: exerciseLibraryRepository,
                templateRepository: templateRepository,
                existing: template,
                cancelLabel: "Back",
                onFinished: {
                    pickerContent = .browsing
                    Task { await loadTemplates() }
                }
            )
        }
    }

    private var browsingView: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchField

                if searchText.trimmingCharacters(in: .whitespaces).isEmpty {
                    tabPicker
                    if tab == .history {
                        muscleFilterChips
                    }
                    tabContent
                } else {
                    searchResultsList
                }

                // Persistent, always-visible -- see `createCustomButton`'s
                // doc comment for why this replaced three per-tab rows.
                createCustomButton

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
                    searchErrorMessage = nil
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
        searchErrorMessage = nil
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
                searchErrorMessage = "Couldn't search exercises."
            }
        }
    }

    private var searchResultsList: some View {
        List {
            if let searchErrorMessage {
                Text(searchErrorMessage)
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
        .onChange(of: tab) { _, _ in
            historyMuscleFilter = nil
        }
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

    // MARK: - Muscle filter chips

    /// Muscle filter chip row, shown only on the History tab -- mirrors
    /// web's `(search || activeTab === 'recent') && !selectedMuscle`
    /// condition (`ExercisePicker.tsx` line ~415), simplified to "History
    /// tab and not searching" since this file's search state swaps in
    /// `searchResultsList` entirely rather than overlaying chips on top of
    /// search results the way web's single-surface layout does.
    ///
    /// COLOR CHOICE: web tints each selected chip with that muscle's own CSS
    /// accent color (`--chest`, `--back`, etc. via `MUSCLE_CSS_VAR`). This
    /// app's only existing per-muscle color table,
    /// `MuscleSpokeColors.byRegion` (built for the Dashboard's Muscle
    /// Radar), doesn't cover two of these nine groups (Cardio, Yoga) and
    /// carries an irrelevant one (Glutes) -- reusing it here would mean
    /// seven chips get their own tint and two silently fall back to
    /// something else, which reads as an inconsistency bug rather than a
    /// fidelity win. Using one flat accent tint for every selected chip
    /// instead -- exactly what web already does for its own "All" chip
    /// (`cssVar` is null there) -- keeps every chip visually consistent.
    private var muscleFilterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                muscleChip(title: "All", isSelected: historyMuscleFilter == nil) {
                    historyMuscleFilter = nil
                }
                ForEach(Self.muscleGroups, id: \.self) { group in
                    muscleChip(title: group, isSelected: historyMuscleFilter == group) {
                        historyMuscleFilter = (historyMuscleFilter == group) ? nil : group
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 8)
    }

    private func muscleChip(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(isSelected ? ColorTokens.accent : ColorTokens.textMuted)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(isSelected ? ColorTokens.accentDim : ColorTokens.bgElevated)
                .clipShape(Capsule())
                .overlay(
                    Capsule().stroke(isSelected ? ColorTokens.accent.opacity(0.35) : .clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - History tab

    /// One bucket of `recentOptions` sharing a `muscleGroup`, in first-seen
    /// order -- backs the grouped (no filter active) rendering below.
    private struct MuscleGroupBucket: Identifiable {
        let group: String
        let options: [RecentExerciseOption]
        var id: String { group }
    }

    /// Groups `recentOptions` by `muscleGroup`, preserving first-seen order
    /// -- matches web's `Map`-based grouping (`ExercisePicker.tsx` lines
    /// ~500-505), which likewise groups in the order muscle groups are first
    /// encountered in the already-most-recent-first list, not alphabetically.
    private var groupedRecentOptions: [MuscleGroupBucket] {
        var order: [String] = []
        var buckets: [String: [RecentExerciseOption]] = [:]
        for option in recentOptions {
            if buckets[option.muscleGroup] == nil {
                buckets[option.muscleGroup] = []
                order.append(option.muscleGroup)
            }
            buckets[option.muscleGroup]?.append(option)
        }
        return order.map { MuscleGroupBucket(group: $0, options: buckets[$0] ?? []) }
    }

    private var filteredRecentOptions: [RecentExerciseOption] {
        guard let historyMuscleFilter else { return recentOptions }
        return recentOptions.filter { $0.muscleGroup == historyMuscleFilter }
    }

    private var historyTab: some View {
        Group {
            if isLoadingHistory {
                ProgressView().tint(ColorTokens.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let historyErrorMessage {
                emptyState(text: historyErrorMessage, isError: true)
            } else if recentOptions.isEmpty {
                emptyState(text: "No exercise history yet.")
            } else if let historyMuscleFilter {
                // A specific muscle chip is active: flat (ungrouped) list of
                // just that muscle's exercises -- matches web's early-return
                // `if (filterMuscle) { return list.map(...) }` (line ~495),
                // which skips the group-header rendering entirely since
                // there's only one group left to show.
                if filteredRecentOptions.isEmpty {
                    muscleEmptyState(historyMuscleFilter)
                } else {
                    List {
                        ForEach(filteredRecentOptions) { option in
                            row(
                                for: ExercisePickerSelection(name: option.name, muscleGroup: option.muscleGroup, exerciseDbId: option.exerciseDbId),
                                subtitle: lastSessionSubtitle(option.lastSession)
                            )
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            } else {
                // "All" selected: grouped-by-muscle rendering with section
                // headers, matching web's grouped-by-muscle branch.
                List {
                    ForEach(groupedRecentOptions) { bucket in
                        Section {
                            ForEach(bucket.options) { option in
                                row(
                                    for: ExercisePickerSelection(name: option.name, muscleGroup: option.muscleGroup, exerciseDbId: option.exerciseDbId),
                                    subtitle: lastSessionSubtitle(option.lastSession)
                                )
                            }
                        } header: {
                            Text(bucket.group.uppercased())
                                .font(.caption2.weight(.bold))
                                .tracking(1.2)
                                .foregroundStyle(ColorTokens.textMuted)
                        }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(ColorTokens.bgBase)
    }

    private func lastSessionSubtitle(_ summary: LastSessionSummary) -> String {
        "\(summary.sets) sets \u{00B7} \(WeightUnit.format(summary.weight, unit: weightUnit))"
    }

    private func muscleEmptyState(_ group: String) -> some View {
        VStack(spacing: 4) {
            Spacer()
            Text("No \(group) exercises logged yet")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.textPrimary)
            Text("Log a \(group) workout and it will show up here")
                .font(.caption)
                .foregroundStyle(ColorTokens.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func loadHistory() async {
        isLoadingHistory = true
        historyErrorMessage = nil
        defer { isLoadingHistory = false }
        do {
            recentOptions = try await exerciseLibraryRepository.recentExerciseOptions(userId: userId)
        } catch {
            historyErrorMessage = "Couldn't load recent exercises."
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
            muscleErrorMessage = nil
            defer { isLoadingMuscleGroup = false }
            do {
                muscleGroupResults = try await exerciseLibraryRepository.libraryByGroup(userId: userId, muscleGroup: group)
            } catch {
                muscleErrorMessage = "Couldn't load \(group) exercises."
            }
        }
    }

    private func muscleGroupDrilldown(_ group: String) -> some View {
        VStack(spacing: 0) {
            HStack {
                Button {
                    selectedMuscleGroup = nil
                    muscleGroupResults = []
                    muscleErrorMessage = nil
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
            } else if let muscleErrorMessage {
                emptyState(text: muscleErrorMessage, isError: true)
            } else if muscleGroupResults.isEmpty {
                emptyState(text: "No \(group) exercises yet.")
            } else {
                List {
                    ForEach(muscleGroupResults) { item in
                        row(for: ExercisePickerSelection(name: item.name, muscleGroup: item.muscleGroup, exerciseDbId: item.exerciseDbId))
                    }
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
            } else if let templatesErrorMessage {
                emptyState(text: templatesErrorMessage, isError: true)
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

            Button {
                pickerContent = .editingTemplate(template)
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
        // This PlanEditorViewModel is intentionally transient/throwaway -- it exists only to
        // derive the starting [ExerciseEntry] list via startSession(), then it's discarded.
        // ActiveWorkoutView.onStartPlan constructs a SEPARATE, long-lived PlanEditorViewModel
        // from this same `template` that actually owns `pendingDecision` state for the rest of
        // the session. Both are pure re-derivations of the same immutable Template, so having
        // two instances is harmless -- not a duplication to "simplify" into one shared instance.
        let editor = PlanEditorViewModel(userId: userId, templateRepository: templateRepository, existing: template)
        let entries = editor.startSession()
        onStartPlan(template, entries)
        dismiss()
    }

    private func deleteTemplate(_ template: Template) {
        templates.removeAll { $0.id == template.id }
        Task {
            do {
                try await templateRepository.deleteTemplate(userId: userId, templateId: template.id)
            } catch {
                // Reload FIRST, then set the delete-failure message -- loadTemplates()
                // clears `templatesErrorMessage` at its own start (before its await),
                // so setting the message before reloading would have it wiped out
                // before the user ever saw it.
                await loadTemplates()
                templatesErrorMessage = "Couldn't delete \(template.title)."
            }
        }
    }

    private func loadTemplates() async {
        isLoadingTemplates = true
        templatesErrorMessage = nil
        defer { isLoadingTemplates = false }
        do {
            templates = try await templateRepository.fetchTemplates(userId: userId)
        } catch {
            templatesErrorMessage = "Couldn't load plans."
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

    /// Persistent, always-visible footer button -- mirrors web's sticky
    /// "Create Custom Exercise" footer (`ExercisePicker.tsx` lines ~702-720),
    /// a single fixed element sitting below the tab content rather than a
    /// row duplicated inside every tab's list. The prior Swift version
    /// embedded this as a trailing `List` row inside History/Search/Muscle
    /// drilldown separately, which left it duplicated three times over AND
    /// still missing from My Plans and the top-level muscle grid. Rendering
    /// it once here, outside any tab's content, fixes both problems at once.
    private var createCustomButton: some View {
        Button {
            showingCreateCustom = true
        } label: {
            Label("Create Custom Exercise", systemImage: "plus.circle")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .background(ColorTokens.accentDim)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(ColorTokens.bgBase)
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

    private func emptyState(text: String, isError: Bool = false) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.subheadline)
                .foregroundStyle(isError ? ColorTokens.red : ColorTokens.textMuted)
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
