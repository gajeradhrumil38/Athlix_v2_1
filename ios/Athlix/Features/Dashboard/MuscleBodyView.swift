// ios/Athlix/Features/Dashboard/MuscleBodyView.swift
import SwiftUI
import AthlixCore

struct MuscleBodyView: View {
    /// Maps muscle slug -> training intensity tier (0 = untrained, 1-4 = intensity).
    let intensityBySlug: [String: Int]
    @Binding var view: MuscleBodyViewSide

    // Cached once per process -- SVG path strings are static data, so their
    // parsed Path never changes and doesn't need re-computing on every
    // SwiftUI re-render.
    private static let parsedFrontPaths: [String: Path] = cachedPaths(for: MuscleBodyPaths.front)
    private static let parsedBackPaths: [String: Path] = cachedPaths(for: MuscleBodyPaths.back)

    private static func cachedPaths(for entries: [MuscleBodyPathEntry]) -> [String: Path] {
        var result: [String: Path] = [:]
        for entry in entries {
            for pathString in entry.pathStrings {
                result[pathString] = SVGPathParser.parse(pathString)
            }
        }
        return result
    }

    // Ported verbatim from MuscleMap.tsx's SLUG_HEX table.
    private static let slugHex: [String: String] = [
        "chest": "F09595", "biceps": "85B7EB", "triceps": "AFA9EC",
        "deltoids": "AFA9EC", "abs": "ff7a59", "obliques": "ff7a59",
        "upper-back": "5DCAA5", "lower-back": "5DCAA5", "trapezius": "5DCAA5",
        "quadriceps": "EF9F27", "hamstring": "EF9F27", "calves": "EF9F27",
        "gluteal": "F4B96A", "adductors": "EF9F27", "tibialis": "98D4E8",
        "ankles": "98D4E8", "forearm": "98D4E8", "neck": "AFA9EC",
    ]
    private static let fallbackHex = "8692a4"
    // Ported verbatim from MuscleMap.tsx's INTENSITY_ALPHA table.
    private static let intensityAlpha: [Double] = [0.45, 0.65, 0.85, 1.0]

    private func color(forSlug slug: String) -> Color {
        let intensity = intensityBySlug[slug] ?? 0
        guard intensity > 0 else {
            return Color(hex: slug == "head" ? "bebebe" : "3f3f3f")
        }
        let hex = Self.slugHex[slug] ?? Self.fallbackHex
        let alpha = Self.intensityAlpha[min(intensity, 4) - 1]
        return Color(hex: hex).opacity(alpha)
    }

    var body: some View {
        let entries = view == .front ? MuscleBodyPaths.front : MuscleBodyPaths.back
        let cache = view == .front ? Self.parsedFrontPaths : Self.parsedBackPaths
        GeometryReader { geometry in
            ZStack {
                ForEach(entries, id: \.slug) { entry in
                    ForEach(entry.pathStrings, id: \.self) { pathString in
                        (cache[pathString] ?? Path())
                            .fill(color(forSlug: entry.slug))
                    }
                }
            }
            .scaleEffect(
                x: geometry.size.width / 724,
                y: geometry.size.height / 1448,
                anchor: .topLeading
            )
        }
        // Real canvas dimensions per react-muscle-highlighter's own SVG viewBox
        // ("0 0 724 1448" front, "724 0 724 1448" back) -- verified directly
        // against the source library, not assumed.
        .aspectRatio(724.0 / 1448.0, contentMode: .fit)
    }
}

enum MuscleBodyViewSide {
    case front
    case back
}
