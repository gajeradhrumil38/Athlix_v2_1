import SwiftUI
import AthlixCore

struct MuscleRadarView: View {
    /// Region name -> normalized load (0...1), e.g. ["Chest": 0.8, "Legs": 0.4, ...]
    let regionLoads: [String: Double]

    private let regions = ["Chest", "Back", "Shoulders", "Legs", "Core", "Arms"]

    var body: some View {
        VStack(spacing: 8) {
            Text("Weekly Distribution")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ColorTokens.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            GeometryReader { geometry in
                let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
                let radius = min(geometry.size.width, geometry.size.height) / 2 - 12

                ZStack {
                    ForEach([0.33, 0.66, 1.0], id: \.self) { fraction in
                        polygonPath(center: center, radius: radius * fraction)
                            .stroke(ColorTokens.borderSubtle, lineWidth: 1)
                    }
                    dataPath(center: center, radius: radius)
                        .fill(ColorTokens.accent.opacity(0.25))
                    dataPath(center: center, radius: radius)
                        .stroke(ColorTokens.accent, lineWidth: 2)
                }
            }
            .frame(height: 180)
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func point(forIndex index: Int, radius: Double, center: CGPoint) -> CGPoint {
        let angle = (Double(index) / Double(regions.count)) * 2 * .pi - .pi / 2
        return CGPoint(x: center.x + radius * cos(angle), y: center.y + radius * sin(angle))
    }

    private func polygonPath(center: CGPoint, radius: Double) -> Path {
        var path = Path()
        for index in 0..<regions.count {
            let point = point(forIndex: index, radius: radius, center: center)
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }

    private func dataPath(center: CGPoint, radius: Double) -> Path {
        var path = Path()
        for (index, region) in regions.enumerated() {
            let load = regionLoads[region] ?? 0
            let point = point(forIndex: index, radius: radius * load, center: center)
            if index == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }
}
