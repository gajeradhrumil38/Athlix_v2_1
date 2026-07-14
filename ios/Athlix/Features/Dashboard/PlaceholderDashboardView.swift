import SwiftUI
import AthlixCore

struct PlaceholderDashboardView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        ZStack {
            ColorTokens.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Text("Home").foregroundStyle(ColorTokens.textPrimary)

                Button("Sign Out") {
                    Task { await authManager.signOut() }
                }
                .foregroundStyle(ColorTokens.red)
            }
        }
    }
}
