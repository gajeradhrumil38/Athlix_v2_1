import SwiftUI
import AthlixCore

/// Mirrors web's `src/components/home/MuscleRadar.tsx` as closely as SwiftUI allows: a fixed
/// MAX_SETS/TARGET_SETS scale (NOT relative to this week's own max), per-region spoke colors,
/// pulsing dots on active spokes, a dashed "ghost" target polygon, a dominant-region pill badge,
/// and the same empty-state copy.
struct MuscleRadarView: View {
    /// Region name -> raw weighted SET COUNT for the week, e.g. ["Chest": 6.5, "Legs": 3, ...].
    /// NOT pre-normalized -- this view normalizes against the fixed `maxSets` scale itself,
    /// matching web's `normalize(sets) = min(sets / MAX_SETS, 1)`.
    let regionSetCounts: [String: Double]

    private let regions = ["Chest", "Shoulders", "Back", "Biceps", "Legs", "Glutes", "Core", "Triceps"]

    private let maxSets: Double = 15
    private let targetSets: Double = 10

    @State private var pulse = false

    /// Named struct instead of a tuple: `ForEach` over an `enumerated()`/`.indices` sequence of
    /// tuples confuses overload resolution (it picks the `Binding<C>`-based initializer meant for
    /// editable collections) and blows up type-check time, so spokes are looked up by explicit
    /// `Int` index against a plain `[Int]` array instead.
    private struct Spoke {
        let region: String
        let sets: Double
        let load: Double
    }

    private var spokeSets: [Spoke] {
        regions.map { region in
            let sets = regionSetCounts[region] ?? 0
            return Spoke(region: region, sets: sets, load: min(sets / maxSets, 1))
        }
    }

    private var hasData: Bool {
        spokeSets.contains { $0.sets > 0 }
    }

    private var dominant: Spoke? {
        spokeSets.filter { $0.sets > 0 }.max { $0.sets < $1.sets }
    }

    var body: some View {
        VStack(spacing: 4) {
            header

            ZStack(alignment: .bottomTrailing) {
                GeometryReader { geometry in
                    let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
                    let radius = min(geometry.size.width, geometry.size.height) / 2 - 26

                    ZStack {
                        rings(center: center, radius: radius)
                        ringLabels(center: center, radius: radius)
                        axisSpokes(center: center, radius: radius)
                        ghostTargetPolygon(center: center, radius: radius)

                        if hasData {
                            dataFillPolygon(center: center, radius: radius)
                            pulseDots(center: center, radius: radius)
                        }

                        centerDot

                        muscleLabels(center: center, radius: radius)
                    }
                }

                if hasData {
                    goalLegend
                }
            }
            .frame(height: 220)

            if !hasData {
                Text("No data yet — log a workout")
                    .font(.system(size: 10))
                    .foregroundStyle(ColorTokens.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.bottom, 6)
            }
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .onAppear { pulse = true }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            HStack(spacing: 4) {
                Text("MUSCLE LOAD")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(ColorTokens.textSecondary)
                Text("· this week")
                    .font(.system(size: 10))
                    .foregroundStyle(ColorTokens.textMuted)
            }
            Spacer()
            if let dominant, let color = MuscleSpokeColors.byRegion[dominant.region] {
                HStack(spacing: 4) {
                    Circle()
                        .fill(color)
                        .frame(width: 6, height: 6)
                    Text("\(dominant.region) dominant")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(color)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(color.opacity(0.10))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(color.opacity(0.18), lineWidth: 1))
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Geometry helpers

    private func angle(forIndex index: Int) -> Double {
        let step: Double = (2 * Double.pi) / Double(regions.count)
        let offset: Double = step * Double(index)
        return -Double.pi / 2 + offset
    }

    private func point(center: CGPoint, radius: Double, fraction: Double, index: Int) -> CGPoint {
        let a = angle(forIndex: index)
        return CGPoint(x: center.x + radius * fraction * cos(a), y: center.y + radius * fraction * sin(a))
    }

    private func polygon(center: CGPoint, radius: Double, fraction: Double) -> Path {
        var path = Path()
        for index in 0..<regions.count {
            let p = point(center: center, radius: radius, fraction: fraction, index: index)
            if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }

    // MARK: - Ring grid (0.2 / 0.4 / 0.6 / 0.8 / 1.0)

    private func rings(center: CGPoint, radius: Double) -> some View {
        ForEach([0.2, 0.4, 0.6, 0.8, 1.0], id: \.self) { fraction in
            Group {
                if fraction == 0.6 {
                    polygon(center: center, radius: radius, fraction: fraction)
                        .stroke(Color.white.opacity(0.07), style: StrokeStyle(lineWidth: 0.5, dash: [2, 3]))
                } else if fraction == 1.0 {
                    polygon(center: center, radius: radius, fraction: fraction)
                        .stroke(Color.white.opacity(0.10), lineWidth: 0.8)
                } else {
                    polygon(center: center, radius: radius, fraction: fraction)
                        .stroke(Color.white.opacity(0.04), lineWidth: 0.5)
                }
            }
        }
    }

    // MARK: - Faint 40% / 80% labels

    private func ringLabels(center: CGPoint, radius: Double) -> some View {
        ForEach([0.4, 0.8], id: \.self) { fraction in
            Text("\(Int(fraction * 100))%")
                .font(.system(size: 6))
                .foregroundStyle(Color.white.opacity(0.13))
                .position(x: center.x + 3, y: center.y - radius * fraction)
        }
    }

    // MARK: - Axis spokes

    private func axisSpokes(center: CGPoint, radius: Double) -> some View {
        ForEach(0..<regions.count, id: \.self) { index in
            let p = point(center: center, radius: radius, fraction: 1.0, index: index)
            Path { path in
                path.move(to: center)
                path.addLine(to: p)
            }
            .stroke(Color.white.opacity(0.05), lineWidth: 0.7)
        }
    }

    // MARK: - Ghost target polygon (fixed TARGET_SETS/MAX_SETS shape)

    private func ghostTargetPolygon(center: CGPoint, radius: Double) -> some View {
        let targetFraction = min(targetSets / maxSets, 1)
        return polygon(center: center, radius: radius, fraction: targetFraction)
            .stroke(Color.white.opacity(0.11), style: StrokeStyle(lineWidth: 0.8, dash: [2, 3]))
    }

    // MARK: - Data fill polygon

    private func dataFillPolygon(center: CGPoint, radius: Double) -> some View {
        let spokes = spokeSets
        let path = Path { p in
            for index in spokes.indices {
                let spoke = spokes[index]
                let point = point(center: center, radius: radius, fraction: spoke.load, index: index)
                if index == 0 { p.move(to: point) } else { p.addLine(to: point) }
            }
            p.closeSubpath()
        }
        return ZStack {
            path.fill(
                RadialGradient(
                    colors: [ColorTokens.accent.opacity(0.10), ColorTokens.accent.opacity(0.02)],
                    center: .center, startRadius: 0, endRadius: radius
                )
            )
            path.stroke(ColorTokens.accent.opacity(0.50), style: StrokeStyle(lineWidth: 1.3, lineJoin: .round))
        }
    }

    // MARK: - Pulse dots per active spoke

    private func pulseDots(center: CGPoint, radius: Double) -> some View {
        let spokes = spokeSets
        let indices = Array(0..<spokes.count)
        return ForEach(indices, id: \.self) { index in
            pulseDot(spoke: spokes[index], index: index, center: center, radius: radius)
        }
    }

    @ViewBuilder
    private func pulseDot(spoke: Spoke, index: Int, center: CGPoint, radius: Double) -> some View {
        if spoke.load > 0, let color = MuscleSpokeColors.byRegion[spoke.region] {
            let p = point(center: center, radius: radius, fraction: spoke.load, index: index)
            ZStack {
                Circle()
                    .fill(color)
                    .frame(width: 5, height: 5)
                    .scaleEffect(pulse ? 3.2 : 1)
                    .opacity(pulse ? 0 : 0.22)
                    .animation(
                        .easeInOut(duration: 1.6).repeatForever(autoreverses: true).delay(Double(index) * 0.4),
                        value: pulse
                    )
                Circle()
                    .fill(color)
                    .frame(width: 6, height: 6)
                Circle()
                    .fill(Color.white.opacity(0.65))
                    .frame(width: 2.2, height: 2.2)
            }
            .position(p)
        }
    }

    private var centerDot: some View {
        GeometryReader { geometry in
            Circle()
                .fill(ColorTokens.accent.opacity(0.22))
                .frame(width: 5, height: 5)
                .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        }
    }

    // MARK: - Muscle name labels

    private func muscleLabels(center: CGPoint, radius: Double) -> some View {
        let spokes = spokeSets
        let indices = Array(0..<spokes.count)
        return ForEach(indices, id: \.self) { index in
            muscleLabel(spoke: spokes[index], center: center, radius: radius)
        }
    }

    // Approximates web's SVG `text-anchor: start/middle/end` logic (anchor(lx) in
    // MuscleRadar.tsx): labels left of center are right-aligned so their text ends at the
    // spoke point, labels right of center are left-aligned so text starts there, and
    // near-vertical spokes stay centered. Width estimate (~5.5pt/char at size 9 bold) is
    // an approximation since SwiftUI has no direct text-anchor equivalent.
    @ViewBuilder
    private func muscleLabel(spoke: Spoke, center: CGPoint, radius: Double) -> some View {
        let labelRadius = radius + 26
        let angleIndex = regions.firstIndex(of: spoke.region) ?? 0
        let p = point(center: center, radius: labelRadius, fraction: 1.0, index: angleIndex)
        let isActive = spoke.sets > 0
        let color: Color = isActive ? (MuscleSpokeColors.byRegion[spoke.region] ?? ColorTokens.textSecondary) : Color.white.opacity(0.18)
        let estimatedWidth = Double(spoke.region.count) * 5.5
        let xOffset: Double = p.x < center.x - 8 ? -estimatedWidth / 2 : (p.x > center.x + 8 ? estimatedWidth / 2 : 0)

        Text(spoke.region.uppercased())
            .font(.system(size: 9, weight: .bold))
            .tracking(0.5)
            .foregroundStyle(color)
            .fixedSize()
            .position(x: p.x + xOffset, y: p.y)
    }

    // MARK: - Ghost legend

    private var goalLegend: some View {
        HStack(spacing: 4) {
            Rectangle()
                .fill(Color.white.opacity(0.4))
                .frame(width: 14, height: 0.8)
            Text("Goal (\(Int(targetSets)) sets)")
                .font(.system(size: 7))
                .foregroundStyle(ColorTokens.textMuted)
        }
        .opacity(0.5)
        .padding(.trailing, 4)
        .padding(.bottom, 8)
    }
}
