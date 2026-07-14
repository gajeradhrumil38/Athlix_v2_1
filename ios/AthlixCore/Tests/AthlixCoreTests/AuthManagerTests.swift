import XCTest
@testable import AthlixCore

actor MockSupabaseAuthClient: SupabaseAuthClient {
    var stubbedUser: AuthUser?
    var signInError: AuthClientError?

    init(stubbedUser: AuthUser? = nil, signInError: AuthClientError? = nil) {
        self.stubbedUser = stubbedUser
        self.signInError = signInError
    }

    func currentUser() async -> AuthUser? { stubbedUser }

    func signIn(email: String, password: String) async throws -> AuthUser {
        if let signInError { throw signInError }
        let user = AuthUser(id: "user-1", email: email)
        stubbedUser = user
        return user
    }

    func signUp(email: String, password: String) async throws -> AuthUser {
        let user = AuthUser(id: "user-2", email: email)
        stubbedUser = user
        return user
    }

    func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser {
        let user = AuthUser(id: "apple-user", email: nil)
        stubbedUser = user
        return user
    }

    func signOut() async throws {
        stubbedUser = nil
    }
}

@MainActor
final class AuthManagerTests: XCTestCase {
    func testSignInSuccessUpdatesUser() async {
        let manager = AuthManager(client: MockSupabaseAuthClient())
        await manager.signIn(email: "a@example.com", password: "hunter2")

        XCTAssertEqual(manager.user?.email, "a@example.com")
        XCTAssertNil(manager.errorMessage)
    }

    func testSignInFailureSetsErrorAndKeepsUserNil() async {
        let manager = AuthManager(client: MockSupabaseAuthClient(signInError: .invalidCredentials))
        await manager.signIn(email: "a@example.com", password: "wrong")

        XCTAssertNil(manager.user)
        XCTAssertNotNil(manager.errorMessage)
    }

    func testSignOutClearsUser() async {
        let mock = MockSupabaseAuthClient(stubbedUser: AuthUser(id: "user-1", email: "a@example.com"))
        let manager = AuthManager(client: mock)
        await manager.restoreSession()
        XCTAssertNotNil(manager.user)

        await manager.signOut()
        XCTAssertNil(manager.user)
    }

    func testRestoreSessionLoadsExistingUser() async {
        let mock = MockSupabaseAuthClient(stubbedUser: AuthUser(id: "user-1", email: "a@example.com"))
        let manager = AuthManager(client: mock)

        await manager.restoreSession()

        XCTAssertEqual(manager.user?.id, "user-1")
    }

    func testSignInWithAppleUpdatesUser() async {
        let manager = AuthManager(client: MockSupabaseAuthClient())
        await manager.signInWithApple(idToken: "token", nonce: "nonce")

        XCTAssertEqual(manager.user?.id, "apple-user")
    }
}
