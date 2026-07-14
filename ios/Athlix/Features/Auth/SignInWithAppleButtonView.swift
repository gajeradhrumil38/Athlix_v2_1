import SwiftUI
import AuthenticationServices
import AthlixCore

struct SignInWithAppleButtonView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var currentNonce: String?

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            let nonce = NonceGenerator.randomNonce()
            currentNonce = nonce
            request.requestedScopes = [.email]
            request.nonce = NonceGenerator.sha256(nonce)
        } onCompletion: { result in
            switch result {
            case .success(let authorization):
                guard
                    let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                    let tokenData = credential.identityToken,
                    let idToken = String(data: tokenData, encoding: .utf8),
                    let nonce = currentNonce
                else { return }

                Task {
                    await authManager.signInWithApple(idToken: idToken, nonce: nonce)
                }
            case .failure(let error):
                print("Sign in with Apple failed: \(error)")
            }
        }
        .signInWithAppleButtonStyle(.white)
        .frame(height: 44)
    }
}
