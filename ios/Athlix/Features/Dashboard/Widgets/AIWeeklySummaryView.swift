import SwiftUI
import AthlixCore

struct AIWeeklySummaryView: View {
    let trainedMuscleGroups: [String]

    // Ported verbatim from Home.tsx's ai_summary widget -- templated text,
    // no Gemini/AI API call. The web version's "Generate" button is also
    // presently non-functional, so this port matches that (no button here).
    private var summaryText: String {
        if trainedMuscleGroups.isEmpty {
            return "You haven't logged any workouts this week. Start a session to generate insights."
        }
        let groups = trainedMuscleGroups.joined(separator: ", ")
        return "You hit \(groups) this week. Consistency is key. Keep pushing your limits and ensure adequate recovery for optimal growth."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(ColorTokens.purple)
                Text("Weekly AI Summary")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.purple)
            }
            Text(summaryText)
                .font(.footnote)
                .foregroundStyle(ColorTokens.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(ColorTokens.purple.opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ColorTokens.purple.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
