import SwiftUI
import AthlixCore

/// Detail screen for a single exercise within the active workout session,
/// mirroring web's `ExerciseContent.tsx`: sticky stats header + list of
/// `SetRowView`s + add-set button.
///
/// OWNERSHIP: plain (non-`@Bindable`) `viewModel` reference, matching
/// `SetRowView` -- see that file's header comment for the rationale (mutation
/// must flow through the view model's validated id-based methods, never a raw
/// `Binding` into `exercises`). This view re-derives `exercise` from
/// `viewModel.exercises` each render (see `exercise` computed property) so it
/// always reflects the latest state after a child row's mutation.
struct ExerciseDetailView: View {
    let viewModel: ActiveWorkoutViewModel
    let exerciseId: String
    var distanceUnit: String = "mi"
    /// Body weight for the "xBW" relative-load hint. No source is wired up yet
    /// in this milestone (no `ProfileRepository`/settings fetch built) -- the
    /// hint is structured to show whenever this is non-nil, but every current
    /// caller passes `nil`. FOLLOW-UP: wire this from the user's profile once
    /// a settings/profile repository exists.
    var bodyWeight: Double? = nil

    /// Live display unit for weight-bearing set rows/stats, sourced directly
    /// from `viewModel.unitPreference` (rather than a static prop default)
    /// so toggling the picker below via `setUnitPreference` is immediately
    /// reflected here -- see that method's doc comment.
    private var weightUnit: WeightUnit { viewModel.unitPreference }

    /// Re-resolved from the view model's live `exercises` array on every
    /// render rather than captured once, so edits made via child `SetRowView`s
    /// (which mutate through `viewModel`, not a local copy) are reflected
    /// immediately.
    private var exercise: ExerciseEntry? {
        viewModel.exercises.first { $0.id == exerciseId }
    }

    private var inputType: ExerciseInputType {
        guard let exercise else { return .weightReps }
        return exercise.inputTypeOverride ?? ExerciseTypeResolver.resolve(exercise.name)
    }

    /// SCOPE LIMITATION (distance half only): this toggle is visually present
    /// but a no-op for distance-type exercises -- there's no distance-unit
    /// equivalent of `ActiveWorkoutViewModel.setUnitPreference`/`unitPreference`
    /// wired up (no `distanceUnitPreference` was added). The WEIGHT half of
    /// this toggle (kg/lbs) is fully live -- see `weightUnitPicker` -- this
    /// `@State` only backs the still-inert km/mi picker. A future
    /// settings-integration task should replace this with a real binding that
    /// also converts already-entered distance values.
    @State private var displayUnitIsMetric = true

    private var doneCount: Int { exercise?.sets.filter(\.done).count ?? 0 }
    private var totalCount: Int { exercise?.sets.count ?? 0 }

    private var totalVolume: Double? {
        guard let exercise, inputType.isWeightExerciseType else { return nil }
        let volume = exercise.sets
            .filter(\.done)
            .reduce(0.0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) }
        return volume
    }

    /// SIGNAL SOURCE for the at-cap state: `exercise.sets.count >= 20` checked
    /// directly here (matching `SetCRUDEngine`'s cap, which
    /// `ActiveWorkoutViewModel` doesn't expose directly) rather than relying
    /// solely on `viewModel.setCapMessage`, because that message is only
    /// populated AFTER a rejected `addSet` call -- checking the count directly
    /// lets the button disable itself proactively, before the user ever taps
    /// it and sees the message once.
    private var isAtCap: Bool { totalCount >= 20 }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                Section {
                    if let exercise {
                        ForEach(Array(exercise.sets.enumerated()), id: \.element.id) { index, set in
                            SetRowView(
                                viewModel: viewModel,
                                exerciseId: exerciseId,
                                loggedSet: set,
                                index: index,
                                inputType: inputType,
                                weightUnit: weightUnit,
                                distanceUnit: distanceUnit,
                                optionalWeight: exercise.optionalWeight ?? false
                            )
                        }
                    }

                    addSetButton
                } header: {
                    statsHeader
                }
            }
            .padding(16)
        }
        .background(ColorTokens.bgBase)
        .navigationTitle(exercise?.name ?? "Exercise")
    }

    private var statsHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(exercise?.name ?? "")
                    .font(.headline)
                    .foregroundStyle(ColorTokens.textPrimary)

                Spacer()

                // No unit picker shown at all for reps-only/time-only/calories-time types --
                // intentional; those types have no weight or distance unit to toggle.
                if inputType.isWeightExerciseType {
                    weightUnitPicker
                } else if inputType.isDistanceExerciseType {
                    distanceUnitPicker
                }
            }

            if inputType == .repsOnly {
                Toggle("Track weight", isOn: Binding(
                    get: { exercise?.optionalWeight ?? false },
                    set: { viewModel.setOptionalWeight(exerciseId: exerciseId, enabled: $0) }
                ))
                .font(.caption)
                .foregroundStyle(ColorTokens.textSecondary)
                .tint(ColorTokens.accent)
            }

            HStack(spacing: 14) {
                Label("Sets: \(doneCount)/\(totalCount) done", systemImage: "checklist")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ColorTokens.textSecondary)

                if let totalVolume {
                    Label(
                        "\(ExerciseTypeLabels.formatSetValue(kind: .weight, value: totalVolume)) \(weightUnit.rawValue) vol",
                        systemImage: "scalemass"
                    )
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ColorTokens.textSecondary)
                }

                if let bodyWeight, bodyWeight > 0, let totalVolume {
                    Text(String(format: "%.1fx BW", totalVolume / bodyWeight))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ColorTokens.accent)
                }
            }
        }
        .padding(12)
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    /// Live kg/lbs toggle: reads/writes straight through
    /// `viewModel.unitPreference` via `setUnitPreference`, so it both updates
    /// this session's display immediately and persists to the profile in the
    /// background (see that method's doc comment for the fire-and-forget
    /// persistence rationale). Unlike the distance picker below, this one is
    /// fully interactive.
    private var weightUnitPicker: some View {
        Picker("", selection: Binding(
            get: { weightUnit == .kg },
            set: { isMetric in
                Task { await viewModel.setUnitPreference(isMetric ? .kg : .lbs) }
            }
        )) {
            Text("kg").tag(true)
            Text("lbs").tag(false)
        }
        .pickerStyle(.segmented)
        .frame(width: 110)
    }

    /// No-op unit toggle -- see `displayUnitIsMetric` doc comment. Disabled
    /// (rather than fully interactive) so it reads as "not yet available"
    /// instead of a control that visibly responds to taps but never changes
    /// any displayed value -- flagged in code review as misleading otherwise.
    private var distanceUnitPicker: some View {
        Picker("", selection: $displayUnitIsMetric) {
            Text("km").tag(true)
            Text("mi").tag(false)
        }
        .pickerStyle(.segmented)
        .frame(width: 110)
        .disabled(true)
        .opacity(0.5)
    }

    private var addSetButton: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button {
                viewModel.addSet(exerciseId: exerciseId)
            } label: {
                HStack {
                    Spacer()
                    Label("Add Set", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                }
                .padding(.vertical, 10)
            }
            .foregroundStyle(isAtCap ? ColorTokens.textMuted : ColorTokens.accent)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    .foregroundStyle(isAtCap ? ColorTokens.border : ColorTokens.accent.opacity(0.5))
            )
            .disabled(isAtCap)

            if isAtCap {
                Text(viewModel.setCapMessage ?? "Maximum 20 sets per exercise")
                    .font(.caption2)
                    .foregroundStyle(ColorTokens.textMuted)
            }
        }
    }
}
