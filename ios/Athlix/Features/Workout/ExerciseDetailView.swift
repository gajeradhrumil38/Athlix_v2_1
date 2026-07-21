import SwiftUI
import AthlixCore

/// Detail screen for a single exercise within the active workout session,
/// mirroring web's `ExerciseContent.tsx`: sticky 3-column stats card + prefill
/// banner + list of `SetRowView`s + add-set button.
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
    /// so toggling the pill toggle below via `setUnitPreference` is
    /// immediately reflected here -- see that method's doc comment.
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
    /// this toggle (kg/lbs) is fully live -- see `weightUnitPills` -- this
    /// `@State` only backs the still-inert km/mi pill pair. A future
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

    /// Mirrors web's `relativeLoad`: only shown for weight-bearing types, and
    /// requires a positive body weight -- does NOT require `totalVolume > 0`
    /// (a 0 volume with a valid body weight legitimately renders "0.00x BW").
    private var relativeLoad: Double? {
        guard inputType.isWeightExerciseType, let bodyWeight, bodyWeight > 0, let totalVolume else { return nil }
        return totalVolume / bodyWeight
    }

    /// SIGNAL SOURCE for the at-cap state: `exercise.sets.count >= 20` checked
    /// directly here (matching `SetCRUDEngine`'s cap, which
    /// `ActiveWorkoutViewModel` doesn't expose directly) rather than relying
    /// solely on `viewModel.setCapMessage`, because that message is only
    /// populated AFTER a rejected `addSet` call -- checking the count directly
    /// lets the button disable itself proactively, before the user ever taps
    /// it and sees the message once.
    private var isAtCap: Bool { totalCount >= 20 }

    /// Whether the "Last session · ..." prefill banner should show, mirroring
    /// web's `showPrefillBanner` (`ActiveWorkout.tsx`): a `lastSession` exists
    /// AND the user hasn't already tapped Reset for this exercise this
    /// session (tracked on the view model so it survives navigating away and
    /// back within the session).
    private var showPrefillBanner: Bool {
        exercise?.lastSession != nil && !viewModel.hiddenPrefillExerciseIds.contains(exerciseId)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10, pinnedViews: [.sectionHeaders]) {
                Section {
                    if let exercise, let lastSession = exercise.lastSession, showPrefillBanner {
                        prefillBanner(lastSession)
                    }

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
                    stickyHeader
                }
            }
            .padding(16)
        }
        .background(ColorTokens.bgBase)
        .navigationTitle(exercise?.name ?? "Exercise")
    }

    // MARK: - Sticky header (name/type-selector row + 3-column stats card)

    private var stickyHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(exercise?.name ?? "")
                    .font(.headline)
                    .foregroundStyle(ColorTokens.textPrimary)

                Spacer()

                inputTypeSelector
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

            statsGrid
        }
        .padding(.vertical, 4)
        .background(ColorTokens.bgBase)
    }

    /// 3-way TIME / WEIGHT / REPS selector, matching web's custom segmented
    /// row in `ActiveWorkout.tsx` (icon + label per segment, thin
    /// border-right dividers between segments, active segment tinted
    /// `--accent` at 14% opacity) -- deliberately NOT a native `.segmented`
    /// `Picker`, since that control can't reproduce the icon+label pairing or
    /// the exact accent-tinted active state web uses.
    private var inputTypeSelector: some View {
        let activeType = inputType
        let segments: [(type: ExerciseInputType, systemImage: String, label: String)] = [
            (.timeOnly, "timer", "Time"),
            (.weightReps, "dumbbell.fill", "Weight"),
            (.repsOnly, "number", "Reps"),
        ]

        return HStack(spacing: 0) {
            ForEach(Array(segments.enumerated()), id: \.element.type) { index, segment in
                let isActive = activeType == segment.type
                Button {
                    viewModel.cycleInputType(exerciseId: exerciseId, forced: segment.type)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: segment.systemImage)
                            .font(.system(size: 10, weight: .bold))
                        Text(segment.label.uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.4)
                    }
                    .padding(.horizontal, 8)
                    .frame(height: 32)
                }
                .buttonStyle(.plain)
                .background(isActive ? ColorTokens.accent.opacity(0.14) : Color.clear)
                .foregroundStyle(isActive ? ColorTokens.accent : ColorTokens.textMuted)
                .overlay(alignment: .trailing) {
                    if index < segments.count - 1 {
                        Rectangle().fill(ColorTokens.border).frame(width: 1)
                    }
                }
            }
        }
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(ColorTokens.border))
    }

    /// 3-column stats card: Sets | Volume (+ relative-load sub-line) | Unit,
    /// matching web's `grid grid-cols-3` card exactly -- middle column has
    /// visible left+right dividers (web's `border-l border-r`).
    private var statsGrid: some View {
        HStack(spacing: 0) {
            statColumn(label: "Sets") {
                (
                    Text("\(doneCount)")
                        .font(.system(size: 20, weight: .black))
                        .foregroundColor(ColorTokens.textPrimary)
                    + Text("/\(totalCount)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(ColorTokens.textMuted)
                )
                .monospacedDigit()
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            statColumn(label: "Volume") {
                VStack(alignment: .leading, spacing: 2) {
                    if let totalVolume, totalVolume > 0 {
                        Text(ExerciseTypeLabels.formatSetValue(kind: .weight, value: totalVolume))
                            .font(.system(size: 20, weight: .black))
                            .foregroundStyle(ColorTokens.textPrimary)
                            .monospacedDigit()
                    } else {
                        Text("—")
                            .font(.system(size: 20, weight: .black))
                            .foregroundStyle(ColorTokens.textMuted)
                    }
                    if let relativeLoad {
                        Text(String(format: "%.2fx BW", relativeLoad))
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(ColorTokens.textSecondary)
                            .monospacedDigit()
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .leading) { Rectangle().fill(ColorTokens.border).frame(width: 1) }
            .overlay(alignment: .trailing) { Rectangle().fill(ColorTokens.border).frame(width: 1) }

            statColumn(label: "Unit") {
                unitColumnContent
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(ColorTokens.border))
    }

    private func statColumn<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.6)
                .foregroundStyle(ColorTokens.textSecondary)
            content()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var unitColumnContent: some View {
        // No unit control at all for reps-only/time-only/calories-time types --
        // intentional; those types show their fixed static unit text instead
        // (matching web's `statUnit` fallback branch), same as before.
        if inputType.isWeightExerciseType {
            weightUnitPills
        } else if inputType.isDistanceExerciseType {
            distanceUnitPills
        } else {
            let unit = ExerciseTypeLabels.unitDisplay(for: inputType)
            Text(unit.isEmpty ? "—" : unit.uppercased())
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(ColorTokens.textPrimary)
        }
    }

    /// Live kg/lbs pill toggle: reads/writes straight through
    /// `viewModel.unitPreference` via `setUnitPreference`, so it both updates
    /// this session's display immediately and persists to the profile in the
    /// background (see that method's doc comment for the fire-and-forget
    /// persistence rationale). Restyled from Task 9's native `.segmented`
    /// `Picker` to a custom two-button pill (matching web's
    /// `inline-flex rounded-lg border ... p-[3px]` button pair) while
    /// preserving the exact same live `Binding`/`Task` wiring.
    private var weightUnitPills: some View {
        HStack(spacing: 0) {
            unitPillButton("kg", isSelected: weightUnit == .kg, enabled: true) {
                Task { await viewModel.setUnitPreference(.kg) }
            }
            unitPillButton("lbs", isSelected: weightUnit == .lbs, enabled: true) {
                Task { await viewModel.setUnitPreference(.lbs) }
            }
        }
        .padding(3)
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(ColorTokens.border))
    }

    /// No-op pill pair -- see `displayUnitIsMetric` doc comment. Disabled
    /// (rather than fully interactive) so it reads as "not yet available"
    /// instead of a control that visibly responds to taps but never changes
    /// any displayed value -- flagged in code review as misleading otherwise.
    private var distanceUnitPills: some View {
        HStack(spacing: 0) {
            unitPillButton("km", isSelected: displayUnitIsMetric, enabled: false) {}
            unitPillButton("mi", isSelected: !displayUnitIsMetric, enabled: false) {}
        }
        .padding(3)
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(ColorTokens.border))
        .opacity(0.5)
    }

    private func unitPillButton(_ label: String, isSelected: Bool, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .bold))
                .frame(minWidth: 34, minHeight: 24)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .background(isSelected ? ColorTokens.accentDim : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(isSelected ? ColorTokens.accent.opacity(0.25) : Color.clear, lineWidth: 1)
        )
        .foregroundStyle(isSelected ? ColorTokens.accent : ColorTokens.textSecondary)
    }

    // MARK: - Prefill banner

    /// "Last session · <date>" banner with a Reset button, matching web's
    /// prefill banner in `ExerciseContent.tsx` exactly (accent-tinted
    /// bordered pill, small accent dot, uppercase tracked "Reset" action).
    /// Reset calls straight through to `viewModel.clearPrefill`, which resets
    /// this exercise's sets to its input type's defaults, marks them undone,
    /// and permanently hides this banner for the rest of the session -- see
    /// that method's doc comment.
    private func prefillBanner(_ lastSession: LastSessionSummary) -> some View {
        HStack {
            HStack(spacing: 8) {
                Circle()
                    .fill(ColorTokens.accent)
                    .frame(width: 6, height: 6)
                Text("Last session · \(formattedLastSessionDate(lastSession.date))")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(ColorTokens.textPrimary)
            }

            Spacer()

            Button {
                viewModel.clearPrefill(exerciseId: exerciseId)
            } label: {
                Text("RESET")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1)
            }
            .buttonStyle(.plain)
            .foregroundStyle(ColorTokens.accent)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(ColorTokens.accent.opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(ColorTokens.accent.opacity(0.20)))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    /// Ports web's `fmtLastDate` (`ExerciseContent.tsx`) exactly: parses a
    /// plain "YYYY-MM-DD" date string (constructed at local midnight, same as
    /// web's `new Date(y, m - 1, d)`), and returns "today"/"yesterday" for the
    /// last two days or a short "Mon D" style date otherwise -- day-count
    /// diffed against today at local midnight, matching web's
    /// `today.setHours(0,0,0,0)` + integer-day-division approach rather than
    /// `Calendar` component comparison, so the two implementations agree on
    /// edge cases (e.g. DST transitions) the same way.
    private func formattedLastSessionDate(_ dateStr: String) -> String {
        let parts = dateStr.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return "last session" }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        let calendar = Calendar.current
        guard let date = calendar.date(from: components) else { return "last session" }

        let today = calendar.startOfDay(for: Date())
        let dayStart = calendar.startOfDay(for: date)
        let diffDays = calendar.dateComponents([.day], from: dayStart, to: today).day ?? 0

        if diffDays == 0 { return "today" }
        if diffDays == 1 { return "yesterday" }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
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
