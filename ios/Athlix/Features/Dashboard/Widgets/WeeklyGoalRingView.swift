import SwiftUI
import AthlixCore

struct WeeklyGoalRingView: View {
    let completedSets: Int
    let goalSets: Int

    private var progress: Double {
        guard goalSets > 0 else { return 0 }
        return min(Double(completedSets) / Double(goalSets), 1.0)
    }

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .stroke(ColorTokens.border, lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(ColorTokens.accent, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(Int(progress * 100))%")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ColorTokens.textPrimary)
            }
            .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 2) {
                Text("Weekly Goal")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textSecondary)
                Text("\(completedSets) / \(goalSets) sets")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
            }
            Spacer()
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
