import Foundation

public enum AuthClientError: Error, Equatable {
    case invalidCredentials
    case network
    case unknown(String)
}

public protocol SupabaseAuthClient: Sendable {
    func currentUser() async -> AuthUser?
    func signIn(email: String, password: String) async throws -> AuthUser
    func signUp(email: String, password: String) async throws -> AuthUser
    func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser
    func signOut() async throws
}
