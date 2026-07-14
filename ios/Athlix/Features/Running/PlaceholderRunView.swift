import SwiftUI
import AthlixCore

struct PlaceholderRunView: View {
    var body: some View {
        ZStack {
            ColorTokens.bgBase.ignoresSafeArea()
            Text("Run").foregroundStyle(ColorTokens.textPrimary)
        }
    }
}
