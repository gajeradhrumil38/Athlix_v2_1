import XCTest
@testable import AthlixCore

final class ProfileTests: XCTestCase {
    func testDecodesFromSupabaseJSON() throws {
        let json = """
        {
            "id": "b3f1c2d4-1111-2222-3333-444455556666",
            "full_name": "Dhrumil Gajera",
            "unit_preference": "kg",
            "theme_preference": "dark",
            "body_weight": 78.5,
            "height_cm": 178.0
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        let profile = try decoder.decode(Profile.self, from: json)

        XCTAssertEqual(profile.id, "b3f1c2d4-1111-2222-3333-444455556666")
        XCTAssertEqual(profile.fullName, "Dhrumil Gajera")
        XCTAssertEqual(profile.unitPreference, .kg)
        XCTAssertEqual(profile.themePreference, "dark")
        XCTAssertEqual(profile.bodyWeight, 78.5)
        XCTAssertEqual(profile.heightCm, 178.0)
    }

    func testDecodesWithMissingOptionalFields() throws {
        let json = """
        {
            "id": "b3f1c2d4-1111-2222-3333-444455556666",
            "full_name": null,
            "unit_preference": "lbs",
            "theme_preference": "darker",
            "body_weight": null,
            "height_cm": null
        }
        """.data(using: .utf8)!

        let profile = try JSONDecoder().decode(Profile.self, from: json)

        XCTAssertNil(profile.fullName)
        XCTAssertEqual(profile.unitPreference, .lbs)
        XCTAssertNil(profile.bodyWeight)
    }
}
