import SwiftUI
import AthlixCore

/// Native wheel-picker replacement for the web app's custom 3D "cylinder" dial picker.
/// Presented as a sheet when a user taps a set's value box to enter/edit weight, reps,
/// distance, time, etc.
struct SetValuePicker: View {
    let kind: DialFieldKind
    let isRepsOnlyContext: Bool
    let isTimeOnlyContext: Bool
    let initialValue: Double
    /// Unit suffix shown alongside the title, e.g. "kg", "mi". Populated by the caller via
    /// `ExerciseTypeLabels.unitDisplay(for:weightUnit:distanceUnit:)`. Empty for kinds where
    /// a unit doesn't apply (reps, height, calories).
    let unitLabel: String
    let onConfirm: (Double) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var wholeSelection: Int
    @State private var decimalSelection: Int

    /// Values for the weight decimal column: tag 0 -> ".0", tag 5 -> ".5".
    private static let weightDecimalOptions = [0, 5]

    init(
        kind: DialFieldKind,
        isRepsOnlyContext: Bool,
        isTimeOnlyContext: Bool,
        initialValue: Double,
        unitLabel: String = "",
        onConfirm: @escaping (Double) -> Void
    ) {
        self.kind = kind
        self.isRepsOnlyContext = isRepsOnlyContext
        self.isTimeOnlyContext = isTimeOnlyContext
        self.initialValue = initialValue
        self.unitLabel = unitLabel
        self.onConfirm = onConfirm

        // Seed wheel positions in `init` rather than `onAppear`: if a future caller presents
        // this via `.sheet(item:)` with an `Identifiable` wrapper whose `id` doesn't change
        // between two edits, SwiftUI treats it as the same view identity and `onAppear` won't
        // re-fire, leaving stale wheel positions from the previous edit. Seeding `@State` in
        // `init` makes correctness independent of presentation-lifecycle timing.
        let range = Self.wholeRange(for: kind, isRepsOnlyContext: isRepsOnlyContext, isTimeOnlyContext: isTimeOnlyContext)
        let (whole, decimal) = Self.initialSelections(for: kind, initialValue: initialValue, wholeRange: range)
        _wholeSelection = State(initialValue: whole)
        _decimalSelection = State(initialValue: decimal)
    }

    private static func wholeRange(for kind: DialFieldKind, isRepsOnlyContext: Bool, isTimeOnlyContext: Bool) -> [Int] {
        switch kind {
        case .weight: return Array(0...500)
        case .distance: return Array(0...200)
        case .minutes: return Array(0...(isTimeOnlyContext ? 120 : 180))
        case .seconds: return stride(from: 0, through: 55, by: 5).map { $0 }
        case .reps: return Array(isRepsOnlyContext ? 1...50 : 0...80)
        case .height: return Array(0...250)
        case .calories: return stride(from: 0, through: 300, by: 5).map { $0 }
        }
    }

    /// Computes the initial whole/decimal wheel selections for a given `initialValue`,
    /// snapping to the nearest valid option per `DialFieldKind` rather than assuming the
    /// value lands exactly on a valid tag.
    private static func initialSelections(for kind: DialFieldKind, initialValue: Double, wholeRange: [Int]) -> (whole: Int, decimal: Int) {
        var whole = min(max(Int(initialValue.rounded(.down)), wholeRange.first ?? 0), wholeRange.last ?? 0)
        var decimal = 0

        switch kind {
        case .weight:
            // Snap to the nearest valid option (.0 or .5).
            let fraction = initialValue - initialValue.rounded(.down)
            decimal = fraction < 0.25 ? 0 : 5
            if fraction >= 0.75 {
                // e.g. 72.9 rounds up to 73.0 rather than snapping to 72.5.
                whole = min(whole + 1, wholeRange.last ?? whole)
                decimal = 0
            }
        case .distance:
            let fraction = initialValue - initialValue.rounded(.down)
            decimal = Int((fraction * 10).rounded())
            if decimal > 9 {
                decimal = 0
                whole = min(whole + 1, wholeRange.last ?? whole)
            }
        case .seconds, .calories:
            // Round to the nearest multiple of 5 rather than flooring to it.
            let nearest = Int((initialValue / 5).rounded()) * 5
            whole = min(max(nearest, wholeRange.first ?? 0), wholeRange.last ?? 0)
        case .minutes, .reps, .height:
            break
        }

        return (whole, decimal)
    }

    private var wholeRange: [Int] {
        Self.wholeRange(for: kind, isRepsOnlyContext: isRepsOnlyContext, isTimeOnlyContext: isTimeOnlyContext)
    }

    private var hasDecimalColumn: Bool { kind == .weight || kind == .distance }

    private var wholeColumnLabel: String {
        switch kind {
        case .weight: return "Weight, whole number"
        case .distance: return "Distance, whole number"
        case .minutes: return "Minutes"
        case .seconds: return "Seconds"
        case .reps: return "Reps"
        case .height: return "Height, whole number"
        case .calories: return "Calories"
        }
    }

    private var decimalColumnLabel: String {
        kind == .weight ? "Weight, fraction" : "Distance, fraction"
    }

    /// Composes the final value from the current wheel selections. `.weight`/`.distance`
    /// combine a whole column with a decimal column; every other kind's whole-column
    /// selection already IS the value (including `.seconds`/`.calories`, which are stepped
    /// by 5 in `wholeRange`).
    private var composedValue: Double {
        switch kind {
        case .weight, .distance:
            return Double(wholeSelection) + Double(decimalSelection) / 10
        case .minutes, .reps, .height, .seconds, .calories:
            return Double(wholeSelection)
        }
    }

    var body: some View {
        VStack(spacing: 16) {
            Text(title)
                .font(.headline)
                .foregroundStyle(ColorTokens.textPrimary)

            HStack(spacing: 0) {
                Picker("", selection: $wholeSelection) {
                    ForEach(wholeRange, id: \.self) { value in
                        Text("\(value)").tag(value)
                    }
                }
                .pickerStyle(.wheel)
                .accessibilityLabel(wholeColumnLabel)

                if hasDecimalColumn {
                    Picker("", selection: $decimalSelection) {
                        if kind == .weight {
                            ForEach(Self.weightDecimalOptions, id: \.self) { value in
                                Text(value == 0 ? ".0" : ".5").tag(value)
                            }
                        } else {
                            ForEach(0...9, id: \.self) { value in
                                Text(".\(value)").tag(value)
                            }
                        }
                    }
                    .pickerStyle(.wheel)
                    .accessibilityLabel(decimalColumnLabel)
                }
            }
            .frame(maxHeight: 180)

            Button("Set") {
                onConfirm(composedValue)
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .tint(ColorTokens.accent)
            .frame(minHeight: 44)
        }
        .padding()
        .background(ColorTokens.bgElevated)
    }

    private var title: String {
        let base: String
        switch kind {
        case .weight: base = "Weight"
        case .reps: base = "Reps"
        case .distance: base = "Distance"
        case .minutes: base = "Minutes"
        case .seconds: base = "Seconds"
        case .height: base = "Height"
        case .calories: base = "Calories"
        }
        return unitLabel.isEmpty ? base : "\(base) (\(unitLabel))"
    }
}
