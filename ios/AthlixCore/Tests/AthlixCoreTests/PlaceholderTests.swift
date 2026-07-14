import XCTest
@testable import AthlixCore

final class PlaceholderTests: XCTestCase {
    func testVersionIsSet() {
        XCTAssertEqual(AthlixCore.version, "0.1.0")
    }
}
