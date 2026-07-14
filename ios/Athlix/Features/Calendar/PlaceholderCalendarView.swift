import SwiftUI
import AthlixCore

struct PlaceholderCalendarView: View {
    var body: some View {
        ZStack {
            ColorTokens.bgBase.ignoresSafeArea()
            Text("Calendar").foregroundStyle(ColorTokens.textPrimary)
        }
    }
}
