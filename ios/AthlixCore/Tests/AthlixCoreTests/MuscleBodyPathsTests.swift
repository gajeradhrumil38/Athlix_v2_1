import XCTest
@testable import AthlixCore

final class MuscleBodyPathsTests: XCTestCase {
    func testFrontHasEntryForEveryExpectedSlug() {
        let frontSlugs = Set(MuscleBodyPaths.front.map(\.slug))
        let backSlugs = Set(MuscleBodyPaths.back.map(\.slug))
        let allSlugs = frontSlugs.union(backSlugs)
        XCTAssertTrue(allSlugs.contains("chest"))
        XCTAssertTrue(allSlugs.contains("biceps"))
        XCTAssertTrue(allSlugs.contains("quadriceps"))
        XCTAssertGreaterThan(allSlugs.count, 10)
    }

    func testEveryPathStringParsesToNonEmptyPath() {
        for entry in MuscleBodyPaths.front + MuscleBodyPaths.back {
            for pathString in entry.pathStrings {
                let path = SVGPathParser.parse(pathString)
                XCTAssertFalse(path.isEmpty, "Empty path for slug \(entry.slug): \(pathString.prefix(40))...")
            }
        }
    }

    func testPathStringCountMatchesSourceFileCount() {
        // Counts verified via `grep -c '"M' bodyFront.js` / `bodyBack.js`
        // against node_modules/react-muscle-highlighter's source data.
        let totalFront = MuscleBodyPaths.front.reduce(0) { $0 + $1.pathStrings.count }
        let totalBack = MuscleBodyPaths.back.reduce(0) { $0 + $1.pathStrings.count }
        XCTAssertEqual(totalFront, 89)
        XCTAssertEqual(totalBack, 70)
    }
}
