import SwiftUI

enum SVGArcConverter {
    /// Converts an SVG elliptical arc (as used in path `A`/`a` commands) into
    /// one or more cubic Bezier curves appended to `path`, following the
    /// standard algorithm from the SVG 1.1 spec, appendix F.6.
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
        if from == end { return }

        var rx = abs(radiusX)
        var ry = abs(radiusY)
        if rx == 0 || ry == 0 {
            path.addLine(to: end)
            return
        }

        let phi = xAxisRotationDegrees * .pi / 180
        let cosPhi = cos(phi)
        let sinPhi = sin(phi)

        let dx2 = (from.x - end.x) / 2
        let dy2 = (from.y - end.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2

        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let scale = sqrt(lambda)
            rx *= scale
            ry *= scale
        }

        let sign: Double = (largeArcFlag == sweepFlag) ? -1 : 1
        let num = max(0, (rx * rx * ry * ry) - (rx * rx * y1p * y1p) - (ry * ry * x1p * x1p))
        let den = (rx * rx * y1p * y1p) + (ry * ry * x1p * x1p)
        let coef = den == 0 ? 0 : sign * sqrt(num / den)
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * -(ry * x1p / rx)

        let cx = cosPhi * cxp - sinPhi * cyp + (from.x + end.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (from.y + end.y) / 2

        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let dot = ux * vx + uy * vy
            let len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
            var a = acos(max(-1, min(1, dot / len)))
            if (ux * vy - uy * vx) < 0 { a = -a }
            return a
        }

        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var deltaTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweepFlag && deltaTheta > 0 { deltaTheta -= 2 * .pi }
        if sweepFlag && deltaTheta < 0 { deltaTheta += 2 * .pi }

        let segmentCount = max(1, Int(ceil(abs(deltaTheta) / (.pi / 2))))
        let segmentAngle = deltaTheta / Double(segmentCount)
        let k = 4.0 / 3.0 * tan(segmentAngle / 4)

        var currentTheta = theta1
        for _ in 0..<segmentCount {
            let nextTheta = currentTheta + segmentAngle

            let cosCur = cos(currentTheta), sinCur = sin(currentTheta)
            let cosNext = cos(nextTheta), sinNext = sin(nextTheta)

            func ellipsePoint(_ cosT: Double, _ sinT: Double) -> CGPoint {
                let ex = cx + rx * cosT * cosPhi - ry * sinT * sinPhi
                let ey = cy + rx * cosT * sinPhi + ry * sinT * cosPhi
                return CGPoint(x: ex, y: ey)
            }
            func ellipseDerivative(_ cosT: Double, _ sinT: Double) -> CGPoint {
                let dx = -rx * sinT * cosPhi - ry * cosT * sinPhi
                let dy = -rx * sinT * sinPhi + ry * cosT * cosPhi
                return CGPoint(x: dx, y: dy)
            }

            let p1 = ellipsePoint(cosCur, sinCur)
            let p2 = ellipsePoint(cosNext, sinNext)
            let d1 = ellipseDerivative(cosCur, sinCur)
            let d2 = ellipseDerivative(cosNext, sinNext)

            let c1 = CGPoint(x: p1.x + k * d1.x, y: p1.y + k * d1.y)
            let c2 = CGPoint(x: p2.x - k * d2.x, y: p2.y - k * d2.y)

            path.addCurve(to: p2, control1: c1, control2: c2)
            currentTheta = nextTheta
        }
    }
}
