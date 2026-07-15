import XCTest
import SwiftUI
@testable import AthlixCore

final class SVGPathParserTests: XCTestCase {
    func testParsesSimpleMoveAndLine() {
        let path = SVGPathParser.parse("M10 10L20 20L10 20Z")
        let bounds = path.boundingRect
        XCTAssertEqual(bounds.minX, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 20, accuracy: 0.01)
        XCTAssertEqual(bounds.minY, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxY, 20, accuracy: 0.01)
    }

    func testParsesRelativeMoveAndLine() {
        let path = SVGPathParser.parse("m10 10l10 0l0 10z")
        let bounds = path.boundingRect
        XCTAssertEqual(bounds.minX, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 20, accuracy: 0.01)
    }

    func testParsesRealChestPathLeftSide() {
        let path = SVGPathParser.parse(
            "M272.91 422.84c-18.95-17.19-22-57-12.64-78.79 5.57-12.99 26.54-24.37 39.97-25.87q20.36-2.26 37.02.75c9.74 1.76 16.13 15.64 18.41 25.04 3.99 16.48 3.23 31.38 1.67 48.06q-1.35 14.35-2.05 16.89c-6.52 23.5-38.08 29.23-58.28 24.53-9.12-2.12-17.24-4.38-24.1-10.61z"
        )
        let bounds = path.boundingRect
        XCTAssertGreaterThan(bounds.minX, 250)
        XCTAssertLessThan(bounds.maxX, 365)
        XCTAssertGreaterThan(bounds.minY, 310)
        XCTAssertLessThan(bounds.maxY, 455)
    }

    func testEmptyStringProducesEmptyPath() {
        let path = SVGPathParser.parse("")
        XCTAssertTrue(path.isEmpty)
    }

    func testMultipleSubpathsViaRepeatedMoveto() {
        let path = SVGPathParser.parse("M0 0L10 0L0 10ZM20 20L30 20L20 30Z")
        let bounds = path.boundingRect
        XCTAssertEqual(bounds.minX, 0, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 30, accuracy: 0.01)
    }

    func testMalformedNumbersAfterCloseDoNotHang() {
        // "Z5 5" is malformed (Z takes no args) -- the parser must terminate
        // rather than loop forever treating "5 5" as an implicit repeat of Z.
        let path = SVGPathParser.parse("M0 0L10 0L0 10Z5 5")
        // No crash/hang is the primary assertion; the path should at least
        // contain the valid triangle drawn before the malformed trailing data.
        XCTAssertFalse(path.isEmpty)
    }

    func testArcCommandTokenizesWithoutCrashingUsingRealFixture() {
        // Real fixture containing an arc command with concatenated flags:
        // "a1.71 1.71 0 012.89 1.12" -- flags "0" and "1" have no separator
        // before the following number "2.89".
        let pathString = "M438.7 444.36c-2.09-4.03-.13-6.83 3.63-8.81 10.22-5.36 16.79-11 24.23-18.07a1.71 1.71 0 012.89 1.12c.33 4.74-.81 14.39-5.53 17.22-4.68 2.82-18.74 10.02-24.39 9.14q-.57-.09-.83-.6z"
        let path = SVGPathParser.parse(pathString)
        XCTAssertFalse(path.isEmpty)
        // With the current placeholder SVGArcConverter (draws a straight line
        // for the arc segment instead of a real curve), the parse should still
        // succeed and produce a non-trivial bounding box -- this test verifies
        // the SCANNER correctly tokenizes the arc's 7 parameters (including the
        // concatenated "01" flags) and that `current`/`absEnd` position tracking
        // through the arc command is correct, independent of the placeholder's
        // simplified rendering. Real arc-to-curve geometry is verified in the
        // dedicated SVGArcConverter task, not here.
        let bounds = path.boundingRect
        XCTAssertGreaterThan(bounds.minX, 400)
        XCTAssertLessThan(bounds.maxX, 470)
    }
}
