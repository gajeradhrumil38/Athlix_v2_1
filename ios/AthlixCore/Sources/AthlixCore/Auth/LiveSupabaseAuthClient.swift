import Foundation
import Supabase

public final class LiveSupabaseAuthClient: SupabaseAuthClient, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func currentUser() async -> AuthUser? {
        // `session` refreshes and throws if none exists; `currentSession` is the
        // possibly-stale synchronous fallback if that ever changes.
        guard let session = try? await client.auth.session else { return nil }
        return AuthUser(id: session.user.id.uuidString, email: session.user.email)
    }

    public func signIn(email: String, password: String) async throws -> AuthUser {
        do {
            let session = try await client.auth.signIn(email: email, password: password)
            return AuthUser(id: session.user.id.uuidString, email: session.user.email)
        } catch {
            throw AuthClientError.invalidCredentials
        }
    }

    public func signUp(email: String, password: String) async throws -> AuthUser {
        do {
            let response = try await client.auth.signUp(email: email, password: password)
            let user = response.user
            return AuthUser(id: user.id.uuidString, email: user.email)
        } catch {
            throw AuthClientError.unknown("\(error)")
        }
    }

    public func signInWithApple(idToken: String, nonce: String) async throws -> AuthUser {
        do {
            let session = try await client.auth.signInWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce)
            )
            return AuthUser(id: session.user.id.uuidString, email: session.user.email)
        } catch {
            throw AuthClientError.unknown("\(error)")
        }
    }

    public func signOut() async throws {
        try await client.auth.signOut()
    }
}
