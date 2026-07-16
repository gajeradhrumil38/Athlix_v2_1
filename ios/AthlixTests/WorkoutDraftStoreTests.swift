import XCTest
@testable import Athlix
import AthlixCore

@MainActor
final class WorkoutDraftStoreTests: XCTestCase {
    var tempDir: URL!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tempDir)
        tempDir = nil
        super.tearDown()
    }

    // Whole-second "now" — not raw `Date()` — because `.secondsSince1970` encodes
    // Date as a Double, and Foundation's JSON number formatting does not reliably
    // round-trip sub-second precision bit-for-bit (confirmed by direct repro).
    // Rounding to the nearest second keeps the fixture fresh (not expired against
    // the real 8hr TTL, unlike a hardcoded past timestamp would eventually become)
    // while still round-tripping exactly, matching the round-second convention
    // AthlixCoreTests/WorkoutDraftTests.swift uses for its own round-trip tests.
    private static func freshWholeSecondNow() -> Date {
        Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded())
    }

    private func makeDraft(savedAt: Date = WorkoutDraftStoreTests.freshWholeSecondNow()) -> WorkoutDraft {
        WorkoutDraft(
            id: nil,
            title: "Test Workout",
            startAt: Date(timeIntervalSince1970: 1_752_000_000),
            elapsedSeconds: 120,
            exercises: [],
            notes: "some notes",
            savedAt: savedAt
        )
    }

    func testSaveAndLoadRoundTrips() {
        let store = WorkoutDraftStore(directory: tempDir)
        let draft = makeDraft()

        XCTAssertTrue(store.save(draft))

        XCTAssertEqual(store.load(), draft)
    }

    func testSecondSaveFullyReplacesFirst() {
        let store = WorkoutDraftStore(directory: tempDir)
        let first = makeDraft()
        var second = makeDraft()
        second.title = "Second Workout"
        second.elapsedSeconds = 999

        XCTAssertTrue(store.save(first))
        XCTAssertTrue(store.save(second))

        // .atomic writes should fully replace the file, not append/corrupt it.
        XCTAssertEqual(store.load(), second)
    }

    func testLoadReturnsNilForMalformedFile() {
        let store = WorkoutDraftStore(directory: tempDir)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        let fileURL = tempDir.appendingPathComponent("athlix_active_workout.json")
        let malformedData = Data("{ this is not valid json".utf8)
        try? malformedData.write(to: fileURL)

        XCTAssertNil(store.load())
    }

    func testLoadReturnsNilWhenNoFileExists() {
        let store = WorkoutDraftStore(directory: tempDir)

        XCTAssertNil(store.load())
    }

    func testLoadReturnsNilAndDeletesFileWhenExpired() {
        let store = WorkoutDraftStore(directory: tempDir)
        // Fixed round-second timestamp, well outside the 8hr TTL relative to `now`.
        let longAgo = Date(timeIntervalSince1970: 1_000_000_000)
        let expiredDraft = makeDraft(savedAt: longAgo)
        store.save(expiredDraft)

        XCTAssertNil(store.load())
        // Verify the file is actually gone, not just filtered on read.
        XCTAssertNil(store.load())

        let fileURL = tempDir.appendingPathComponent("athlix_active_workout.json")
        XCTAssertFalse(FileManager.default.fileExists(atPath: fileURL.path))
    }

    func testClearRemovesFile() {
        let store = WorkoutDraftStore(directory: tempDir)
        let draft = makeDraft()
        store.save(draft)
        XCTAssertNotNil(store.load())

        store.clear()

        XCTAssertNil(store.load())
    }
}
