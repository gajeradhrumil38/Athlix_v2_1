import SwiftUI
import AthlixCore

struct PRBannerView: View {
    let personalRecords: [PersonalRecord]

    private var thisWeeksRecords: [PersonalRecord] {
        let calendar = Calendar.current
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return personalRecords.filter { record in
            guard let date = formatter.date(from: record.achievedDate) else { return false }
            return calendar.isDate(date, equalTo: Date(), toGranularity: .weekOfYear)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "trophy.fill")
                    .foregroundStyle(ColorTokens.prGold)
                Text("This Week's PRs")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.prGold)
            }
            if thisWeeksRecords.isEmpty {
                Text("No new PRs this week yet.")
                    .font(.footnote)
                    .foregroundStyle(ColorTokens.textSecondary)
            } else {
                ForEach(thisWeeksRecords) { record in
                    Text("\(record.exerciseName): \(Int(record.bestWeight)) lbs x \(record.bestReps)")
                        .font(.footnote)
                        .foregroundStyle(ColorTokens.textPrimary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(ColorTokens.prGold.opacity(0.1))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ColorTokens.prGold.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
