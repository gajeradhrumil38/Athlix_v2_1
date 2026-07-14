import SwiftUI
import AthlixCore

@main
struct AthlixApp: App {
    @State private var authManager = AuthManager(client: LiveSupabaseAuthClient())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authManager)
                .task {
                    await authManager.restoreSession()
                }
        }
    }
}
