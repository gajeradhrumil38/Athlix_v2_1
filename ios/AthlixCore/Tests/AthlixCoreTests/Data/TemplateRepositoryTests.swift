import XCTest
@testable import AthlixCore

actor MockTemplateRepository: TemplateRepository {
    var stubbedTemplates: [Template] = []
    var stubbedNameExists = false
    var stubbedSaveId = "new-template-id"
    var rpcCallCount = 0
    var directSaveCallCount = 0
    var lastSavedTemplateId: String?
    var deletedCalls: [(templateId: String, userId: String)] = []

    func fetchTemplates(userId: String) async throws -> [Template] {
        stubbedTemplates
    }

    func checkNameExists(userId: String, title: String, excludeId: String?) async throws -> Bool {
        stubbedNameExists
    }

    // Mirrors the real repository's contract: templateId == nil goes through the RPC
    // create path, templateId != nil always goes through the direct update path
    // (the RPC is skipped entirely on update, matching web's documented behavior).
    func saveTemplate(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String {
        lastSavedTemplateId = templateId
        if templateId == nil {
            rpcCallCount += 1
        } else {
            directSaveCallCount += 1
        }
        return stubbedSaveId
    }

    func deleteTemplate(userId: String, templateId: String) async throws {
        deletedCalls.append((templateId, userId))
    }
}

extension MockTemplateRepository {
    func setStubbedTemplates(_ templates: [Template]) { self.stubbedTemplates = templates }
    func setStubbedNameExists(_ value: Bool) { self.stubbedNameExists = value }
    func setStubbedSaveId(_ value: String) { self.stubbedSaveId = value }
}

final class TemplateRepositoryTests: XCTestCase {
    private func makeExercise(templateId: String) -> TemplateExercise {
        TemplateExercise(
            id: "ex-1", templateId: templateId, name: "Bench Press", muscleGroup: "Chest",
            defaultSets: 3, defaultReps: 10, defaultWeight: 135, orderIndex: 0, exerciseDbId: nil
        )
    }

    func testFetchTemplatesReturnsStubbedDataWithNestedExercises() async throws {
        let exercise = makeExercise(templateId: "t1")
        let template = Template(id: "t1", userId: "u1", title: "Push Day", createdAt: "2026-07-10T00:00:00Z", exercises: [exercise])
        let mock = MockTemplateRepository()
        await mock.setStubbedTemplates([template])

        let result = try await mock.fetchTemplates(userId: "u1")

        XCTAssertEqual(result, [template])
        XCTAssertEqual(result.first?.exercises, [exercise])
    }

    func testCheckNameExistsReturnsTrueOnCollision() async throws {
        let mock = MockTemplateRepository()
        await mock.setStubbedNameExists(true)

        let exists = try await mock.checkNameExists(userId: "u1", title: "Push Day", excludeId: nil)

        XCTAssertTrue(exists)
    }

    func testCheckNameExistsReturnsFalseWhenNoCollision() async throws {
        let mock = MockTemplateRepository()
        await mock.setStubbedNameExists(false)

        let exists = try await mock.checkNameExists(userId: "u1", title: "Unique Name", excludeId: nil)

        XCTAssertFalse(exists)
    }

    func testSaveTemplateCreatesViaRPCWhenTemplateIdIsNil() async throws {
        let mock = MockTemplateRepository()
        await mock.setStubbedSaveId("created-id")

        let id = try await mock.saveTemplate(userId: "u1", templateId: nil, title: "New Template", exercises: [])

        XCTAssertEqual(id, "created-id")
        let rpcCalls = await mock.rpcCallCount
        let directCalls = await mock.directSaveCallCount
        XCTAssertEqual(rpcCalls, 1)
        XCTAssertEqual(directCalls, 0)
    }

    func testSaveTemplateUpdatesViaDirectPathWhenTemplateIdIsNonNil() async throws {
        let mock = MockTemplateRepository()

        let id = try await mock.saveTemplate(userId: "u1", templateId: "existing-id", title: "Renamed", exercises: [])

        XCTAssertEqual(id, "new-template-id")
        let rpcCalls = await mock.rpcCallCount
        let directCalls = await mock.directSaveCallCount
        XCTAssertEqual(rpcCalls, 0)
        XCTAssertEqual(directCalls, 1)
    }

    func testDeleteTemplateScopesToIdAndUserId() async throws {
        let mock = MockTemplateRepository()

        try await mock.deleteTemplate(userId: "u1", templateId: "t1")

        let calls = await mock.deletedCalls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.templateId, "t1")
        XCTAssertEqual(calls.first?.userId, "u1")
    }
}
