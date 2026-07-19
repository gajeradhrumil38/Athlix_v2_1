import SwiftUI
import AthlixCore

/// Stats-review-and-save sheet shown when the user taps "Finish" on an
/// active workout, mirroring web's `FinishSheet.tsx` -- with one deliberate
/// fix: web's Finish sheet always shows "0 PRs" because its client-side PR
/// flag is dead code. This view instead calls
/// `PersonalRecordRepository.countNewPRs` AFTER a successful save, so the
/// displayed count reflects what the server-side RPC actually upserted.
///
/// OWNERSHIP: plain (non-`@Bindable`) `viewModel` reference, matching
/// `ExerciseDetailView`/`ActiveWorkoutView` -- mutation flows through the
/// view model's explicit `setTitle`/`updateNotes`/`save` methods, never a
/// raw `Binding` into its private-set properties.
struct FinishSheetView: View {
    let viewModel: ActiveWorkoutViewModel
    let userId: String
    let personalRecordRepository: PersonalRecordRepository
    /// Body weight for the "xBW" relative-load hint. No source is wired up yet
    /// in this milestone (no `ProfileRepository`/settings fetch built) --
    /// same follow-up-wiring-point pattern as `ExerciseDetailView.bodyWeight`.
    /// FOLLOW-UP: wire this from the user's profile once a settings/profile
    /// repository exists.
    var bodyWeight: Double? = nil
    /// Called once the post-save success state has run its course (either the
    /// short auto-dismiss delay elapses, or the user taps through) -- the
    /// caller (`ActiveWorkoutView`) owns the actual sheet-dismissal /
    /// navigate-home behavior.
    var onDone: () -> Void = {}
    /// Called when "Add More Exercise" is tapped -- dismisses this sheet back
    /// to `ActiveWorkoutView` WITHOUT saving, per web's behavior, letting the
    /// user resume editing. Distinct from `onDone` since no save happened.
    var onAddMoreExercise: () -> Void = {}

    private enum SaveState: Equatable {
        case editing
        case saving
        case success(prCount: Int)
        case failure(String)
    }

    @State private var saveState: SaveState = .editing
    @State private var draftTitle = ""
    @State private var isEditingTitle = false
    @FocusState private var titleFieldFocused: Bool
    @FocusState private var notesFieldFocused: Bool

    // MARK: - Stats (mirrors ExerciseDetailView's exact volume-computation logic)

    private var completedSetCount: Int {
        viewModel.exercises.reduce(0) { $0 + $1.sets.filter(\.done).count }
    }

    private var totalVolume: Double {
        viewModel.exercises.reduce(0.0) { total, exercise in
            let inputType = exercise.inputTypeOverride ?? ExerciseTypeResolver.resolve(exercise.name)
            guard inputType.isWeightExerciseType else { return total }
            let volume = exercise.sets
                .filter(\.done)
                .reduce(0.0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
            return total + volume
        }
    }

    private var relativeLoadText: String? {
        guard let bodyWeight, bodyWeight > 0, totalVolume > 0 else { return nil }
        return String(format: "%.1fx BW", totalVolume / bodyWeight)
    }

    /// Exercises with at least one done set -- the set touched-exercise-names
    /// extraction used both for what actually got saved and for the
    /// `countNewPRs` lookup post-save.
    private var touchedExerciseNames: [String] {
        viewModel.exercises.filter { $0.sets.contains { $0.done } }.map(\.name)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 16) {
                    statsGrid
                    titleField
                    notesField

                    if case .failure(let message) = saveState {
                        errorBanner(message)
                    }

                    if case .success(let prCount) = saveState {
                        successBanner(prCount: prCount)
                    }
                }
                .padding(16)
            }
            actions
        }
        .background(ColorTokens.bgBase)
    }

    // MARK: - Header

    private var header: some View {
        Text("Finish Workout")
            .font(.headline)
            .foregroundStyle(ColorTokens.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(ColorTokens.bgElevated)
    }

    // MARK: - Stats

    private var statsGrid: some View {
        HStack(spacing: 12) {
            statTile(label: "Sets Completed", value: "\(completedSetCount)")
            statTile(label: "Total Volume", value: ExerciseTypeLabels.formatSetValue(kind: .weight, value: totalVolume))
            if let relativeLoadText {
                statTile(label: "Relative Load", value: relativeLoadText)
            }
        }
    }

    private func statTile(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundStyle(ColorTokens.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(ColorTokens.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Title / Notes (commit-on-blur, matching ActiveWorkoutView's pattern)

    private var titleField: some View {
        Group {
            if isEditingTitle {
                TextField("Workout title", text: $draftTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                    .focused($titleFieldFocused)
                    .submitLabel(.done)
                    .onSubmit(commitTitle)
                    .onChange(of: titleFieldFocused) { _, isFocused in
                        if !isFocused { commitTitle() }
                    }
                    .onAppear { titleFieldFocused = true }
                    .padding(10)
                    .background(ColorTokens.bgSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                Button {
                    draftTitle = viewModel.title
                    isEditingTitle = true
                } label: {
                    HStack {
                        Text(viewModel.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ColorTokens.textPrimary)
                        Spacer()
                        Image(systemName: "pencil")
                            .font(.caption)
                            .foregroundStyle(ColorTokens.textMuted)
                    }
                    .padding(10)
                    .background(ColorTokens.bgSurface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
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

    /// Binds directly to `viewModel.notes` for instant per-keystroke display,
    /// but commits via `updateNotes(_:)` only on focus-loss/submit -- matching
    /// `ActiveWorkoutView.notesField`'s exact established pattern, not the
    /// per-keystroke-persist anti-pattern that was already fixed once there.
    private var notesField: some View {
        TextField(
            "Add notes...",
            text: Binding(get: { viewModel.notes ?? "" }, set: { viewModel.notes = $0.isEmpty ? nil : $0 })
        )
        .font(.caption)
        .foregroundStyle(ColorTokens.textSecondary)
        .focused($notesFieldFocused)
        .padding(10)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .onChange(of: notesFieldFocused) { _, isFocused in
            if !isFocused {
                viewModel.updateNotes(viewModel.notes)
            }
        }
        .onSubmit {
            viewModel.updateNotes(viewModel.notes)
        }
    }

    // MARK: - Success / error banners

    private func successBanner(prCount: Int) -> some View {
        Text(prCount > 0 ? "\u{1F389} \(prCount) New PR\(prCount == 1 ? "" : "s")!" : "Workout saved!")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(prCount > 0 ? ColorTokens.prGold : ColorTokens.green)
            .frame(maxWidth: .infinity)
            .padding(12)
            .background((prCount > 0 ? ColorTokens.prGold : ColorTokens.green).opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func errorBanner(_ message: String) -> some View {
        Text(message)
            .font(.caption.weight(.medium))
            .foregroundStyle(ColorTokens.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(ColorTokens.red.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Actions

    @ViewBuilder
    private var actions: some View {
        VStack(spacing: 10) {
            switch saveState {
            case .editing, .failure:
                Button {
                    Task { await finish() }
                } label: {
                    Text("Save Workout")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(ColorTokens.accent)

                Button {
                    onAddMoreExercise()
                } label: {
                    Text("Add More Exercise")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ColorTokens.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }

            case .saving:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)

            case .success:
                Button {
                    onDone()
                } label: {
                    Text("Done")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(ColorTokens.accent)
            }
        }
        .padding(16)
        .background(ColorTokens.bgElevated)
    }

    /// Saves the workout, then -- only on success -- looks up the REAL PR
    /// count for the exercises that were actually touched this session, on
    /// the just-saved workout's date. On failure, the sheet/draft are left
    /// exactly as they were (`ActiveWorkoutViewModel.save()` only clears the
    /// draft store after `workoutRepository.saveWorkout` itself succeeds), so
    /// the user can retry without losing anything.
    ///
    /// TRANSITION DECISION: the success state shows a "Done" button rather
    /// than auto-dismissing after a fixed delay -- letting the user register
    /// the PR count (which is the entire point of this fix) before the sheet
    /// goes away, rather than racing a timer. `onDone()` is the caller's cue
    /// to dismiss/navigate home.
    private func finish() async {
        saveState = .saving
        do {
            let names = touchedExerciseNames
            let workout = try await viewModel.save()
            let prCount = (try? await personalRecordRepository.countNewPRs(
                userId: userId, exerciseNames: names, achievedOn: workout.date
            )) ?? 0
            saveState = .success(prCount: prCount)
        } catch {
            saveState = .failure("Couldn't save workout. Please try again.")
        }
    }
}
