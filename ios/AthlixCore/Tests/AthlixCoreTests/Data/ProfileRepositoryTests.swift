import XCTest
@testable import AthlixCore

actor MockProfileRepository: ProfileRepository {
    var stubbedProfile: Profile?
    var shouldThrow = false

    func fetchProfile(userId: String) async throws -> Profile {
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
}
