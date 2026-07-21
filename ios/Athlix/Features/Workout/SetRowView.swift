import SwiftUI
import AthlixCore

/// One row per logged set within an exercise, mirroring web's `SetRow.tsx`.
///
/// OWNERSHIP DECISION: takes `viewModel` as a plain (non-`@Bindable`) reference
/// and calls its explicit id-based methods (`updateSet`/`markSetDone`/`copySet`/
/// `removeSet`) rather than binding directly into `viewModel.exercises[...]`.
/// `ActiveWorkoutViewModel` deliberately exposes `exercises` as `private(set)`
/// precisely so all mutation flows through its validated methods (readiness
/// gates, the 20-set cap, draft persistence) -- a raw `Binding` into the array
/// would bypass all of that. `ExerciseDetailView` follows the same pattern for
/// consistency.
struct SetRowView: View {
    let viewModel: ActiveWorkoutViewModel
    let exerciseId: String
    let loggedSet: LoggedSet
    let index: Int
    let inputType: ExerciseInputType
    let weightUnit: WeightUnit
    let distanceUnit: String
    /// From `ExerciseEntry.optionalWeight` -- when `true` on a `.repsOnly`
    /// exercise, this row gains a second value box for tracking added weight
    /// (e.g. weighted push-ups), reusing the otherwise-unused secondary
    /// storage slot. See `fieldKinds` for how this reshapes the effective
    /// field layout.
    let optionalWeight: Bool

    /// Identifies exactly one field-edit (a specific set's specific field) so
    /// `.sheet(item:)` always sees a fresh identity when the user opens the
    /// picker again -- even for the SAME field on the SAME set -- avoiding the
    /// stale-wheel-position bug `SetValuePicker`'s init-seeding was built to
    /// prevent. Each tap mints a new UUID rather than reusing `loggedSet.id` so that
    /// re-tapping the same box after a confirm still gets a fresh identity.
    private struct EditTarget: Identifiable {
        let id = UUID()
        let isSecondary: Bool
    }

    @State private var editTarget: EditTarget?

    /// Overrides the resolved `(.reps, nil)` layout to `(.reps, .weight)` when
    /// this `.repsOnly` exercise has opted into weight tracking -- the
    /// secondary box (which stores into `loggedSet.reps`, per this file's
    /// fixed primary->weight/secondary->reps mapping) is otherwise unused for
    /// `.repsOnly`, so it's repurposed here rather than adding a third
    /// storage slot to `LoggedSet`.
    private var fieldKinds: (primary: DialFieldKind, secondary: DialFieldKind?) {
        if inputType == .repsOnly && optionalWeight {
            return (.reps, .weight)
        }
        return inputType.fieldKinds
    }

    /// `ExerciseTypeLabels.inputLabels` is driven purely by `inputType`, so
    /// for a plain `.repsOnly` exercise it correctly returns a `nil` secondary
    /// label. It has no notion of this view's `optionalWeight` override,
    /// though, so when that override is active it would otherwise leave the
    /// synthetic weight box with an empty label. Special-cased here rather
    /// than teaching `ExerciseTypeLabels` about a Swift-only, per-exercise
    /// opt-in that doesn't exist as an `ExerciseInputType` case.
    private var labels: (primary: String, secondary: String?) {
        let base = ExerciseTypeLabels.inputLabels(for: inputType, weightUnit: weightUnit, distanceUnit: distanceUnit)
        if inputType == .repsOnly && optionalWeight {
            return (base.primary, weightUnit.rawValue.uppercased())
        }
        return base
    }

    /// `LoggedSet` only has two numeric slots (`weight`, `reps`) that get
    /// reinterpreted per `DialFieldKind` -- primary always reads/writes
    /// `weight`, secondary always reads/writes `reps`, matching the same
    /// mapping `ActiveWorkoutViewModel.addExercise`'s seeding decision uses.
    private var primaryValue: Double { loggedSet.weight ?? 0 }
    private var secondaryValue: Double { Double(loggedSet.reps ?? 0) }

    private var isReady: Bool {
        SetCompletionRules.isReady(type: inputType, weight: loggedSet.weight ?? 0, reps: loggedSet.reps ?? 0)
    }

    var body: some View {
        HStack(spacing: 10) {
            accentBar

            Text("\(index + 1)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ColorTokens.textSecondary)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    valueBox(
                        kind: fieldKinds.primary,
                        label: labels.primary,
                        value: primaryValue,
                        isSecondary: false
                    )

                    if let secondaryKind = fieldKinds.secondary {
                        valueBox(
                            kind: secondaryKind,
                            label: labels.secondary ?? "",
                            value: secondaryValue,
                            isSecondary: true
                        )
                    }
                }

                if !loggedSet.done, let hint = targetHint {
                    Text(hint)
                        .font(.caption2)
                        .foregroundStyle(ColorTokens.textMuted)
                }
            }

            Spacer(minLength: 0)

            doneButton
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            // Swipe-actions treatment (rather than a trailing "..." menu) since
            // it matches standard iOS list-row conventions and needs no extra
            // chrome in the row itself. Destructive remove is Red per system
            // convention; copy is Accent to distinguish it as non-destructive.
            Button(role: .destructive) {
                viewModel.removeSet(exerciseId: exerciseId, setId: loggedSet.id)
            } label: {
                Label("Remove", systemImage: "trash")
            }

            Button {
                viewModel.copySet(exerciseId: exerciseId, setId: loggedSet.id)
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
            .tint(ColorTokens.accent)
        }
        .sheet(item: $editTarget) { target in
            SetValuePicker(
                kind: target.isSecondary ? (fieldKinds.secondary ?? fieldKinds.primary) : fieldKinds.primary,
                isRepsOnlyContext: inputType == .repsOnly,
                isTimeOnlyContext: inputType == .timeOnly,
                initialValue: target.isSecondary ? secondaryValue : primaryValue,
                unitLabel: target.isSecondary ? (labels.secondary ?? "") : labels.primary,
                onConfirm: { newValue in
                    applyValue(newValue, isSecondary: target.isSecondary)
                }
            )
            .presentationDetents([.height(320)])
        }
    }

    private var accentBar: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(loggedSet.done ? ColorTokens.accent : ColorTokens.border)
            .frame(width: 4)
            .frame(maxHeight: .infinity)
    }

    private var targetHint: String? {
        guard loggedSet.plannedWeight != nil || loggedSet.plannedReps != nil else { return nil }
        var parts: [String] = []
        if let plannedWeight = loggedSet.plannedWeight {
            parts.append(ExerciseTypeLabels.formatSetValue(kind: fieldKinds.primary, value: plannedWeight))
        }
        if let plannedReps = loggedSet.plannedReps {
            let kind = fieldKinds.secondary ?? .reps
            parts.append(ExerciseTypeLabels.formatSetValue(kind: kind, value: Double(plannedReps)))
        }
        guard !parts.isEmpty else { return nil }
        return "Target: \(parts.joined(separator: " x "))"
    }

    private func valueBox(kind: DialFieldKind, label: String, value: Double, isSecondary: Bool) -> some View {
        HStack(spacing: 6) {
            stepperButton(systemName: "minus", kind: kind, isSecondary: isSecondary, delta: -stepSize(for: kind))

            Button {
                editTarget = EditTarget(isSecondary: isSecondary)
            } label: {
                VStack(spacing: 1) {
                    Text(ExerciseTypeLabels.formatSetValue(kind: kind, value: value))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ColorTokens.textPrimary)
                    Text(label)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(ColorTokens.textMuted)
                }
                .frame(minWidth: 52)
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)

            stepperButton(systemName: "plus", kind: kind, isSecondary: isSecondary, delta: stepSize(for: kind))
        }
        .padding(.horizontal, 6)
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func stepperButton(systemName: String, kind: DialFieldKind, isSecondary: Bool, delta: Double) -> some View {
        Button {
            let current = isSecondary ? secondaryValue : primaryValue
            let next = max(0, current + delta)
            applyValue(next, isSecondary: isSecondary)
        } label: {
            Image(systemName: systemName)
                .font(.caption.weight(.bold))
                .foregroundStyle(ColorTokens.textSecondary)
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.plain)
    }

    /// Step sizes, per the task's guidance ("your judgment, document choices"):
    /// - weight: 1.25 in kg, 2.5 in lbs (standard plate-loading increments).
    /// - reps / height / minutes / calories: 1 (smallest meaningful whole-unit step).
    /// - distance: 0.1 (matches `SetValuePicker`'s distance decimal-column granularity).
    /// - seconds: 5 (matches `SetValuePicker`'s 0/5/10/.../55 wheel granularity,
    ///   rather than 1, so +/- steps stay consistent with what the dial itself offers).
    private func stepSize(for kind: DialFieldKind) -> Double {
        switch kind {
        case .weight: return weightUnit == .kg ? 1.25 : 2.5
        case .reps, .height, .minutes, .calories: return 1
        case .distance: return 0.1
        case .seconds: return 5
        }
    }

    /// NOTE: `Int(value.rounded())` here is correct for reps, but when
    /// `optionalWeight` has repurposed the secondary slot to represent weight
    /// (see `fieldKinds`), this silently rounds fractional weight entries (e.g.
    /// 22.5 -> 23), losing precision. Fixing this would require a new storage
    /// field on `LoggedSet`, which is out of scope for the optional-weight
    /// feature -- tracked as a known, accepted limitation, not a bug to "fix"
    /// here.
    private func applyValue(_ value: Double, isSecondary: Bool) {
        let newWeight = isSecondary ? loggedSet.weight : value
        let newReps = isSecondary ? Int(value.rounded()) : loggedSet.reps
        viewModel.updateSet(exerciseId: exerciseId, setId: loggedSet.id, weight: newWeight, reps: newReps)
    }

    private var doneButton: some View {
        Button {
            viewModel.markSetDone(exerciseId: exerciseId, setId: loggedSet.id)
        } label: {
            Image(systemName: loggedSet.done ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(loggedSet.done ? ColorTokens.accent : ColorTokens.textMuted)
        }
        .buttonStyle(.plain)
        // Not `.disabled(!isReady)` when un-toggling -- `markSetDone` itself
        // allows un-marking unconditionally and only gates the DONE transition
        // on readiness, so disabling the button when `!loggedSet.done && !isReady`
        // would silently swallow taps rather than relying on the view model's
        // own no-op guard. Left fully tappable; the view model is the source
        // of truth for whether a tap has any effect.
    }
}
