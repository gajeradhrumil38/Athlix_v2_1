import SwiftUI
import AthlixCore

struct WeeklyGoalRingView: View {
    let trainedDays: Int
    let goalDays: Int
    let weekDays: [WeekDayInfo]
    var onEditGoal: () -> Void = {}

    @State private var animatedProgress: Double = 0
    @State private var pulse = false

    private var progress: Double {
        guard goalDays > 0 else { return 0 }
        return min(Double(trainedDays) / Double(goalDays), 1.0)
    }

    private static let dayLetterFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEEEE" // single-letter weekday (M, T, W, T, F, S, S)
        return formatter
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Title + Edit button row, matching Home.tsx:605-612 — only the Edit
            // button (not the whole card) triggers the goal-edit sheet.
            HStack {
                Text("WEEKLY GOAL")
                    .font(.system(size: 9, weight: .bold))
                    .tracking(1.5)
                    .foregroundStyle(ColorTokens.textSecondary)
                Spacer()
                Button {
                    onEditGoal()
                } label: {
                    Text("Edit")
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundStyle(ColorTokens.accent)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 8)

            // Header: trained/goal count + percentage, matching WeeklyRing.tsx lines 15-21.
            HStack(alignment: .lastTextBaseline) {
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("\(trainedDays)")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(ColorTokens.textPrimary)
                    Text("/ \(goalDays) days")
                        .font(.system(size: 11))
                        .foregroundStyle(ColorTokens.textSecondary)
                }
                Spacer()
                Text("\(Int((progress * 100).rounded()))%")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(ColorTokens.accent)
            }
            .padding(.bottom, 8)

            // Linear progress bar.
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 999)
                        .fill(ColorTokens.bgElevated)
                        .overlay(
                            RoundedRectangle(cornerRadius: 999)
                                .stroke(ColorTokens.border, lineWidth: 1)
                        )
                    RoundedRectangle(cornerRadius: 999)
                        .fill(ColorTokens.accent)
                        .frame(width: geo.size.width * animatedProgress)
                }
            }
            .frame(height: 12)
            .padding(.bottom, 16)
            .onAppear {
                withAnimation(.easeOut(duration: 1.0)) {
                    animatedProgress = progress
                }
            }
            .onChange(of: progress) { _, newValue in
                withAnimation(.easeOut(duration: 1.0)) {
                    animatedProgress = newValue
                }
            }

            // 7-day bar chart.
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(Array(weekDays.enumerated()), id: \.offset) { _, day in
                    VStack(spacing: 8) {
                        GeometryReader { geo in
                            VStack {
                                Spacer(minLength: 0)
                                dayBar(for: day)
                                    .frame(height: geo.size.height * barHeightFraction(for: day.status))
                            }
                        }
                        Text(Self.dayLetterFormatter.string(from: day.date))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(ColorTokens.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 96)
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onAppear {
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    private func barHeightFraction(for status: WeekDayStatus) -> CGFloat {
        switch status {
        case .trained, .todayTrained: return 1.0
        case .rest, .todayRest: return 0.3
        case .future: return 0.2
        }
    }

    @ViewBuilder
    private func dayBar(for day: WeekDayInfo) -> some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        switch day.status {
        case .trained:
            shape
                .fill(ColorTokens.accent)
                .shadow(color: ColorTokens.accentGlow, radius: 8)
        case .rest:
            shape
                .fill(ColorTokens.bgElevated)
                .overlay(shape.stroke(ColorTokens.border, lineWidth: 1))
        case .todayTrained:
            shape
                .fill(ColorTokens.accent)
                .shadow(color: ColorTokens.accentGlow, radius: 8)
                .scaleEffect(pulse ? 1.04 : 0.96)
                .opacity(pulse ? 1.0 : 0.75)
        case .todayRest:
            shape
                .fill(Color.clear)
                .overlay(
                    shape.stroke(
                        ColorTokens.accent.opacity(0.5),
                        style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                    )
                )
        case .future:
            shape
                .fill(Color.clear)
                .overlay(shape.stroke(ColorTokens.border, lineWidth: 1))
        }
    }
}
