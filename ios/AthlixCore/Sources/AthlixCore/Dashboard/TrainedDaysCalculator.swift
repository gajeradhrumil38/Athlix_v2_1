import Foundation

public enum WeekDayStatus: Equatable, Sendable {
    case trained
    case rest
    case todayTrained
    case todayRest
    case future
}

public struct WeekDayInfo: Equatable, Sendable {
    public let date: Date
    public let status: WeekDayStatus
    public init(date: Date, status: WeekDayStatus) {
        self.date = date
        self.status = status
    }
}

public enum TrainedDaysCalculator {
    /// Matches web's Monday-start week (startOfWeek(currentDate, {weekStartsOn: 1})).
    /// `workoutDates` are ISO "yyyy-MM-dd" strings (UTC-anchored, matching this
    /// codebase's established date-formatting convention elsewhere).
    public static func weekDays(containing date: Date, workoutDates: Set<String>, today: Date = Date()) -> [WeekDayInfo] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!

        let todayStart = calendar.startOfDay(for: today)
        let dateStart = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: dateStart) // 1 = Sunday ... 7 = Saturday
        let daysFromMonday = (weekday + 5) % 7 // Sunday(1)->6, Monday(2)->0, Tuesday(3)->1, ..., Saturday(7)->5
        let weekStart = calendar.date(byAdding: .day, value: -daysFromMonday, to: dateStart) ?? dateStart

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(identifier: "UTC")!

        return (0..<7).compactMap { offset -> WeekDayInfo? in
            guard let day = calendar.date(byAdding: .day, value: offset, to: weekStart) else { return nil }
            let dayStr = formatter.string(from: day)
            let isToday = calendar.isDate(day, inSameDayAs: todayStart)
            let isFuture = day > todayStart && !isToday
            let hasWorkout = workoutDates.contains(dayStr)

            let status: WeekDayStatus
            if isToday {
                status = hasWorkout ? .todayTrained : .todayRest
            } else if isFuture {
                status = .future
            } else {
                status = hasWorkout ? .trained : .rest
            }
            return WeekDayInfo(date: day, status: status)
        }
    }

    public static func trainedDaysCount(_ days: [WeekDayInfo]) -> Int {
        days.filter { $0.status == .trained || $0.status == .todayTrained }.count
    }
}
