# Swift Workout Logger Milestone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the native SwiftUI Workout Logger (the app's `/log` flow) — session entry, active workout editing, set logging via a native wheel picker, rest timer, Exercise Picker (History/Muscle/My Plans), Plans/Templates, and Finish/Save — replacing `PlaceholderLogView`, per `docs/superpowers/specs/2026-07-15-swift-workout-logger-design.md`.

**Architecture:** `AthlixCore` gains the exercise input-type system (ported verbatim from `exerciseTypes.ts`), a `TemplateRepository`, an `ExerciseLibraryRepository`, and extensions to `WorkoutRepository`/`PersonalRecordRepository` for save/delete/rename/PR-lookup. The `Athlix` app target gets a consolidated `ActiveWorkoutViewModel` (session state machine) and a shared `PlanEditorViewModel` (used both standalone for Templates and inline during a session), plus the SwiftUI views themselves. No schema changes — everything ports against the existing shared Supabase backend exactly as `docs/superpowers/specs/2026-07-15-swift-workout-logger-design.md` specifies.

**Tech Stack:** Swift 6, SwiftUI, `Observation` (`@Observable`), Supabase Swift SDK (PostgREST + RPC), local on-disk JSON draft persistence, `UserDefaults` for rest-timer duration, Python-script-based data extraction for the large `exerciseTypes.ts` heuristic table (same technique proven in the Dashboard milestone for `MuscleBodyPaths`/`ExerciseMuscleMapper`).

---

## Reference: real signatures already in the codebase

These exist today and MUST be matched exactly — do not invent different names/shapes.

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/Workout.swift
public struct Workout: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let title: String
    public let date: String // YYYY-MM-DD
    public let durationMinutes: Int?
    public let notes: String?
    public let muscleGroups: [String]?
    public let createdAt: String
    public init(id: String, userId: String, title: String, date: String, durationMinutes: Int?, notes: String?, muscleGroups: [String]?, createdAt: String)
}

// ios/AthlixCore/Sources/AthlixCore/Models/ExerciseSet.swift
public struct ExerciseSet: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let workoutId: String
    public let name: String
    public let muscleGroup: String?
    public let sets: Int      // always 1 in practice (one row per completed set)
    public let reps: Int
    public let weight: Double
    public let unit: String   // "kg" | "lbs" | "km" | "mi"
    public let orderIndex: Int
    public let exerciseDbId: String?
}

// ios/AthlixCore/Sources/AthlixCore/Models/PersonalRecord.swift
public struct PersonalRecord: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public let exerciseName: String
    public let bestWeight: Double
    public let bestReps: Int
    public let achievedDate: String
    public let createdAt: String
    public let exerciseDbId: String?
    public init(id: String, userId: String, exerciseName: String, bestWeight: Double, bestReps: Int, achievedDate: String, createdAt: String, exerciseDbId: String?)
}

// ios/AthlixCore/Sources/AthlixCore/Data/RepositoryError.swift
public enum RepositoryError: Error, Equatable {
    case network
    case decoding
    case unknown(String)
}

// ios/AthlixCore/Sources/AthlixCore/Theme/ColorTokens.swift — use these, never hardcode hex in views.
// ios/AthlixCore/Sources/AthlixCore/Units/WeightUnit.swift — WeightUnit.convert(_:from:to:), .format(_:unit:)
// ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift — Profile.unitPreference: WeightUnit, .bodyWeight: Double?
```

Real DB schema (`supabase/schema.sql`, unchanged — no migration in this milestone):

```sql
-- workouts(id, user_id, title, date DATE, duration_minutes, notes, muscle_groups TEXT[], created_at)
-- exercises(id, workout_id, name, muscle_group, sets INT /* always 1 */, reps INT, weight FLOAT,
--           unit TEXT CHECK IN ('kg','lbs','km','mi'), order_index, exercise_db_id)
-- templates(id, user_id, title, created_at)
-- template_exercises(id, template_id, name, muscle_group, default_sets, default_reps, default_weight,
--                     order_index, exercise_db_id)
-- personal_records(id, user_id, exercise_name, best_weight, best_reps, achieved_date, created_at, exercise_db_id)
--   UNIQUE (user_id, exercise_name)
-- exercise_library(id, name, muscle_group, is_custom, user_id, exercise_db_id, muscle_slugs JSONB)

-- RPC: save_workout_with_sets(p_title TEXT, p_workout_date DATE, p_duration_minutes INT, p_notes TEXT, p_exercises JSONB) RETURNS UUID
--   p_exercises shape: [{ name, muscle_group, exercise_db_id, completed_sets: [{ reps, weight, unit }] }]
--   Inserts one exercises row per completed_set, upserts personal_records (best-of, by weight then reps).

-- RPC: save_template_with_exercises(p_template_id UUID, p_title TEXT, p_exercises JSONB) RETURNS UUID
--   p_exercises shape: [{ name, muscle_group, default_sets, default_reps, default_weight, order_index, exercise_db_id }]
```

---

## Task 1: `ExerciseInputType` + `DialFieldKind` core enums

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseInputType.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/ExerciseInputTypeTests.swift`

- [ ] **Step 1: Write failing tests** for the two enums' case sets and for `getFieldKinds(for:)`, `getDefaultSetValues(for:)`, `hasSecondaryField(_:)`, `isDistanceExerciseType(_:)`, `isWeightExerciseType(_:)` — one test per input type, asserting against the exact table below (ported verbatim from `src/lib/exerciseTypes.ts` lines 557–598).

```swift
import Testing
@testable import AthlixCore

@Test func fieldKindsWeightReps() {
    let kinds = ExerciseInputType.weightReps.fieldKinds
    #expect(kinds.primary == .weight)
    #expect(kinds.secondary == .reps)
}

@Test func fieldKindsDistanceOnlyHasNoSecondary() {
    #expect(ExerciseInputType.distanceOnly.fieldKinds.secondary == nil)
}

@Test func defaultSetValuesTimeOnly() {
    let defaults = ExerciseInputType.timeOnly.defaultSetValues
    #expect(defaults.weight == 2)
    #expect(defaults.reps == 0)
}

@Test func isWeightExerciseTypeTrueForHeightReps() {
    #expect(ExerciseInputType.heightReps.isWeightExerciseType)
}
```

- [ ] **Step 2: Run tests, confirm they fail to compile** (types don't exist yet).

- [ ] **Step 3: Implement**

```swift
import Foundation

public enum ExerciseInputType: String, Codable, Sendable, CaseIterable {
    case weightReps = "weight_reps"
    case distanceTime = "distance_time"
    case timeOnly = "time_only"
    case distanceOnly = "distance_only"
    case repsOnly = "reps_only"
    case heightReps = "height_reps"
    case caloriesTime = "calories_time"

    public var fieldKinds: (primary: DialFieldKind, secondary: DialFieldKind?) {
        switch self {
        case .weightReps: return (.weight, .reps)
        case .distanceTime: return (.distance, .minutes)
        case .timeOnly: return (.minutes, .seconds)
        case .distanceOnly: return (.distance, nil)
        case .repsOnly: return (.reps, nil)
        case .heightReps: return (.height, .reps)
        case .caloriesTime: return (.calories, .minutes)
        }
    }

    public var defaultSetValues: (weight: Double, reps: Int) {
        switch self {
        case .distanceTime: return (0, 5)
        case .timeOnly: return (2, 0)
        case .caloriesTime: return (0, 5)
        case .repsOnly: return (0, 10)
        case .distanceOnly: return (0, 0)
        case .heightReps: return (0, 8)
        case .weightReps: return (0, 0)
        }
    }

    public var hasSecondaryField: Bool { fieldKinds.secondary != nil }
    public var isDistanceExerciseType: Bool { self == .distanceTime || self == .distanceOnly }
    public var isWeightExerciseType: Bool { self == .weightReps || self == .heightReps }
}

public enum DialFieldKind: String, Codable, Sendable {
    case weight, reps, distance, minutes, seconds, height, calories
}
```

- [ ] **Step 4: Run tests, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseInputType.swift ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/ExerciseInputTypeTests.swift
git commit -m "Add ExerciseInputType/DialFieldKind core enums"
```

---

## Task 2: `ExerciseTypeResolver` — exact-match + pattern heuristic (extracted programmatically)

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeResolver.swift`
- Create (scratch, not committed): a Python extraction script under the scratchpad directory
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/ExerciseTypeResolverTests.swift`

This ports `EXACT_TYPE_MAP` (~230 entries) and `TYPE_PATTERNS` (6 pattern groups with regexes) from `src/lib/exerciseTypes.ts` lines 25–531. **Do not hand-transcribe** — write a Python script that parses `src/lib/exerciseTypes.ts`, extracts the `EXACT_TYPE_MAP` object literal (key → `ExerciseInputType` string) and the `TYPE_PATTERNS` array (regex source strings + type), and emits Swift source. This is the same proven technique used for `MuscleBodyPaths.swift` and `ExerciseMuscleMapper.swift` in the Dashboard milestone.

- [ ] **Step 1: Write the extraction script** at `/private/tmp/claude-501/.../scratchpad/extract_exercise_types.py` (or wherever the current scratchpad path is): regex-parse `EXACT_TYPE_MAP`'s `'key': 'value',` lines (trim quotes, normalize the TS input type string to the Swift enum's `rawValue`), and `TYPE_PATTERNS`'s `patterns: [...]` regex literals (convert JS `/pattern/i` to an NSRegularExpression-compatible Swift string, case-insensitive), preserving array order (order matters — first matching pattern group wins).

- [ ] **Step 2: Run the script**, redirect output to `ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeResolverData.swift`, containing two `internal static let` constants:

```swift
import Foundation

enum ExerciseTypeResolverData {
    static let exactMatches: [String: ExerciseInputType] = [
        "treadmill": .distanceTime,
        "elliptical": .distanceTime,
        // ... (all ~230 entries, generated)
    ]

    // Order matters: first matching group wins, matching TYPE_PATTERNS's array order.
    static let patternGroups: [(patterns: [NSRegularExpression], type: ExerciseInputType)] = {
        func rx(_ pattern: String) -> NSRegularExpression {
            try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        }
        return [
            (patterns: [rx(#"\btreadmill\b"#), /* ... */], type: .distanceTime),
            // ... (all 6 groups, generated)
        ]
    }()
}
```

- [ ] **Step 3: Write failing tests** against real exercise names (not synthetic), covering: an exact-match hit (`"Treadmill"` → `.distanceTime`, case/whitespace-insensitive per `normalizeKey`), a pattern-match hit that must NOT false-positive on a substring (`"Bicycle Crunch"` → `.repsOnly`, NOT `.distanceTime` from "cycle"; `"Crunches"` → `.repsOnly`, NOT matching "run"), the word-boundary walking guard (`"Walking Lunge"` → `.weightReps` via exact map, not `.distanceOnly` via pattern), and the default fallback (`"Bench Press"` → `.weightReps`, no match at all).

```swift
@Test func exactMatchCaseAndWhitespaceInsensitive() {
    #expect(ExerciseTypeResolver.resolve("  Treadmill  ") == .distanceTime)
}

@Test func bicycleCrunchDoesNotFalsePositiveOnCycle() {
    #expect(ExerciseTypeResolver.resolve("Bicycle Crunch") == .repsOnly)
}

@Test func walkingLungeExactMapWinsOverWalkingPattern() {
    #expect(ExerciseTypeResolver.resolve("Walking Lunge") == .weightReps)
}

@Test func unknownExerciseDefaultsToWeightReps() {
    #expect(ExerciseTypeResolver.resolve("Bench Press") == .weightReps)
}
```

- [ ] **Step 4: Implement the resolver**, using the generated data:

```swift
import Foundation

public enum ExerciseTypeResolver {
    public static func resolve(_ exerciseName: String) -> ExerciseInputType {
        let normalized = normalizeKey(exerciseName)
        if let exact = ExerciseTypeResolverData.exactMatches[normalized] { return exact }
        for group in ExerciseTypeResolverData.patternGroups {
            let range = NSRange(normalized.startIndex..., in: normalized)
            if group.patterns.contains(where: { $0.firstMatch(in: normalized, range: range) != nil }) {
                return group.type
            }
        }
        return .weightReps
    }

    private static func normalizeKey(_ value: String) -> String {
        var result = value.lowercased()
        result = result.replacingOccurrences(of: "(", with: "").replacingOccurrences(of: ")", with: "")
        while result.contains("  ") { result = result.replacingOccurrences(of: "  ", with: " ") }
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
```

- [ ] **Step 5: Run tests, confirm pass.** Spot-check at least 15 more names from `EXACT_TYPE_MAP` against the generated data by diffing against the original TS map (not just the 4 unit tests) to catch extraction bugs.

- [ ] **Step 6: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeResolver.swift ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeResolverData.swift ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/ExerciseTypeResolverTests.swift
git commit -m "Port ExerciseTypeResolver's exact/pattern name-to-type heuristic"
```

---

## Task 3: `SetCompletionRules`, label/unit helpers, `formatSetValue`

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/SetCompletionRules.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeLabels.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/SetCompletionRulesTests.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/ExerciseTypeLabelsTests.swift`

Ports `isSetReadyForCompletion` (lines 612–629), `INPUT_LABELS`/`getInputLabels`/`getUnitDisplay` (lines 536–609), and `formatSetValue` (lines 631–635) from `exerciseTypes.ts`.

- [ ] **Step 1: Write failing tests** — one per `ExerciseInputType` case for completion rules (mirroring the `isSetReadyForCompletion` switch exactly, e.g. `.weightReps` ready iff `reps > 0` even with `weight == 0`; `.distanceOnly` ready iff `weight > 0` since distance is stored in the weight slot), plus label tests (`getInputLabels(for: .weightReps, weightUnit: .kg)` → `("KG", "REPS")`) and format tests (`formatSetValue(.weight, 72.5)` → `"72.5"`; `formatSetValue(.reps, 8.0)` → `"8"`).

```swift
@Test func weightRepsReadyWithZeroWeightIfRepsPositive() {
    #expect(SetCompletionRules.isReady(type: .weightReps, weight: 0, reps: 5))
}

@Test func distanceOnlyNotReadyWithZeroWeight() {
    #expect(!SetCompletionRules.isReady(type: .distanceOnly, weight: 0, reps: 0))
}

@Test func formatWeightRoundsToOneDecimal() {
    #expect(ExerciseTypeLabels.formatSetValue(kind: .weight, value: 72.46) == "72.5")
}

@Test func formatRepsRoundsToInteger() {
    #expect(ExerciseTypeLabels.formatSetValue(kind: .reps, value: 8.0) == "8")
}
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```swift
// SetCompletionRules.swift
import Foundation

public enum SetCompletionRules {
    public static func isReady(type: ExerciseInputType, weight: Double, reps: Int) -> Bool {
        switch type {
        case .weightReps: return reps > 0
        case .distanceTime: return weight > 0 || reps > 0
        case .timeOnly: return weight > 0 || reps > 0
        case .distanceOnly: return weight > 0
        case .repsOnly: return reps > 0
        case .heightReps: return reps > 0
        case .caloriesTime: return weight > 0 || reps > 0
        }
    }
}
```

```swift
// ExerciseTypeLabels.swift
import Foundation

public enum ExerciseTypeLabels {
    public static func baseLabels(for type: ExerciseInputType) -> (primary: String, secondary: String?) {
        switch type {
        case .weightReps: return ("KG", "REPS")
        case .distanceTime: return ("KM", "MIN")
        case .timeOnly: return ("MIN", "SEC")
        case .distanceOnly: return ("KM", nil)
        case .repsOnly: return ("REPS", nil)
        case .heightReps: return ("CM", "REPS")
        case .caloriesTime: return ("CAL", "MIN")
        }
    }

    public static func inputLabels(
        for type: ExerciseInputType,
        weightUnit: WeightUnit = .lbs,
        distanceUnit: String = "km"
    ) -> (primary: String, secondary: String?) {
        let base = baseLabels(for: type)
        if type == .weightReps { return (weightUnit.rawValue.uppercased(), base.secondary) }
        if type == .distanceTime || type == .distanceOnly { return (distanceUnit.uppercased(), base.secondary) }
        return base
    }

    public static func unitDisplay(
        for type: ExerciseInputType,
        weightUnit: WeightUnit = .lbs,
        distanceUnit: String = "km"
    ) -> String {
        switch type {
        case .weightReps: return weightUnit.rawValue.uppercased()
        case .distanceTime, .distanceOnly: return distanceUnit.uppercased()
        case .heightReps: return "CM"
        case .caloriesTime: return "CAL"
        case .repsOnly: return "REPS"
        case .timeOnly: return "MIN"
        }
    }

    public static func formatSetValue(kind: DialFieldKind, value: Double) -> String {
        switch kind {
        case .weight, .distance: return String(format: "%.1f", value)
        default: return String(Int(value.rounded()))
        }
    }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/SetCompletionRules.swift ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeLabels.swift ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/SetCompletionRulesTests.swift ios/AthlixCore/Tests/AthlixCoreTests/ExerciseTypes/ExerciseTypeLabelsTests.swift
git commit -m "Port set-completion gating and label/format helpers"
```

---

## Task 4: `WorkoutDraft` model + set/exercise entry types

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Session/WorkoutDraft.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Session/WorkoutDraftTests.swift`

Ports the `Set`/`ExerciseEntry`/`WorkoutState` shapes from `Log.tsx` (see design spec, "Session state"). These are the in-memory/on-disk session types — distinct from the `ExerciseSet` DB row model, since one `ExerciseEntry` groups N in-progress `LoggedSet`s that haven't been saved yet.

- [ ] **Step 1: Write failing tests** for `Codable` round-trip (encode → decode → equal) of a `WorkoutDraft` containing multiple `ExerciseEntry`s with mixed `done`/`planned*` sets, and for `WorkoutDraft.isExpired(now:ttl:)` (8-hour TTL, matching web's `DRAFT_TTL`).

```swift
@Test func draftRoundTripsThroughJSON() {
    let draft = WorkoutDraft(
        id: nil, title: "Morning", startAt: Date(), elapsedSeconds: 120,
        exercises: [ExerciseEntry(id: "1", name: "Bench Press", muscleGroup: "Chest",
                                   exerciseDbId: nil, sets: [LoggedSet(id: "s1", weight: 135, reps: 8, done: true, isPR: false, plannedWeight: nil, plannedReps: nil)],
                                   optionalWeight: nil, inputTypeOverride: nil)],
        notes: nil, savedAt: Date()
    )
    let data = try! JSONEncoder().encode(draft)
    let decoded = try! JSONDecoder().decode(WorkoutDraft.self, from: data)
    #expect(decoded == draft)
}

@Test func draftExpiresAfterTTL() {
    let old = WorkoutDraft(id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil,
                            savedAt: Date().addingTimeInterval(-9 * 3600))
    #expect(old.isExpired(now: Date(), ttl: 8 * 3600))
}

@Test func draftNotExpiredWithinTTL() {
    let fresh = WorkoutDraft(id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil,
                              savedAt: Date().addingTimeInterval(-1 * 3600))
    #expect(!fresh.isExpired(now: Date(), ttl: 8 * 3600))
}
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```swift
import Foundation

public struct LoggedSet: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public var weight: Double?
    public var reps: Int?
    public var done: Bool
    public var isPR: Bool
    public var plannedWeight: Double?
    public var plannedReps: Int?

    public init(id: String, weight: Double?, reps: Int?, done: Bool, isPR: Bool, plannedWeight: Double?, plannedReps: Int?) {
        self.id = id; self.weight = weight; self.reps = reps; self.done = done
        self.isPR = isPR; self.plannedWeight = plannedWeight; self.plannedReps = plannedReps
    }
}

public struct LastSessionSummary: Codable, Equatable, Sendable {
    public let date: String
    public let sets: Int
    public let reps: Int
    public let weight: Double
    public let totalVolume: Double
    public let perSetData: [PerSetDatum]

    public struct PerSetDatum: Codable, Equatable, Sendable {
        public let weight: Double
        public let reps: Int
    }
}

public struct ExerciseEntry: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public var name: String
    public var muscleGroup: String
    public var exerciseDbId: String?
    public var sets: [LoggedSet]
    public var optionalWeight: Bool?
    public var inputTypeOverride: ExerciseInputType?
    public var lastSession: LastSessionSummary?

    public init(id: String, name: String, muscleGroup: String, exerciseDbId: String?, sets: [LoggedSet],
                optionalWeight: Bool?, inputTypeOverride: ExerciseInputType?, lastSession: LastSessionSummary? = nil) {
        self.id = id; self.name = name; self.muscleGroup = muscleGroup; self.exerciseDbId = exerciseDbId
        self.sets = sets; self.optionalWeight = optionalWeight; self.inputTypeOverride = inputTypeOverride
        self.lastSession = lastSession
    }
}

public struct WorkoutDraft: Codable, Equatable, Sendable {
    public var id: String?
    public var title: String
    public var startAt: Date
    public var elapsedSeconds: Int
    public var exercises: [ExerciseEntry]
    public var notes: String?
    public var savedAt: Date

    public init(id: String?, title: String, startAt: Date, elapsedSeconds: Int, exercises: [ExerciseEntry], notes: String?, savedAt: Date) {
        self.id = id; self.title = title; self.startAt = startAt; self.elapsedSeconds = elapsedSeconds
        self.exercises = exercises; self.notes = notes; self.savedAt = savedAt
    }

    public func isExpired(now: Date, ttl: TimeInterval) -> Bool {
        now.timeIntervalSince(savedAt) > ttl
    }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/Session/WorkoutDraft.swift ios/AthlixCore/Tests/AthlixCoreTests/Session/WorkoutDraftTests.swift
git commit -m "Add WorkoutDraft/ExerciseEntry/LoggedSet session models"
```

---

## Task 5: `WorkoutDraftStore` — local on-disk persistence

**Files:**
- Create: `ios/Athlix/Data/WorkoutDraftStore.swift`
- Test: `ios/AthlixTests/WorkoutDraftStoreTests.swift` (if an `AthlixTests` target exists; otherwise place under a new test target added to `project.yml` — check `ios/project.yml` first and add one following the same pattern as `AthlixCoreTests` if missing)

Matches web's `sessionStorage` draft (8hr TTL, written on exercise-count change + 30s interval) but as an on-disk JSON file in `Application Support`, per the approved "local draft only" decision.

- [ ] **Step 1: Write failing tests**: save a draft, load it back (round-trips), load returns `nil` when no file exists, load returns `nil` (and deletes the file) when the loaded draft `isExpired`, `clear()` removes the file.

```swift
@Test func saveAndLoadRoundTrips() {
    let store = WorkoutDraftStore(directory: tempDir())
    let draft = WorkoutDraft(id: nil, title: "Test", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil, savedAt: Date())
    store.save(draft)
    #expect(store.load() == draft)
}

@Test func loadReturnsNilWhenNoFile() {
    let store = WorkoutDraftStore(directory: tempDir())
    #expect(store.load() == nil)
}

@Test func loadReturnsNilAndDeletesWhenExpired() {
    let store = WorkoutDraftStore(directory: tempDir())
    let expired = WorkoutDraft(id: nil, title: "Old", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil,
                                savedAt: Date().addingTimeInterval(-9 * 3600))
    store.save(expired)
    #expect(store.load() == nil)
    #expect(store.load() == nil) // file gone, still nil on second call
}

@Test func clearRemovesFile() {
    let store = WorkoutDraftStore(directory: tempDir())
    store.save(WorkoutDraft(id: nil, title: "x", startAt: Date(), elapsedSeconds: 0, exercises: [], notes: nil, savedAt: Date()))
    store.clear()
    #expect(store.load() == nil)
}
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```swift
import Foundation
import AthlixCore

struct WorkoutDraftStore {
    private let fileURL: URL
    private let ttl: TimeInterval = 8 * 3600

    init(directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.fileURL = directory.appendingPathComponent("athlix_active_workout.json")
    }

    func save(_ draft: WorkoutDraft) {
        guard let data = try? JSONEncoder().encode(draft) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    func load() -> WorkoutDraft? {
        guard let data = try? Data(contentsOf: fileURL),
              let draft = try? JSONDecoder().decode(WorkoutDraft.self, from: data) else { return nil }
        if draft.isExpired(now: Date(), ttl: ttl) {
            clear()
            return nil
        }
        return draft
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/Athlix/Data/WorkoutDraftStore.swift ios/AthlixTests/WorkoutDraftStoreTests.swift
git commit -m "Add on-disk WorkoutDraftStore for in-progress session persistence"
```

---

## Task 6: `TemplateRepository` + `Template`/`TemplateExercise` models

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/Template.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Data/TemplateRepository.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Data/TemplateRepositoryTests.swift`

Mirrors the `WorkoutRepository`/`LiveWorkoutRepository` protocol pattern exactly. Covers `getTemplates`, `checkTemplateNameExists`, `saveTemplate` (RPC-first with manual fallback, matching `saveWorkout`'s pattern), `deleteTemplate` (all from `supabaseData.ts` lines 1828–1970).

- [ ] **Step 1: Write failing tests** against a `MockSupabaseClient`-equivalent (check `ios/AthlixCoreTests` for the existing mock pattern used by `AuthManager`'s tests, e.g. `MockSupabaseAuthClient`, and follow the same style) — one test per repository method's happy path, plus a name-collision-detected test for `checkTemplateNameExists`.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement models**

```swift
import Foundation

public struct TemplateExercise: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let templateId: String
    public var name: String
    public var muscleGroup: String?
    public var defaultSets: Int
    public var defaultReps: Int
    public var defaultWeight: Double
    public var orderIndex: Int
    public var exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case templateId = "template_id"
        case name
        case muscleGroup = "muscle_group"
        case defaultSets = "default_sets"
        case defaultReps = "default_reps"
        case defaultWeight = "default_weight"
        case orderIndex = "order_index"
        case exerciseDbId = "exercise_db_id"
    }
}

public struct Template: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let userId: String
    public var title: String
    public let createdAt: String
    public var exercises: [TemplateExercise]

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title
        case createdAt = "created_at"
        case exercises = "template_exercises"
    }
}
```

- [ ] **Step 4: Implement repository**

```swift
import Foundation
import Supabase

public protocol TemplateRepository: Sendable {
    func fetchTemplates(userId: String) async throws -> [Template]
    func checkNameExists(userId: String, title: String, excludeId: String?) async throws -> Bool
    /// Saves via the save_template_with_exercises RPC when creating (templateId == nil);
    /// always does a direct delete+insert of template_exercises when updating, matching
    /// web's saveTemplate which deliberately skips the RPC on update (the RPC may always INSERT).
    func saveTemplate(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String
    func deleteTemplate(userId: String, templateId: String) async throws
}

public final class LiveTemplateRepository: TemplateRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(supabaseURL: SupabaseConfig.url, supabaseKey: SupabaseConfig.anonKey)) {
        self.client = client
    }

    public func fetchTemplates(userId: String) async throws -> [Template] {
        do {
            let templates: [Template] = try await client
                .from("templates")
                .select("*, template_exercises(*)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .execute()
                .value
            return templates
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func checkNameExists(userId: String, title: String, excludeId: String?) async throws -> Bool {
        do {
            var query = client
                .from("templates")
                .select("id")
                .eq("user_id", value: userId)
                .ilike("title", pattern: title.trimmingCharacters(in: .whitespaces))
            if let excludeId {
                query = query.neq("id", value: excludeId)
            }
            let rows: [[String: String]] = try await query.limit(1).execute().value
            return !rows.isEmpty
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func saveTemplate(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String {
        do {
            if templateId == nil {
                struct RPCParams: Encodable {
                    let p_template_id: String?
                    let p_title: String
                    let p_exercises: [TemplateExercisePayload]
                }
                let params = RPCParams(p_template_id: nil, p_title: title, p_exercises: exercises.map(TemplateExercisePayload.init))
                if let newId: String = try? await client.rpc("save_template_with_exercises", params: params).execute().value {
                    return newId
                }
            }
            // Direct path (used for updates, and as the create fallback if the RPC failed).
            let resolvedId = templateId ?? UUID().uuidString
            struct TemplateRow: Encodable { let id: String; let user_id: String; let title: String }
            _ = try await client.from("templates").upsert(TemplateRow(id: resolvedId, user_id: userId, title: title)).execute()
            _ = try await client.from("template_exercises").delete().eq("template_id", value: resolvedId).execute()
            let rows = exercises.map { ex in
                TemplateExerciseInsert(id: UUID().uuidString, templateId: resolvedId, name: ex.name, muscleGroup: ex.muscleGroup,
                                        defaultSets: ex.defaultSets, defaultReps: ex.defaultReps, defaultWeight: ex.defaultWeight,
                                        orderIndex: ex.orderIndex, exerciseDbId: ex.exerciseDbId)
            }
            _ = try await client.from("template_exercises").insert(rows).execute()
            return resolvedId
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func deleteTemplate(userId: String, templateId: String) async throws {
        do {
            _ = try await client.from("templates").delete().eq("id", value: templateId).eq("user_id", value: userId).execute()
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}

private struct TemplateExercisePayload: Encodable {
    let name: String
    let muscle_group: String?
    let default_sets: Int
    let default_reps: Int
    let default_weight: Double
    let order_index: Int
    let exercise_db_id: String?
    init(_ ex: TemplateExercise) {
        name = ex.name; muscle_group = ex.muscleGroup; default_sets = ex.defaultSets
        default_reps = ex.defaultReps; default_weight = ex.defaultWeight
        order_index = ex.orderIndex; exercise_db_id = ex.exerciseDbId
    }
}

private struct TemplateExerciseInsert: Encodable {
    let id: String
    let templateId: String
    let name: String
    let muscleGroup: String?
    let defaultSets: Int
    let defaultReps: Int
    let defaultWeight: Double
    let orderIndex: Int
    let exerciseDbId: String?
    enum CodingKeys: String, CodingKey {
        case id, name
        case templateId = "template_id"
        case muscleGroup = "muscle_group"
        case defaultSets = "default_sets"
        case defaultReps = "default_reps"
        case defaultWeight = "default_weight"
        case orderIndex = "order_index"
        case exerciseDbId = "exercise_db_id"
    }
}
```

*(Implementer note: verify the exact Supabase-Swift SDK method names for `.rpc(...)`, `.upsert(...)`, `.ilike(...)` against the SDK version already pinned in `ios/Athlix.xcodeproj`/`Package.resolved` — the Foundation and Dashboard milestones already call `.rpc`-equivalent and query-builder methods elsewhere in this codebase; match those exact call shapes rather than guessing new ones.)*

- [ ] **Step 5: Run tests, confirm pass.**

- [ ] **Step 6: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/Models/Template.swift ios/AthlixCore/Sources/AthlixCore/Data/TemplateRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/TemplateRepositoryTests.swift
git commit -m "Add TemplateRepository and Template/TemplateExercise models"
```

---

## Task 7: `WorkoutRepository` extensions — save, delete, rename, update-sets

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Data/WorkoutRepositorySaveTests.swift`

Adds the write-path methods the Dashboard milestone didn't need (it was read-only). Ports `saveWorkout` (RPC-first, manual-insert fallback with client-side PR best-of logic, `supabaseData.ts` lines 1571–1725), `deleteWorkout` (1727–1737), `renameWorkout` (1818–1826), `updateWorkoutSets` (1743–1815, used by the past-date calendar edit flow).

- [ ] **Step 1: Write failing tests**: happy-path RPC save returns the fetched `Workout`; when the RPC mock errors, the fallback path is exercised and still returns a valid `Workout` plus writes `exercises` and upserts `personal_records` with correct best-of comparison (existing PR has higher weight → not replaced; new set has higher weight → replaced; equal weight but more reps → replaced); `deleteWorkout` calls delete scoped to both id and user_id; empty completed-sets across all exercises throws before any network call.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**, extending the existing protocol:

```swift
public protocol WorkoutRepository: Sendable {
    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout]
    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout
    func deleteWorkout(userId: String, workoutId: String) async throws
    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws
    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String])
}

public struct NewWorkoutExercise: Sendable {
    public let name: String
    public let muscleGroup: String?
    public let exerciseDbId: String?
    public let completedSets: [(reps: Int, weight: Double, unit: String)]
    public init(name: String, muscleGroup: String?, exerciseDbId: String?, completedSets: [(reps: Int, weight: Double, unit: String)]) {
        self.name = name; self.muscleGroup = muscleGroup; self.exerciseDbId = exerciseDbId; self.completedSets = completedSets
    }
}

public struct NewWorkoutInput: Sendable {
    public let title: String
    public let date: String
    public let durationMinutes: Int
    public let notes: String?
    public let exercises: [NewWorkoutExercise]
    public init(title: String, date: String, durationMinutes: Int, notes: String?, exercises: [NewWorkoutExercise]) {
        self.title = title; self.date = date; self.durationMinutes = max(0, durationMinutes)
        self.notes = notes; self.exercises = exercises
    }
}
```

`LiveWorkoutRepository.saveWorkout` mirrors `saveWorkout` in `supabaseData.ts`: filter exercises to only those with a `completedSets` entry surviving `reps > 0 || weight > 0`, throw `RepositoryError.unknown("Complete at least one set before saving.")` if nothing survives, call the `save_workout_with_sets` RPC, on success re-fetch the `workouts` row by returned id; on RPC failure fall back to manual `workouts` insert + `exercises` insert + `personal_records` best-of upsert (replicate the exact best-of comparison from `supabaseData.ts` lines 1673–1677 and 1701–1704: replace if `candidate.weight > existing.weight`, or equal weight with `candidate.reps > existing.reps`).

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/WorkoutRepositorySaveTests.swift
git commit -m "Add save/delete/rename/update-sets to WorkoutRepository"
```

---

## Task 8: `PersonalRecordRepository` extension — real PR count for Finish sheet

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Data/PersonalRecordRepository.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Data/PersonalRecordRepositoryTests.swift`

This is the approved **fix** for the web app's always-0 PR count bug (see design spec's Data Flow section): after a workout saves, query which of the touched exercise names now have a `personal_records` row whose `achievedDate` equals the just-saved workout's date (meaning the RPC's upsert applied a new best for that exercise on this save).

- [ ] **Step 1: Write failing test**: given a mock returning records for `["Bench Press", "Squat"]` where only `"Bench Press"`'s `achievedDate` matches the target date, `countNewPRs(userId:exerciseNames:achievedOn:)` returns `1`.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```swift
public protocol PersonalRecordRepository: Sendable {
    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord]
    func countNewPRs(userId: String, exerciseNames: [String], achievedOn date: String) async throws -> Int
}

extension LivePersonalRecordRepository {
    public func countNewPRs(userId: String, exerciseNames: [String], achievedOn date: String) async throws -> Int {
        guard !exerciseNames.isEmpty else { return 0 }
        do {
            let records: [PersonalRecord] = try await client
                .from("personal_records")
                .select()
                .eq("user_id", value: userId)
                .in("exercise_name", values: exerciseNames)
                .eq("achieved_date", value: date)
                .execute()
                .value
            return records.count
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/Data/PersonalRecordRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/PersonalRecordRepositoryTests.swift
git commit -m "Add countNewPRs to PersonalRecordRepository for real Finish-sheet PR count"
```

---

## Task 9: `ExerciseLibraryRepository` — search, recent, by-group

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Models/ExerciseLibraryItem.swift`
- Create: `ios/AthlixCore/Sources/AthlixCore/Data/ExerciseLibraryRepository.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Data/ExerciseLibraryRepositoryTests.swift`

Backs the Exercise Picker's three tabs. Ports (simplified — no in-memory TTL cache layer is required for correctness, though implementers may add one if it's a trivial addition, matching `getCachedLibrary`'s 5-min TTL from `supabaseData.ts` lines 2344–2356): `searchExerciseLibrary` (fuzzy name match, no alias table in this milestone — see note below), `getExerciseLibraryByGroup`, `getRecentExerciseOptions`, `getLastExerciseSession`, `renameExerciseEverywhere`, `addCustomExercise`.

**Scope note**: `EXERCISE_ALIASES` (referenced but not read during research) is a large supplementary alias table for search. Since exact contents weren't available during design, implement search using only direct fuzzy name-matching + muscle-group-name matching (tiers 1 and 3 of `searchExerciseLibrary`); skip tier 2 (alias matching) for this milestone. This is a deliberate, minor scope reduction — flag it in the task's self-review, not a silent gap.

- [ ] **Step 1: Write failing tests**: `searchLibrary(userId:query:)` returns name-matches before muscle-group-name matches, and empty query returns all rows alphabetically; `libraryByGroup` filters to the given muscle group and excludes other users' custom exercises; `lastSession(userId:exerciseName:)` returns nil when no matching rows, and returns the correct `perSetData`/`totalVolume` aggregation when matches exist (mirror the exact aggregation logic in `supabaseData.ts` lines 2154–2189: group by latest workout date, sum `weight*reps*sets` for volume); `recentExerciseOptions` groups/dedupes by exercise name, most-recent first.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement models + repository**

```swift
public struct ExerciseLibraryItem: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let muscleGroup: String
    public let isCustom: Bool
    public let userId: String?
    public let exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case muscleGroup = "muscle_group"
        case isCustom = "is_custom"
        case userId = "user_id"
        case exerciseDbId = "exercise_db_id"
    }
}

public struct RecentExerciseOption: Sendable, Equatable, Identifiable {
    public var id: String { name }
    public let name: String
    public let muscleGroup: String
    public let exerciseDbId: String?
    public let lastSession: LastSessionSummary
}
```

```swift
public protocol ExerciseLibraryRepository: Sendable {
    func searchLibrary(userId: String, query: String) async throws -> [ExerciseLibraryItem]
    func libraryByGroup(userId: String, muscleGroup: String) async throws -> [ExerciseLibraryItem]
    func lastSession(userId: String, exerciseName: String) async throws -> LastSessionSummary?
    func recentExerciseOptions(userId: String) async throws -> [RecentExerciseOption]
    func renameExerciseEverywhere(userId: String, oldName: String, newName: String, exerciseDbId: String?) async throws
    func addCustomExercise(userId: String, name: String, muscleGroup: String) async throws -> ExerciseLibraryItem
}
```

`LiveExerciseLibraryRepository`'s `fetchExerciseRowsWithWorkoutDates` helper joins `workouts(id,date)` + `exercises` (batched `.in("workout_id", ...)` in chunks of 400, matching `chunk(workoutIds, 400)` in `supabaseData.ts` line 2133) — reuse this for both `lastSession` and `recentExerciseOptions`, exactly like the web's shared `getCachedExerciseRows` does. `libraryByGroup` and `searchLibrary` query `exercise_library` with the `.or("is_custom.eq.false,user_id.eq.\(userId)")` filter matching `fetchExerciseLibraryRows` (line 2192–2210).

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/Models/ExerciseLibraryItem.swift ios/AthlixCore/Sources/AthlixCore/Data/ExerciseLibraryRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/ExerciseLibraryRepositoryTests.swift
git commit -m "Add ExerciseLibraryRepository for search/recent/by-group/last-session"
```

---

## Task 10: `SetCRUDEngine` — pure set/exercise mutation logic

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Session/SetCRUDEngine.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Session/SetCRUDEngineTests.swift`

Extracts the pure, side-effect-free parts of `ActiveWorkout.tsx`'s set/exercise CRUD (add/copy/remove-set, dedupe-on-add-exercise) into `AthlixCore` functions operating on `[ExerciseEntry]`, so they're unit-testable without any SwiftUI/view-model machinery. This is the "engine" the `ActiveWorkoutViewModel` (Task 11, in the app target) calls into.

- [ ] **Step 1: Write failing tests**:
  - `addSet(to:)` seeds the new set from the last set's weight/reps, and returns the input unchanged (with a flag or thrown error — pick one and be consistent) when already at 20 sets.
  - `copySet(in:at:)` inserts a duplicate immediately after the source index, capped at 20.
  - `removeSet(from:at:)` refuses to drop below 1 set (returns unchanged).
  - `findExistingExerciseIndex(in:matchingName:)` is case-insensitive.

```swift
@Test func addSetSeedsFromLastSet() {
    let sets = [LoggedSet(id: "1", weight: 135, reps: 8, done: true, isPR: false, plannedWeight: nil, plannedReps: nil)]
    let result = SetCRUDEngine.addSet(to: sets, newId: "2")
    #expect(result.count == 2)
    #expect(result.last?.weight == 135)
    #expect(result.last?.done == false)
}

@Test func addSetCapsAtTwenty() {
    let sets = (0..<20).map { LoggedSet(id: "\($0)", weight: 100, reps: 5, done: false, isPR: false, plannedWeight: nil, plannedReps: nil) }
    let result = SetCRUDEngine.addSet(to: sets, newId: "new")
    #expect(result.count == 20)
}

@Test func removeSetRefusesBelowOne() {
    let sets = [LoggedSet(id: "1", weight: 100, reps: 5, done: false, isPR: false, plannedWeight: nil, plannedReps: nil)]
    let result = SetCRUDEngine.removeSet(from: sets, at: 0)
    #expect(result.count == 1)
}

@Test func findExistingExerciseIndexCaseInsensitive() {
    let exercises = [ExerciseEntry(id: "1", name: "Bench Press", muscleGroup: "Chest", exerciseDbId: nil, sets: [], optionalWeight: nil, inputTypeOverride: nil)]
    #expect(SetCRUDEngine.findExistingExerciseIndex(in: exercises, matchingName: "bench press") == 0)
}
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```swift
import Foundation

public enum SetCRUDEngine {
    static let maxSetsPerExercise = 20

    public static func addSet(to sets: [LoggedSet], newId: String) -> [LoggedSet] {
        guard sets.count < maxSetsPerExercise else { return sets }
        let seed = sets.last
        var result = sets
        result.append(LoggedSet(id: newId, weight: seed?.weight, reps: seed?.reps, done: false, isPR: false, plannedWeight: nil, plannedReps: nil))
        return result
    }

    public static func copySet(in sets: [LoggedSet], at index: Int, newId: String) -> [LoggedSet] {
        guard sets.indices.contains(index), sets.count < maxSetsPerExercise else { return sets }
        var result = sets
        var copy = sets[index]
        copy = LoggedSet(id: newId, weight: copy.weight, reps: copy.reps, done: false, isPR: false, plannedWeight: copy.plannedWeight, plannedReps: copy.plannedReps)
        result.insert(copy, at: index + 1)
        return result
    }

    public static func removeSet(from sets: [LoggedSet], at index: Int) -> [LoggedSet] {
        guard sets.count > 1, sets.indices.contains(index) else { return sets }
        var result = sets
        result.remove(at: index)
        return result
    }

    public static func findExistingExerciseIndex(in exercises: [ExerciseEntry], matchingName name: String) -> Int? {
        let normalized = name.lowercased()
        return exercises.firstIndex { $0.name.lowercased() == normalized }
    }
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/AthlixCore/Sources/AthlixCore/Session/SetCRUDEngine.swift ios/AthlixCore/Tests/AthlixCoreTests/Session/SetCRUDEngineTests.swift
git commit -m "Add pure SetCRUDEngine for set/exercise CRUD logic"
```

---

## Task 11: `ActiveWorkoutViewModel` — session state machine (core)

**Files:**
- Create: `ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift`
- Test: `ios/AthlixTests/ActiveWorkoutViewModelTests.swift`

The consolidated `@Observable` view model per the design spec's Architecture section. This is the biggest single task — the equivalent of `Log.tsx` + `ActiveWorkout.tsx`'s state (minus dead code, minus what's factored into `SetCRUDEngine`/`PlanEditorViewModel`).

- [ ] **Step 1: Write failing tests** covering: entry resolution priority order (resume valid draft > deep-add-exercise > plan-today > quick-start > blank — construct each precondition and assert the resulting `entryMode`), elapsed timer starts paused and increments only while running, rest timer starts on `markSetDone` and stops when the same set is un-marked, `addExercise` dedupes case-insensitively (uses `SetCRUDEngine.findExistingExerciseIndex`) and navigates to the existing exercise instead of duplicating, `cycleInputType` resets that exercise's sets to the new type's defaults and clears `done`, retroactive date edit disallows future dates and resets `elapsedSeconds`.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement.** Key surface:

```swift
import Foundation
import Observation
import AthlixCore

enum WorkoutEntryMode: Equatable {
    case resumedDraft
    case blankAddExercise
    case planToday
    case pastDateEdit(date: String)
    case quickStart
    case blank
}

@Observable
@MainActor
final class ActiveWorkoutViewModel {
    private(set) var title: String
    private(set) var startAt: Date
    private(set) var elapsedSeconds: Int = 0
    private(set) var isPaused: Bool = true
    private(set) var exercises: [ExerciseEntry] = []
    var notes: String?
    private(set) var restSecondsLeft: Int?
    private(set) var entryMode: WorkoutEntryMode

    private let draftStore: WorkoutDraftStore
    private let workoutRepository: WorkoutRepository
    private let libraryRepository: ExerciseLibraryRepository
    private let userId: String
    private var timerTask: Task<Void, Never>?
    private var restTimerTask: Task<Void, Never>?
    private var draftAutosaveTask: Task<Void, Never>?

    // ... init(userId:workoutRepository:libraryRepository:draftStore:), resolveEntry(deepLink:), 
    // togglePause(), tick(), markSetDone(exerciseId:setId:), addSet(exerciseId:), copySet(exerciseId:at:),
    // removeSet(exerciseId:at:), addExercise(_:), removeExercise(at:), renameExercise(id:newName:),
    // cycleInputType(exerciseId:forced:), changeDate(to:), persistDraftIfNeeded(), save() -> throws -> Workout
}
```

Implement each method by directly porting the corresponding logic from `ActiveWorkout.tsx`/`Log.tsx` as described in the design spec, calling into `SetCRUDEngine` for the pure CRUD parts and `SetCompletionRules`/`ExerciseTypeResolver` for gating/typing. Rest timer duration read via `UserDefaults.standard.integer(forKey: "athlix_default_rest_secs")` (default 90 if unset — matching web's `localStorage` key name and default). Draft autosave: call `draftStore.save(...)` whenever `exercises.count` changes and on a periodic 30s task while the view is active, matching web's dual trigger.

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift ios/AthlixTests/ActiveWorkoutViewModelTests.swift
git commit -m "Add ActiveWorkoutViewModel session state machine"
```

---

## Task 12: `PlanEditorViewModel` — shared plan/template editing logic

**Files:**
- Create: `ios/Athlix/Features/Workout/PlanEditorViewModel.swift`
- Test: `ios/AthlixTests/PlanEditorViewModelTests.swift`

The consolidated view model replacing web's duplicated `PlanTodaySheet.tsx` + in-`ActiveWorkout.tsx` plan-editing logic, per the design spec's "Consolidating duplicated web logic" section. Used both standalone (Templates create/edit) and inline (editing a loaded plan mid-session).

- [ ] **Step 1: Write failing tests**: dirty-tracking flips to `true` on any exercise/set edit; duplicate-name guard calls `TemplateRepository.checkNameExists` before save and surfaces a rename-prompt state on collision; `handleStart()`-equivalent converts `[PlannedExercise]` → `[ExerciseEntry]` copying weight/reps into both the live fields and `plannedWeight`/`plannedReps`; adding a new exercise while `loadedTemplateId != nil` produces a `pendingDecision` state (`.updatePlan`/`.sessionOnly`/`.cancel`) rather than silently mutating.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

```swift
import Foundation
import Observation
import AthlixCore

public struct PlannedSet: Equatable, Sendable {
    public var weight: Double
    public var reps: Int
}

public struct PlannedExercise: Equatable, Sendable, Identifiable {
    public let id: String
    public var name: String
    public var muscleGroup: String
    public var exerciseDbId: String?
    public var sets: [PlannedSet]
}

enum PlanPendingDecision: Equatable {
    case none
    case awaitingUpdateOrSessionOnly(exerciseName: String)
}

@Observable
@MainActor
final class PlanEditorViewModel {
    private(set) var templateId: String?
    var title: String
    private(set) var exercises: [PlannedExercise]
    private(set) var isDirty: Bool = false
    private(set) var pendingDecision: PlanPendingDecision = .none

    private let templateRepository: TemplateRepository
    private let userId: String

    // init(userId:templateRepository:existing:Template?), addExercise(_:), updateSet(exerciseId:index:PlannedSet),
    // markDirty(), checkNameCollisionAndSave() async throws, buildTemplateExercises() -> [TemplateExercise]
    // (averages sets down to default_sets/default_reps/default_weight, matching the approved
    // "replicate flattening" decision -- default_reps/default_weight = arithmetic mean across sets,
    // default_sets = sets.count),
    // startSession() -> [ExerciseEntry] (converts PlannedExercise -> ExerciseEntry, done: false,
    // copying weight/reps into plannedWeight/plannedReps per the design spec)
}
```

- [ ] **Step 4: Run, confirm pass.**

- [ ] **Step 5: Commit.**

```bash
git add ios/Athlix/Features/Workout/PlanEditorViewModel.swift ios/AthlixTests/PlanEditorViewModelTests.swift
git commit -m "Add shared PlanEditorViewModel for template/plan editing"
```

---

## Task 13: `SetValuePicker` — native wheel picker

**Files:**
- Create: `ios/Athlix/Features/Workout/SetValuePicker.swift`

Per the approved decision, uses SwiftUI's native `.pickerStyle(.wheel)` rather than a custom 3D dial. Builds 1-2 `Picker(selection:)` columns based on `DialFieldKind`, matching the web's column ranges from `DialPicker.tsx` (see design research): weight (whole 0-500 + decimal .0/.5), distance (whole + one decimal digit 0-9), minutes (0-120 for time_only else 0-180), seconds (12 values: 0,5,10...55), reps (1-50 if repsOnly else 0-80), height (0-250), calories (0-300 step 5).

- [ ] **Step 1: Implement**

```swift
import SwiftUI
import AthlixCore

struct SetValuePicker: View {
    let kind: DialFieldKind
    let isRepsOnlyContext: Bool
    let isTimeOnlyContext: Bool
    @Binding var value: Double
    let onConfirm: (Double) -> Void
    @Environment(\.dismiss) private var dismiss

    private var wholeRange: [Int] {
        switch kind {
        case .weight: return Array(0...500)
        case .distance: return Array(0...200)
        case .minutes: return Array(0...(isTimeOnlyContext ? 120 : 180))
        case .seconds: return stride(from: 0, through: 55, by: 5).map { $0 }
        case .reps: return Array(isRepsOnlyContext ? 1...50 : 0...80)
        case .height: return Array(0...250)
        case .calories: return stride(from: 0, through: 300, by: 5).map { $0 }
        }
    }

    private var hasDecimalColumn: Bool { kind == .weight || kind == .distance }

    @State private var wholeSelection: Int = 0
    @State private var decimalSelection: Int = 0

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Picker("", selection: $wholeSelection) {
                    ForEach(wholeRange, id: \.self) { Text("\($0)").tag($0) }
                }
                .pickerStyle(.wheel)

                if hasDecimalColumn {
                    Picker("", selection: $decimalSelection) {
                        if kind == .weight {
                            Text(".0").tag(0)
                            Text(".5").tag(5)
                        } else {
                            ForEach(0...9, id: \.self) { Text(".\($0)").tag($0) }
                        }
                    }
                    .pickerStyle(.wheel)
                }
            }
            Button("Set") {
                let composed = Double(wholeSelection) + Double(decimalSelection) / 10
                onConfirm(composed)
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .tint(ColorTokens.accent)
        }
        .padding()
        .background(ColorTokens.bgElevated)
        .onAppear {
            wholeSelection = Int(value)
            decimalSelection = Int((value - value.rounded(.down)) * 10)
        }
    }
}
```

- [ ] **Step 2: Manual verification** (per design spec's testing section — views are manual-only): build a temporary debug harness rendering `SetValuePicker` for each `DialFieldKind`, screenshot on Simulator, confirm scrollable wheel behavior and correct ranges, then fully revert the harness (same pattern used for `MuscleBodyView` verification in the Dashboard milestone).

- [ ] **Step 3: Commit.**

```bash
git add ios/Athlix/Features/Workout/SetValuePicker.swift
git commit -m "Add native wheel SetValuePicker for set value entry"
```

---

## Task 14: `SetRowView` + `ExerciseDetailView`

**Files:**
- Create: `ios/Athlix/Features/Workout/SetRowView.swift`
- Create: `ios/Athlix/Features/Workout/ExerciseDetailView.swift`

Mirrors `SetRow.tsx` + `ExerciseContent.tsx`. `SetRowView`: value box (tap → `.sheet` presenting `SetValuePicker`), +/- steppers with type-appropriate step (weight: 1.25 kg / 2.5 lbs per `Profile.unitPreference`; reps: 1), done-toggle button driving left accent-bar color (`ColorTokens.accent` when done, `ColorTokens.border` otherwise), "Target: …" hint rendered from `plannedWeight`/`plannedReps` when present and set isn't done yet. `ExerciseDetailView`: sticky header (sets done/total, volume, relative-load "×BW" when `Profile.bodyWeight` is set and `ExerciseInputType.isWeightExerciseType`, unit toggle), `ForEach` of `SetRowView`, dashed "+ Add Set" button, last-session prefill banner with Reset action.

- [ ] **Step 1: Implement both views** using `ColorTokens` exclusively for styling (per project convention), taking an `ActiveWorkoutViewModel` binding/reference and the target exercise's `id`.

- [ ] **Step 2: Manual verification**: same debug-harness screenshot approach as Task 13, for a couple of representative `ExerciseInputType`s (weight_reps, reps_only with a planned target present).

- [ ] **Step 3: Commit.**

```bash
git add ios/Athlix/Features/Workout/SetRowView.swift ios/Athlix/Features/Workout/ExerciseDetailView.swift
git commit -m "Add SetRowView and ExerciseDetailView"
```

---

## Task 15: `ActiveWorkoutView` — list/detail assembly + calendar date editor

**Files:**
- Create: `ios/Athlix/Features/Workout/ActiveWorkoutView.swift`
- Create: `ios/Athlix/Features/Workout/CalendarDatePickerView.swift`

Mirrors `ActiveWorkout.tsx`'s top-level two-pane view (list of exercise cards ↔ `ExerciseDetailView`), elapsed-timer display + play/pause control, inline rest-timer bottom bar (lime progress fill per web, using `ColorTokens.accent`), title editing, "Unload all" confirm, empty-state CTAs (Add Exercise / My Plans / Create Plan), and the calendar icon → `CalendarDatePickerView` sheet (month-grid, future dates disabled — a `maxDate: Date()` guard, no external calendar library, matching web's custom `CalendarPicker`).

- [ ] **Step 1: Implement** `ActiveWorkoutView`, wiring every control to the corresponding `ActiveWorkoutViewModel` method from Task 11.

- [ ] **Step 2: Implement** `CalendarDatePickerView` as a simple month-grid `LazyVGrid`, disabling days after `Date()`, calling back into the view model's `changeDate(to:)`.

- [ ] **Step 3: Manual verification** on-device: start a session, add an exercise, log a set, verify rest timer appears and counts down, toggle pause/play, open the calendar and confirm future dates are disabled.

- [ ] **Step 4: Commit.**

```bash
git add ios/Athlix/Features/Workout/ActiveWorkoutView.swift ios/Athlix/Features/Workout/CalendarDatePickerView.swift
git commit -m "Add ActiveWorkoutView list/detail assembly and calendar date editor"
```

---

## Task 16: `ExercisePickerView` — History/Muscle/My Plans tabs + search

**Files:**
- Create: `ios/Athlix/Features/Workout/ExercisePickerView.swift`

Mirrors `ExercisePicker.tsx` minus the confirmed-dead `ExerciseTabBar`. Full-screen sheet, 3 segmented tabs, search field overrides tab content when non-empty (calls `ExerciseLibraryRepository.searchLibrary`), History tab calls `recentExerciseOptions` and groups by muscle group with sticky headers, Muscle tab is a static 9-group grid (Chest/Back/Shoulders/Biceps/Triceps/Legs/Core/Cardio/Yoga) drilling into `libraryByGroup`, My Plans tab lists `TemplateRepository.fetchTemplates` results with Edit/Delete/Start actions. Supports both single-select (dismiss on tap, used from `ActiveWorkoutView`) and multi-select (checkbox + "Add N Exercises" footer, used from `PlanEditorViewModel`'s add-exercise flow) via an `isMultiSelect: Bool` parameter and an `onSelect: ([ExerciseLibraryItem]) -> Void` callback. No exercise thumbnail images (per approved scope decision) — rows show name + a muscle-group `AppIcon`.

- [ ] **Step 1: Implement** the view, its tab-switching state, and the search-overrides-tabs logic.

- [ ] **Step 2: Manual verification**: open the picker from an active session, search for an exercise, switch tabs, add an exercise via both single- and multi-select paths.

- [ ] **Step 3: Commit.**

```bash
git add ios/Athlix/Features/Workout/ExercisePickerView.swift
git commit -m "Add ExercisePickerView with History/Muscle/My Plans tabs"
```

---

## Task 17: `PlanEditorView` — standalone Templates screen + inline plan editing

**Files:**
- Create: `ios/Athlix/Features/Workout/PlanEditorView.swift`
- Create: `ios/Athlix/Features/Workout/TemplatesListView.swift`

`PlanEditorView` is backed by `PlanEditorViewModel` (Task 12) and used two ways: standalone (pushed from `TemplatesListView`, a simple CRUD list wrapping `TemplateRepository`, matching `Templates.tsx`), and inline (presented as a sheet from `ActiveWorkoutView` when the user taps "My Plans" or the bookmark/save-as-template action). Renders the pending-decision prompt (Update Plan / This Session Only / Cancel) as an `.confirmationDialog` when `PlanEditorViewModel.pendingDecision != .none`.

- [ ] **Step 1: Implement both views.**

- [ ] **Step 2: Manual verification**: create a template standalone, edit it, load it into an active session via "My Plans", add an ad-hoc exercise while the plan is loaded and confirm the Update/Session-Only/Cancel prompt appears and each choice behaves correctly.

- [ ] **Step 3: Commit.**

```bash
git add ios/Athlix/Features/Workout/PlanEditorView.swift ios/Athlix/Features/Workout/TemplatesListView.swift
git commit -m "Add PlanEditorView and standalone TemplatesListView"
```

---

## Task 18: `FinishSheetView` — stats, real PR count, save

**Files:**
- Create: `ios/Athlix/Features/Workout/FinishSheetView.swift`

Mirrors `FinishSheet.tsx` minus the confirmed-dead `CelebrationScreen` (per approved decision, finish is: sheet → save → toast → dismiss, no celebration screen). Computes completed-set count, total volume (weight-type exercises only, via `ExerciseInputType.isWeightExerciseType`), relative load (`× bodyweight` using `Profile.bodyWeight`), and the **real** PR count via `PersonalRecordRepository.countNewPRs(userId:exerciseNames:achievedOn:)` called *after* `ActiveWorkoutViewModel.save()` succeeds (the touched exercise names come from the just-saved workout's exercises, the date from the workout's `date`). Editable title/notes bound to the view model. "Add More Exercise" dismisses back to `ActiveWorkoutView` without saving.

- [ ] **Step 1: Implement the view**, calling `ActiveWorkoutViewModel.save()` on confirm, showing an inline error (per design spec's Error Handling section) if it throws, and preserving the local draft (do not call `draftStore.clear()`) until save actually succeeds.

- [ ] **Step 2: Manual verification**: complete a session with at least one PR-worthy set, confirm the Finish sheet shows a non-zero, correct PR count, confirm save navigates home and the draft is cleared only after success.

- [ ] **Step 3: Commit.**

```bash
git add ios/Athlix/Features/Workout/FinishSheetView.swift
git commit -m "Add FinishSheetView with real PR count computation"
```

---

## Task 19: `LogEntryView` — routing + wiring into `MainTabView`

**Files:**
- Create: `ios/Athlix/Features/Workout/LogEntryView.swift`
- Create: `ios/Athlix/Features/Workout/QuickStartSheetView.swift`
- Modify: `ios/Athlix/Navigation/MainTabView.swift`
- Delete: `ios/Athlix/Features/Workout/PlaceholderLogView.swift`

`LogEntryView` mirrors `Log.tsx`'s entry orchestration: on appear, ask `ActiveWorkoutViewModel` to `resolveEntry()`, then route to the resulting `WorkoutEntryMode` — resumed draft or blank → `ActiveWorkoutView` directly; quick-start → `QuickStartSheetView` first; plan-today → `PlanEditorView` (inline mode) first; past-date-edit → fetch that date's workout via `WorkoutRepository.fetchWorkouts` scoped to the single day, regroup its `ExerciseSet` rows back into `[ExerciseEntry]` (group by `name`, matching web's past-date reconstruction logic described in the design research), then `ActiveWorkoutView`.

`QuickStartSheetView` is a small new view — the "Quick Start" concept exists in `Log.tsx`'s flow (`profile.show_start_sheet` branch) but wasn't in scope for a dedicated research pass; implement it minimally: a sheet offering "Start Empty Workout" / "Plan Today" / "Start from a Plan" (listing templates), matching the branch's evident intent from the entry-flow state machine in the design research. If its exact current copy/layout matters, flag as `DONE_WITH_CONCERNS` rather than guessing further.

Update `MainTabView.swift`: replace `PlaceholderLogView()` in the `.fullScreenCover` with `LogEntryView()`. Delete the placeholder file since nothing else references it (confirm via grep before deleting).

- [ ] **Step 1: Implement** `LogEntryView`, `QuickStartSheetView`, update `MainTabView`, delete the placeholder.

- [ ] **Step 2: Manual verification**: tap the Log tab from Dashboard, confirm `LogEntryView` appears (not the placeholder), confirm a full add-exercise → log-set → finish → save round trip navigates back to the Dashboard.

- [ ] **Step 3: Commit.**

```bash
git add ios/Athlix/Features/Workout/LogEntryView.swift ios/Athlix/Features/Workout/QuickStartSheetView.swift ios/Athlix/Navigation/MainTabView.swift
git rm ios/Athlix/Features/Workout/PlaceholderLogView.swift
git commit -m "Wire LogEntryView into the Log tab, remove PlaceholderLogView"
```

---

## Task 20: `project.yml` regeneration + full-suite verification

**Files:**
- Modify: `ios/project.yml` (only if new source directories need explicit globs — check existing glob patterns first; most XcodeGen configs glob whole directories and won't need changes for new files within already-globbed folders)

- [ ] **Step 1: Check** whether `ios/project.yml` requires updates (new test target added in Task 5, if `AthlixTests` didn't already exist) and add an XcodeGen target entry if needed, following the same structure as the existing target(s).

- [ ] **Step 2: Regenerate** the Xcode project — **never hand-edit `project.pbxproj`**:

```bash
cd ios && xcodegen generate
```

- [ ] **Step 3: Verify no fabricated IDs were introduced** (should be none, since xcodegen generates them):

```bash
grep -oE '[A-F0-9]{32}' ios/Athlix.xcodeproj/project.pbxproj | sort -u | wc -l
```

- [ ] **Step 4: Run the full test suite**:

```bash
cd ios/AthlixCore && swift test
```

- [ ] **Step 5: Build the app target** and confirm it builds and launches in the Simulator, then walk the full golden path manually: Log tab → add exercise → log a set → finish → verify workout appears (Dashboard's Today's Workout widget or a fresh fetch).

- [ ] **Step 6: Commit** (only if `project.yml`/`project.pbxproj` changed).

```bash
git add ios/project.yml ios/Athlix.xcodeproj
git commit -m "Regenerate Xcode project for Workout Logger milestone"
```

---

## Self-Review Notes (from the plan author, addressed inline above)

- **Spec coverage**: all 7 in-scope items from the design spec map to tasks: session entry (19), active session (11, 15), set value entry (13), Exercise Picker (16), Plans/Templates (6, 12, 17), Finish flow (18), input-type system (1–3). Draft persistence (4–5) and the PR-count fix (8) are called out explicitly as their own tasks since they're each a distinct approved design decision.
- **`EXERCISE_ALIASES` gap**: flagged explicitly in Task 9 as a deliberate, minor scope reduction (the alias table's contents weren't available during design research) rather than silently omitted.
- **`QuickStartSheetView` gap**: flagged explicitly in Task 19 — its exact web copy/layout wasn't part of the research pass; implementer should flag concerns rather than over-guess.
- **Type consistency check**: `ExerciseEntry`/`LoggedSet` (Task 4) are consumed identically by `SetCRUDEngine` (Task 10), `ActiveWorkoutViewModel` (Task 11), and the views (Tasks 13–15) — same field names throughout. `TemplateExercise`/`Template` (Task 6) are consumed identically by `PlanEditorViewModel` (Task 12) and `TemplatesListView`/`PlanEditorView` (Task 17).
