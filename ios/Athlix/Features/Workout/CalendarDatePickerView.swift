import SwiftUI
import AthlixCore

/// Simple month-grid date picker sheet, used by `ActiveWorkoutView`'s calendar
/// icon to move a session's date. Built entirely from `Calendar.current`
/// primitives -- no external calendar library, per the task's explicit
/// instruction.
///
/// Future dates are disabled directly in the UI (in addition to
/// `ActiveWorkoutViewModel.changeDate`'s own rejection) for a proactively
/// better UX: the user sees the constraint instead of tapping a day and
/// getting silently bounced.
struct CalendarDatePickerView: View {
    let selectedDate: Date
    let onSelect: (Date) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var displayedMonth: Date

    private let calendar = Calendar.current
    private static let weekdaySymbols = ["S", "M", "T", "W", "T", "F", "S"]

    init(selectedDate: Date, onSelect: @escaping (Date) -> Void) {
        self.selectedDate = selectedDate
        self.onSelect = onSelect
        _displayedMonth = State(initialValue: selectedDate)
    }

    private var today: Date { Date() }

    /// True when `displayedMonth` and today's month are the same -- next-month
    /// navigation is disabled once we're viewing the current month, so the
    /// user can never navigate into a future month.
    private var isCurrentMonth: Bool {
        calendar.isDate(displayedMonth, equalTo: today, toGranularity: .month)
    }

    private var monthTitle: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: displayedMonth)
    }

    /// Builds a flat grid of optional `Date`s for the displayed month: `nil`
    /// entries pad the leading days before the 1st (so the grid always starts
    /// on Sunday), and the grid length is always a multiple of 7.
    private var gridDays: [Date?] {
        guard
            let monthInterval = calendar.dateInterval(of: .month, for: displayedMonth),
            let range = calendar.range(of: .day, in: .month, for: displayedMonth)
        else { return [] }

        let firstOfMonth = monthInterval.start
        let firstWeekday = calendar.component(.weekday, from: firstOfMonth) // 1 = Sunday
        let leadingBlanks = firstWeekday - 1

        var days: [Date?] = Array(repeating: nil, count: leadingBlanks)
        for day in range {
            var components = calendar.dateComponents([.year, .month], from: firstOfMonth)
            components.day = day
            if let date = calendar.date(from: components) {
                days.append(date)
            }
        }

        while days.count % 7 != 0 {
            days.append(nil)
        }
        return days
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                monthHeader

                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 8) {
                    ForEach(Self.weekdaySymbols.indices, id: \.self) { idx in
                        Text(Self.weekdaySymbols[idx])
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ColorTokens.textMuted)
                            .frame(maxWidth: .infinity)
                    }

                    ForEach(Array(gridDays.enumerated()), id: \.offset) { _, date in
                        dayCell(date)
                    }
                }

                Spacer()
            }
            .padding(16)
            .background(ColorTokens.bgBase)
            .navigationTitle("Change Date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var monthHeader: some View {
        HStack {
            Button {
                if let prev = calendar.date(byAdding: .month, value: -1, to: displayedMonth) {
                    displayedMonth = prev
                }
            } label: {
                Image(systemName: "chevron.left")
                    .foregroundStyle(ColorTokens.textSecondary)
            }

            Spacer()

            Text(monthTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ColorTokens.textPrimary)

            Spacer()

            Button {
                if let next = calendar.date(byAdding: .month, value: 1, to: displayedMonth) {
                    displayedMonth = next
                }
            } label: {
                Image(systemName: "chevron.right")
                    .foregroundStyle(isCurrentMonth ? ColorTokens.textMuted : ColorTokens.textSecondary)
            }
            .disabled(isCurrentMonth)
        }
    }

    @ViewBuilder
    private func dayCell(_ date: Date?) -> some View {
        if let date {
            let isFuture = calendar.compare(date, to: today, toGranularity: .day) == .orderedDescending
            let isSelected = calendar.isDate(date, inSameDayAs: selectedDate)
            let isToday = calendar.isDate(date, inSameDayAs: today)

            Button {
                onSelect(date)
                dismiss()
            } label: {
                Text("\(calendar.component(.day, from: date))")
                    .font(.subheadline.weight(isSelected ? .bold : .regular))
                    .foregroundStyle(
                        isFuture ? ColorTokens.textMuted.opacity(0.4)
                            : isSelected ? ColorTokens.bgBase
                            : ColorTokens.textPrimary
                    )
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(isSelected ? ColorTokens.accent : Color.clear)
                    )
                    .overlay(
                        Circle()
                            .strokeBorder(isToday && !isSelected ? ColorTokens.accent.opacity(0.6) : .clear, lineWidth: 1)
                    )
            }
            .disabled(isFuture)
        } else {
            Color.clear
                .frame(width: 36, height: 36)
        }
    }
}
