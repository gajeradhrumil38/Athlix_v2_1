import SwiftUI
import AthlixCore

struct MainTabView: View {
    @State private var selection = 0
    @State private var showingLog = false

    var body: some View {
        TabView(selection: $selection) {
            DashboardView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(0)

            PlaceholderProgressView()
                .tabItem { Label("Progress", systemImage: "chart.bar.fill") }
                .tag(1)

            Color.clear
                .tabItem { Label("Log", systemImage: "plus.circle.fill") }
                .tag(2)

            PlaceholderRunView()
                .tabItem { Label("Run", systemImage: "figure.run") }
                .tag(3)

            PlaceholderCalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }
                .tag(4)
        }
        .tint(ColorTokens.accent)
        .onChange(of: selection) { _, newValue in
            if newValue == 2 {
                showingLog = true
                selection = 0
            }
        }
        .fullScreenCover(isPresented: $showingLog) {
            LogEntryView(onDismiss: { showingLog = false })
        }
    }
}
