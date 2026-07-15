import SwiftUI

public enum SVGPathParser {
    /// Parses an SVG path `d` attribute string into a SwiftUI `Path`.
    /// Supports: M/m, L/l, H/h, V/v, C/c, Q/q, A/a, Z/z.
    public static func parse(_ pathData: String) -> Path {
        var path = Path()
        var scanner = PathScanner(pathData)
        var current = CGPoint.zero
        var subpathStart = CGPoint.zero
        var lastControlPoint: CGPoint?
        var lastCommand: Character?

        while let command = scanner.nextCommand(previous: lastCommand) {
            let isRelative = command.isLowercase
            switch command.lowercased().first! {
            case "m":
                let point = scanner.nextPoint()
                current = isRelative ? current.offset(by: point) : point
                subpathStart = current
                path.move(to: current)
                lastControlPoint = nil
            case "l":
                let point = scanner.nextPoint()
                current = isRelative ? current.offset(by: point) : point
                path.addLine(to: current)
                lastControlPoint = nil
            case "h":
                let x = scanner.nextNumber()
                current = CGPoint(x: isRelative ? current.x + x : x, y: current.y)
                path.addLine(to: current)
                lastControlPoint = nil
            case "v":
                let y = scanner.nextNumber()
                current = CGPoint(x: current.x, y: isRelative ? current.y + y : y)
                path.addLine(to: current)
                lastControlPoint = nil
            case "c":
                let c1 = scanner.nextPoint()
                let c2 = scanner.nextPoint()
                let end = scanner.nextPoint()
                let absC1 = isRelative ? current.offset(by: c1) : c1
                let absC2 = isRelative ? current.offset(by: c2) : c2
                let absEnd = isRelative ? current.offset(by: end) : end
                path.addCurve(to: absEnd, control1: absC1, control2: absC2)
                current = absEnd
                lastControlPoint = absC2
            case "q":
                let c1 = scanner.nextPoint()
                let end = scanner.nextPoint()
                let absC1 = isRelative ? current.offset(by: c1) : c1
                let absEnd = isRelative ? current.offset(by: end) : end
                path.addQuadCurve(to: absEnd, control: absC1)
                current = absEnd
                lastControlPoint = absC1
            case "a":
                let rx = scanner.nextNumber()
                let ry = scanner.nextNumber()
                let xRotation = scanner.nextNumber()
                let largeArc = scanner.nextFlag()
                let sweep = scanner.nextFlag()
                let end = scanner.nextPoint()
                let absEnd = isRelative ? current.offset(by: end) : end
                SVGArcConverter.appendArc(
                    to: &path,
                    from: current,
                    to: absEnd,
                    radiusX: rx,
                    radiusY: ry,
                    xAxisRotationDegrees: xRotation,
                    largeArcFlag: largeArc,
                    sweepFlag: sweep
                )
                current = absEnd
                lastControlPoint = nil
            case "z":
                path.closeSubpath()
                current = subpathStart
                lastControlPoint = nil
            default:
                break
            }
            lastCommand = command
        }

        return path
    }
}

private extension CGPoint {
    func offset(by delta: CGPoint) -> CGPoint {
        CGPoint(x: x + delta.x, y: y + delta.y)
    }
}

/// Scans an SVG path data string into commands, numbers, and flags.
/// SVG path syntax allows numbers to be separated by whitespace, commas, or
/// nothing at all when unambiguous (e.g. "1.5.5" is two numbers "1.5" and ".5";
/// arc flags "01" are two single-digit flags "0" and "1" with no separator).
struct PathScanner {
    private let chars: [Character]
    private var index = 0

    init(_ string: String) {
        self.chars = Array(string)
    }

    mutating func nextCommand(previous: Character?) -> Character? {
        skipSeparators()
        guard index < chars.count else { return nil }
        let c = chars[index]
        if "MmLlHhVvCcQqAaZz".contains(c) {
            index += 1
            return c
        }
        // Implicit repeat: a number follows without a new command letter.
        // Z/z takes no arguments, so it can never implicitly repeat -- treat
        // a bare number after Z as malformed input and stop parsing rather
        // than looping forever on unconsumed input.
        if let previous, previous.lowercased() != "z", c == "-" || c == "." || c == "+" || c.isNumber {
            if previous.lowercased() == "m" {
                return previous.isLowercase ? "l" : "L"
            }
            return previous
        }
        return nil
    }

    mutating func nextNumber() -> Double {
        skipSeparators()
        var result = ""
        var seenDot = false
        var seenDigitOrDot = false
        if index < chars.count, chars[index] == "-" || chars[index] == "+" {
            result.append(chars[index])
            index += 1
        }
        while index < chars.count {
            let c = chars[index]
            if c.isNumber {
                result.append(c)
                seenDigitOrDot = true
                index += 1
            } else if c == "." && !seenDot {
                result.append(c)
                seenDot = true
                seenDigitOrDot = true
                index += 1
            } else if (c == "e" || c == "E"), seenDigitOrDot {
                result.append(c)
                index += 1
                if index < chars.count, chars[index] == "-" || chars[index] == "+" {
                    result.append(chars[index])
                    index += 1
                }
            } else {
                break
            }
        }
        return Double(result) ?? 0
    }

    mutating func nextPoint() -> CGPoint {
        let x = nextNumber()
        let y = nextNumber()
        return CGPoint(x: x, y: y)
    }

    /// Arc flags are always exactly one character: '0' or '1', with no
    /// separator required before the next number (e.g. "012.89" = flag "0",
    /// flag "1", then the number "2.89").
    mutating func nextFlag() -> Bool {
        skipSeparators()
        guard index < chars.count else { return false }
        let c = chars[index]
        index += 1
        return c == "1"
    }

    private mutating func skipSeparators() {
        while index < chars.count, chars[index] == " " || chars[index] == "," || chars[index] == "\n" || chars[index] == "\t" {
            index += 1
        }
    }
}
