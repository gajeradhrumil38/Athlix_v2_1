import XCTest
import SwiftUI
@testable import AthlixCore

final class SVGArcConverterTests: XCTestCase {
    func testSemicircleArcBulgesBeyondChordBoundingBox() {
        // A straight chord between (-10,0) and (10,0) has bounding box y∈[0,0].
        // The true semicircular arc (r=10, sweep=1, large-arc=0) bulges to
        // y≈-10 at its midpoint -- unlike a diagonal quarter-circle (where the
        // chord and arc share the same bounding-box corners), this case
        // genuinely distinguishes real arc curvature from a straight-line
        // placeholder: a straight line would keep minY at 0, while the real
        // arc's minY must reach well below 0.
        var path = Path()
        path.move(to: CGPoint(x: -10, y: 0))
        SVGArcConverter.appendArc(
            to: &path,
            from: CGPoint(x: -10, y: 0),
            to: CGPoint(x: 10, y: 0),
            radiusX: 10, radiusY: 10,
            xAxisRotationDegrees: 0,
            largeArcFlag: false,
            sweepFlag: true
        )
        let bounds = path.boundingRect
        XCTAssertLessThan(bounds.minY, -5)
    }

    func testRealChestPathWithArcSegmentParsesWithoutCrashing() {
        let pathString = "M438.7 444.36c-2.09-4.03-.13-6.83 3.63-8.81 10.22-5.36 16.79-11 24.23-18.07a1.71 1.71 0 012.89 1.12c.33 4.74-.81 14.39-5.53 17.22-4.68 2.82-18.74 10.02-24.39 9.14q-.57-.09-.83-.6z"
        let path = SVGPathParser.parse(pathString)
        XCTAssertFalse(path.isEmpty)
        let bounds = path.boundingRect
        XCTAssertGreaterThan(bounds.minX, 400)
        XCTAssertLessThan(bounds.maxX, 470)
    }

    func testFlagParsingHandlesConcatenatedDigits() {
        var scanner = PathScanner("012.89 1.12")
        let flag1 = scanner.nextFlag()
        let flag2 = scanner.nextFlag()
        let point = scanner.nextPoint()
        XCTAssertEqual(flag1, false)
        XCTAssertEqual(flag2, true)
        XCTAssertEqual(point.x, 2.89, accuracy: 0.001)
        XCTAssertEqual(point.y, 1.12, accuracy: 0.001)
    }
}
