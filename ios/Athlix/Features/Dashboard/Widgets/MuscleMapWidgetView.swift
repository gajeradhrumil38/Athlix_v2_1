// ios/Athlix/Features/Dashboard/Widgets/MuscleMapWidgetView.swift
import SwiftUI
import AthlixCore

struct MuscleMapWidgetView: View {
    let intensityBySlug: [String: Int]
    @State private var side: MuscleBodyViewSide = .front

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Muscle Map")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.textSecondary)
                Spacer()
                Picker("Side", selection: $side) {
                    Text("Front").tag(MuscleBodyViewSide.front)
                    Text("Back").tag(MuscleBodyViewSide.back)
                }
                .pickerStyle(.segmented)
                .frame(width: 140)
            }
            MuscleBodyView(intensityBySlug: intensityBySlug, view: $side)
                .frame(height: 260)
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
