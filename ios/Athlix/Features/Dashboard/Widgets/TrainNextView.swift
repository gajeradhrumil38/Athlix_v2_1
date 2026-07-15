import SwiftUI
import AthlixCore

struct TrainNextView: View {
    let muscleIntensityBySlug: [String: Int]

    private var suggestedRegion: String {
        let regions = ["Chest", "Back", "Legs", "Shoulders", "Core"]
        let slugsByRegion: [String: [String]] = [
            "Chest": ["chest"], "Back": ["upper-back", "lower-back", "trapezius"],
            "Legs": ["quadriceps", "hamstring", "calves", "gluteal"],
            "Shoulders": ["deltoids"], "Core": ["abs", "obliques"],
        ]
        let scored = regions.map { region -> (String, Int) in
            let slugs = slugsByRegion[region] ?? []
            let maxIntensity = slugs.compactMap { muscleIntensityBySlug[$0] }.max() ?? 0
            return (region, maxIntensity)
        }
        return scored.min { $0.1 < $1.1 }?.0 ?? "Core"
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "bolt.fill")
                .foregroundStyle(ColorTokens.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("Train Next")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textSecondary)
                Text(suggestedRegion)
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
