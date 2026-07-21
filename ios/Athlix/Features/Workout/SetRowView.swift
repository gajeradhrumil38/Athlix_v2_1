import SwiftUI
import AthlixCore

/// One row per logged set within an exercise, mirroring web's `SetRow.tsx`
/// (the card: accent bar + header row + value boxes) plus `ExerciseContent.tsx`'s
/// `SetSeparator` (the always-visible Copy set / Remove row rendered directly
/// below each set).
///
/// OWNERSHIP DECISION: takes `viewModel` as a plain (non-`@Bindable`) reference
/// and calls its explicit id-based methods (`updateSet`/`markSetDone`/`copySet`/
/// `removeSet`) rather than binding directly into `viewModel.exercises[...]`.
/// `ActiveWorkoutViewModel` deliberately exposes `exercises` as `private(set)`
/// precisely so all mutation flows through its validated methods (readiness
/// gates, the 20-set cap, draft persistence) -- a raw `Binding` into the array
/// would bypass all of that. `ExerciseDetailView` follows the same pattern for
/// consistency.
///
/// LAYOUT OWNERSHIP: web renders the set's card and its `SetSeparator` (copy/
/// remove row) as two separate sibling elements inside `ExerciseContent`'s
/// `.map`. Here both are folded into this single view (`setCard` +
/// `SetSeparatorRow` stacked in `body`) rather than making the separator a
/// true sibling in `ExerciseDetailView`'s `ForEach` -- that would require
/// threading `exerciseId`/`loggedSet`/`viewModel` into a second view for no
/// benefit, since this view already owns everything the separator's actions
/// need. Visually the result is identical to web: a card, then a
/// divider-Copy-Remove-divider row, repeated per set.
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
    /// Gates the destructive remove behind a confirmation, matching web's
    /// `confirmRemoveIndex` modal in `ExerciseContent.tsx` ("Remove Set N? /
    /// This action cannot be undone."). Copy has no such gate on either
    /// platform -- it isn't destructive.
    @State private var showingRemoveConfirmation = false

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
        VStack(alignment: .leading, spacing: 10) {
            setCard
            SetSeparatorRow(
                onCopy: { viewModel.copySet(exerciseId: exerciseId, setId: loggedSet.id) },
                onRemove: { showingRemoveConfirmation = true }
            )
        }
        .alert("Remove Set \(index + 1)?", isPresented: $showingRemoveConfirmation) {
            Button("Remove", role: .destructive) {
                viewModel.removeSet(exerciseId: exerciseId, setId: loggedSet.id)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
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

    // MARK: - Card (accent bar + header row + value boxes)

    /// Mirrors web's `SetRow.tsx` outer `<div>`: `rounded-2xl` card, `bg-base`
    /// background, border tinted accent when done, with the `w-[3px]` accent
    /// bar along the leading edge.
    private var setCard: some View {
        HStack(spacing: 0) {
            accentBar
            VStack(alignment: .leading, spacing: 8) {
                headerRow
                valueBoxesRow
            }
            .padding(.top, 12)
            .padding(.bottom, 12)
            .padding(.horizontal, 12)
        }
        .background(ColorTokens.bgBase)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(loggedSet.done ? ColorTokens.accent.opacity(0.12) : ColorTokens.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var accentBar: some View {
        Rectangle()
            .fill(loggedSet.done ? ColorTokens.accent : ColorTokens.border)
            .frame(width: 3)
    }

    /// Web: "Set N" badge + Done/Target label on the left, checkmark button on
    /// the right -- a row ABOVE the value boxes, not inline with them at the
    /// row's trailing edge (that was the previous Swift layout's fidelity gap).
    private var headerRow: some View {
        HStack(spacing: 8) {
            setBadge
            if loggedSet.done {
                Text("DONE")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(ColorTokens.accent.opacity(0.70))
            } else if let hint = targetHint {
                Text(hint)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(ColorTokens.textMuted)
            }
            Spacer(minLength: 0)
            doneButton
        }
    }

    private var setBadge: some View {
        Text("SET \(index + 1)")
            .font(.system(size: 10, weight: .bold))
            .tracking(1.4)
            .foregroundStyle(loggedSet.done ? ColorTokens.accent : ColorTokens.textSecondary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(loggedSet.done ? Color.clear : ColorTokens.bgElevated)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(loggedSet.done ? ColorTokens.accent.opacity(0.28) : Color.clear, lineWidth: 1)
            )
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

    /// Web: `Check` icon (bare checkmark glyph, not circled), `h-10 w-10
    /// rounded-lg border`, accent-tinted when done, muted/elevated otherwise.
    private var doneButton: some View {
        Button {
            viewModel.markSetDone(exerciseId: exerciseId, setId: loggedSet.id)
        } label: {
            Image(systemName: "checkmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(loggedSet.done ? ColorTokens.accent : ColorTokens.textMuted)
                .frame(width: 40, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(loggedSet.done ? ColorTokens.accent.opacity(0.10) : ColorTokens.bgElevated)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(loggedSet.done ? ColorTokens.accent.opacity(0.50) : ColorTokens.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        // Not `.disabled(!isReady)` when un-toggling -- `markSetDone` itself
        // allows un-marking unconditionally and only gates the DONE transition
        // on readiness, so disabling the button when `!loggedSet.done && !isReady`
        // would silently swallow taps rather than relying on the view model's
        // own no-op guard. Left fully tappable; the view model is the source
        // of truth for whether a tap has any effect.
    }

    // MARK: - Value boxes

    /// Web: `grid-cols-2` when there's a secondary field, `grid-cols-1`
    /// otherwise -- an `HStack` of two `.frame(maxWidth: .infinity)` boxes
    /// achieves the same 50/50 split (or a single full-width box) in SwiftUI.
    private var valueBoxesRow: some View {
        HStack(spacing: 8) {
            valueBox(kind: fieldKinds.primary, label: labels.primary, value: primaryValue, isSecondary: false)
                .frame(maxWidth: .infinity)

            if let secondaryKind = fieldKinds.secondary {
                valueBox(kind: secondaryKind, label: labels.secondary ?? "", value: secondaryValue, isSecondary: true)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    /// Web's `ValueBox`: `h-[82px]` card, `w-[48px]` minus/plus buttons at
    /// each end (hairline dividers between them and the center tap area), a
    /// large center value (web: 34px/black; here: 28pt/black, the closest
    /// legible iOS-appropriate size) with the field label beneath it, and a
    /// step-amount subscript under each stepper glyph.
    private func valueBox(kind: DialFieldKind, label: String, value: Double, isSecondary: Bool) -> some View {
        HStack(spacing: 0) {
            stepperButton(systemName: "minus", kind: kind, isSecondary: isSecondary, delta: -stepSize(for: kind), tint: ColorTokens.textMuted)

            Rectangle().fill(Color.white.opacity(0.05)).frame(width: 1)

            Button {
                editTarget = EditTarget(isSecondary: isSecondary)
            } label: {
                VStack(spacing: 3) {
                    Text(ExerciseTypeLabels.formatSetValue(kind: kind, value: value))
                        .font(.system(size: 28, weight: .black))
                        .monospacedDigit()
                        .foregroundStyle(ColorTokens.textPrimary)
                    Text(label)
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.6)
                        .foregroundStyle(ColorTokens.textSecondary)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            Rectangle().fill(Color.white.opacity(0.05)).frame(width: 1)

            stepperButton(systemName: "plus", kind: kind, isSecondary: isSecondary, delta: stepSize(for: kind), tint: ColorTokens.accent)
        }
        .frame(height: 82)
        .background(ColorTokens.bgBase)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(loggedSet.done ? ColorTokens.accent.opacity(0.12) : ColorTokens.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func stepperButton(systemName: String, kind: DialFieldKind, isSecondary: Bool, delta: Double, tint: Color) -> some View {
        Button {
            let current = isSecondary ? secondaryValue : primaryValue
            let next = max(0, current + delta)
            applyValue(next, isSecondary: isSecondary)
        } label: {
            VStack(spacing: 2) {
                Image(systemName: systemName)
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(tint)
                Text(stepLabel(for: abs(delta)))
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(tint.opacity(0.5))
            }
            .frame(width: 48, height: 82)
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

    /// Formats a step size for the subscript label under each stepper glyph
    /// (e.g. "1.25", "2.5", "1", "0.1", "5"), matching web's plain
    /// `${step}`-style rendering without an unnecessary trailing ".0"/".00".
    private func stepLabel(for step: Double) -> String {
        let rounded = (step * 100).rounded() / 100
        if rounded == rounded.rounded() {
            return String(Int(rounded))
        }
        var text = String(format: "%.2f", rounded)
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
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
}

/// Always-visible copy/remove affordance rendered directly below every set
/// card, mirroring web's `SetSeparator` in `ExerciseContent.tsx`: a hairline
/// divider, a "Copy set" button, a "Remove" button, another hairline divider.
/// Deliberately NOT a `.swipeActions`/swipe-to-reveal treatment -- the user's
/// screenshots of web show these buttons permanently visible under each set,
/// so that's what's matched here rather than substituting a hidden iOS
/// pattern for a visible web one.
private struct SetSeparatorRow: View {
    let onCopy: () -> Void
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1)

            Button(action: onCopy) {
                HStack(spacing: 6) {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Copy set")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(ColorTokens.textMuted)
                .padding(.horizontal, 12)
                .frame(height: 28)
                .background(ColorTokens.bgElevated)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(Color.white.opacity(0.08), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Button(action: onRemove) {
                HStack(spacing: 6) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                    Text("Remove")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(ColorTokens.red.opacity(0.7))
                .padding(.horizontal, 12)
                .frame(height: 28)
                .background(ColorTokens.red.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .strokeBorder(ColorTokens.red.opacity(0.15), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1)
        }
    }
}
