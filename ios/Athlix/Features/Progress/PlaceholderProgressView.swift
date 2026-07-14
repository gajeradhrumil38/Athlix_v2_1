import SwiftUI
import AthlixCore

struct PlaceholderProgressView: View {
    var body: some View {
        ZStack {
            ColorTokens.bgBase.ignoresSafeArea()
            Text("Progress").foregroundStyle(ColorTokens.textPrimary)
        }
    }
}
