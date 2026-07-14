import SwiftUI
import AthlixCore

struct RootView: View {
    @Environment(AuthManager.self) private var authManager

    var body: some View {
        if authManager.isLoading {
            ZStack {
                ColorTokens.bgBase.ignoresSafeArea()
                ProgressView()
                    .tint(ColorTokens.accent)
            }
        } else if authManager.user != nil {
            MainTabView()
        } else {
            SignInView()
        }
    }
}
