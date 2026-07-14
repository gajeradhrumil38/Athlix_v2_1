import XCTest
@testable import AthlixCore

final class WeightUnitTests: XCTestCase {
    func testConvertKgToLbs() {
        let result = WeightUnit.convert(20, from: .kg, to: .lbs)
        XCTAssertEqual(result, 44.09, accuracy: 0.01)
    }

    func testConvertLbsToKg() {
        let result = WeightUnit.convert(100, from: .lbs, to: .kg)
        XCTAssertEqual(result, 45.36, accuracy: 0.01)
    }

    func testConvertSameUnitIsNoOp() {
        XCTAssertEqual(WeightUnit.convert(60, from: .kg, to: .kg), 60)
    }

    func testFormatWeightRoundsToOneDecimal() {
        XCTAssertEqual(WeightUnit.format(44.09, unit: .lbs), "44.1 lbs")
        XCTAssertEqual(WeightUnit.format(20, unit: .kg), "20.0 kg")
    }

    func testConvertNonFiniteReturnsZero() {
        XCTAssertEqual(WeightUnit.convert(.infinity, from: .kg, to: .lbs), 0)
        XCTAssertEqual(WeightUnit.convert(.nan, from: .kg, to: .lbs), 0)
    }

    func testFormatUsesFixedLocaleDecimalSeparator() {
        // Regardless of the process's current locale, output must use "." as the decimal separator.
        XCTAssertEqual(WeightUnit.format(44.09, unit: .lbs), "44.1 lbs")
    }
}
