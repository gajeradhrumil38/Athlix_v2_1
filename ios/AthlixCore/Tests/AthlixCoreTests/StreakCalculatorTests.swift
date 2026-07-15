import XCTest
@testable import AthlixCore

final class StreakCalculatorTests: XCTestCase {
    func testEmptyWorkoutsReturnsZeroStreak() {
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: [], today: fixedDate()), 0)
    }

    func testConsecutiveDaysEndingTodayCountsFullStreak() {
        let today = fixedDate()
        let dates = [today, dayBefore(today, 1), dayBefore(today, 2)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 3)
    }

    func testStreakEndingYesterdayStillCounts() {
        let today = fixedDate()
        let dates = [dayBefore(today, 1), dayBefore(today, 2)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 2)
    }

    func testGapBreaksStreak() {
        let today = fixedDate()
        let dates = [dayBefore(today, 2)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 0)
    }

    func testGapInMiddleStopsCountingAtGap() {
        let today = fixedDate()
        let dates = [today, dayBefore(today, 1), dayBefore(today, 3)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 2)
    }

    private func fixedDate() -> Date {
        var components = DateComponents()
        components.year = 2026; components.month = 7; components.day = 14
        return Calendar.current.date(from: components)!
    }

    private func dayBefore(_ date: Date, _ days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: -days, to: date)!
    }
}
