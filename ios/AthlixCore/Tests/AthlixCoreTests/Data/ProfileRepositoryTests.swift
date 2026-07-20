import XCTest
@testable import AthlixCore

actor MockProfileRepository: ProfileRepository {
    var stubbedProfile: Profile?
    var shouldThrow = false
    private(set) var lastUpdate: ProfileUpdate?

    func fetchProfile(userId: String) async throws -> Profile {
        if shouldThrow { throw RepositoryError.network }
        guard let stubbedProfile else {
            throw RepositoryError.unknown("no stubbed profile")
        }
        return stubbedProfile
    }

    func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile {
        lastUpdate = updates
        if shouldThrow { throw RepositoryError.network }
        guard let stubbedProfile else {
            throw RepositoryError.unknown("no stubbed profile")
        }
        return stubbedProfile
    }
}

extension MockProfileRepository {
    func setStubbedProfile(_ profile: Profile?) { self.stubbedProfile = profile }
    func setShouldThrow(_ value: Bool) { self.shouldThrow = value }
}

final class ProfileRepositoryTests: XCTestCase {
    private func makeProfile(id: String = "u1") -> Profile {
        Profile(
            id: id, fullName: "Alex Rivera", unitPreference: .lbs, themePreference: "dark",
            bodyWeight: 180, bodyWeightUnit: .lbs, heightFeet: 5, heightInches: 10
        )
    }

    func testProfileRepositoryReturnsStubbedData() async throws {
        let profile = makeProfile()
        let mock = MockProfileRepository()
        await mock.setStubbedProfile(profile)

        let result = try await mock.fetchProfile(userId: "u1")
        XCTAssertEqual(result, profile)
    }

    func testProfileRepositoryPropagatesErrors() async {
        let mock = MockProfileRepository()
        await mock.setShouldThrow(true)

        do {
            _ = try await mock.fetchProfile(userId: "u1")
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(error as? RepositoryError, .network)
        }
    }

    func testUpdateProfilePayloadOnlyIncludesNonNilFields() {
        let onlyUnit = ProfileUpdate(unitPreference: .kg)
        XCTAssertEqual(onlyUnit.encodablePayload().count, 1)
        XCTAssertEqual(onlyUnit.encodablePayload()["unit_preference"], .string("kg"))

        let both = ProfileUpdate(unitPreference: .lbs, showStartSheet: false)
        XCTAssertEqual(both.encodablePayload().count, 2)
        XCTAssertEqual(both.encodablePayload()["unit_preference"], .string("lbs"))
        XCTAssertEqual(both.encodablePayload()["show_start_sheet"], .bool(false))

        let empty = ProfileUpdate()
        XCTAssertEqual(empty.encodablePayload().count, 0)
    }
}
