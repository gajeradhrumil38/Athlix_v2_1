import XCTest
@testable import AthlixCore

final class MuscleIntensityTests: XCTestCase {
    func testZeroLoadReturnsZeroIntensity() {
        XCTAssertEqual(MuscleIntensity.tier(load: 0, maxLoad: 100), 0)
    }

    func testZeroMaxLoadReturnsZeroIntensity() {
        XCTAssertEqual(MuscleIntensity.tier(load: 50, maxLoad: 0), 0)
    }

    func testHighRatioReturnsTierFour() {
        XCTAssertEqual(MuscleIntensity.tier(load: 80, maxLoad: 100), 4)
    }

    func testMidRatioReturnsTierThree() {
        XCTAssertEqual(MuscleIntensity.tier(load: 50, maxLoad: 100), 3)
    }

    func testLowRatioReturnsTierTwo() {
        XCTAssertEqual(MuscleIntensity.tier(load: 20, maxLoad: 100), 2)
    }

    func testVeryLowRatioReturnsTierOne() {
        XCTAssertEqual(MuscleIntensity.tier(load: 5, maxLoad: 100), 1)
    }
}
