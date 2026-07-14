import SwiftUI
import AthlixCore

struct PlaceholderLogView: View {
    var body: some View {
        ZStack {
            ColorTokens.bgBase.ignoresSafeArea()
            Text("Log Workout").foregroundStyle(ColorTokens.textPrimary)
        }
    }
}
