// ios/Athlix/Features/Dashboard/MuscleBodyView.swift
import SwiftUI
import AthlixCore

struct MuscleBodyView: View {
    /// Maps muscle slug -> training intensity tier (0 = untrained, 1-4 = intensity).
    let intensityBySlug: [String: Int]
    @Binding var view: MuscleBodyViewSide
    /// nil (the Dashboard's usage) = tapping does nothing, no selection overlay.
    /// non-nil (custom-exercise creation's usage) = each tap on a region invokes
    /// this with that region's slug; the CALLER owns the selection state and
    /// passes it back in via `selectionBySlug` -- this view has no memory of
    /// its own selection, it's a pure display + tap-reporter.
    var onTapSlug: ((String) -> Void)? = nil
    /// nil = pure intensity-heatmap coloring (existing Dashboard behavior,
    /// via `intensityBySlug`). non-nil = selection-state coloring takes
    /// priority over intensity for any slug present in this dictionary --
    /// the two colorings are mutually exclusive per-slug, not blended,
    /// since the two callers never need both simultaneously.
    var selectionBySlug: [String: MuscleSelectionState]? = nil

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
        if let selection = selectionBySlug?[slug] {
            switch selection {
            case .primary: return ColorTokens.accent
            case .secondary: return ColorTokens.accent.opacity(0.45)
            }
        }
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
                    ZStack {
                        ForEach(entry.pathStrings, id: \.self) { pathString in
                            (cache[pathString] ?? Path())
                                .fill(color(forSlug: entry.slug))
                        }
                    }
                    .contentShape(pathsUnion(for: entry, cache: cache))
                    .onTapGesture { onTapSlug?(entry.slug) }
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

    /// Unions a region's (possibly multiple) path strings into one hit-testable
    /// shape -- a region like "biceps" may be drawn from two separate SVG path
    /// strings (left+right arm), both of which must be tappable as one region.
    private func pathsUnion(for entry: MuscleBodyPathEntry, cache: [String: Path]) -> Path {
        var union = Path()
        for pathString in entry.pathStrings {
            union.addPath(cache[pathString] ?? Path())
        }
        return union
    }
}

enum MuscleBodyViewSide {
    case front
    case back
}

enum MuscleSelectionState {
    case primary
    case secondary
}
