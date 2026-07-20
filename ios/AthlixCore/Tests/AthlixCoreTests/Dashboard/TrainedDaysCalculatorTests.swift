import XCTest
@testable import AthlixCore

final class TrainedDaysCalculatorTests: XCTestCase {

    // MARK: - Genuine mix of trained/rest/future within a real, hand-verified week

    // Week of 2026-07-13 (Mon) ... 2026-07-19 (Sun), hand-verified:
    // 2026-07-13 Monday, 2026-07-14 Tuesday, 2026-07-15 Wednesday,
    // 2026-07-16 Thursday, 2026-07-17 Friday, 2026-07-18 Saturday, 2026-07-19 Sunday.
    func testGenuineMixOfTrainedRestFutureWithinRealWeek() {
        let currentDate = day(2026, 7, 14) // Tuesday, mid-week reference date
        let today = day(2026, 7, 16)       // Thursday
        let workoutDates: Set<String> = ["2026-07-13", "2026-07-15", "2026-07-16"]

        let result = TrainedDaysCalculator.weekDays(containing: currentDate, workoutDates: workoutDates, today: today)

        XCTAssertEqual(result.count, 7)
        XCTAssertEqual(result[0].status, .trained)     // Mon 07-13, before today, has workout
        XCTAssertEqual(result[1].status, .rest)        // Tue 07-14, before today, no workout
        XCTAssertEqual(result[2].status, .trained)     // Wed 07-15, before today, has workout
        XCTAssertEqual(result[3].status, .todayTrained) // Thu 07-16 = today, has workout
        XCTAssertEqual(result[4].status, .future)      // Fri 07-17
        XCTAssertEqual(result[5].status, .future)      // Sat 07-18
        XCTAssertEqual(result[6].status, .future)      // Sun 07-19

        XCTAssertEqual(result[0].date, day(2026, 7, 13))
        XCTAssertEqual(result[6].date, day(2026, 7, 19))
    }

    // MARK: - Week-start resolves correctly regardless of which weekday currentDate falls on

    func testWeekStartResolvesToMondayWhenCurrentDateIsWednesday() {
        let currentDate = day(2026, 7, 15) // Wednesday
        let today = day(2026, 7, 15)
        let result = TrainedDaysCalculator.weekDays(containing: currentDate, workoutDates: [], today: today)

        XCTAssertEqual(result.first?.date, day(2026, 7, 13)) // Monday
        XCTAssertEqual(result.last?.date, day(2026, 7, 19))  // Sunday
    }

    func testWeekStartResolvesToPrecedingMondayWhenCurrentDateIsSunday() {
        // Sunday is the LAST day of a Monday-start week, not the first —
        // the trickiest case for off-by-one errors in the weekday-offset math.
        let currentDate = day(2026, 7, 19) // Sunday
        let today = day(2026, 7, 19)
        let result = TrainedDaysCalculator.weekDays(containing: currentDate, workoutDates: [], today: today)

        XCTAssertEqual(result.first?.date, day(2026, 7, 13)) // Monday (6 days before)
        XCTAssertEqual(result.last?.date, day(2026, 7, 19))  // Sunday itself, as last entry
    }

    // MARK: - Today status

    func testTodayWithWorkoutIsTodayTrained() {
        let today = day(2026, 7, 16)
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: ["2026-07-16"], today: today)
        let todayEntry = result.first { $0.date == today }
        XCTAssertEqual(todayEntry?.status, .todayTrained)
    }

    func testTodayWithoutWorkoutIsTodayRest() {
        let today = day(2026, 7, 16)
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: [], today: today)
        let todayEntry = result.first { $0.date == today }
        XCTAssertEqual(todayEntry?.status, .todayRest)
    }

    // MARK: - Future always wins, even with a matching "workout" entry

    func testFutureDayIsAlwaysFutureEvenWithMatchingWorkoutEntry() {
        let today = day(2026, 7, 16) // Thursday
        // Deliberately malformed test input: a workout date string that matches
        // a future day (2026-07-18, Saturday) exactly. The future check must win.
        let workoutDates: Set<String> = ["2026-07-18"]
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: workoutDates, today: today)

        let futureEntry = result.first { $0.date == day(2026, 7, 18) }
        XCTAssertEqual(futureEntry?.status, .future)
    }

    // MARK: - Past days

    func testPastDayWithoutWorkoutIsRest() {
        let today = day(2026, 7, 16)
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: [], today: today)
        let pastEntry = result.first { $0.date == day(2026, 7, 14) }
        XCTAssertEqual(pastEntry?.status, .rest)
    }

    func testPastDayWithWorkoutIsTrained() {
        let today = day(2026, 7, 16)
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: ["2026-07-14"], today: today)
        let pastEntry = result.first { $0.date == day(2026, 7, 14) }
        XCTAssertEqual(pastEntry?.status, .trained)
    }

    // MARK: - trainedDaysCount only counts .trained and .todayTrained

    func testTrainedDaysCountOnlyCountsTrainedAndTodayTrained() {
        let today = day(2026, 7, 16) // Thursday
        // Mon 07-13: trained (past, workout)
        // Tue 07-14: rest (past, no workout)
        // Wed 07-15: rest (past, no workout) -- kept distinct from Mon to avoid double-counting trained
        // Thu 07-16: today-trained (today, workout)
        // Fri 07-17: future
        // Sat 07-18: future
        // Sun 07-19: future
        let workoutDates: Set<String> = ["2026-07-13", "2026-07-16"]
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: workoutDates, today: today)

        // Sanity: all 5 statuses represented.
        let statuses = Set(result.map { $0.status })
        XCTAssertEqual(statuses, [.trained, .rest, .todayTrained, .future])
        // (today-rest isn't present in this fixture; verify separately that it's excluded from the count.)

        XCTAssertEqual(TrainedDaysCalculator.trainedDaysCount(result), 2)
    }

    func testTrainedDaysCountExcludesAllFiveStatusesButTrainedAndTodayTrained() {
        // Construct a week (using a different "today") with all five statuses present:
        // trained, rest, todayRest, future, and (from another day) todayTrained isn't
        // possible simultaneously with todayRest since there's only one "today" per week.
        // Instead, verify todayRest + rest + future contribute zero, using two separate
        // weeks to isolate todayTrained vs todayRest contributions.
        let today = day(2026, 7, 16) // Thursday, no workout today -> todayRest
        let workoutDates: Set<String> = ["2026-07-13"] // Mon trained
        let result = TrainedDaysCalculator.weekDays(containing: today, workoutDates: workoutDates, today: today)

        let statuses = Set(result.map { $0.status })
        XCTAssertEqual(statuses, [.trained, .rest, .todayRest, .future])
        XCTAssertEqual(TrainedDaysCalculator.trainedDaysCount(result), 1) // only the Monday .trained day
    }

    // MARK: - Helpers

    private func day(_ year: Int, _ month: Int, _ dayOfMonth: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = dayOfMonth
        return calendar.date(from: components)!
    }
}
