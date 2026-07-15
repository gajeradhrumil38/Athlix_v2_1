import SwiftUI
import SwiftData
import AthlixCore

@main
struct AthlixApp: App {
    @State private var authManager = AuthManager(client: LiveSupabaseAuthClient())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authManager)
                .modelContainer(for: [CachedWorkout.self, CachedPersonalRecord.self])
                .task {
                    await authManager.restoreSession()
                }
        }
    }
}
