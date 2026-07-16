import XCTest
@testable import Athlix
import AthlixCore

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

    private func makeDraft(savedAt: Date = Date()) -> WorkoutDraft {
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

        store.save(draft)

        XCTAssertEqual(store.load(), draft)
    }

    func testLoadReturnsNilWhenNoFileExists() {
        let store = WorkoutDraftStore(directory: tempDir)

        XCTAssertNil(store.load())
    }

    func testLoadReturnsNilAndDeletesFileWhenExpired() {
        let store = WorkoutDraftStore(directory: tempDir)
        let expiredDraft = makeDraft(savedAt: Date(timeIntervalSinceNow: -9 * 3600))
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
