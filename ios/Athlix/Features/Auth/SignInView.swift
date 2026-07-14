import SwiftUI
import AthlixCore

struct SignInView: View {
    @Environment(AuthManager.self) private var authManager
    @State private var email = ""
    @State private var password = ""
    @State private var showingSignUp = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("ATHLIX")
                    .font(.system(size: 28, weight: .black))
                    .foregroundStyle(ColorTokens.accent)

                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .textFieldStyle(.roundedBorder)

                if let error = authManager.errorMessage {
                    Text(error).foregroundStyle(ColorTokens.red).font(.footnote)
                }

                Button {
                    Task { await authManager.signIn(email: email, password: password) }
                } label: {
                    if authManager.isLoading {
                        ProgressView()
                    } else {
                        Text("Sign In").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(ColorTokens.accent)
                .disabled(email.isEmpty || password.isEmpty || authManager.isLoading)

                SignInWithAppleButtonView()

                Button("Don't have an account? Sign up") {
                    showingSignUp = true
                }
                .font(.footnote)
            }
            .padding(24)
            .background(ColorTokens.bgBase)
            .sheet(isPresented: $showingSignUp) {
                SignUpView()
            }
        }
    }
}
