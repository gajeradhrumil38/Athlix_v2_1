import SwiftUI

enum SVGArcConverter {
    static func appendArc(
        to path: inout Path,
        from: CGPoint,
        to end: CGPoint,
        radiusX: Double,
        radiusY: Double,
        xAxisRotationDegrees: Double,
        largeArcFlag: Bool,
        sweepFlag: Bool
    ) {
        // Placeholder: draws a straight line so the parser compiles and
        // non-arc tests pass. A later task replaces this with the real
        // arc-to-cubic-Bezier conversion.
        path.addLine(to: end)
    }
}
