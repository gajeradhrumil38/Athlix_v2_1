import Foundation

public enum StreakCalculator {
    /// Counts consecutive training days ending today or yesterday; any gap
    /// stops the count.
    public static func calculateStreak(workoutDates: [Date], today: Date) -> Int {
        guard !workoutDates.isEmpty else { return 0 }

        let calendar = Calendar.current
        let todayStart = calendar.startOfDay(for: today)
        let uniqueDays = Set(workoutDates.map { calendar.startOfDay(for: $0) })
            .sorted(by: >)

        guard let latest = uniqueDays.first else { return 0 }

        var streak = 0
        var cursor: Date

        if latest == todayStart {
            streak = 1
            cursor = calendar.date(byAdding: .day, value: -1, to: todayStart)!
        } else if let yesterday = calendar.date(byAdding: .day, value: -1, to: todayStart), latest == yesterday {
            cursor = yesterday
        } else {
            return 0
        }

        let remaining = uniqueDays.first == todayStart ? Array(uniqueDays.dropFirst()) : uniqueDays

        for day in remaining {
            if day == cursor {
                streak += 1
                cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
            } else if day > cursor {
                continue
            } else {
                break
            }
        }

        return streak
    }
}
