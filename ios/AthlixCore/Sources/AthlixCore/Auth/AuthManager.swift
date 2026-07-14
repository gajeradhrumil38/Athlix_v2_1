import Foundation
import Observation

@Observable
@MainActor
public final class AuthManager {
    public private(set) var user: AuthUser?
    public private(set) var isLoading = false
    public private(set) var errorMessage: String?

    private let client: SupabaseAuthClient

    public init(client: SupabaseAuthClient) {
        self.client = client
    }

    public func restoreSession() async {
        isLoading = true
        user = await client.currentUser()
        isLoading = false
    }

    public func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await client.signIn(email: email, password: password)
        } catch {
            user = nil
            errorMessage = "Could not sign in. Check your email and password."
        }
        isLoading = false
    }

    public func signUp(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await client.signUp(email: email, password: password)
        } catch {
            errorMessage = "Could not create account. Try a different email."
        }
        isLoading = false
    }

    public func signInWithApple(idToken: String, nonce: String) async {
        isLoading = true
        errorMessage = nil
        do {
            user = try await client.signInWithApple(idToken: idToken, nonce: nonce)
        } catch {
            errorMessage = "Sign in with Apple failed. Please try again."
        }
        isLoading = false
    }

    public func signOut() async {
        try? await client.signOut()
        user = nil
    }
}
