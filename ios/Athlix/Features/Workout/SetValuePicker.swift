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
    let onConfirm: (Double) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var wholeSelection: Int = 0
    @State private var decimalSelection: Int = 0

    /// Values for the weight decimal column: tag 0 -> ".0", tag 5 -> ".5".
    private static let weightDecimalOptions = [0, 5]

    private var wholeRange: [Int] {
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

    /// Composes the final value from the current wheel selections. Each `DialFieldKind`
    /// has its own composition rule: `.seconds` and `.calories` selections already ARE
    /// the value (stepped by 5), `.weight`/`.distance` combine a whole column with a
    /// decimal column, and the remaining kinds are plain integers.
    private var composedValue: Double {
        switch kind {
        case .weight:
            return Double(wholeSelection) + Double(decimalSelection) / 10
        case .distance:
            return Double(wholeSelection) + Double(decimalSelection) / 10
        case .seconds, .calories:
            return Double(wholeSelection)
        case .minutes, .reps, .height:
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
        .onAppear {
            wholeSelection = min(max(Int(initialValue.rounded(.down)), wholeRange.first ?? 0), wholeRange.last ?? 0)
            if kind == .weight {
                // Snap to the nearest valid option (.0 or .5) rather than assuming the
                // initial value lands exactly on a valid tag.
                let fraction = initialValue - initialValue.rounded(.down)
                decimalSelection = fraction < 0.25 ? 0 : 5
                if fraction >= 0.75 {
                    // e.g. 72.9 rounds up to 73.0 rather than snapping to 72.5.
                    wholeSelection = min(wholeSelection + 1, wholeRange.last ?? wholeSelection)
                    decimalSelection = 0
                }
            } else if kind == .distance {
                let fraction = initialValue - initialValue.rounded(.down)
                decimalSelection = Int((fraction * 10).rounded())
                if decimalSelection > 9 {
                    decimalSelection = 0
                    wholeSelection = min(wholeSelection + 1, wholeRange.last ?? wholeSelection)
                }
            } else if kind == .seconds || kind == .calories {
                // Snap to nearest valid 5-step value already covered by wholeRange clamp above,
                // but round to the nearest multiple of 5 rather than flooring to it.
                let nearest = Int((initialValue / 5).rounded()) * 5
                wholeSelection = min(max(nearest, wholeRange.first ?? 0), wholeRange.last ?? 0)
            }
        }
    }

    private var title: String {
        switch kind {
        case .weight: return "Weight"
        case .reps: return "Reps"
        case .distance: return "Distance"
        case .minutes: return "Minutes"
        case .seconds: return "Seconds"
        case .height: return "Height"
        case .calories: return "Calories"
        }
    }
}
