import SwiftUI
import AthlixCore

/// Top-level two-pane (list <-> detail) screen for an active workout session,
/// mirroring web's `ActiveWorkout.tsx`. Presented full-screen (see
/// `MainTabView`'s `.fullScreenCover` pattern) -- this view therefore owns its
/// own dismiss affordance rather than relying on a nav-stack back button.
///
/// OWNERSHIP: plain (non-`@Bindable`) `viewModel` reference, matching
/// `ExerciseDetailView`/`SetRowView` -- all mutation flows through the view
/// model's explicit methods.
struct ActiveWorkoutView: View {
    let viewModel: ActiveWorkoutViewModel
    /// Owning user id, needed separately from `viewModel` (which keeps its
    /// own copy private) because `ExercisePickerView` -- and the
    /// `PlanEditorViewModel` it constructs internally for "Start Plan" --
    /// both need it directly.
    let userId: String
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let templateRepository: TemplateRepository
    let personalRecordRepository: PersonalRecordRepository
    /// Called when the user taps the close/dismiss affordance. The caller
    /// (a later task's `LogEntryView`) owns the actual `fullScreenCover`
    /// presentation state; this view just signals "I'm done."
    var onDismiss: () -> Void = {}

    private enum ViewMode: Equatable {
        case list
        case detail(exerciseId: String)
    }

    @State private var viewMode: ViewMode = .list
    @State private var showingCalendar = false
    @State private var showingUnloadConfirm = false
    @State private var showingExercisePicker = false
    @State private var showingFinishSheet = false
    @State private var isEditingTitle = false
    @State private var draftTitle = ""
    @FocusState private var titleFieldFocused: Bool
    @FocusState private var notesFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header

            if viewModel.isFutureDateBlocked {
                futureDateBanner
            }

            if let message = viewModel.setCapMessage {
                setCapBanner(message)
            }

            content

            if viewModel.restSecondsLeft != nil {
                restTimerBar
            }
        }
        .background(ColorTokens.bgBase)
        .sheet(isPresented: $showingCalendar) {
            CalendarDatePickerView(selectedDate: viewModel.startAt) { newDate in
                viewModel.changeDate(to: newDate)
            }
        }
        .sheet(isPresented: $showingExercisePicker) {
            ExercisePickerView(
                userId: userId,
                exerciseLibraryRepository: exerciseLibraryRepository,
                templateRepository: templateRepository,
                isMultiSelect: false,
                onSelectExercise: { selection in
                    let id = viewModel.addExercise(
                        name: selection.name, muscleGroup: selection.muscleGroup, exerciseDbId: selection.exerciseDbId
                    )
                    viewMode = .detail(exerciseId: id)
                },
                onStartPlan: { entries in
                    viewModel.loadExercises(entries)
                }
            )
        }
        .sheet(isPresented: $showingFinishSheet) {
            FinishSheetView(
                viewModel: viewModel,
                userId: userId,
                personalRecordRepository: personalRecordRepository,
                onDone: {
                    showingFinishSheet = false
                    onDismiss()
                },
                onAddMoreExercise: {
                    showingFinishSheet = false
                }
            )
        }
        .confirmationDialog(
            "Remove all exercises from this workout?",
            isPresented: $showingUnloadConfirm,
            titleVisibility: .visible
        ) {
            Button("Unload All", role: .destructive) {
                for exercise in viewModel.exercises {
                    viewModel.removeExercise(exerciseId: exercise.id)
                }
                viewMode = .list
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "chevron.down")
                        .font(.headline)
                        .foregroundStyle(ColorTokens.textSecondary)
                        .frame(width: 32, height: 32)
                }

                titleField

                Spacer(minLength: 0)

                Button {
                    showingCalendar = true
                } label: {
                    Image(systemName: "calendar")
                        .font(.headline)
                        .foregroundStyle(ColorTokens.textSecondary)
                        .frame(width: 32, height: 32)
                }

                if !viewModel.exercises.isEmpty {
                    Button {
                        showingUnloadConfirm = true
                    } label: {
                        Image(systemName: "trash")
                            .font(.headline)
                            .foregroundStyle(ColorTokens.red)
                            .frame(width: 32, height: 32)
                    }

                    Button {
                        showingFinishSheet = true
                    } label: {
                        Text("Finish")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ColorTokens.accent)
                    }
                }
            }

            HStack(spacing: 12) {
                Text(elapsedTimeText)
                    .font(.system(.title2, design: .monospaced).weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                    .monospacedDigit()

                Button {
                    viewModel.togglePause()
                } label: {
                    Image(systemName: viewModel.isPaused ? "play.circle.fill" : "pause.circle.fill")
                        .font(.title2)
                        .foregroundStyle(ColorTokens.accent)
                }

                Spacer(minLength: 0)

                if viewMode != .list {
                    Button {
                        viewMode = .list
                    } label: {
                        Label("All Exercises", systemImage: "chevron.left")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ColorTokens.accent)
                    }
                }
            }

            notesField
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(ColorTokens.bgElevated)
    }

    private var titleField: some View {
        Group {
            if isEditingTitle {
                TextField("Workout title", text: $draftTitle)
                    .font(.headline)
                    .foregroundStyle(ColorTokens.textPrimary)
                    .focused($titleFieldFocused)
                    .submitLabel(.done)
                    .onSubmit(commitTitle)
                    .onAppear { titleFieldFocused = true }
            } else {
                Button {
                    draftTitle = viewModel.title
                    isEditingTitle = true
                } label: {
                    Text(viewModel.title)
                        .font(.headline)
                        .foregroundStyle(ColorTokens.textPrimary)
                        .lineLimit(1)
                }
            }
        }
    }

    private func commitTitle() {
        let trimmed = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            viewModel.setTitle(trimmed)
        }
        isEditingTitle = false
    }

    /// Binds directly to `viewModel.notes` for instant per-keystroke display
    /// (kept a plain `var` on the view model for exactly this reason), but
    /// commits to disk via `updateNotes(_:)` only on focus-loss/submit -- not
    /// per keystroke, which would mean a synchronous full-draft JSON encode +
    /// atomic disk write (`WorkoutDraftStore.save()`) on every character
    /// typed. `.onChange(of: notesFieldFocused)` catches the common case
    /// (tapping away); `.onSubmit` catches return-to-dismiss.
    private var notesField: some View {
        TextField(
            "Add notes...",
            text: Binding(get: { viewModel.notes ?? "" }, set: { viewModel.notes = $0.isEmpty ? nil : $0 })
        )
        .font(.caption)
        .foregroundStyle(ColorTokens.textSecondary)
        .focused($notesFieldFocused)
        .onChange(of: notesFieldFocused) { _, isFocused in
            if !isFocused {
                viewModel.updateNotes(viewModel.notes)
            }
        }
        .onSubmit {
            viewModel.updateNotes(viewModel.notes)
        }
    }

    private var elapsedTimeText: String {
        let total = viewModel.elapsedSeconds
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }

    // MARK: - Banners

    private var futureDateBanner: some View {
        Text("Can't move a workout to a future date.")
            .font(.caption.weight(.medium))
            .foregroundStyle(ColorTokens.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(ColorTokens.red.opacity(0.12))
    }

    private func setCapBanner(_ message: String) -> some View {
        Text(message)
            .font(.caption.weight(.medium))
            .foregroundStyle(ColorTokens.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(ColorTokens.bgSurface)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch viewMode {
        case .list:
            listView
        case .detail(let exerciseId):
            if viewModel.exercises.contains(where: { $0.id == exerciseId }) {
                ExerciseDetailView(viewModel: viewModel, exerciseId: exerciseId)
            } else {
                // Exercise was removed (e.g. via Unload All) while its detail
                // pane was showing -- fall back to the list rather than
                // rendering a detail view for a now-nonexistent exercise.
                listView
                    .onAppear { viewMode = .list }
            }
        }
    }

    private var listView: some View {
        Group {
            if viewModel.exercises.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(viewModel.exercises) { exercise in
                            exerciseCard(exercise)
                        }

                        addExerciseStubButton
                    }
                    .padding(16)
                }
            }
        }
    }

    private func exerciseCard(_ exercise: ExerciseEntry) -> some View {
        let doneCount = exercise.sets.filter(\.done).count
        let totalCount = exercise.sets.count

        return Button {
            viewMode = .detail(exerciseId: exercise.id)
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(exercise.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ColorTokens.textPrimary)
                    Text(exercise.muscleGroup)
                        .font(.caption)
                        .foregroundStyle(ColorTokens.textSecondary)
                }

                Spacer()

                Text("\(doneCount)/\(totalCount)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(doneCount == totalCount && totalCount > 0 ? ColorTokens.accent : ColorTokens.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(ColorTokens.bgElevated)
                    .clipShape(Capsule())

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.textMuted)
            }
            .padding(12)
            .background(ColorTokens.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }

    private var addExerciseStubButton: some View {
        Button {
            showingExercisePicker = true
        } label: {
            Label("Add Exercise", systemImage: "plus")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                        .foregroundStyle(ColorTokens.accent.opacity(0.5))
                )
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "dumbbell")
                .font(.system(size: 40))
                .foregroundStyle(ColorTokens.textMuted)
            Text("No exercises yet")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.textSecondary)

            Button {
                showingExercisePicker = true
            } label: {
                Label("Add Exercise", systemImage: "plus")
                    .font(.subheadline.weight(.semibold))
            }
            .buttonStyle(.borderedProminent)
            .tint(ColorTokens.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }

    // MARK: - Rest timer bar

    private var restTimerBar: some View {
        let total = Double(UserDefaults.standard.integer(forKey: "athlix_default_rest_secs"))
        let denominator = total > 0 ? total : 90
        let remaining = Double(viewModel.restSecondsLeft ?? 0)
        let progress = denominator > 0 ? min(max(remaining / denominator, 0), 1) : 0

        return HStack(spacing: 12) {
            Image(systemName: "timer")
                .foregroundStyle(ColorTokens.accent)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(ColorTokens.bgElevated)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(ColorTokens.accent)
                        .frame(width: geo.size.width * progress)
                        .animation(.linear(duration: 1), value: progress)
                }
            }
            .frame(height: 8)

            Text("\(viewModel.restSecondsLeft ?? 0)s")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ColorTokens.textPrimary)
                .monospacedDigit()

            Button {
                viewModel.dismissRestTimer()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(ColorTokens.textMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(ColorTokens.bgElevated)
    }
}
