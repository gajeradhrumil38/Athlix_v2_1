# Swift Dashboard Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PlaceholderDashboardView` with a fully data-driven native Dashboard: 8 widgets in fixed order, backed by real Supabase data, including a pixel-faithful port of the web app's anatomical Muscle Map (real SVG body diagram + the full exercise-to-muscle mapping table) and its weekly muscle-radar chart.

**Architecture:** New `AthlixCore` additions — `SVGPathParser` (custom SVG path-command parser, TDD'd against real extracted path fixtures), `MuscleBodyPaths` (verbatim-extracted anatomical path data), `ExerciseMuscleMapper` (verbatim Swift port of `exerciseMuscles.ts`'s pattern-matching muscle-load engine), repositories (`WorkoutRepository`, `PersonalRecordRepository`, `BodyWeightRepository`) following the `AuthManager`/mock-client pattern from the Foundation milestone, and derived pure functions (streak calculation, intensity tiering). New `ios/Athlix/Features/Dashboard/` SwiftUI views assemble these into the 8-widget scrolling stack, replacing the placeholder.

**Tech Stack:** Swift 6, SwiftUI, XCTest, `supabase-swift` (already integrated), SwiftData (new — first real use in this rewrite).

---

## Scope Reminder (from the approved design spec)

- Fixed widget order, no drag-and-drop, no WHOOP widget, no Timeline. Read-only.
- Muscle Map must be **visually identical** to the current web app — verbatim path/color data, no simplification. Manual verification for this widget includes a side-by-side screenshot comparison against the web app.
- Full spec: `docs/superpowers/specs/2026-07-14-swift-dashboard-design.md`

---

### Task 1: Extract anatomical body-diagram path data

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Muscle/MuscleBodyPaths.swift`

- [ ] **Step 1: Extract the raw path data from the npm package**

Run this to see the exact source data you're porting (do not modify these files — they belong to `node_modules` and are read-only reference material):

```bash
cat /Users/dhrumilgajera/Desktop/AthlixV2.1-1/node_modules/react-muscle-highlighter/dist/esm/assets/bodyFront.js
cat /Users/dhrumilgajera/Desktop/AthlixV2.1-1/node_modules/react-muscle-highlighter/dist/esm/assets/bodyBack.js
```

Each file exports an array of entries shaped like:
```js
{
    slug: "chest",
    color: "#3f3f3f",
    path: {
        left: ["M272.91 422.84c-18.95-17.19...z"],
        right: ["M416.04 435c-15.12.11...z"],
    },
},
```
(Some muscle groups only have a single unsplit path, not left/right — check each entry's actual shape rather than assuming all have both sides.)

- [ ] **Step 2: Port every entry verbatim into a Swift data structure**

```swift
// ios/AthlixCore/Sources/AthlixCore/Muscle/MuscleBodyPaths.swift
import Foundation

public struct MuscleBodyPathEntry: Sendable {
    public let slug: String
    /// Raw SVG path-data strings for this muscle group on this body view.
    /// May contain 1 (unsplit) or 2 (left/right) path strings.
    public let pathStrings: [String]

    public init(slug: String, pathStrings: [String]) {
        self.slug = slug
        self.pathStrings = pathStrings
    }
}

public enum MuscleBodyPaths {
    /// Ported verbatim from node_modules/react-muscle-highlighter/dist/esm/assets/bodyFront.js
    public static let front: [MuscleBodyPathEntry] = [
        // Port EVERY entry from bodyFront.js here, in the same order,
        // flattening each entry's `path.left`/`path.right` (or single `path`)
        // arrays into `pathStrings`. Example for the "chest" entry:
        MuscleBodyPathEntry(slug: "chest", pathStrings: [
            "M272.91 422.84c-18.95-17.19-22-57-12.64-78.79 5.57-12.99 26.54-24.37 39.97-25.87q20.36-2.26 37.02.75c9.74 1.76 16.13 15.64 18.41 25.04 3.99 16.48 3.23 31.38 1.67 48.06q-1.35 14.35-2.05 16.89c-6.52 23.5-38.08 29.23-58.28 24.53-9.12-2.12-17.24-4.38-24.1-10.61z",
            "M416.04 435c-15.12.11-34.46-6.78-41.37-21.48q-1.88-3.99-2.84-12.18c-2.89-24.41-5.9-53.65 8.44-74.79 4.26-6.26 10.49-7.93 18.36-8.56q11.66-.92 23.32-.35c10.58.53 18.02 2.74 26.62 7.87 12.81 7.65 19.73 14.52 22.67 29.75 4.94 25.57.24 64.14-28.21 74.97q-12.26 4.67-26.99 4.77z",
        ]),
        // ... continue for every remaining entry in bodyFront.js (biceps, triceps,
        // deltoids, abs, obliques, quadriceps, forearm, etc. — whatever slugs
        // actually appear in the source file).
    ]

    /// Ported verbatim from node_modules/react-muscle-highlighter/dist/esm/assets/bodyBack.js
    public static let back: [MuscleBodyPathEntry] = [
        // Port EVERY entry from bodyBack.js here, same approach as `front`.
    ]
}
```

**This is a data-transcription task, not a design task**: every path string must be copied character-for-character from the source `.js` files. Do not paraphrase, round numbers, or "clean up" the path data — a single mismatched digit changes the rendered shape.

- [ ] **Step 3: Verify the data compiles and spot-check integrity**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift build`
Expected: `Build complete!`

Then verify no transcription errors by diffing path counts:
```bash
# Count path strings you extracted vs. what's in the source
grep -c '"M' /Users/dhrumilgajera/Desktop/AthlixV2.1-1/node_modules/react-muscle-highlighter/dist/esm/assets/bodyFront.js
grep -c '"M' /Users/dhrumilgajera/Desktop/AthlixV2.1-1/node_modules/react-muscle-highlighter/dist/esm/assets/bodyBack.js
```
Your `MuscleBodyPaths.front`/`.back` arrays' total `pathStrings.count` (summed across all entries) must match these counts exactly.

- [ ] **Step 4: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Muscle/MuscleBodyPaths.swift
git commit -m "Port anatomical body-diagram SVG path data from react-muscle-highlighter"
```

---

### Task 2: `SVGPathParser` — basic commands (M, L, H, V, Z, C, Q)

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Muscle/SVGPathParser.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/SVGPathParserTests.swift`

- [ ] **Step 1: Write failing tests using real extracted path fixtures**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/SVGPathParserTests.swift
import XCTest
import SwiftUI
@testable import AthlixCore

final class SVGPathParserTests: XCTestCase {
    func testParsesSimpleMoveAndLine() {
        let path = SVGPathParser.parse("M10 10L20 20L10 20Z")
        let bounds = path.boundingRect
        XCTAssertEqual(bounds.minX, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 20, accuracy: 0.01)
        XCTAssertEqual(bounds.minY, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxY, 20, accuracy: 0.01)
    }

    func testParsesRelativeMoveAndLine() {
        // "m" moveto is relative to the current point (0,0 at start), "l" lineto also relative
        let path = SVGPathParser.parse("m10 10l10 0l0 10z")
        let bounds = path.boundingRect
        XCTAssertEqual(bounds.minX, 10, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 20, accuracy: 0.01)
    }

    func testParsesRealChestPathLeftSide() {
        // Real fixture: the "chest" left-side path from bodyFront.js (Task 1).
        // Known SVG-authoring-tool bounding box for this path (computed via
        // an SVG bounding-box tool against the original path string).
        let path = SVGPathParser.parse(
            "M272.91 422.84c-18.95-17.19-22-57-12.64-78.79 5.57-12.99 26.54-24.37 39.97-25.87q20.36-2.26 37.02.75c9.74 1.76 16.13 15.64 18.41 25.04 3.99 16.48 3.23 31.38 1.67 48.06q-1.35 14.35-2.05 16.89c-6.52 23.5-38.08 29.23-58.28 24.53-9.12-2.12-17.24-4.38-24.1-10.61z"
        )
        let bounds = path.boundingRect
        // The path's own coordinates range roughly x:[257,332] y:[317,447] —
        // assert the parsed shape lands in that neighborhood (loose tolerance
        // since exact bezier extrema differ slightly from control-point bounds).
        XCTAssertGreaterThan(bounds.minX, 250)
        XCTAssertLessThan(bounds.maxX, 340)
        XCTAssertGreaterThan(bounds.minY, 310)
        XCTAssertLessThan(bounds.maxY, 455)
    }

    func testEmptyStringProducesEmptyPath() {
        let path = SVGPathParser.parse("")
        XCTAssertTrue(path.isEmpty)
    }

    func testMultipleSubpathsViaRepeatedMoveto() {
        // Two separate closed triangles via two "M...Z" subpaths in one string
        let path = SVGPathParser.parse("M0 0L10 0L0 10ZM20 20L30 20L20 30Z")
        let bounds = path.boundingRect
        XCTAssertEqual(bounds.minX, 0, accuracy: 0.01)
        XCTAssertEqual(bounds.maxX, 30, accuracy: 0.01)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter SVGPathParserTests`
Expected: FAIL — `cannot find 'SVGPathParser' in scope`

- [ ] **Step 3: Implement the tokenizer and basic-command parser**

```swift
// ios/AthlixCore/Sources/AthlixCore/Muscle/SVGPathParser.swift
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
```

- [ ] **Step 4: Implement the number/point/flag scanner**

```swift
// Add to the same file: ios/AthlixCore/Sources/AthlixCore/Muscle/SVGPathParser.swift

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
        // SVG allows omitting the command letter for repeated commands
        // (e.g. "L10 10 20 20" means two lineto commands). "moveto" repeats
        // as "lineto" per spec section 9.3.3.
        if let previous, c == "-" || c == "." || c.isNumber {
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
```

- [ ] **Step 5: Add a placeholder `SVGArcConverter` so the file compiles (real implementation is Task 3)**

```swift
// ios/AthlixCore/Sources/AthlixCore/Muscle/SVGArcConverter.swift
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
        // non-arc tests pass. Task 3 replaces this with the real
        // arc-to-cubic-Bezier conversion.
        path.addLine(to: end)
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter SVGPathParserTests`
Expected: PASS — 5 tests run, all green.

- [ ] **Step 7: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Muscle/SVGPathParser.swift ios/AthlixCore/Sources/AthlixCore/Muscle/SVGArcConverter.swift ios/AthlixCore/Tests/AthlixCoreTests/SVGPathParserTests.swift
git commit -m "Add SVGPathParser for M/L/H/V/C/Q/Z commands with real path fixtures"
```

---

### Task 3: `SVGArcConverter` — real elliptical arc support

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Muscle/SVGArcConverter.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/SVGArcConverterTests.swift`

- [ ] **Step 1: Write failing tests using a real arc-containing path fixture**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/SVGArcConverterTests.swift
import XCTest
import SwiftUI
@testable import AthlixCore

final class SVGArcConverterTests: XCTestCase {
    func testSimpleQuarterCircleArc() {
        // A quarter circle: from (10,0) to (0,10), radius 10, centered at origin.
        var path = Path()
        path.move(to: CGPoint(x: 10, y: 0))
        SVGArcConverter.appendArc(
            to: &path,
            from: CGPoint(x: 10, y: 0),
            to: CGPoint(x: 0, y: 10),
            radiusX: 10, radiusY: 10,
            xAxisRotationDegrees: 0,
            largeArcFlag: false,
            sweepFlag: true
        )
        let bounds = path.boundingRect
        // The arc should bow outward, so its bounding box should reach
        // close to (10,10) even though the endpoints are (10,0) and (0,10).
        XCTAssertGreaterThan(bounds.maxX, 9)
        XCTAssertGreaterThan(bounds.maxY, 9)
    }

    func testRealChestPathWithArcSegmentParsesWithoutCrashing() {
        // Real fixture containing an arc command with concatenated flags:
        // "a1.71 1.71 0 012.89 1.12" -- flags "0" and "1" have no separator
        // before the following number "2.89", which is the classic SVG arc
        // flag-parsing gotcha this converter must handle correctly.
        let pathString = "M438.7 444.36c-2.09-4.03-.13-6.83 3.63-8.81 10.22-5.36 16.79-11 24.23-18.07a1.71 1.71 0 012.89 1.12c.33 4.74-.81 14.39-5.53 17.22-4.68 2.82-18.74 10.02-24.39 9.14q-.57-.09-.83-.6z"
        let path = SVGPathParser.parse(pathString)
        XCTAssertFalse(path.isEmpty)
        let bounds = path.boundingRect
        // Known coordinate range from the raw path data (control points span
        // roughly x:[408,463] y:[417,445]); allow tolerance for curve extrema.
        XCTAssertGreaterThan(bounds.minX, 400)
        XCTAssertLessThan(bounds.maxX, 470)
    }

    func testFlagParsingHandlesConcatenatedDigits() {
        // Isolates the exact gotcha: "01" must parse as flag=0, flag=1 --
        // NOT as a single number "01" or flag=0 followed by a malformed number.
        var scanner = PathScanner("012.89 1.12")
        let flag1 = scanner.nextFlag()
        let flag2 = scanner.nextFlag()
        let point = scanner.nextPoint()
        XCTAssertEqual(flag1, false)
        XCTAssertEqual(flag2, true)
        XCTAssertEqual(point.x, 2.89, accuracy: 0.001)
        XCTAssertEqual(point.y, 1.12, accuracy: 0.001)
    }
}
```

- [ ] **Step 2: Run tests to verify the real-arc-conversion assertions fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter SVGArcConverterTests`
Expected: `testSimpleQuarterCircleArc` and `testRealChestPathWithArcSegmentParsesWithoutCrashing` FAIL (placeholder draws a straight line, so bounds don't bow outward as expected). `testFlagParsingHandlesConcatenatedDigits` should already PASS (it tests `PathScanner` from Task 2, not the arc converter) — if it doesn't, fix `PathScanner.nextFlag()` first before proceeding.

- [ ] **Step 3: Implement the real SVG-arc-to-cubic-Bezier conversion**

```swift
// ios/AthlixCore/Sources/AthlixCore/Muscle/SVGArcConverter.swift
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

        // Step 1: compute (x1', y1') -- midpoint-relative coordinates
        let dx2 = (from.x - end.x) / 2
        let dy2 = (from.y - end.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2

        // Step 2: correct out-of-range radii
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let scale = sqrt(lambda)
            rx *= scale
            ry *= scale
        }

        // Step 3: compute (cx', cy')
        let sign: Double = (largeArcFlag == sweepFlag) ? -1 : 1
        let num = max(0, (rx * rx * ry * ry) - (rx * rx * y1p * y1p) - (ry * ry * x1p * x1p))
        let den = (rx * rx * y1p * y1p) + (ry * ry * x1p * x1p)
        let coef = den == 0 ? 0 : sign * sqrt(num / den)
        let cxp = coef * (rx * y1p / ry)
        let cyp = coef * -(ry * x1p / rx)

        // Step 4: compute (cx, cy) from (cx', cy')
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

        // Step 5: split into segments of at most 90 degrees each, approximate
        // each with a cubic Bezier.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter SVGArcConverterTests`
Expected: PASS — 3 tests run, all green.

- [ ] **Step 5: Run the full parser test suite plus full package suite to check for regressions**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — all tests green (23 total: 20 from Foundation + 3 new `SVGArcConverterTests`; `SVGPathParserTests`' 5 tests were already counted when Task 2 committed).

- [ ] **Step 6: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Muscle/SVGArcConverter.swift ios/AthlixCore/Tests/AthlixCoreTests/SVGArcConverterTests.swift
git commit -m "Implement real SVG elliptical arc to cubic Bezier conversion"
```

---

### Task 4: Complete `MuscleBodyPaths` data porting and verify against the parser

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Muscle/MuscleBodyPaths.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/MuscleBodyPathsTests.swift`

Task 1 established the structure and ported one example entry (`chest`) as a template. This task completes the full transcription of every remaining muscle group and verifies the complete dataset parses cleanly.

- [ ] **Step 1: Write the verification test**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/MuscleBodyPathsTests.swift
import XCTest
@testable import AthlixCore

final class MuscleBodyPathsTests: XCTestCase {
    func testFrontHasEntryForEveryExpectedSlug() {
        // Cross-check against the slugs referenced in ColorTokens/MuscleMap.tsx's
        // SLUG_HEX table (chest, biceps, triceps, deltoids, abs, obliques,
        // upper-back, lower-back, trapezius, quadriceps, hamstring, calves,
        // gluteal, adductors, tibialis, ankles, forearm, neck) -- not every
        // slug appears in every view (e.g. some are back-only), so this just
        // asserts front/back together cover a reasonable superset, not that
        // every slug is in both.
        let frontSlugs = Set(MuscleBodyPaths.front.map(\.slug))
        let backSlugs = Set(MuscleBodyPaths.back.map(\.slug))
        let allSlugs = frontSlugs.union(backSlugs)
        XCTAssertTrue(allSlugs.contains("chest"))
        XCTAssertTrue(allSlugs.contains("biceps"))
        XCTAssertTrue(allSlugs.contains("quadriceps"))
        XCTAssertGreaterThan(allSlugs.count, 10)
    }

    func testEveryPathStringParsesToNonEmptyPath() {
        for entry in MuscleBodyPaths.front + MuscleBodyPaths.back {
            for pathString in entry.pathStrings {
                let path = SVGPathParser.parse(pathString)
                XCTAssertFalse(path.isEmpty, "Empty path for slug \(entry.slug): \(pathString.prefix(40))...")
            }
        }
    }

    func testPathStringCountMatchesSourceFileCount() {
        // These counts come from `grep -c '"M' bodyFront.js` / `bodyBack.js`
        // (run this yourself against the actual files to get the real
        // numbers -- do not guess; use the exact counts you observed when
        // transcribing in Task 1).
        let totalFront = MuscleBodyPaths.front.reduce(0) { $0 + $1.pathStrings.count }
        let totalBack = MuscleBodyPaths.back.reduce(0) { $0 + $1.pathStrings.count }
        XCTAssertGreaterThan(totalFront, 0)
        XCTAssertGreaterThan(totalBack, 0)
        // Replace these placeholders with the actual grep counts before
        // considering this test complete -- if you don't know them yet,
        // run the grep commands from Task 1 Step 3 first.
        let expectedFrontCount = totalFront // TODO becomes a real assertion once counted
        let expectedBackCount = totalBack
        XCTAssertEqual(totalFront, expectedFrontCount)
        XCTAssertEqual(totalBack, expectedBackCount)
    }
}
```

**Note on Step 1's last test**: `testPathStringCountMatchesSourceFileCount` as written is a placeholder that trivially passes (comparing a value to itself). Before considering this task done, run the actual `grep -c` commands from Task 1 Step 3, get the real numbers, and hard-code them as the expected values (e.g. `let expectedFrontCount = 87`) so this test actually catches a future accidental deletion or duplication of path entries. Do not leave it comparing a variable to itself.

- [ ] **Step 2: Complete the transcription in `MuscleBodyPaths.swift`**

Go through `bodyFront.js` and `bodyBack.js` entry by entry and add every remaining `MuscleBodyPathEntry` to the `front`/`back` arrays (Task 1 already did `chest` in `front` as a template — continue from there). For each entry: use the exact `slug` string, and collect all of that entry's path strings (whether stored as `path.left`/`path.right` or a single `path` array) into `pathStrings`.

- [ ] **Step 3: Fix the count-verification test with real numbers**

Run:
```bash
grep -c '"M' /Users/dhrumilgajera/Desktop/AthlixV2.1-1/node_modules/react-muscle-highlighter/dist/esm/assets/bodyFront.js
grep -c '"M' /Users/dhrumilgajera/Desktop/AthlixV2.1-1/node_modules/react-muscle-highlighter/dist/esm/assets/bodyBack.js
```
Update `testPathStringCountMatchesSourceFileCount` to assert against these literal numbers instead of comparing a value to itself.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter MuscleBodyPathsTests`
Expected: PASS — 3 tests run, all green, with the count test now asserting real, hard-coded numbers.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Muscle/MuscleBodyPaths.swift ios/AthlixCore/Tests/AthlixCoreTests/MuscleBodyPathsTests.swift
git commit -m "Complete anatomical body-diagram path data transcription with verification"
```

---

### Task 5: `ExerciseMuscleMapper` — port the exercise-to-muscle mapping engine

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Muscle/ExerciseMuscleMapper.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/ExerciseMuscleMapperTests.swift`

This ports `src/lib/exerciseMuscles.ts` verbatim: the muscle-slug region map, the label map, the fallback-by-region-type table, and the ~50-entry regex-pattern-to-muscle-target list that determines which muscles an exercise trains, given its name.

- [ ] **Step 1: Read the source file completely before starting**

```bash
cat /Users/dhrumilgajera/Desktop/AthlixV2.1-1/src/lib/exerciseMuscles.ts
```

Every constant (`MUSCLE_SLUG_LABELS`, `MUSCLE_SLUG_REGION_MAP`, `FALLBACK_TARGETS_BY_GROUP`, `EXERCISE_MUSCLE_PATTERNS`) and every function (`normalizeTargets`, `deriveRegionsFromTargets`, `buildProfile`, `getExerciseRegionWeights`, `buildProfileFromSlugs`, `getExerciseMuscleProfile`) must be ported with equivalent behavior, in the same order (pattern-matching is order-sensitive — the first matching pattern wins, exactly as in the TypeScript `for...of` loop).

- [ ] **Step 2: Write failing tests covering the algorithm and a representative sample of patterns**

Testing all ~50 regex patterns exhaustively would be impractical; these tests cover the core algorithm plus enough real patterns (including tricky ones: multi-pattern-per-rule, order-dependent overlaps, region overrides, and the fallback path) to catch a faithful vs. unfaithful port:

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/ExerciseMuscleMapperTests.swift
import XCTest
@testable import AthlixCore

final class ExerciseMuscleMapperTests: XCTestCase {
    func testBenchPressMapsToChestTricepsDeltoids() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Bench Press")
        let slugs = Set(profile.targets.map(\.slug))
        XCTAssertTrue(slugs.contains("chest"))
        XCTAssertTrue(slugs.contains("triceps"))
        XCTAssertTrue(slugs.contains("deltoids"))
        // chest should be the heaviest target (weight 1, vs 0.55/0.42 for the others)
        let chestWeight = profile.targets.first { $0.slug == "chest" }?.weight ?? 0
        let tricepsWeight = profile.targets.first { $0.slug == "triceps" }?.weight ?? 0
        XCTAssertGreaterThan(chestWeight, tricepsWeight)
    }

    func testInclinePressMatchesBeforeGenericBenchPress() {
        // "Incline Bench Press" must match the /incline (bench )?press/i rule
        // (chest 0.88, deltoids 0.55, triceps 0.45), NOT the later generic
        // /bench press/i rule (chest 1, triceps 0.55, deltoids 0.42) --
        // this specifically tests that pattern ORDER is preserved from the
        // TypeScript source, since the two rules would both match the string
        // and only the first (in source order) should win.
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Incline Bench Press")
        let chestWeight = profile.targets.first { $0.slug == "chest" }?.weight ?? 0
        XCTAssertEqual(chestWeight, 0.88, accuracy: 0.001)
    }

    func testSquatMapsToLegsWithQuadsAsPrimary() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Barbell Squat")
        XCTAssertTrue(profile.primary.contains("Legs"))
        let quadWeight = profile.targets.first { $0.slug == "quadriceps" }?.weight ?? 0
        XCTAssertEqual(quadWeight, 0.88, accuracy: 0.001)
    }

    func testUnknownExerciseNameFallsBackToMuscleGroup() {
        // No pattern matches "Some Made Up Exercise Name", so it should fall
        // back to FALLBACK_TARGETS_BY_GROUP using the provided fallback group.
        let profile = ExerciseMuscleMapper.profile(
            forExerciseName: "Some Made Up Exercise Name",
            fallbackMuscleGroup: "Biceps"
        )
        let slugs = Set(profile.targets.map(\.slug))
        XCTAssertTrue(slugs.contains("biceps"))
        XCTAssertTrue(profile.primary.contains("Biceps"))
    }

    func testUnknownExerciseNoFallbackGroupDefaultsToCore() {
        let profile = ExerciseMuscleMapper.profile(forExerciseName: "Totally Unrecognized")
        XCTAssertTrue(profile.primary.contains("Core"))
    }

    func testExplicitMuscleSlugsOverridePatternMatching() {
        // When explicit muscleSlugs are provided (from exercise_library custom
        // entries), they take precedence over name-pattern matching entirely.
        let profile = ExerciseMuscleMapper.profile(
            forExerciseName: "Bench Press",
            muscleSlugs: [(slug: "biceps", type: .primary)]
        )
        XCTAssertEqual(profile.targets.map(\.slug), ["biceps"])
        XCTAssertTrue(profile.primary.contains("Biceps"))
    }

    func testNormalizeTargetsMergesDuplicateSlugsAndSortsDescending() {
        let merged = ExerciseMuscleMapper.normalizeTargets([
            ExerciseMuscleTarget(slug: "chest", weight: 0.5),
            ExerciseMuscleTarget(slug: "triceps", weight: 0.3),
            ExerciseMuscleTarget(slug: "chest", weight: 0.5),
        ])
        XCTAssertEqual(merged.count, 2)
        XCTAssertEqual(merged.first?.slug, "chest")
        XCTAssertEqual(merged.first?.weight ?? 0, 1.0, accuracy: 0.001)
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter ExerciseMuscleMapperTests`
Expected: FAIL — `cannot find 'ExerciseMuscleMapper' in scope`

- [ ] **Step 4: Implement the port**

```swift
// ios/AthlixCore/Sources/AthlixCore/Muscle/ExerciseMuscleMapper.swift
import Foundation

public struct ExerciseMuscleTarget: Sendable, Equatable {
    public let slug: String
    public let weight: Double

    public init(slug: String, weight: Double) {
        self.slug = slug
        self.weight = weight
    }
}

public struct ExerciseMuscleProfile: Sendable, Equatable {
    public let primary: [String]
    public let secondary: [String]
    public let targets: [ExerciseMuscleTarget]
}

public enum MuscleTargetType: Sendable {
    case primary
    case secondary
}

public enum ExerciseMuscleMapper {
    public static let primaryLoadWeight = 1.0
    public static let secondaryLoadWeight = 0.4

    // Port MUSCLE_SLUG_LABELS verbatim (slug -> display label).
    public static let slugLabels: [String: String] = [
        "abs": "Abs", "adductors": "Adductors", "ankles": "Ankles",
        "biceps": "Biceps", "calves": "Calves", "chest": "Chest",
        "deltoids": "Shoulders", "forearm": "Forearms", "gluteal": "Glutes",
        "hamstring": "Hamstrings", "lower-back": "Lower Back",
        "obliques": "Obliques", "quadriceps": "Quads", "tibialis": "Tibialis",
        "trapezius": "Traps", "triceps": "Triceps", "upper-back": "Upper Back",
    ]

    // Port MUSCLE_SLUG_REGION_MAP verbatim (slug -> region).
    public static let slugRegionMap: [String: String] = [
        "abs": "Core", "adductors": "Legs", "ankles": "Legs",
        "biceps": "Biceps", "calves": "Legs", "chest": "Chest",
        "deltoids": "Shoulders", "forearm": "Forearms", "gluteal": "Glutes",
        "hamstring": "Legs", "lower-back": "Back", "obliques": "Core",
        "quadriceps": "Legs", "tibialis": "Legs", "trapezius": "Back",
        "triceps": "Triceps", "upper-back": "Back",
    ]

    // Port FALLBACK_TARGETS_BY_GROUP verbatim.
    public static let fallbackTargetsByGroup: [String: [ExerciseMuscleTarget]] = [
        "Chest": [t("chest", 1), t("deltoids", 0.28), t("triceps", 0.22)],
        "Back": [t("upper-back", 0.8), t("trapezius", 0.45), t("lower-back", 0.35), t("biceps", 0.2)],
        "Shoulders": [t("deltoids", 1), t("trapezius", 0.18)],
        "Biceps": [t("biceps", 1)],
        "Triceps": [t("triceps", 1)],
        "Arms": [t("biceps", 0.55), t("triceps", 0.55), t("forearm", 0.2)],
        "Legs": [t("quadriceps", 0.8), t("gluteal", 0.55), t("hamstring", 0.45), t("adductors", 0.22), t("calves", 0.15)],
        "Glutes": [t("gluteal", 1), t("hamstring", 0.45), t("adductors", 0.18)],
        "Core": [t("abs", 0.82), t("obliques", 0.42)],
        "Forearms": [t("forearm", 1)],
        "Cardio": [t("quadriceps", 0.45), t("calves", 0.42), t("hamstring", 0.22), t("gluteal", 0.18)],
        "Yoga": [t("lower-back", 0.45), t("hamstring", 0.45), t("abs", 0.38), t("deltoids", 0.3), t("adductors", 0.28), t("gluteal", 0.22)],
        "Mobility": [t("lower-back", 0.5), t("hamstring", 0.45), t("adductors", 0.4), t("gluteal", 0.3), t("tibialis", 0.2), t("calves", 0.18)],
    ]

    private struct PatternProfile {
        let patterns: [String] // regex patterns, case-insensitive
        let targets: [ExerciseMuscleTarget]
        let primaryRegions: [String]?
        let secondaryRegions: [String]?
    }

    // Port EXERCISE_MUSCLE_PATTERNS verbatim, IN THE SAME ORDER (order
    // determines which rule wins when multiple patterns match the same
    // exercise name -- the first match in this array wins, exactly like the
    // TypeScript `for...of` loop over EXERCISE_MUSCLE_PATTERNS).
    private static let patterns: [PatternProfile] = [
        PatternProfile(
            patterns: ["incline (bench )?press", "incline dumbbell press"],
            targets: [t("chest", 0.88), t("deltoids", 0.55), t("triceps", 0.45)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["close[- ]grip bench", "close grip bench"],
            targets: [t("triceps", 0.95), t("chest", 0.35), t("deltoids", 0.22)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["bench press", "chest press", "machine chest press", "smith (bench )?press", "decline (bench )?press", "dumbbell (bench|chest) press", "floor press"],
            targets: [t("chest", 1), t("triceps", 0.55), t("deltoids", 0.42)],
            primaryRegions: nil, secondaryRegions: nil
        ),
        PatternProfile(
            patterns: ["\\bsquat\\b"],
            targets: [t("quadriceps", 0.88), t("gluteal", 0.65), t("adductors", 0.3), t("hamstring", 0.18)],
            primaryRegions: ["Legs"], secondaryRegions: nil
        ),
        // ... CONTINUE PORTING EVERY REMAINING ENTRY FROM
        // EXERCISE_MUSCLE_PATTERNS in src/lib/exerciseMuscles.ts, IN THE
        // EXACT SAME ORDER, converting each TypeScript RegExp literal (e.g.
        // /incline (bench )?press/i) to a plain pattern string (the `i` flag
        // is applied uniformly via .caseInsensitive below, so drop it from
        // each individual pattern) and each `target(slug, weight)` call to
        // `t(slug, weight)`.
    ]

    private static func t(_ slug: String, _ weight: Double) -> ExerciseMuscleTarget {
        ExerciseMuscleTarget(slug: slug, weight: weight)
    }

    public static func normalizeTargets(_ targets: [ExerciseMuscleTarget]) -> [ExerciseMuscleTarget] {
        var bySlug: [String: Double] = [:]
        for target in targets where target.weight > 0 {
            bySlug[target.slug, default: 0] += target.weight
        }
        return bySlug
            .map { ExerciseMuscleTarget(slug: $0.key, weight: ($0.value * 1000).rounded() / 1000) }
            .sorted { $0.weight > $1.weight }
    }

    private static func deriveRegions(from targets: [ExerciseMuscleTarget]) -> (primary: [String], secondary: [String]) {
        var regionWeights: [String: Double] = [:]
        for target in targets {
            guard let region = slugRegionMap[target.slug] else { continue }
            regionWeights[region, default: 0] += target.weight
        }
        let sorted = regionWeights.sorted { $0.value > $1.value }
        guard let topWeight = sorted.first?.value else {
            return (["Core"], [])
        }
        let primary = sorted.enumerated()
            .filter { index, entry in entry.value >= topWeight * 0.65 || index == 0 }
            .map { $0.element.key }
        let secondary = sorted
            .filter { entry in !primary.contains(entry.key) && entry.value >= topWeight * 0.24 }
            .map { $0.key }
        return (uniqueOrdered(primary), uniqueOrdered(secondary))
    }

    private static func uniqueOrdered(_ items: [String]) -> [String] {
        var seen = Set<String>()
        return items.filter { seen.insert($0).inserted }
    }

    private static func buildProfile(
        targets: [ExerciseMuscleTarget],
        primaryRegions: [String]? = nil,
        secondaryRegions: [String]? = nil
    ) -> ExerciseMuscleProfile {
        let normalized = normalizeTargets(targets)
        let derived = deriveRegions(from: normalized)
        let primary = uniqueOrdered(primaryRegions ?? derived.primary)
        let secondary = uniqueOrdered((secondaryRegions ?? derived.secondary).filter { !primary.contains($0) })
        return ExerciseMuscleProfile(primary: primary, secondary: secondary, targets: normalized)
    }

    public static func profile(
        forExerciseName exerciseName: String,
        fallbackMuscleGroup: String? = nil,
        muscleSlugs: [(slug: String, type: MuscleTargetType)]? = nil
    ) -> ExerciseMuscleProfile {
        if let muscleSlugs, !muscleSlugs.isEmpty {
            let valid = muscleSlugs.filter { slugRegionMap[$0.slug] != nil }
            let targets = valid.map {
                ExerciseMuscleTarget(slug: $0.slug, weight: $0.type == .primary ? primaryLoadWeight : secondaryLoadWeight)
            }
            let primaryRegions = uniqueOrdered(valid.filter { $0.type == .primary }.compactMap { slugRegionMap[$0.slug] })
            let secondaryRegions = uniqueOrdered(valid.filter { $0.type == .secondary }.compactMap { slugRegionMap[$0.slug] })
            return buildProfile(targets: targets, primaryRegions: primaryRegions, secondaryRegions: secondaryRegions)
        }

        for pattern in patterns {
            let matches = pattern.patterns.contains { regex in
                (try? NSRegularExpression(pattern: regex, options: .caseInsensitive))
                    .map { $0.firstMatch(in: exerciseName, range: NSRange(exerciseName.startIndex..., in: exerciseName)) != nil }
                    ?? false
            }
            if matches {
                return buildProfile(targets: pattern.targets, primaryRegions: pattern.primaryRegions, secondaryRegions: pattern.secondaryRegions)
            }
        }

        if let fallbackMuscleGroup, let fallbackTargets = fallbackTargetsByGroup[fallbackMuscleGroup] {
            return buildProfile(targets: fallbackTargets, primaryRegions: [fallbackMuscleGroup])
        }

        return buildProfile(targets: fallbackTargetsByGroup["Core"] ?? [], primaryRegions: ["Core"])
    }
}
```

**Note**: the `patterns` array above shows the structural pattern (first 4 entries ported exactly, including the order-sensitivity example the tests rely on) — complete the remaining ~46 entries from `src/lib/exerciseMuscles.ts`'s `EXERCISE_MUSCLE_PATTERNS`, preserving exact order, exact weights, and exact regions.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter ExerciseMuscleMapperTests`
Expected: PASS — 7 tests run, all green.

- [ ] **Step 6: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Muscle/ExerciseMuscleMapper.swift ios/AthlixCore/Tests/AthlixCoreTests/ExerciseMuscleMapperTests.swift
git commit -m "Port ExerciseMuscleMapper (exercise-to-muscle-load engine) from exerciseMuscles.ts"
```

---

### Task 6: `MuscleBodyView` — render the anatomical diagram

**Files:**
- Create: `ios/Athlix/Features/Dashboard/MuscleBodyView.swift`

No unit test: this is a SwiftUI view composing already-tested `SVGPathParser`/`MuscleBodyPaths`/`ColorTokens`. Verified via the milestone's side-by-side visual comparison (Task 17).

- [ ] **Step 1: Implement `MuscleBodyView`**

```swift
// ios/Athlix/Features/Dashboard/MuscleBodyView.swift
import SwiftUI
import AthlixCore

struct MuscleBodyView: View {
    /// Maps muscle slug -> training intensity tier (0 = untrained, 1-4 = intensity).
    let intensityBySlug: [String: Int]
    @Binding var view: MuscleBodyViewSide

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
        let hex = Self.slugHex[slug] ?? Self.fallbackHex
        let intensity = intensityBySlug[slug] ?? 0
        guard intensity > 0 else { return Color(hex: hex).opacity(0.15) }
        let alpha = Self.intensityAlpha[min(intensity, 4) - 1]
        return Color(hex: hex).opacity(alpha)
    }

    var body: some View {
        let entries = view == .front ? MuscleBodyPaths.front : MuscleBodyPaths.back
        GeometryReader { geometry in
            ZStack {
                ForEach(entries, id: \.slug) { entry in
                    ForEach(entry.pathStrings, id: \.self) { pathString in
                        SVGPathParser.parse(pathString)
                            .fill(color(forSlug: entry.slug))
                    }
                }
            }
            .scaleEffect(
                x: geometry.size.width / 512,
                y: geometry.size.height / 512,
                anchor: .topLeading
            )
        }
        .aspectRatio(512.0 / 900.0, contentMode: .fit)
    }
}

enum MuscleBodyViewSide {
    case front
    case back
}
```

- [ ] **Step 2: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard/MuscleBodyView.swift
git commit -m "Add MuscleBodyView rendering the anatomical diagram from parsed SVG paths"
```

---

### Task 7: New models — `Workout`, `ExerciseSet`, `PersonalRecord`, `BodyWeightLog`

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/Workout.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/ExerciseSet.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/PersonalRecord.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/BodyWeightLog.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/WorkoutModelsTests.swift`

Field lists below are verified against the real `supabase/schema.sql` (`workouts`, `exercises`, `personal_records`, `body_weight_logs` tables) — the same discipline that caught the `Profile.height_cm` mismatch in the Foundation milestone.

- [ ] **Step 1: Write failing decode tests**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/WorkoutModelsTests.swift
import XCTest
@testable import AthlixCore

final class WorkoutModelsTests: XCTestCase {
    func testDecodesWorkoutFromSupabaseJSON() throws {
        let json = """
        {
            "id": "a1111111-1111-1111-1111-111111111111",
            "user_id": "b2222222-2222-2222-2222-222222222222",
            "title": "Push Day",
            "date": "2026-07-10",
            "duration_minutes": 62,
            "notes": null,
            "muscle_groups": ["Chest", "Triceps"],
            "created_at": "2026-07-10T14:00:00+00:00"
        }
        """.data(using: .utf8)!
        let workout = try JSONDecoder().decode(Workout.self, from: json)
        XCTAssertEqual(workout.title, "Push Day")
        XCTAssertEqual(workout.durationMinutes, 62)
        XCTAssertEqual(workout.muscleGroups, ["Chest", "Triceps"])
        XCTAssertNil(workout.notes)
    }

    func testDecodesExerciseSetFromSupabaseJSON() throws {
        let json = """
        {
            "id": "c3333333-3333-3333-3333-333333333333",
            "workout_id": "a1111111-1111-1111-1111-111111111111",
            "name": "Bench Press",
            "muscle_group": "Chest",
            "sets": 4,
            "reps": 8,
            "weight": 185.0,
            "unit": "lbs",
            "order_index": 0,
            "exercise_db_id": null
        }
        """.data(using: .utf8)!
        let exercise = try JSONDecoder().decode(ExerciseSet.self, from: json)
        XCTAssertEqual(exercise.name, "Bench Press")
        XCTAssertEqual(exercise.unit, .lbs)
        XCTAssertEqual(exercise.weight, 185.0)
    }

    func testDecodesPersonalRecordFromSupabaseJSON() throws {
        let json = """
        {
            "id": "d4444444-4444-4444-4444-444444444444",
            "user_id": "b2222222-2222-2222-2222-222222222222",
            "exercise_name": "Deadlift",
            "best_weight": 315.0,
            "best_reps": 3,
            "achieved_date": "2026-07-08",
            "created_at": "2026-07-08T10:00:00+00:00",
            "exercise_db_id": null
        }
        """.data(using: .utf8)!
        let pr = try JSONDecoder().decode(PersonalRecord.self, from: json)
        XCTAssertEqual(pr.exerciseName, "Deadlift")
        XCTAssertEqual(pr.bestWeight, 315.0)
        XCTAssertEqual(pr.bestReps, 3)
    }

    func testDecodesBodyWeightLogFromSupabaseJSON() throws {
        let json = """
        {
            "id": "e5555555-5555-5555-5555-555555555555",
            "user_id": "b2222222-2222-2222-2222-222222222222",
            "date": "2026-07-09",
            "weight": 180.5,
            "unit": "lbs",
            "notes": null,
            "created_at": "2026-07-09T08:00:00+00:00"
        }
        """.data(using: .utf8)!
        let log = try JSONDecoder().decode(BodyWeightLog.self, from: json)
        XCTAssertEqual(log.weight, 180.5)
        XCTAssertEqual(log.unit, .lbs)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter WorkoutModelsTests`
Expected: FAIL — `cannot find 'Workout' in scope` (and similarly for the other 3 types).

- [ ] **Step 3: Implement the models**

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/Workout.swift
import Foundation

public struct Workout: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let title: String
    public let date: String // ISO date string (YYYY-MM-DD), parsed on demand
    public let durationMinutes: Int?
    public let notes: String?
    public let muscleGroups: [String]?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title
        case date
        case durationMinutes = "duration_minutes"
        case notes
        case muscleGroups = "muscle_groups"
        case createdAt = "created_at"
    }
}
```

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/ExerciseSet.swift
import Foundation

public struct ExerciseSet: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let workoutId: String
    public let name: String
    public let muscleGroup: String?
    public let sets: Int
    public let reps: Int
    public let weight: Double
    public let unit: WeightUnit
    public let orderIndex: Int
    public let exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case workoutId = "workout_id"
        case name
        case muscleGroup = "muscle_group"
        case sets, reps, weight, unit
        case orderIndex = "order_index"
        case exerciseDbId = "exercise_db_id"
    }
}
```

**Note**: `ExerciseSet.unit`'s real Postgres `CHECK` constraint allows `'kg' | 'lbs' | 'km' | 'mi'` (for distance-based cardio exercises), but the existing `WeightUnit` enum from the Foundation milestone only has `.kg`/`.lbs`. Decoding a `km`/`mi` row would fail. For this milestone (strength-training widgets only, no running data), add `.kg`/`.lbs` as the only cases the Dashboard widgets need to handle, but make the field `unit: String` (not `WeightUnit`) here to avoid a decode failure on cardio-exercise rows that may exist in real user data — pattern-match on `.lbs`/`.kg` string values only where the Dashboard widgets actually consume this field.

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/PersonalRecord.swift
import Foundation

public struct PersonalRecord: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let exerciseName: String
    public let bestWeight: Double
    public let bestReps: Int
    public let achievedDate: String
    public let createdAt: String
    public let exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case exerciseName = "exercise_name"
        case bestWeight = "best_weight"
        case bestReps = "best_reps"
        case achievedDate = "achieved_date"
        case createdAt = "created_at"
        case exerciseDbId = "exercise_db_id"
    }
}
```

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/BodyWeightLog.swift
import Foundation

public struct BodyWeightLog: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let date: String
    public let weight: Double
    public let unit: WeightUnit
    public let notes: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case date, weight, unit, notes
        case createdAt = "created_at"
    }
}
```

Fix `ExerciseSet.swift`'s `unit` field to be `String` instead of `WeightUnit` per the note above, and adjust the test's assertion (`XCTAssertEqual(exercise.unit, .lbs)`) to `XCTAssertEqual(exercise.unit, "lbs")`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter WorkoutModelsTests`
Expected: PASS — 4 tests run, all green.

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Models/Workout.swift ios/AthlixCore/Sources/AthlixCore/Models/ExerciseSet.swift ios/AthlixCore/Sources/AthlixCore/Models/PersonalRecord.swift ios/AthlixCore/Sources/AthlixCore/Models/BodyWeightLog.swift ios/AthlixCore/Tests/AthlixCoreTests/WorkoutModelsTests.swift
git commit -m "Add Workout, ExerciseSet, PersonalRecord, BodyWeightLog models"
```

---

### Task 8: Repositories — `WorkoutRepository`, `PersonalRecordRepository`, `BodyWeightRepository`

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Data/PersonalRecordRepository.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Data/BodyWeightRepository.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/RepositoryTests.swift`

Follows the `SupabaseAuthClient`/`LiveSupabaseAuthClient`/mock pattern from the Foundation milestone: a protocol per repository, a live implementation wrapping the real `SupabaseClient`, and mock-tested business logic.

- [ ] **Step 1: Write failing tests against mock repositories**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/RepositoryTests.swift
import XCTest
@testable import AthlixCore

actor MockWorkoutRepository: WorkoutRepository {
    var stubbedWorkouts: [Workout] = []
    var shouldThrow = false

    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        if shouldThrow { throw RepositoryError.network }
        return stubbedWorkouts
    }
}

actor MockPersonalRecordRepository: PersonalRecordRepository {
    var stubbedRecords: [PersonalRecord] = []

    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord] {
        stubbedRecords
    }
}

actor MockBodyWeightRepository: BodyWeightRepository {
    var stubbedLogs: [BodyWeightLog] = []

    func fetchBodyWeightLogs(userId: String) async throws -> [BodyWeightLog] {
        stubbedLogs
    }
}

final class RepositoryTests: XCTestCase {
    func testWorkoutRepositoryReturnsStubbedData() async throws {
        let workout = Workout(
            id: "1", userId: "u1", title: "Leg Day", date: "2026-07-10",
            durationMinutes: 50, notes: nil, muscleGroups: ["Legs"], createdAt: "2026-07-10T00:00:00Z"
        )
        let mock = MockWorkoutRepository()
        await mock.setStubbedWorkouts([workout])

        let result = try await mock.fetchWorkouts(userId: "u1", from: Date(), to: Date())
        XCTAssertEqual(result, [workout])
    }

    func testWorkoutRepositoryPropagatesErrors() async {
        let mock = MockWorkoutRepository()
        await mock.setShouldThrow(true)

        do {
            _ = try await mock.fetchWorkouts(userId: "u1", from: Date(), to: Date())
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(error as? RepositoryError, .network)
        }
    }

    func testPersonalRecordRepositoryReturnsStubbedData() async throws {
        let pr = PersonalRecord(
            id: "1", userId: "u1", exerciseName: "Squat", bestWeight: 315,
            bestReps: 5, achievedDate: "2026-07-01", createdAt: "2026-07-01T00:00:00Z", exerciseDbId: nil
        )
        let mock = MockPersonalRecordRepository()
        await mock.setStubbedRecords([pr])

        let result = try await mock.fetchPersonalRecords(userId: "u1")
        XCTAssertEqual(result, [pr])
    }

    func testBodyWeightRepositoryReturnsStubbedData() async throws {
        let log = BodyWeightLog(
            id: "1", userId: "u1", date: "2026-07-10", weight: 180,
            unit: .lbs, notes: nil, createdAt: "2026-07-10T00:00:00Z"
        )
        let mock = MockBodyWeightRepository()
        await mock.setStubbedLogs([log])

        let result = try await mock.fetchBodyWeightLogs(userId: "u1")
        XCTAssertEqual(result, [log])
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter RepositoryTests`
Expected: FAIL — `cannot find type 'WorkoutRepository' in scope` (and similarly for the others). You'll also need to add `setStubbedWorkouts`/`setShouldThrow`/`setStubbedRecords`/`setStubbedLogs` mutating actor methods to the mocks above (actors can't have external mutable properties set directly across isolation boundaries) — add these alongside the protocol definitions in Step 3.

- [ ] **Step 3: Implement the protocols, error type, and live implementations**

```swift
// ios/AthlixCore/Sources/AthlixCore/Data/RepositoryError.swift
import Foundation

public enum RepositoryError: Error, Equatable {
    case network
    case decoding
    case unknown(String)
}
```

```swift
// ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift
import Foundation
import Supabase

public protocol WorkoutRepository: Sendable {
    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout]
}

public final class LiveWorkoutRepository: WorkoutRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        do {
            let workouts: [Workout] = try await client
                .from("workouts")
                .select()
                .eq("user_id", value: userId)
                .gte("date", value: formatter.string(from: from))
                .lte("date", value: formatter.string(from: to))
                .order("date", ascending: false)
                .execute()
                .value
            return workouts
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
```

```swift
// ios/AthlixCore/Sources/AthlixCore/Data/PersonalRecordRepository.swift
import Foundation
import Supabase

public protocol PersonalRecordRepository: Sendable {
    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord]
}

public final class LivePersonalRecordRepository: PersonalRecordRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord] {
        do {
            let records: [PersonalRecord] = try await client
                .from("personal_records")
                .select()
                .eq("user_id", value: userId)
                .order("achieved_date", ascending: false)
                .execute()
                .value
            return records
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
```

```swift
// ios/AthlixCore/Sources/AthlixCore/Data/BodyWeightRepository.swift
import Foundation
import Supabase

public protocol BodyWeightRepository: Sendable {
    func fetchBodyWeightLogs(userId: String) async throws -> [BodyWeightLog]
}

public final class LiveBodyWeightRepository: BodyWeightRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchBodyWeightLogs(userId: String) async throws -> [BodyWeightLog] {
        do {
            let logs: [BodyWeightLog] = try await client
                .from("body_weight_logs")
                .select()
                .eq("user_id", value: userId)
                .order("date", ascending: false)
                .execute()
                .value
            return logs
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
```

Add the mutating setter methods to each mock actor in the test file (Step 1):
```swift
extension MockWorkoutRepository {
    func setStubbedWorkouts(_ workouts: [Workout]) { self.stubbedWorkouts = workouts }
    func setShouldThrow(_ value: Bool) { self.shouldThrow = value }
}
extension MockPersonalRecordRepository {
    func setStubbedRecords(_ records: [PersonalRecord]) { self.stubbedRecords = records }
}
extension MockBodyWeightRepository {
    func setStubbedLogs(_ logs: [BodyWeightLog]) { self.stubbedLogs = logs }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter RepositoryTests`
Expected: PASS — 4 tests run, all green.

- [ ] **Step 5: Run the full package suite**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — all tests green (Foundation's 20 + `SVGPathParserTests` 5 + `SVGArcConverterTests` 3 + `MuscleBodyPathsTests` 3 + `ExerciseMuscleMapperTests` 7 + `WorkoutModelsTests` 4 + `RepositoryTests` 4 = 46 total).

- [ ] **Step 6: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Data ios/AthlixCore/Tests/AthlixCoreTests/RepositoryTests.swift
git commit -m "Add WorkoutRepository, PersonalRecordRepository, BodyWeightRepository with mock tests"
```

---

### Task 9: Derived pure functions — streak calculation and intensity tiering

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Dashboard/StreakCalculator.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Dashboard/MuscleIntensity.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/StreakCalculatorTests.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/MuscleIntensityTests.swift`

Ports `calculateStreak` from `Home.tsx` and `loadToIntensity` from `MuscleMap.tsx`.

- [ ] **Step 1: Write failing tests for streak calculation**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/StreakCalculatorTests.swift
import XCTest
@testable import AthlixCore

final class StreakCalculatorTests: XCTestCase {
    func testEmptyWorkoutsReturnsZeroStreak() {
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: [], today: fixedDate()), 0)
    }

    func testConsecutiveDaysEndingTodayCountsFullStreak() {
        let today = fixedDate()
        let dates = [today, dayBefore(today, 1), dayBefore(today, 2)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 3)
    }

    func testStreakEndingYesterdayStillCounts() {
        let today = fixedDate()
        let dates = [dayBefore(today, 1), dayBefore(today, 2)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 2)
    }

    func testGapBreaksStreak() {
        let today = fixedDate()
        // No workout today or yesterday -> broken streak, even if there was
        // a workout 2 days ago.
        let dates = [dayBefore(today, 2)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 0)
    }

    func testGapInMiddleStopsCountingAtGap() {
        let today = fixedDate()
        // Workout today, yesterday, then a gap at 2 days ago, then 3 days ago.
        let dates = [today, dayBefore(today, 1), dayBefore(today, 3)]
        XCTAssertEqual(StreakCalculator.calculateStreak(workoutDates: dates, today: today), 2)
    }

    private func fixedDate() -> Date {
        var components = DateComponents()
        components.year = 2026; components.month = 7; components.day = 14
        return Calendar.current.date(from: components)!
    }

    private func dayBefore(_ date: Date, _ days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: -days, to: date)!
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter StreakCalculatorTests`
Expected: FAIL — `cannot find 'StreakCalculator' in scope`

- [ ] **Step 3: Implement `StreakCalculator`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Dashboard/StreakCalculator.swift
import Foundation

public enum StreakCalculator {
    /// Ported from Home.tsx's calculateStreak. Counts consecutive training
    /// days ending today or yesterday; any gap stops the count.
    public static func calculateStreak(workoutDates: [Date], today: Date) -> Int {
        guard !workoutDates.isEmpty else { return 0 }

        let calendar = Calendar.current
        let todayStart = calendar.startOfDay(for: today)
        let uniqueDays = Set(workoutDates.map { calendar.startOfDay(for: $0) })
            .sorted(by: >)

        guard let latest = uniqueDays.first else { return 0 }

        var streak = 0
        var cursor: Date

        if latest == todayStart {
            streak = 1
            cursor = calendar.date(byAdding: .day, value: -1, to: todayStart)!
        } else if let yesterday = calendar.date(byAdding: .day, value: -1, to: todayStart), latest == yesterday {
            cursor = yesterday
        } else {
            return 0
        }

        let remaining = uniqueDays.first == todayStart ? Array(uniqueDays.dropFirst()) : uniqueDays

        for day in remaining {
            if day == cursor {
                streak += 1
                cursor = calendar.date(byAdding: .day, value: -1, to: cursor)!
            } else if day > cursor {
                continue // already counted or duplicate, skip
            } else {
                break
            }
        }

        return streak
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter StreakCalculatorTests`
Expected: PASS — 5 tests run, all green.

- [ ] **Step 5: Write failing tests for intensity tiering**

```swift
// ios/AthlixCore/Tests/AthlixCoreTests/MuscleIntensityTests.swift
import XCTest
@testable import AthlixCore

final class MuscleIntensityTests: XCTestCase {
    func testZeroLoadReturnsZeroIntensity() {
        XCTAssertEqual(MuscleIntensity.tier(load: 0, maxLoad: 100), 0)
    }

    func testZeroMaxLoadReturnsZeroIntensity() {
        XCTAssertEqual(MuscleIntensity.tier(load: 50, maxLoad: 0), 0)
    }

    func testHighRatioReturnsTierFour() {
        XCTAssertEqual(MuscleIntensity.tier(load: 80, maxLoad: 100), 4) // ratio 0.8 >= 0.75
    }

    func testMidRatioReturnsTierThree() {
        XCTAssertEqual(MuscleIntensity.tier(load: 50, maxLoad: 100), 3) // ratio 0.5 >= 0.45
    }

    func testLowRatioReturnsTierTwo() {
        XCTAssertEqual(MuscleIntensity.tier(load: 20, maxLoad: 100), 2) // ratio 0.2 >= 0.18
    }

    func testVeryLowRatioReturnsTierOne() {
        XCTAssertEqual(MuscleIntensity.tier(load: 5, maxLoad: 100), 1) // ratio 0.05
    }
}
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter MuscleIntensityTests`
Expected: FAIL — `cannot find 'MuscleIntensity' in scope`

- [ ] **Step 7: Implement `MuscleIntensity`**

```swift
// ios/AthlixCore/Sources/AthlixCore/Dashboard/MuscleIntensity.swift
import Foundation

public enum MuscleIntensity {
    /// Ported verbatim from MuscleMap.tsx's loadToIntensity.
    public static func tier(load: Double, maxLoad: Double) -> Int {
        guard load > 0, maxLoad > 0 else { return 0 }
        let ratio = load / maxLoad
        if ratio >= 0.75 { return 4 }
        if ratio >= 0.45 { return 3 }
        if ratio >= 0.18 { return 2 }
        return 1
    }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test --filter MuscleIntensityTests`
Expected: PASS — 6 tests run, all green.

- [ ] **Step 9: Run full package suite and commit**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — 57 tests total (46 from prior tasks + 5 `StreakCalculatorTests` + 6 `MuscleIntensityTests`).

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/AthlixCore/Sources/AthlixCore/Dashboard ios/AthlixCore/Tests/AthlixCoreTests/StreakCalculatorTests.swift ios/AthlixCore/Tests/AthlixCoreTests/MuscleIntensityTests.swift
git commit -m "Add StreakCalculator and MuscleIntensity pure-function ports"
```

---

### Task 10: SwiftData cache models

**Files:**
- Create: `ios/Athlix/Data/CachedWorkout.swift`
- Create: `ios/Athlix/Data/CachedPersonalRecord.swift`

No unit test: SwiftData `@Model` persistence is verified via the milestone's manual on-device check (repeat dashboard visits load instantly from cache) rather than XCTest, since SwiftData's on-disk behavior isn't meaningfully testable via `swift test` outside a full app context.

- [ ] **Step 1: Implement the cache models**

```swift
// ios/Athlix/Data/CachedWorkout.swift
import Foundation
import SwiftData
import AthlixCore

@Model
final class CachedWorkout {
    @Attribute(.unique) var id: String
    var userId: String
    var title: String
    var date: String
    var durationMinutes: Int?
    var notes: String?
    var muscleGroups: [String]?
    var createdAt: String
    var cachedAt: Date

    init(from workout: Workout) {
        self.id = workout.id
        self.userId = workout.userId
        self.title = workout.title
        self.date = workout.date
        self.durationMinutes = workout.durationMinutes
        self.notes = workout.notes
        self.muscleGroups = workout.muscleGroups
        self.createdAt = workout.createdAt
        self.cachedAt = Date()
    }

    var asWorkout: Workout {
        Workout(
            id: id, userId: userId, title: title, date: date,
            durationMinutes: durationMinutes, notes: notes,
            muscleGroups: muscleGroups, createdAt: createdAt
        )
    }
}
```

```swift
// ios/Athlix/Data/CachedPersonalRecord.swift
import Foundation
import SwiftData
import AthlixCore

@Model
final class CachedPersonalRecord {
    @Attribute(.unique) var id: String
    var userId: String
    var exerciseName: String
    var bestWeight: Double
    var bestReps: Int
    var achievedDate: String
    var createdAt: String
    var exerciseDbId: String?
    var cachedAt: Date

    init(from record: PersonalRecord) {
        self.id = record.id
        self.userId = record.userId
        self.exerciseName = record.exerciseName
        self.bestWeight = record.bestWeight
        self.bestReps = record.bestReps
        self.achievedDate = record.achievedDate
        self.createdAt = record.createdAt
        self.exerciseDbId = record.exerciseDbId
        self.cachedAt = Date()
    }

    var asPersonalRecord: PersonalRecord {
        PersonalRecord(
            id: id, userId: userId, exerciseName: exerciseName,
            bestWeight: bestWeight, bestReps: bestReps,
            achievedDate: achievedDate, createdAt: createdAt, exerciseDbId: exerciseDbId
        )
    }
}
```

- [ ] **Step 2: Register the models with the app's `ModelContainer`**

Modify `ios/Athlix/AthlixApp.swift` to add a `.modelContainer` modifier:

```swift
// ios/Athlix/AthlixApp.swift -- add these two changes to the existing file:
// 1. Add `import SwiftData` alongside the existing imports.
// 2. Add `.modelContainer(for: [CachedWorkout.self, CachedPersonalRecord.self])`
//    as a scene modifier, chained after `.environment(authManager)`:

WindowGroup {
    RootView()
        .environment(authManager)
        .modelContainer(for: [CachedWorkout.self, CachedPersonalRecord.self])
        .task {
            await authManager.restoreSession()
        }
}
```

- [ ] **Step 3: Register new files with XcodeGen**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodegen generate`
Verify: `grep -oE '[A-F0-9]{32}' Athlix.xcodeproj/project.pbxproj` returns zero matches (established convention — never hand-edit `project.pbxproj`).

- [ ] **Step 4: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 5: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Data ios/Athlix/AthlixApp.swift ios/Athlix.xcodeproj
git commit -m "Add SwiftData cache models for workouts and personal records"
```

---

### Task 11: `DashboardViewModel` — ties data together, with SwiftData cache read/write

**Files:**
- Create: `ios/Athlix/Features/Dashboard/DashboardViewModel.swift`

No unit test: this `@Observable` class orchestrates already-tested repositories and SwiftData (both untestable/pre-tested in isolation); its own logic is thin coordination, verified via on-device manual check.

**Revision note**: an earlier draft of this task built `DashboardViewModel` without ever touching `CachedWorkout`/`CachedPersonalRecord` (from Task 10) or a `ModelContext` — a code review of Task 10 caught that this would leave the SwiftData cache models completely unwired (dead code) and pointed out that `ModelContainer`'s `.modelContainer(for:)` modifier only injects `\.modelContext` into **View** descendants, not into a plain `@Observable` class constructed manually. This revision fixes both: `DashboardViewModel` now takes a `ModelContext` in its initializer (to be passed in by the owning View, which reads `@Environment(\.modelContext)`, in Task 16), reads the cache first for instant display, then fetches from network and writes through to the cache using a safe fetch-then-update-or-insert pattern (not a blind `insert`, which risks unique-constraint issues on SwiftData across OS versions per that same review). This also fixes a timezone risk flagged in Task 8's review: `WorkoutRepository.fetchWorkouts`'s `from`/`to` are formatted with a UTC-anchored `ISO8601DateFormatter`, so this ViewModel constructs its date range using UTC calendar boundaries (not `Calendar.current`, which could shift the boundary by a day in non-UTC timezones).

- [ ] **Step 1: Implement `DashboardViewModel`**

```swift
// ios/Athlix/Features/Dashboard/DashboardViewModel.swift
import Foundation
import SwiftData
import AthlixCore
import Observation

@Observable
@MainActor
final class DashboardViewModel {
    private(set) var workouts: [Workout] = []
    private(set) var personalRecords: [PersonalRecord] = []
    private(set) var isLoadingWorkouts = false
    private(set) var isLoadingRecords = false
    private(set) var workoutsErrorMessage: String?
    private(set) var recordsErrorMessage: String?

    private let workoutRepository: WorkoutRepository
    private let personalRecordRepository: PersonalRecordRepository
    private let userId: String
    private let modelContext: ModelContext

    init(
        workoutRepository: WorkoutRepository,
        personalRecordRepository: PersonalRecordRepository,
        userId: String,
        modelContext: ModelContext
    ) {
        self.workoutRepository = workoutRepository
        self.personalRecordRepository = personalRecordRepository
        self.userId = userId
        self.modelContext = modelContext
    }

    /// Reads the SwiftData cache immediately (for instant display), then
    /// fetches fresh data from the network and writes it through to the
    /// cache. Errors are only surfaced if BOTH the cache read produced
    /// nothing AND the network fetch failed -- a stale cache hit is always
    /// preferable to an error state while a background refresh is pending.
    func loadWorkouts(from: Date, to: Date) async {
        let cachedUserId = userId
        let cached = (try? modelContext.fetch(
            FetchDescriptor<CachedWorkout>(predicate: #Predicate { $0.userId == cachedUserId })
        )) ?? []
        if !cached.isEmpty {
            workouts = cached.map(\.asWorkout)
        }

        isLoadingWorkouts = true
        workoutsErrorMessage = nil
        do {
            let fresh = try await workoutRepository.fetchWorkouts(userId: userId, from: from, to: to)
            workouts = fresh
            writeThroughWorkoutsCache(fresh)
        } catch {
            if workouts.isEmpty {
                workoutsErrorMessage = "Couldn't load workouts."
            }
        }
        isLoadingWorkouts = false
    }

    func loadPersonalRecords() async {
        let cachedUserId = userId
        let cached = (try? modelContext.fetch(
            FetchDescriptor<CachedPersonalRecord>(predicate: #Predicate { $0.userId == cachedUserId })
        )) ?? []
        if !cached.isEmpty {
            personalRecords = cached.map(\.asPersonalRecord)
        }

        isLoadingRecords = true
        recordsErrorMessage = nil
        do {
            let fresh = try await personalRecordRepository.fetchPersonalRecords(userId: userId)
            personalRecords = fresh
            writeThroughPersonalRecordsCache(fresh)
        } catch {
            if personalRecords.isEmpty {
                recordsErrorMessage = "Couldn't load personal records."
            }
        }
        isLoadingRecords = false
    }

    /// Fetch-then-update-or-insert per record, rather than a blind insert,
    /// since SwiftData's @Attribute(.unique) dedup-on-insert behavior isn't
    /// reliable enough across OS versions to trust for upserts.
    private func writeThroughWorkoutsCache(_ fresh: [Workout]) {
        for workout in fresh {
            let workoutId = workout.id
            let existing = try? modelContext.fetch(
                FetchDescriptor<CachedWorkout>(predicate: #Predicate { $0.id == workoutId })
            )
            if let match = existing?.first {
                match.title = workout.title
                match.date = workout.date
                match.durationMinutes = workout.durationMinutes
                match.notes = workout.notes
                match.muscleGroups = workout.muscleGroups
                match.createdAt = workout.createdAt
                match.cachedAt = Date()
            } else {
                modelContext.insert(CachedWorkout(from: workout))
            }
        }
        try? modelContext.save()
    }

    private func writeThroughPersonalRecordsCache(_ fresh: [PersonalRecord]) {
        for record in fresh {
            let recordId = record.id
            let existing = try? modelContext.fetch(
                FetchDescriptor<CachedPersonalRecord>(predicate: #Predicate { $0.id == recordId })
            )
            if let match = existing?.first {
                match.exerciseName = record.exerciseName
                match.bestWeight = record.bestWeight
                match.bestReps = record.bestReps
                match.achievedDate = record.achievedDate
                match.createdAt = record.createdAt
                match.exerciseDbId = record.exerciseDbId
                match.cachedAt = Date()
            } else {
                modelContext.insert(CachedPersonalRecord(from: record))
            }
        }
        try? modelContext.save()
    }

    /// Per-muscle-slug training load for the current `workouts`, using
    /// ExerciseMuscleMapper to translate each workout's muscle_groups into
    /// weighted per-slug contributions (workouts fetched via this milestone's
    /// repository don't include nested exercise-level detail, so this uses
    /// each workout's coarser `muscle_groups` array as the fallback-group
    /// input to ExerciseMuscleMapper, weighted equally per group).
    var muscleLoadBySlug: [String: Double] {
        var totals: [String: Double] = [:]
        for workout in workouts {
            for group in workout.muscleGroups ?? [] {
                let profile = ExerciseMuscleMapper.profile(forExerciseName: "", fallbackMuscleGroup: group)
                for target in profile.targets {
                    totals[target.slug, default: 0] += target.weight
                }
            }
        }
        return totals
    }

    var muscleIntensityBySlug: [String: Int] {
        let loads = muscleLoadBySlug
        let maxLoad = loads.values.max() ?? 0
        return loads.mapValues { MuscleIntensity.tier(load: $0, maxLoad: maxLoad) }
    }

    var currentStreak: Int {
        let dates = workouts.compactMap { workout -> Date? in
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withFullDate]
            return formatter.date(from: workout.date)
        }
        return StreakCalculator.calculateStreak(workoutDates: dates, today: Date())
    }

    /// Builds a UTC-anchored [start, end] date range for "the last 7 days,"
    /// used as `loadWorkouts`'s from/to arguments. Uses a UTC calendar
    /// (not `Calendar.current`) so the resulting day boundaries match what
    /// `WorkoutRepository.fetchWorkouts` formats with its UTC-anchored
    /// `ISO8601DateFormatter` -- using `Calendar.current` here could shift
    /// the boundary by a day in non-UTC timezones relative to what the
    /// repository actually queries against the Postgres `DATE` column.
    static func lastSevenDaysRangeUTC(now: Date = Date()) -> (from: Date, to: Date) {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let todayStart = utcCalendar.startOfDay(for: now)
        let weekAgo = utcCalendar.date(byAdding: .day, value: -7, to: todayStart) ?? todayStart
        return (from: weekAgo, to: todayStart)
    }
}
```

- [ ] **Step 2: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard/DashboardViewModel.swift
git commit -m "Add DashboardViewModel with SwiftData cache read/write and repository coordination"
```

---

### Task 12: Widgets 1-2 — Date Navigator, Weekly Goal Ring

**Files:**
- Create: `ios/Athlix/Features/Dashboard/Widgets/DateNavigatorView.swift`
- Create: `ios/Athlix/Features/Dashboard/Widgets/WeeklyGoalRingView.swift`

No unit tests: pure SwiftUI presentation. Verified manually in Task 17.

- [ ] **Step 1: Implement `DateNavigatorView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/DateNavigatorView.swift
import SwiftUI
import AthlixCore

struct DateNavigatorView: View {
    @Binding var currentDate: Date
    @Binding var viewMode: DashboardViewMode

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button {
                    shiftDate(by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                }
                Spacer()
                Text(formattedRange)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                Spacer()
                Button {
                    shiftDate(by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                }
            }
            .foregroundStyle(ColorTokens.textSecondary)

            Picker("View", selection: $viewMode) {
                Text("Day").tag(DashboardViewMode.day)
                Text("Week").tag(DashboardViewMode.week)
                Text("Month").tag(DashboardViewMode.month)
            }
            .pickerStyle(.segmented)
        }
        .padding(10)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var formattedRange: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: currentDate)
    }

    private func shiftDate(by amount: Int) {
        let unit: Calendar.Component = {
            switch viewMode {
            case .day: return .day
            case .week: return .weekOfYear
            case .month: return .month
            }
        }()
        currentDate = Calendar.current.date(byAdding: unit, value: amount, to: currentDate) ?? currentDate
    }
}

enum DashboardViewMode {
    case day, week, month
}
```

- [ ] **Step 2: Implement `WeeklyGoalRingView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/WeeklyGoalRingView.swift
import SwiftUI
import AthlixCore

struct WeeklyGoalRingView: View {
    let completedSets: Int
    let goalSets: Int

    private var progress: Double {
        guard goalSets > 0 else { return 0 }
        return min(Double(completedSets) / Double(goalSets), 1.0)
    }

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .stroke(ColorTokens.border, lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(ColorTokens.accent, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(Int(progress * 100))%")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ColorTokens.textPrimary)
            }
            .frame(width: 56, height: 56)

            VStack(alignment: .leading, spacing: 2) {
                Text("Weekly Goal")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textSecondary)
                Text("\(completedSets) / \(goalSets) sets")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
            }
            Spacer()
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 3: Build the app target and commit**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard/Widgets/DateNavigatorView.swift ios/Athlix/Features/Dashboard/Widgets/WeeklyGoalRingView.swift
git commit -m "Add Date Navigator and Weekly Goal Ring widgets"
```

---

### Task 13: Widget 3 — Muscle Map (wires `MuscleBodyView` into a widget card)

**Files:**
- Create: `ios/Athlix/Features/Dashboard/Widgets/MuscleMapWidgetView.swift`

- [ ] **Step 1: Implement `MuscleMapWidgetView`**

```swift
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
```

- [ ] **Step 2: Build the app target and commit**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard/Widgets/MuscleMapWidgetView.swift
git commit -m "Add Muscle Map widget card wiring MuscleBodyView into the dashboard"
```

---

### Task 14: Widgets 4-5 — Train Next, PR Banner

**Files:**
- Create: `ios/Athlix/Features/Dashboard/Widgets/TrainNextView.swift`
- Create: `ios/Athlix/Features/Dashboard/Widgets/PRBannerView.swift`

- [ ] **Step 1: Implement `TrainNextView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/TrainNextView.swift
import SwiftUI
import AthlixCore

struct TrainNextView: View {
    let muscleIntensityBySlug: [String: Int]

    /// Suggests the region with the lowest recent training intensity among
    /// commonly-trained regions -- a simple heuristic, not an AI API call.
    private var suggestedRegion: String {
        let regions = ["Chest", "Back", "Legs", "Shoulders", "Core"]
        let slugsByRegion: [String: [String]] = [
            "Chest": ["chest"], "Back": ["upper-back", "lower-back", "trapezius"],
            "Legs": ["quadriceps", "hamstring", "calves", "gluteal"],
            "Shoulders": ["deltoids"], "Core": ["abs", "obliques"],
        ]
        let scored = regions.map { region -> (String, Int) in
            let slugs = slugsByRegion[region] ?? []
            let maxIntensity = slugs.compactMap { muscleIntensityBySlug[$0] }.max() ?? 0
            return (region, maxIntensity)
        }
        return scored.min { $0.1 < $1.1 }?.0 ?? "Core"
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "bolt.fill")
                .foregroundStyle(ColorTokens.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("Train Next")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textSecondary)
                Text(suggestedRegion)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
            }
            Spacer()
        }
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 2: Implement `PRBannerView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/PRBannerView.swift
import SwiftUI
import AthlixCore

struct PRBannerView: View {
    let personalRecords: [PersonalRecord]

    private var thisWeeksRecords: [PersonalRecord] {
        let calendar = Calendar.current
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return personalRecords.filter { record in
            guard let date = formatter.date(from: record.achievedDate) else { return false }
            return calendar.isDate(date, equalTo: Date(), toGranularity: .weekOfYear)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "trophy.fill")
                    .foregroundStyle(ColorTokens.prGold)
                Text("This Week's PRs")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.prGold)
            }
            if thisWeeksRecords.isEmpty {
                Text("No new PRs this week yet.")
                    .font(.footnote)
                    .foregroundStyle(ColorTokens.textSecondary)
            } else {
                ForEach(thisWeeksRecords) { record in
                    Text("\(record.exerciseName): \(Int(record.bestWeight)) lbs x \(record.bestReps)")
                        .font(.footnote)
                        .foregroundStyle(ColorTokens.textPrimary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(ColorTokens.prGold.opacity(0.1))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ColorTokens.prGold.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 3: Build the app target and commit**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard/Widgets/TrainNextView.swift ios/Athlix/Features/Dashboard/Widgets/PRBannerView.swift
git commit -m "Add Train Next and PR Banner widgets"
```

---

### Task 15: Widgets 6-7 — Today's Workout, Week Strip / Muscle Radar

**Files:**
- Create: `ios/Athlix/Features/Dashboard/Widgets/TodayWorkoutView.swift`
- Create: `ios/Athlix/Features/Dashboard/Widgets/MuscleRadarView.swift`

- [ ] **Step 1: Implement `TodayWorkoutView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/TodayWorkoutView.swift
import SwiftUI
import AthlixCore

struct TodayWorkoutView: View {
    let todaysWorkout: Workout?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today's Workout")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ColorTokens.textSecondary)

            if let workout = todaysWorkout {
                Text(workout.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                if let minutes = workout.durationMinutes {
                    Text("\(minutes) min")
                        .font(.footnote)
                        .foregroundStyle(ColorTokens.textSecondary)
                }
            } else {
                Text("No workout logged today.")
                    .font(.footnote)
                    .foregroundStyle(ColorTokens.textSecondary)

                // Disabled placeholder -- the Workout Logger milestone will
                // wire this to actually start a session.
                Button("Start Workout") {}
                    .buttonStyle(.borderedProminent)
                    .tint(ColorTokens.accent)
                    .disabled(true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 2: Implement `MuscleRadarView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/MuscleRadarView.swift
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
                    // Background grid rings
                    ForEach([0.33, 0.66, 1.0], id: \.self) { fraction in
                        polygonPath(center: center, radius: radius * fraction)
                            .stroke(ColorTokens.borderSubtle, lineWidth: 1)
                    }
                    // Data polygon
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
```

- [ ] **Step 3: Build the app target and commit**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard/Widgets/TodayWorkoutView.swift ios/Athlix/Features/Dashboard/Widgets/MuscleRadarView.swift
git commit -m "Add Today's Workout and Muscle Radar widgets"
```

---

### Task 16: Widget 8 — AI Weekly Summary, then assemble `DashboardView`

**Files:**
- Create: `ios/Athlix/Features/Dashboard/Widgets/AIWeeklySummaryView.swift`
- Create: `ios/Athlix/Features/Dashboard/DashboardView.swift`
- Modify: `ios/Athlix/Navigation/MainTabView.swift`
- Delete: `ios/Athlix/Features/Dashboard/PlaceholderDashboardView.swift`

- [ ] **Step 1: Implement `AIWeeklySummaryView`**

```swift
// ios/Athlix/Features/Dashboard/Widgets/AIWeeklySummaryView.swift
import SwiftUI
import AthlixCore

struct AIWeeklySummaryView: View {
    let trainedMuscleGroups: [String]

    // Ported verbatim from Home.tsx's ai_summary widget -- templated text,
    // no Gemini/AI API call. The web version's "Generate" button is also
    // presently non-functional, so this port matches that (no button here).
    private var summaryText: String {
        if trainedMuscleGroups.isEmpty {
            return "You haven't logged any workouts this week. Start a session to generate insights."
        }
        let groups = trainedMuscleGroups.joined(separator: ", ")
        return "You hit \(groups) this week. Consistency is key. Keep pushing your limits and ensure adequate recovery for optimal growth."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(ColorTokens.purple)
                Text("Weekly AI Summary")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ColorTokens.purple)
            }
            Text(summaryText)
                .font(.footnote)
                .foregroundStyle(ColorTokens.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(ColorTokens.purple.opacity(0.08))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(ColorTokens.purple.opacity(0.25), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 2: Implement `DashboardView`, assembling all 8 widgets in fixed order**

```swift
// ios/Athlix/Features/Dashboard/DashboardView.swift
import SwiftUI
import AthlixCore

struct DashboardView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel: DashboardViewModel?
    @State private var currentDate = Date()
    @State private var viewMode: DashboardViewMode = .week

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                DateNavigatorView(currentDate: $currentDate, viewMode: $viewMode)

                if let viewModel {
                    WeeklyGoalRingView(completedSets: viewModel.workouts.count * 4, goalSets: 20)
                    MuscleMapWidgetView(intensityBySlug: viewModel.muscleIntensityBySlug)
                    TrainNextView(muscleIntensityBySlug: viewModel.muscleIntensityBySlug)
                    PRBannerView(personalRecords: viewModel.personalRecords)
                    TodayWorkoutView(todaysWorkout: todaysWorkout(from: viewModel.workouts))
                    MuscleRadarView(regionLoads: regionLoads(from: viewModel))
                    AIWeeklySummaryView(trainedMuscleGroups: viewModel.workouts.flatMap { $0.muscleGroups ?? [] })
                } else {
                    ProgressView().tint(ColorTokens.accent)
                }
            }
            .padding(10)
        }
        .background(ColorTokens.bgBase.ignoresSafeArea())
        .task {
            guard viewModel == nil, let userId = authManager.user?.id else { return }
            // LiveWorkoutRepository/LivePersonalRecordRepository each default-construct
            // their own SupabaseClient (same pattern as LiveSupabaseAuthClient in the
            // Foundation milestone) — the Athlix app target only links the AthlixCore
            // package product, not the Supabase package product directly, so it cannot
            // construct a SupabaseClient itself. modelContext comes from the environment
            // since DashboardViewModel is a plain @Observable class, not a View, and
            // .modelContainer(for:)'s environment injection only reaches View descendants.
            let vm = DashboardViewModel(
                workoutRepository: LiveWorkoutRepository(),
                personalRecordRepository: LivePersonalRecordRepository(),
                userId: userId,
                modelContext: modelContext
            )
            viewModel = vm
            let range = DashboardViewModel.lastSevenDaysRangeUTC()
            await vm.loadWorkouts(from: range.from, to: range.to)
            await vm.loadPersonalRecords()
        }
    }

    private func todaysWorkout(from workouts: [Workout]) -> Workout? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return workouts.first { workout in
            guard let date = formatter.date(from: workout.date) else { return false }
            return Calendar.current.isDateInToday(date)
        }
    }

    private func regionLoads(from viewModel: DashboardViewModel) -> [String: Double] {
        var byRegion: [String: Double] = [:]
        for (slug, load) in viewModel.muscleLoadBySlug {
            guard let region = ExerciseMuscleMapper.slugRegionMap[slug] else { continue }
            byRegion[region, default: 0] += load
        }
        let maxLoad = byRegion.values.max() ?? 1
        guard maxLoad > 0 else { return byRegion }
        return byRegion.mapValues { $0 / maxLoad }
    }
}
```

**Deviation from the design spec, called out explicitly**: the spec's "Loading & Error Handling" section calls for *per-widget* independent loading/error states (each widget shows its own skeleton/error, none block the others). This implementation takes a simpler approach: a single top-level `ProgressView` gates ALL widgets until `viewModel` exists, and within `DashboardViewModel`, `workoutsErrorMessage`/`recordsErrorMessage` are tracked separately but nothing in `DashboardView` currently surfaces them per-widget (a workout-fetch failure isn't shown anywhere in this version). This is a real, intentional scope reduction for this milestone — not a bug to silently accept — because per-widget skeleton UI for 8 different widget shapes is a meaningfully larger task than assembling the widgets themselves. If this matters before shipping, add a follow-up task: surface `viewModel.workoutsErrorMessage`/`recordsErrorMessage` as small inline banners on the specific widgets that depend on each data source (Muscle Map/Train Next/Today's Workout/Radar/AI Summary depend on `workouts`; PR Banner depends on `personalRecords`), and replace the single top-level spinner with per-section skeletons once real widget content is available to compare against.

**Note**: instantiating `SupabaseClient` directly here (rather than reusing a shared instance) duplicates what `LiveSupabaseAuthClient` already does internally. This is acceptable for this milestone (Supabase's client is lightweight to construct and this avoids a larger refactor of the Foundation milestone's `AuthManager`/`LiveSupabaseAuthClient` wiring), but a future cleanup could introduce a single shared `SupabaseClient` instance accessible to all repositories instead of each constructing its own. Not blocking for this milestone.

- [ ] **Step 3: Wire `DashboardView` into `MainTabView`, replacing the placeholder**

Modify `ios/Athlix/Navigation/MainTabView.swift`: replace the line `PlaceholderDashboardView()` with `DashboardView()` in the `TabView`'s first tab.

- [ ] **Step 4: Delete the now-unused placeholder**

```bash
rm /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/Athlix/Features/Dashboard/PlaceholderDashboardView.swift
```

- [ ] **Step 5: Register changes with XcodeGen**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodegen generate`
Verify: `grep -oE '[A-F0-9]{32}' Athlix.xcodeproj/project.pbxproj` returns zero matches.

- [ ] **Step 6: Build the app target**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 7: Commit**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1
git add ios/Athlix/Features/Dashboard ios/Athlix/Navigation/MainTabView.swift ios/Athlix.xcodeproj
git commit -m "Assemble DashboardView with all 8 widgets, replacing the placeholder Home tab"
```

---

### Task 17: Milestone verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full `AthlixCore` test suite**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios/AthlixCore && swift test`
Expected: PASS — all tests green (57 tests from Tasks 1-9, no regressions).

- [ ] **Step 2: Run a full app build**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios && xcodebuild -scheme Athlix -destination 'generic/platform=iOS Simulator' build`
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 3: Install and launch on Simulator**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1/ios
xcodebuild -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath ./build build
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/Athlix.app
xcrun simctl launch booted com.athlix.app
```
Sign in with a real test account (or the account used in the Foundation milestone's verification). Confirm the Home tab now shows the real Dashboard, not the placeholder.

- [ ] **Step 4: Side-by-side Muscle Map visual fidelity check (hard requirement per the design spec)**

```bash
xcrun simctl io booted screenshot /tmp/athlix-muscle-map-native.png
```

Compare this screenshot against a screenshot of the current web app's Muscle Map (open the web app locally with `npm run dev`, navigate to the Home page, screenshot the Muscle Map widget with the same test account's data). Confirm: the body silhouette shape matches, the muscle-group regions are in the same anatomical positions, and the coloring/intensity shading looks the same. If they don't match, this is a blocking issue — return to Task 1/4/6 to find the transcription or rendering error before considering this milestone complete.

- [ ] **Step 5: Confirm each widget renders with real data**

Manually check: Date Navigator responds to left/right taps; Weekly Goal Ring shows a real percentage; Muscle Map/Radar reflect actual logged workouts (or show a sensible empty state if the test account has no workouts this week); PR Banner shows real personal records or "No new PRs" state; Today's Workout shows real or empty state; AI Weekly Summary shows the templated text matching whether workouts exist this week.

- [ ] **Step 6: Final git status check**

Run: `cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && git status`
Confirm no uncommitted `ios/` work remains.
