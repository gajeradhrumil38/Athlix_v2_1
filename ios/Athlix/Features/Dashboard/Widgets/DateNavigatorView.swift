import SwiftUI
import AthlixCore

struct DateNavigatorView: View {
    @Binding var currentDate: Date
    @Binding var viewMode: DashboardViewMode

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    shiftDate(by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                }
                Spacer()
                Text(formattedRange)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                Spacer()
                Button {
                    shiftDate(by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                }
            }
            .foregroundStyle(ColorTokens.textSecondary)

            Picker("View", selection: $viewMode) {
                Text("Day").tag(DashboardViewMode.day)
                Text("Week").tag(DashboardViewMode.week)
                Text("Month").tag(DashboardViewMode.month)
            }
            .pickerStyle(.segmented)
        }
        .padding(10)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var formattedRange: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: currentDate)
    }

    private func shiftDate(by amount: Int) {
        let unit: Calendar.Component = {
            switch viewMode {
            case .day: return .day
            case .week: return .weekOfYear
            case .month: return .month
            }
        }()
        currentDate = Calendar.current.date(byAdding: unit, value: amount, to: currentDate) ?? currentDate
    }
}

enum DashboardViewMode: Hashable {
    case day, week, month
}
