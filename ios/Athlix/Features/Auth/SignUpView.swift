import SwiftUI
import AthlixCore

struct SignUpView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Create your account")
                    .font(.title2.bold())
                    .foregroundStyle(ColorTokens.textPrimary)

                TextField("Email", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textFieldStyle(.roundedBorder)

                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
                    .textFieldStyle(.roundedBorder)

                if let error = authManager.errorMessage {
                    Text(error).foregroundStyle(ColorTokens.red).font(.footnote)
                }

                Button {
                    Task {
                        await authManager.signUp(email: email, password: password)
                        if authManager.user != nil { dismiss() }
                    }
                } label: {
                    if authManager.isLoading {
                        ProgressView()
                    } else {
                        Text("Sign Up").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(ColorTokens.accent)
                .disabled(email.isEmpty || password.isEmpty || authManager.isLoading)
            }
            .padding(24)
            .background(ColorTokens.bgBase)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
