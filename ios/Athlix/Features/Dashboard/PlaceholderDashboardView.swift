import SwiftUI
import AthlixCore

struct PlaceholderDashboardView: View {
    var body: some View {
        ZStack {
            ColorTokens.bgBase.ignoresSafeArea()
            Text("Home").foregroundStyle(ColorTokens.textPrimary)
        }
    }
}
