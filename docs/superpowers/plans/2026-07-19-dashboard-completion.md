# Dashboard Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all three "Known Limitations" from the Dashboard milestone: a real Weekly Goal Ring (trained-days-vs-goal, matching web's visual layout), real per-exercise-volume body-weight-relative muscle load, and Date Navigator request cancellation. Per `docs/superpowers/specs/2026-07-19-dashboard-completion-design.md`.

**Architecture:** A new minimal `ProfileRepository` in `AthlixCore`, a new batched `WorkoutRepository.fetchExercisesForWorkouts`, two new pure-logic modules (`TrainedDaysCalculator`, `MuscleLoadCalculator`) for testability, `DashboardViewModel` extended with a week-anchored second fetch + exercise/profile fetches + UserDefaults-backed goal-days, and two reworked/new SwiftUI views (`WeeklyGoalRingView`, `GoalEditSheetView`) matching web's visual fidelity.

**Tech Stack:** Swift 6, SwiftUI, Swift Testing, XCTest (matching whichever convention the touched file already uses), Supabase Swift SDK, `UserDefaults`.

---

## Reference: real signatures already in the codebase

```swift
// ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift (current — Task 1 modifies this)
public struct Profile: Codable, Equatable, Sendable {
    public let id: String
    public let fullName: String?
    public let unitPreference: WeightUnit
    public let themePreference: String
    public let bodyWeight: Double?
    public let heightFeet: Int?
    public let heightInches: Int?
}

// ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift (current)
public protocol WorkoutRepository: Sendable {
    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout]
    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout
    func deleteWorkout(userId: String, workoutId: String) async throws
    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws
    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String])
    func fetchWorkoutExercises(userId: String, workoutId: String) async throws -> [ExerciseSet]
}

// ios/AthlixCore/Sources/AthlixCore/Models/ExerciseSet.swift
public struct ExerciseSet: Codable, Equatable, Sendable, Identifiable {
    public let id: String; public let workoutId: String; public let name: String
    public let muscleGroup: String?; public let sets: Int; public let reps: Int
    public let weight: Double; public let unit: String; public let orderIndex: Int
    public let exerciseDbId: String?
    public init(id: String, workoutId: String, name: String, muscleGroup: String?, sets: Int, reps: Int, weight: Double, unit: String, orderIndex: Int, exerciseDbId: String?)
}

// ios/AthlixCore/Sources/AthlixCore/Muscle/ExerciseMuscleMapper.swift
public struct ExerciseMuscleTarget: Sendable, Equatable { public let slug: String; public let weight: Double }
public struct ExerciseMuscleProfile: Sendable, Equatable {
    public let primary: [String]; public let secondary: [String]; public let targets: [ExerciseMuscleTarget]
}
public enum ExerciseMuscleMapper {
    public static let primaryLoadWeight = 1.0
    public static let secondaryLoadWeight = 0.4
    public static let slugRegionMap: [String: String] = [ /* slug -> region, e.g. "biceps": "Biceps" */ ]
    public static func profile(forExerciseName: String, fallbackMuscleGroup: String? = nil, muscleSlugs: [(slug: String, type: MuscleTargetType)]? = nil) -> ExerciseMuscleProfile
}

// ios/AthlixCore/Sources/AthlixCore/Units/WeightUnit.swift
public enum WeightUnit: String, Codable, CaseIterable, Sendable {
    case kg, lbs
    public static func convert(_ value: Double, from: WeightUnit, to: WeightUnit) -> Double
}

// ios/AthlixCore/Sources/AthlixCore/Data/RepositoryError.swift
public enum RepositoryError: Error, Equatable { case network, decoding, unknown(String) }

// ios/Athlix/Features/Dashboard/DashboardViewModel.swift (current, app target — Task 6 modifies this)
@Observable @MainActor final class DashboardViewModel {
    private(set) var workouts: [Workout] = []
    private(set) var personalRecords: [PersonalRecord] = []
    private let workoutRepository: WorkoutRepository
    private let personalRecordRepository: PersonalRecordRepository
    private let userId: String
    private let modelContext: ModelContext
    init(workoutRepository: WorkoutRepository, personalRecordRepository: PersonalRecordRepository, userId: String, modelContext: ModelContext)
    func loadWorkouts(from: Date, to: Date) async
    func loadPersonalRecords() async
    var muscleLoadBySlug: [String: Double] { /* current: coarse, workout.muscleGroups-only, equal-weighted */ }
    var muscleIntensityBySlug: [String: Int] { /* MuscleIntensity.tier(load:maxLoad:) per slug */ }
    static func lastSevenDaysRangeUTC(now: Date = Date()) -> (from: Date, to: Date)
    static func rangeUTC(for date: Date, viewMode: DashboardViewMode) -> (from: Date, to: Date)
}

// ios/Athlix/Features/Dashboard/DashboardView.swift (current, app target — Task 9 modifies this)
// Owns @State currentDate, viewMode; .task/.onChange(of: currentDate)/.onChange(of: viewMode) call reloadData(_:)
```

Real DB schema relevant to this plan (`supabase/schema.sql`, unchanged — no migration):
```sql
-- profiles(id, full_name, unit_preference, theme_preference, body_weight, body_weight_unit, height_feet, height_inches, ...)
--   PRIMARY KEY is id (= auth user id), NOT a user_id foreign-key column like most other tables.
-- exercises(id, workout_id, name, muscle_group, sets, reps, weight, unit, order_index, exercise_db_id)
```

---

## Task 1: Add `bodyWeightUnit` to `Profile`

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift`
- Modify: `ios/AthlixCore/Tests/AthlixCoreTests/ProfileTests.swift` (already exists — check its current content and conventions first)

- [ ] **Step 1**: Read `ProfileTests.swift` to see its existing test style, then add a failing test asserting a `Profile` decodes `body_weight_unit` from JSON into `bodyWeightUnit: WeightUnit`, and that the explicit memberwise init accepts it.

- [ ] **Step 2**: Run, confirm fail (compile error — field doesn't exist).

- [ ] **Step 3**: Implement — add the field, its `CodingKeys` entry, and update the memberwise init:

```swift
public struct Profile: Codable, Equatable, Sendable {
    public let id: String
    public let fullName: String?
    public let unitPreference: WeightUnit
    public let themePreference: String
    public let bodyWeight: Double?
    public let bodyWeightUnit: WeightUnit
    public let heightFeet: Int?
    public let heightInches: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case fullName = "full_name"
        case unitPreference = "unit_preference"
        case themePreference = "theme_preference"
        case bodyWeight = "body_weight"
        case bodyWeightUnit = "body_weight_unit"
        case heightFeet = "height_feet"
        case heightInches = "height_inches"
    }

    public init(id: String, fullName: String?, unitPreference: WeightUnit, themePreference: String, bodyWeight: Double?, bodyWeightUnit: WeightUnit, heightFeet: Int?, heightInches: Int?) {
        self.id = id; self.fullName = fullName; self.unitPreference = unitPreference
        self.themePreference = themePreference; self.bodyWeight = bodyWeight; self.bodyWeightUnit = bodyWeightUnit
        self.heightFeet = heightFeet; self.heightInches = heightInches
    }
}
```

(If `Profile` currently has NO explicit init and relies on the synthesized memberwise one, check whether it's ever constructed from outside the module — if it's only ever decoded via `Codable`, an explicit init may not be strictly necessary, but add one anyway for test-fixture construction, matching the established pattern from every other public `AthlixCore` model.)

- [ ] **Step 4**: Run tests, confirm pass. Run the FULL `AthlixCore` suite (`cd ios/AthlixCore && swift test`) to confirm no other file constructs `Profile` with the old (now-broken) memberwise arity — fix any call sites found.

- [ ] **Step 5**: Commit.

```bash
git add ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift ios/AthlixCore/Tests/AthlixCoreTests/ProfileTests.swift
git commit -m "Add bodyWeightUnit to Profile model"
```

---

## Task 2: `ProfileRepository`

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Data/ProfileRepository.swift`
- Create: `ios/AthlixCore/Tests/AthlixCoreTests/Data/ProfileRepositoryTests.swift`

- [ ] **Step 1**: Read `ios/AthlixCore/Sources/AthlixCore/Data/PersonalRecordRepository.swift` for the exact established `Live*Repository` pattern to mirror (do/catch → `RepositoryError.unknown`, default-constructed `SupabaseClient`). Read `ios/AthlixCore/Tests/AthlixCoreTests/RepositoryTests.swift` for the mock-actor test convention.

- [ ] **Step 2**: Write a failing test: given a mock returning a stubbed `Profile`, `fetchProfile(userId:)` returns it; given `shouldThrow`, it throws `RepositoryError`.

- [ ] **Step 3**: Run, confirm fail.

- [ ] **Step 4**: Implement:

```swift
import Foundation
import Supabase

public protocol ProfileRepository: Sendable {
    func fetchProfile(userId: String) async throws -> Profile
}

public final class LiveProfileRepository: ProfileRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    // profiles.id (not a user_id column) is the primary key -- scope by "id", not "user_id".
    public func fetchProfile(userId: String) async throws -> Profile {
        do {
            let profile: Profile = try await client
                .from("profiles")
                .select()
                .eq("id", value: userId)
                .single()
                .execute()
                .value
            return profile
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
```

- [ ] **Step 5**: Run tests, confirm pass.

- [ ] **Step 6**: Commit.

```bash
git add ios/AthlixCore/Sources/AthlixCore/Data/ProfileRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/ProfileRepositoryTests.swift
git commit -m "Add ProfileRepository"
```

---

## Task 3: `WorkoutRepository.fetchExercisesForWorkouts` (batched)

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift`
- Modify: `ios/AthlixCore/Tests/AthlixCoreTests/Data/WorkoutRepositorySaveTests.swift` (or a new file — match whichever convention already covers `fetchWorkoutExercises`)
- Modify: `ios/AthlixCore/Tests/AthlixCoreTests/RepositoryTests.swift` (mechanical mock-protocol-conformance update)

- [ ] **Step 1**: Read `ExerciseLibraryRepository.swift`'s `chunked(_:)` extension and `fetchJoinedExerciseRows` for the established batched-`IN`-query pattern (chunks of 400) to mirror exactly.

- [ ] **Step 2**: Write failing tests: given workout ids spanning multiple chunks (e.g. 401 ids), confirm the batching doesn't drop/duplicate rows (test against the mock, which can simply ignore chunking and return all stubbed rows — the REAL chunking behavior is a `Live*` implementation detail; if there's no way to unit-test the chunk boundary without hitting the network, add a smaller focused test on the `chunked(_:)` helper itself, matching Task 9's fix pattern from the Workout Logger milestone: make it `internal`, not `private`, so `@testable import` can test it directly). Also test the empty-array case (`fetchExercisesForWorkouts(userId:workoutIds: [])` returns `[]` without any network call — a genuine early-return, matching the `countNewPRs` empty-array short-circuit pattern already established).

- [ ] **Step 3**: Run, confirm fail.

- [ ] **Step 4**: Implement — add to the protocol and `LiveWorkoutRepository`:

```swift
public protocol WorkoutRepository: Sendable {
    // ... existing methods ...
    func fetchExercisesForWorkouts(userId: String, workoutIds: [String]) async throws -> [ExerciseSet]
}
```

```swift
extension Array {
    // internal (not private) so tests can exercise chunk-boundary behavior directly.
    func chunked(_ size: Int) -> [[Element]] {
        guard size > 0, !isEmpty else { return [] }
        return stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}

extension LiveWorkoutRepository {
    // Batched IN-query fetch for exercise rows across many workouts at once --
    // used by the Dashboard's real per-exercise muscle-load computation, where
    // fetching each workout's exercises individually (fetchWorkoutExercises,
    // one workout at a time) would mean one query per workout in the visible
    // range. No separate ownership check needed here: workoutIds are expected
    // to already come from an authenticated, userId-scoped fetchWorkouts call,
    // so this trusts the caller rather than re-verifying per id.
    public func fetchExercisesForWorkouts(userId: String, workoutIds: [String]) async throws -> [ExerciseSet] {
        guard !workoutIds.isEmpty else { return [] }
        do {
            var all: [ExerciseSet] = []
            for batch in workoutIds.chunked(400) {
                let rows: [ExerciseSet] = try await client
                    .from("exercises")
                    .select()
                    .in("workout_id", values: batch)
                    .execute()
                    .value
                all.append(contentsOf: rows)
            }
            return all
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
```

(Check whether `LiveWorkoutRepository` already has a private `chunked`-style helper or array extension from an earlier task that this would collide with — if `Array.chunked` already exists file-scoped elsewhere in this module with a different signature, reuse or rename to avoid ambiguity.)

- [ ] **Step 5**: Update `MockWorkoutRepository`/`InMemoryWorkoutRepository` (wherever the existing test mocks live, per Task 7/9's established pattern in the Workout Logger milestone) with a stub conformance.

- [ ] **Step 6**: Run tests, confirm pass. Full `swift test`, confirm no regressions.

- [ ] **Step 7**: Commit.

```bash
git add ios/AthlixCore/Sources/AthlixCore/Data/WorkoutRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/WorkoutRepositorySaveTests.swift ios/AthlixCore/Tests/AthlixCoreTests/RepositoryTests.swift
git commit -m "Add WorkoutRepository.fetchExercisesForWorkouts (batched)"
```

---

## Task 4: `TrainedDaysCalculator` (pure logic)

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Dashboard/TrainedDaysCalculator.swift`
- Create: `ios/AthlixCore/Tests/AthlixCoreTests/Dashboard/TrainedDaysCalculatorTests.swift`

Ports web's `weekDays`/`trainedDaysCount` logic (`src/pages/Home.tsx:349-377`) — read that source directly for the exact status-derivation rules before implementing.

- [ ] **Step 1**: Write failing tests covering: a week with a mix of trained/rest/future days resolves each day's status correctly (Monday-start week, matching `startOfWeek(currentDate, {weekStartsOn: 1})`); today with a workout → `.todayTrained`; today without → `.todayRest`; a future day is always `.future` regardless of whether a (backdated-to-future, which shouldn't happen, but test the guard anyway) workout exists; `trainedDaysCount` counts only `.trained`/`.todayTrained` days, not `.todayRest`/`.rest`/`.future`.

- [ ] **Step 2**: Run, confirm fail.

- [ ] **Step 3**: Implement:

```swift
import Foundation

public enum WeekDayStatus: Equatable, Sendable {
    case trained
    case rest
    case todayTrained
    case todayRest
    case future
}

public struct WeekDayInfo: Equatable, Sendable {
    public let date: Date
    public let status: WeekDayStatus
    public init(date: Date, status: WeekDayStatus) {
        self.date = date; self.status = status
    }
}

public enum TrainedDaysCalculator {
    // Matches web's Monday-start week (startOfWeek(currentDate, {weekStartsOn: 1})).
    public static func weekDays(containing date: Date, workoutDates: Set<String>, today: Date = Date()) -> [WeekDayInfo] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        calendar.firstWeekday = 2 // Monday

        let todayStart = calendar.startOfDay(for: today)
        let weekday = calendar.component(.weekday, from: date) // 1 = Sunday ... 7 = Saturday
        let daysFromMonday = (weekday + 5) % 7 // Sunday(1)->6, Monday(2)->0, ..., Saturday(7)->5
        let weekStart = calendar.date(byAdding: .day, value: -daysFromMonday, to: calendar.startOfDay(for: date)) ?? date

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]

        return (0..<7).map { offset in
            let day = calendar.date(byAdding: .day, value: offset, to: weekStart) ?? weekStart
            let dayStr = formatter.string(from: day)
            let isToday = calendar.isDate(day, inSameDayAs: todayStart)
            let isFuture = day > todayStart && !isToday
            let hasWorkout = workoutDates.contains(dayStr)

            let status: WeekDayStatus
            if isToday {
                status = hasWorkout ? .todayTrained : .todayRest
            } else if isFuture {
                status = .future
            } else {
                status = hasWorkout ? .trained : .rest
            }
            return WeekDayInfo(date: day, status: status)
        }
    }

    public static func trainedDaysCount(_ days: [WeekDayInfo]) -> Int {
        days.filter { $0.status == .trained || $0.status == .todayTrained }.count
    }
}
```

(Implementer: verify the Monday-start weekday-offset arithmetic by hand-tracing a couple of cases against real dates before trusting it blindly — off-by-one errors in this kind of calendar math are common and exactly the kind of thing tests should pin down precisely, not just smoke-test.)

- [ ] **Step 4**: Run tests, confirm pass.

- [ ] **Step 5**: Commit.

```bash
git add ios/AthlixCore/Sources/AthlixCore/Dashboard/TrainedDaysCalculator.swift ios/AthlixCore/Tests/AthlixCoreTests/Dashboard/TrainedDaysCalculatorTests.swift
git commit -m "Add TrainedDaysCalculator pure logic"
```

---

## Task 5: `MuscleLoadCalculator` (pure logic — real per-exercise volume + relative load)

**Files:**
- Create: `ios/AthlixCore/Sources/AthlixCore/Dashboard/MuscleLoadCalculator.swift`
- Create: `ios/AthlixCore/Tests/AthlixCoreTests/Dashboard/MuscleLoadCalculatorTests.swift`

Ports web's real per-exercise muscle-load aggregation (`src/pages/Home.tsx:301-327`), replacing `DashboardViewModel`'s current coarse workout-level fallback.

- [ ] **Step 1**: Write failing tests: given a list of exercise inputs (name, muscleGroup, weight, reps, sets, unit) and a target display unit, confirm per-slug load aggregation matches `ExerciseMuscleMapper.profile(forExerciseName:).targets`' weighted contribution (`load × target.weight`, summed per slug across exercises); confirm unit conversion is applied before computing volume (an exercise logged in kg contributing correctly when the target display unit is lbs, via `WeightUnit.convert`); confirm relative-load computation: `bodyWeightKg == nil` → result equals raw load per slug; `bodyWeightKg` present and `> 0` → result equals `load / bodyWeightKg` per slug (matching web's `relativeLoad || load` — when body weight IS present, ALWAYS use relative, never fall back to raw, matching web's `if (bodyWeightKg && bodyWeightKg > 0)` unconditional-when-present branch, not a "prefer relative but fall back on some other condition" one).

- [ ] **Step 2**: Run, confirm fail.

- [ ] **Step 3**: Implement:

```swift
import Foundation

public enum MuscleLoadCalculator {
    public struct ExerciseInput: Sendable {
        public let name: String
        public let muscleGroup: String?
        public let weight: Double
        public let reps: Int
        public let sets: Int
        public let unit: WeightUnit
        public init(name: String, muscleGroup: String?, weight: Double, reps: Int, sets: Int, unit: WeightUnit) {
            self.name = name; self.muscleGroup = muscleGroup; self.weight = weight
            self.reps = reps; self.sets = sets; self.unit = unit
        }
    }

    /// Real per-exercise training volume (weight * reps * sets, converted to
    /// `displayUnit`) aggregated per muscle slug via `ExerciseMuscleMapper`'s
    /// real name-based targeting -- NOT the coarse workout-level muscleGroups
    /// fallback this replaces. Matches web's `muscleData`/`muscleMapData`
    /// per-exercise reduce (`src/pages/Home.tsx:301-327`).
    public static func loadBySlug(exercises: [ExerciseInput], displayUnit: WeightUnit) -> [String: Double] {
        var totals: [String: Double] = [:]
        for exercise in exercises {
            let displayWeight = WeightUnit.convert(exercise.weight, from: exercise.unit, to: displayUnit)
            let exerciseLoad = displayWeight * Double(exercise.reps) * Double(exercise.sets)
            let profile = ExerciseMuscleMapper.profile(forExerciseName: exercise.name, fallbackMuscleGroup: exercise.muscleGroup)
            for target in profile.targets {
                totals[target.slug, default: 0] += exerciseLoad * target.weight
            }
        }
        return totals
    }

    /// Converts raw per-slug load into body-weight-relative load when
    /// `bodyWeightKg` is present and positive -- unconditionally, matching
    /// web's `if (bodyWeightKg && bodyWeightKg > 0)` branch (not a
    /// prefer-but-sometimes-fall-back rule). Falls back to raw load when no
    /// body weight is on file.
    public static func relativeLoadBySlug(rawLoad: [String: Double], bodyWeightKg: Double?) -> [String: Double] {
        guard let bodyWeightKg, bodyWeightKg > 0 else { return rawLoad }
        return rawLoad.mapValues { $0 / bodyWeightKg }
    }
}
```

- [ ] **Step 4**: Run tests, confirm pass.

- [ ] **Step 5**: Commit.

```bash
git add ios/AthlixCore/Sources/AthlixCore/Dashboard/MuscleLoadCalculator.swift ios/AthlixCore/Tests/AthlixCoreTests/Dashboard/MuscleLoadCalculatorTests.swift
git commit -m "Add MuscleLoadCalculator: real per-exercise volume + relative load"
```

---

## Task 6: Wire `DashboardViewModel` — weekly-goal fetch, profile fetch, exercises fetch, goal-days

**Files:**
- Modify: `ios/Athlix/Features/Dashboard/DashboardViewModel.swift`

This is the largest task in this plan — read the current full file first, since it's an already-reviewed, committed file from the original Dashboard milestone; keep the SwiftData caching pattern (`CachedWorkout`/`CachedPersonalRecord`, fetch-then-update-or-insert) intact for anything already using it, and follow the exact same pattern for any new cached state if you introduce one (or justify why a given new piece of state doesn't need caching — e.g. `Profile`/exercises-for-range are cheap enough and change often enough that a cache-read-first pattern may not be worth it; use your judgment and document it).

- [ ] **Step 1**: Add new state:
```swift
private(set) var weeklyGoalWorkouts: [Workout] = []
private(set) var profile: Profile?
private(set) var exercisesInRange: [ExerciseSet] = []
private(set) var goalDays: Int = Self.loadGoalDays()

private let profileRepository: ProfileRepository
```
Add `profileRepository: ProfileRepository` as a new required `init` parameter (update the call site in `DashboardView.swift` in Task 9 accordingly — don't default it, matching this file's existing pattern of explicit, non-defaulted repository dependencies).

- [ ] **Step 2**: Add `loadWeeklyGoalData(for date: Date) async` — fetches `workoutRepository.fetchWorkouts(userId:from:to:)` scoped to the Monday-start week containing `date` (NOT the Date Navigator's `viewMode`-scoped range — a second, independent fetch, per the design's core finding), stores into `weeklyGoalWorkouts`. Follow the same cache-read-then-network-write-through pattern already used by `loadWorkouts` if you decide caching is warranted here (a separate `CachedWorkout` read scoped to the week range would work, reusing the existing model — just make sure it doesn't collide with or double-write against the main `loadWorkouts`' cache-eviction logic for a possibly-overlapping date range).

- [ ] **Step 3**: Add `loadProfile() async` — fetches `profileRepository.fetchProfile(userId:)`, stores into `profile`. Per-widget error isolation matching the rest of this file: on failure, leave `profile` as its last-known value (nil if never loaded), don't surface a blocking error.

- [ ] **Step 4**: Add `loadExercisesInRange() async` — after `workouts` is populated (by the existing `loadWorkouts`), calls `workoutRepository.fetchExercisesForWorkouts(userId:workoutIds: workouts.map(\.id))`, stores into `exercisesInRange`. Call this AFTER `loadWorkouts` completes (sequenced, not concurrent with it, since it depends on `workouts`' ids) from whichever call site orchestrates the full reload (in `DashboardView`, Task 9).

- [ ] **Step 5**: Goal-days persistence — `UserDefaults`-backed, matching the Workout Logger milestone's rest-timer-duration convention:
```swift
private static let goalDaysDefaultsKey = "athlix_weekly_goal_days"

private static func loadGoalDays() -> Int {
    let stored = UserDefaults.standard.integer(forKey: goalDaysDefaultsKey)
    return (1...7).contains(stored) ? stored : 4
}

func setGoalDays(_ days: Int) {
    let clamped = min(max(days, 1), 7)
    goalDays = clamped
    UserDefaults.standard.set(clamped, forKey: Self.goalDaysDefaultsKey)
}
```

- [ ] **Step 6**: Replace the current `muscleLoadBySlug`/`muscleIntensityBySlug` computed properties to use the real calculators:
```swift
var muscleLoadBySlug: [String: Double] {
    let inputs = exercisesInRange.map {
        MuscleLoadCalculator.ExerciseInput(
            name: $0.name, muscleGroup: $0.muscleGroup, weight: $0.weight,
            reps: $0.reps, sets: $0.sets, unit: WeightUnit(rawValue: $0.unit) ?? .lbs
        )
    }
    let displayUnit = profile?.unitPreference ?? .lbs
    let rawLoad = MuscleLoadCalculator.loadBySlug(exercises: inputs, displayUnit: displayUnit)
    let bodyWeightKg: Double? = profile?.bodyWeight.map {
        WeightUnit.convert($0, from: profile?.bodyWeightUnit ?? .lbs, to: .kg)
    }
    return MuscleLoadCalculator.relativeLoadBySlug(rawLoad: rawLoad, bodyWeightKg: bodyWeightKg)
}
```
(Note: `ExerciseSet.unit` is a raw `String` per the existing model, e.g. `"kg"`/`"lbs"`/`"km"`/`"mi"` — a distance-unit exercise's "weight" field isn't actually a weight at all for those input types, per the Workout Logger milestone's `ExerciseInputType` system. Since `DashboardViewModel` doesn't have exercise-type context here, filter to `unit == "kg" || unit == "lbs"` before mapping to `MuscleLoadCalculator.ExerciseInput`, skipping distance/time-based exercises from the volume computation entirely — matching the spirit of web's `isWeightExerciseType`-style gating used elsewhere, even though web's own `muscleData`/`muscleMapData` reduce doesn't appear to gate on this explicitly; use your judgment here and document the choice, since including a "245 km" value as if it were a weight would produce a nonsensical volume number.)

- [ ] **Step 7**: Add computed properties for the Weekly Goal Ring:
```swift
var weekDays: [WeekDayInfo] {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    let workoutDateStrings = Set(weeklyGoalWorkouts.map(\.date))
    return TrainedDaysCalculator.weekDays(containing: currentReferenceDate, workoutDates: workoutDateStrings)
}
var trainedDaysCount: Int { TrainedDaysCalculator.trainedDaysCount(weekDays) }
```
(`currentReferenceDate` here means whatever `Date` the caller last requested `loadWeeklyGoalData(for:)` with — store it alongside `weeklyGoalWorkouts` as a `private(set) var weeklyGoalReferenceDate: Date` set in `loadWeeklyGoalData`, so `weekDays` doesn't need an external parameter and stays consistent with the data it was computed against.)

- [ ] **Step 8**: Full `swift test` run (this file lives in the app target, so also run the `AthlixTests` suite) to confirm no regressions from the changed `init` signature or computed-property rework — fix any broken call sites (test mocks, `DashboardView`'s construction call) as part of this task, even though `DashboardView.swift`'s FULL rework is Task 9; a minimal compile-fixing update to its `DashboardViewModel(...)` construction call is fine here if needed to keep the build green, with the fuller feature wiring left for Task 9.

- [ ] **Step 9**: Commit.

```bash
git add ios/Athlix/Features/Dashboard/DashboardViewModel.swift
git commit -m "Wire DashboardViewModel: real weekly-goal data, profile, real per-exercise muscle load"
```

---

## Task 7: `WeeklyGoalRingView` rework (ring header + 7-day bar chart)

**Files:**
- Modify: `ios/Athlix/Features/Dashboard/Widgets/WeeklyGoalRingView.swift`

Per the design spec's explicit visual-fidelity requirement — read `src/components/home/WeeklyRing.tsx` directly before implementing, matching its layout/color-per-status choices as closely as SwiftUI reasonably allows, not a simplified reinterpretation.

- [ ] **Step 1**: Change the view's inputs from `completedSets: Int, goalSets: Int` to `trainedDays: Int, goalDays: Int, weekDays: [WeekDayInfo]` (plus an `onEditGoal: () -> Void` closure for the tap-to-edit affordance — check how web triggers `setShowGoalEdit(true)`, likely a tap target somewhere in the widget header, per `src/pages/Home.tsx:603-620` — read that section for exactly what's tappable).

- [ ] **Step 2**: Implement the header (trained/goal count + percentage) matching `WeeklyRing.tsx` lines 15-21, and a horizontal progress bar (not the existing ring — web uses a linear bar here, NOT a circular ring, per `WeeklyRing.tsx` lines 24-31; the CURRENT Swift widget's circular ring doesn't match web at all and should be replaced with a linear `RoundedRectangle`-based progress bar to match).

- [ ] **Step 3**: Implement the 7-day bar chart below the progress bar, one bar per `WeekDayInfo`, matching `WeeklyRing.tsx`'s `switch(day.status)` block (lines 33-58) via `ColorTokens`:
  - `.trained`: full height, `ColorTokens.accent` fill with a glow (`.shadow(color: ColorTokens.accentGlow, radius: ...)`).
  - `.rest`: partial height (~30%), `ColorTokens.bgElevated` fill with `ColorTokens.border` stroke.
  - `.todayTrained`: full height, `ColorTokens.accent` fill with glow AND a pulsing animation (`.scaleEffect`/`.opacity` via a repeating `Animation.easeInOut`, matching web's `animate-pulse-ring` CSS class's intent even if not byte-identical timing).
  - `.todayRest`: partial height (~30%), transparent fill, DASHED `ColorTokens.accent` stroke at reduced opacity (`StrokeStyle(dash: [4, 3])`).
  - `.future`: small height (~20%), transparent fill, `ColorTokens.border` stroke.
  - Each bar labeled with a single-letter day abbreviation below it (`M`, `T`, `W`, ...).

- [ ] **Step 4**: Manual on-device verification via the established temporary-debug-harness pattern (see prior milestones for the exact workflow: swap into `AthlixApp.swift`, screenshot, fully revert). Specifically get a SIDE-BY-SIDE comparison against a screenshot of the web app's Weekly Goal widget (or the `WeeklyRing.tsx` source's visual intent if a live web screenshot isn't available in this environment) confirming the day-bar color/height mapping and overall layout genuinely match — this widget has the milestone's explicit hard fidelity requirement.

- [ ] **Step 5**: Commit (include any `project.pbxproj` diff if `xcodegen generate` reports one — it shouldn't, since this modifies an existing file).

```bash
git add ios/Athlix/Features/Dashboard/Widgets/WeeklyGoalRingView.swift
git commit -m "Rework WeeklyGoalRingView to match web: linear progress bar + 7-day bar chart"
```

---

## Task 8: `GoalEditSheetView` (new)

**Files:**
- Create: `ios/Athlix/Features/Dashboard/Widgets/GoalEditSheetView.swift`

Per `src/components/home/GoalEditSheet.tsx` — read it directly before implementing.

- [ ] **Step 1**: Implement a `.sheet`-presentable view: `GoalEditSheetView(current: Int, onConfirm: (Int) -> Void)`.
  - A 7-cell grid (`LazyVGrid`, 7 columns), one cell per day-count 1-7, each showing the number + "day"/"days" label (singular for 1, matching web's `{day === 1 ? 'day' : 'days'}`).
  - Selected cell: `ColorTokens.accent` background, BLACK text (matching web's explicit `color: isActive ? '#000' : ...` contrast choice — this is one of the few places in the app that intentionally deviates from `ColorTokens.textPrimary`, since the accent color is light/lime and needs dark text for contrast; confirm this reads correctly against `ColorTokens.accent`'s actual hex value).
  - Unselected cells: `ColorTokens.bgElevated` background, `ColorTokens.border` stroke, `ColorTokens.textPrimary`/`ColorTokens.textMuted` text.
  - A contextual hint text below the grid, matching web's exact copy and thresholds verbatim: `selected <= 3` → "Great for recovery-focused training"; `selected <= 5` → "Balanced training frequency"; else → "High-intensity schedule — prioritise recovery".
  - A pinned "Set Goal" confirm button at the bottom (`ColorTokens.accent` background, black text, full-width), calling `onConfirm(selected)` and dismissing.

- [ ] **Step 2**: Manual on-device verification (same established pattern), including the side-by-side comparison per this milestone's fidelity requirement — confirm the grid, selected-state contrast, hint-text thresholds, and confirm-button all render and behave correctly, then fully revert the debug harness.

- [ ] **Step 3**: `cd ios && xcodegen generate`, verify diff registers only the new file, commit.

```bash
git add ios/Athlix/Features/Dashboard/Widgets/GoalEditSheetView.swift ios/Athlix.xcodeproj
git commit -m "Add GoalEditSheetView"
```

---

## Task 9: Wire `DashboardView` — goal edit sheet, request cancellation, final data-flow assembly

**Files:**
- Modify: `ios/Athlix/Features/Dashboard/DashboardView.swift`

- [ ] **Step 1**: Read the current full file (already committed/reviewed from the original Dashboard milestone) before changing anything.

- [ ] **Step 2**: Update the `DashboardViewModel(...)` construction call to pass `profileRepository: LiveProfileRepository()`, matching the existing pattern for `workoutRepository`/`personalRecordRepository`.

- [ ] **Step 3**: Add a `@State private var showingGoalEdit = false` and wire `WeeklyGoalRingView`'s `onEditGoal` closure to set it `true`; present `GoalEditSheetView(current: viewModel.goalDays, onConfirm: { viewModel.setGoalDays($0) })` via `.sheet(isPresented: $showingGoalEdit)`.

- [ ] **Step 4**: Update `reloadData(_:)` (or wherever the existing `.task`/`.onChange` orchestration lives) to also call the new `loadWeeklyGoalData(for: currentDate)`, `loadProfile()`, and (after `loadWorkouts` completes) `loadExercisesInRange()` — sequence `loadExercisesInRange()` strictly after `loadWorkouts` finishes (it depends on `workouts`' ids), but the others can run concurrently via `async let`/`TaskGroup` if that's idiomatic here, matching however the existing `loadWorkouts`/`loadPersonalRecords` pair is already orchestrated (read that pattern first and mirror it).

- [ ] **Step 5**: Request cancellation — add a `@State private var reloadGeneration = 0` (or equivalent). At the start of `reloadData(_:)`, increment it and capture the new value into a local `let myGeneration`. After each `await` inside `reloadData`, before applying results, guard `reloadGeneration == myGeneration else { return }`. This requires `reloadData` to structure its result-application as a final step after all the awaits, not interleaved — restructure if the current implementation applies results incrementally per-fetch (in which case each individual result-application point needs its own guard, not just one at the very end).

- [ ] **Step 6**: Pass `viewModel.weekDays`/`viewModel.trainedDaysCount`/`viewModel.goalDays` into the reworked `WeeklyGoalRingView` call site, replacing the old `completedSets`/`goalSets` arguments.

- [ ] **Step 7**: Manual on-device verification: rapid-tap the Date Navigator's chevrons several times in quick succession, confirm no visible flicker/flash of stale data (the generation-token guard working as intended) — this is the one piece of this plan without a clean unit-test path per the design spec's own testing section, so a documented manual check is the accepted verification here.

- [ ] **Step 8**: Full verification: `cd ios/AthlixCore && swift test` (confirm no regressions), `xcodebuild build`/`test -only-testing:AthlixTests` (confirm the whole app builds and the app-target test suite passes), `cd ios && xcodegen generate` (confirm zero diff).

- [ ] **Step 9**: Commit.

```bash
git add ios/Athlix/Features/Dashboard/DashboardView.swift
git commit -m "Wire goal edit sheet and Date Navigator request-cancellation into DashboardView"
```

---

## Self-Review Notes (from the plan author, addressed inline above)

- **Spec coverage**: all 3 gaps from the design spec map to tasks — Weekly Goal Ring (Tasks 4, 7, 8, parts of 6/9), relative muscle load (Tasks 3, 5, parts of 6), request cancellation (Task 9 Step 5). The `Profile.bodyWeightUnit` model gap and the discovered need for real exercise-level data (Task 3/5) were both surfaced during design/planning and are explicitly covered, not silently dropped.
- **Type consistency check**: `WeekDayInfo`/`WeekDayStatus` (Task 4) are consumed identically by `DashboardViewModel.weekDays` (Task 6) and `WeeklyGoalRingView` (Task 7) — same names throughout. `MuscleLoadCalculator.ExerciseInput` (Task 5) is constructed identically in `DashboardViewModel.muscleLoadBySlug` (Task 6) from real `ExerciseSet` fields.
- **No placeholders**: every task has concrete code, not "implement appropriate logic" — the one explicitly-flagged judgment call (filtering non-weight-unit exercises out of the volume computation) is called out for the implementer to confirm and document, not silently assumed.
