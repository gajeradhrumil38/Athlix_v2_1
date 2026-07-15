import XCTest
@testable import AthlixCore

final class MuscleBodyPathsTests: XCTestCase {
    func testFrontHasExactExpectedEntryCount() {
        XCTAssertEqual(MuscleBodyPaths.front.count, 19)
        let frontSlugs = Set(MuscleBodyPaths.front.map(\.slug))
        let expectedFrontSlugs: Set<String> = [
            "chest", "obliques", "abs", "biceps", "triceps", "neck", "trapezius",
            "deltoids", "adductors", "quadriceps", "knees", "tibialis", "calves",
            "forearm", "hands", "ankles", "feet", "head", "hair",
        ]
        XCTAssertEqual(frontSlugs, expectedFrontSlugs)
    }

    func testBackHasExactExpectedEntryCount() {
        XCTAssertEqual(MuscleBodyPaths.back.count, 16)
        let backSlugs = Set(MuscleBodyPaths.back.map(\.slug))
        let expectedBackSlugs: Set<String> = [
            "neck", "trapezius", "deltoids", "upper-back", "triceps", "lower-back",
            "forearm", "gluteal", "adductors", "hamstring", "calves", "ankles",
            "feet", "hands", "head", "hair",
        ]
        XCTAssertEqual(backSlugs, expectedBackSlugs)
    }

    func testEveryPathStringParsesToNonEmptyPath() {
        for entry in MuscleBodyPaths.front + MuscleBodyPaths.back {
            for pathString in entry.pathStrings {
                let path = SVGPathParser.parse(pathString)
                let bounds = path.boundingRect
                XCTAssertGreaterThan(bounds.width, 1, "Suspiciously small/truncated path for slug \(entry.slug): \(pathString.prefix(40))...")
                XCTAssertGreaterThan(bounds.height, 1, "Suspiciously small/truncated path for slug \(entry.slug): \(pathString.prefix(40))...")
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
