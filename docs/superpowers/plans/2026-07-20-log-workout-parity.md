# Log Workout Web Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the native iOS Workout Logger to full design and behavioral parity with web's `Log.tsx`/`src/components/log/*`, per `docs/superpowers/specs/2026-07-20-log-workout-parity-design.md`.

**Architecture:** Two shared-infrastructure tasks first (`ProfileRepository.updateProfile`, `MuscleBodyView` tap-interaction), then six chunks of mostly-independent tasks: (A) existing-screen fixes + the 8 previously-documented known gaps, (B) rest-timer presets, (C) Quick Start sheet, (D) custom-exercise creation with the muscle body-diagram, (E) celebration screen, (F) unifying the two disconnected "plan today" flows.

**Tech Stack:** Swift 6, SwiftUI, `Observation` (`@Observable`), Supabase Swift SDK, XcodeGen. Two test surfaces: `ios/AthlixCore` (Swift Package, `swift test`) and `ios/Athlix.xcodeproj` app target (`xcodebuild test -only-testing:AthlixTests`) — **every task that touches a shared protocol or the app target must verify BOTH**, not just `swift test` (a build break went undetected for 3 tasks in the prior Dashboard Completion milestone for exactly this reason).

---

## Task 1: `ProfileRepository.updateProfile`

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Data/ProfileRepository.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Data/ProfileRepositoryTests.swift`

- [ ] **Step 1: Read the current file**

Current `ios/AthlixCore/Sources/AthlixCore/Data/ProfileRepository.swift`:
```swift
public protocol ProfileRepository: Sendable {
    func fetchProfile(userId: String) async throws -> Profile
}
public final class LiveProfileRepository: ProfileRepository, @unchecked Sendable {
    private let client: SupabaseClient
    public init(client: SupabaseClient = SupabaseClient(supabaseURL: SupabaseConfig.url, supabaseKey: SupabaseConfig.anonKey)) { self.client = client }
    public func fetchProfile(userId: String) async throws -> Profile {
        do {
            let profile: Profile = try await client.from("profiles").select().eq("id", value: userId).single().execute().value
            return profile
        } catch { throw RepositoryError.unknown("\(error)") }
    }
}
```

- [ ] **Step 2: Add a `ProfileUpdate` struct and the protocol method**

Add to `ProfileRepository.swift`, above the protocol:
```swift
/// A narrow partial-update surface for `Profile` -- only the fields this
/// milestone's fixes actually need to write (live unit-preference toggle,
/// Quick Start gating). NOT a general profile-editing API; add fields here
/// only when a specific caller needs to write them.
public struct ProfileUpdate: Sendable {
    public var unitPreference: WeightUnit?
    public var showStartSheet: Bool?

    public init(unitPreference: WeightUnit? = nil, showStartSheet: Bool? = nil) {
        self.unitPreference = unitPreference
        self.showStartSheet = showStartSheet
    }

    /// Row-shaped payload for PostgREST's `.update(...)`, containing only the
    /// non-nil fields -- omitting a field entirely (not sending it as an
    /// explicit `null`) so an unset field is left untouched server-side,
    /// matching standard partial-update semantics.
    func encodablePayload() -> [String: AnyJSON] {
        var payload: [String: AnyJSON] = [:]
        if let unitPreference { payload["unit_preference"] = .string(unitPreference.rawValue) }
        if let showStartSheet { payload["show_start_sheet"] = .bool(showStartSheet) }
        return payload
    }
}
```

Update the protocol and `LiveProfileRepository`:
```swift
public protocol ProfileRepository: Sendable {
    func fetchProfile(userId: String) async throws -> Profile
    func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile
}
public final class LiveProfileRepository: ProfileRepository, @unchecked Sendable {
    private let client: SupabaseClient
    public init(client: SupabaseClient = SupabaseClient(supabaseURL: SupabaseConfig.url, supabaseKey: SupabaseConfig.anonKey)) { self.client = client }
    public func fetchProfile(userId: String) async throws -> Profile {
        do {
            let profile: Profile = try await client.from("profiles").select().eq("id", value: userId).single().execute().value
            return profile
        } catch { throw RepositoryError.unknown("\(error)") }
    }
    public func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile {
        do {
            let profile: Profile = try await client.from("profiles")
                .update(updates.encodablePayload())
                .eq("id", value: userId)
                .select()
                .single()
                .execute()
                .value
            return profile
        } catch { throw RepositoryError.unknown("\(error)") }
    }
}
```
Check the actual Supabase Swift SDK's `AnyJSON` type is importable from wherever `PostgrestClient`/`SupabaseClient` already comes from in this file (it should already be transitively available since `select()`/`.eq()` are used) -- if `AnyJSON` isn't the right encoding type for this SDK version, use whatever `.update(_:)` actually accepts (check the SDK source under the package's checked-out dependencies, same way `LiveWorkoutRepository`/other `Live*` repositories resolve their exact call shapes) and adjust `encodablePayload()`'s return type to match.

- [ ] **Step 3: Add a mock and tests**

Find the existing `MockProfileRepository` (used by `DashboardViewModelTests.swift`) and add an `updateProfile` stub matching its existing pattern (an actor, storing calls/stubbed results). Add to `ProfileRepositoryTests.swift`:
```swift
func testUpdateProfileSendsOnlyNonNilFields() async throws {
    // exercise ProfileUpdate.encodablePayload() directly -- pure function, no network needed
    let unitOnly = ProfileUpdate(unitPreference: .kg)
    let payload = unitOnly.encodablePayload()
    XCTAssertEqual(payload.count, 1)

    let both = ProfileUpdate(unitPreference: .lbs, showStartSheet: true)
    XCTAssertEqual(both.encodablePayload().count, 2)

    let neither = ProfileUpdate()
    XCTAssertTrue(neither.encodablePayload().isEmpty)
}
```

- [ ] **Step 4: Run tests, build, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -20
cd .. && xcodegen generate && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/AthlixCore/Sources/AthlixCore/Data/ProfileRepository.swift ios/AthlixCore/Tests/AthlixCoreTests/Data/ProfileRepositoryTests.swift ios/AthlixTests
git commit -m "Add ProfileRepository.updateProfile for the unit-preference and show-start-sheet writes this milestone needs"
```

---

## Task 2: `MuscleBodyView` tap-interaction extension

**Files:**
- Modify: `ios/Athlix/Features/Dashboard/MuscleBodyView.swift`

- [ ] **Step 1: Read the current file** (already quoted in full in the design spec's Architecture section — re-read from disk to confirm no drift).

- [ ] **Step 2: Add an optional tap callback and a selection-state overlay**

Add a new public type and extend `MuscleBodyView`'s properties (additive only — existing Dashboard call sites, which never pass the new parameters, must compile and behave identically):
```swift
enum MuscleSelectionState {
    case primary
    case secondary
}
```
Add to the `MuscleBodyView` struct:
```swift
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
```
Update `color(forSlug:)` to check `selectionBySlug` first:
```swift
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
```
Update `body` to attach a tap gesture per region when `onTapSlug` is set:
```swift
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
```
When `onTapSlug` is `nil`, `.onTapGesture { onTapSlug?(entry.slug) }` is a harmless no-op closure (SwiftUI still attaches the recognizer, but it does nothing) — this does not change any existing Dashboard visual/behavior, only adds inert gesture recognizers. Confirm this reasoning holds during review; if a reviewer flags unconditionally attaching a no-op gesture recognizer as wasteful, an acceptable alternative is wrapping the `.contentShape`/`.onTapGesture` pair in `if onTapSlug != nil { ... }`.

- [ ] **Step 3: Verify existing Dashboard usage is unaffected**

`ios/Athlix/Features/Dashboard/Widgets/MuscleMapWidgetView.swift` calls `MuscleBodyView(intensityBySlug:view:)` — confirm this still compiles unchanged (the two new properties have defaults, so this call site needs no edit).

- [ ] **Step 4: Build and commit**

```bash
cd ios && xcodegen generate && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Dashboard/MuscleBodyView.swift
git commit -m "Extend MuscleBodyView with an optional tap-to-select interaction mode for custom-exercise creation"
```

---

## Task 3: Known gap #1 — `ExerciseTypeResolver.normalizeKey` whitespace

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeResolver.swift:24-32`
- Test: find the existing `ExerciseTypeResolverTests.swift` (or equivalent) in `ios/AthlixCore/Tests/AthlixCoreTests/`

- [ ] **Step 1: Write the failing test**

Add to the existing resolver test file:
```swift
func testNormalizeKeyCollapsesAllWhitespaceNotJustAsciiSpaces() {
    // Web's TS source: name.replace(/\s+/g, ' ') -- collapses ANY whitespace
    // run (tabs, newlines, multiple spaces) into one space, not just repeated
    // ASCII spaces. "Bench\tPress" and "Bench  Press" must resolve identically.
    let tabResult = ExerciseTypeResolver.resolve("Bench\tPress")
    let spaceResult = ExerciseTypeResolver.resolve("Bench Press")
    XCTAssertEqual(tabResult, spaceResult)

    let newlineResult = ExerciseTypeResolver.resolve("Bench\n\nPress")
    XCTAssertEqual(newlineResult, spaceResult)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ios/AthlixCore && swift test --filter testNormalizeKeyCollapsesAllWhitespaceNotJustAsciiSpaces 2>&1 | tail -20
```
Expected: FAIL (tab/newline runs don't collapse, so `resolve` may return a different `ExerciseInputType` for a name with a stray tab than for the same name with a single space, depending on whether the pattern/exact-match tables are whitespace-sensitive).

- [ ] **Step 3: Fix `normalizeKey`**

```swift
    private static func normalizeKey(_ value: String) -> String {
        var result = value.lowercased()
        result = result.replacingOccurrences(of: "(", with: "")
        result = result.replacingOccurrences(of: ")", with: "")
        result = result.replacingOccurrences(
            of: "\\s+", with: " ", options: .regularExpression
        )
        return result.trimmingCharacters(in: .whitespacesAndNewlines)
    }
```

- [ ] **Step 4: Run to verify it passes, run the full suite, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -30
git add ios/AthlixCore/Sources/AthlixCore/ExerciseTypes/ExerciseTypeResolver.swift ios/AthlixCore/Tests/AthlixCoreTests
git commit -m "Fix ExerciseTypeResolver.normalizeKey to collapse all whitespace runs, not just repeated ASCII spaces (closes known gap #1)"
```

---

## Task 4: Known gap #3 — `getRecentExerciseOptions` muscle-group inference fallback

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Data/ExerciseLibraryRepository.swift` (around line 122)
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Data/ExerciseLibraryRepositoryTests.swift` (or wherever the existing `getRecentExerciseOptions`/`searchTiers` tests live — find via `grep -rl "getRecentExerciseOptions" ios/AthlixCore/Tests/`)

- [ ] **Step 1: Confirm `inferMuscleGroupFromName` doesn't already exist**

```bash
grep -rn "inferMuscleGroupFromName" ios/AthlixCore/Sources/AthlixCore/
```
If it already exists somewhere (e.g. added incidentally by another task), reuse it rather than re-deriving. If not, read web's implementation first:
```bash
grep -n "inferMuscleGroupFromName" -A 20 /Users/dhrumilgajera/Desktop/AthlixV2.1-1/src/lib/supabaseData.ts
```
Port that exact heuristic (a name-substring-to-muscle-group lookup table) as a new `static func inferMuscleGroupFromName(_ name: String) -> String` on `ExerciseLibraryRepository` or a small standalone helper in the same file — match web's exact keyword list, don't invent a different one.

- [ ] **Step 2: Write the failing test**

```swift
func testGetRecentExerciseOptionsInfersMuscleGroupWhenBlank() {
    // Construct an ExerciseSet row with muscleGroup == nil and a name that
    // web's inferMuscleGroupFromName would map to a known group (use whatever
    // exact name/group pair the ported heuristic produces -- read the ported
    // table from Step 1 and pick a real example, e.g. a name containing
    // "squat" inferring "Legs", matching web's actual keyword table).
    let rows = [/* construct via this file's existing ExerciseSet test fixtures,
                   with muscleGroup: nil and name matching an inferable keyword */]
    let options = ExerciseLibraryRepository.getRecentExerciseOptions(from: rows)
    XCTAssertNotEqual(options.first?.muscleGroup, "")
}
```
(Fill in the exact fixture construction by reading this file's existing tests for `getRecentExerciseOptions` — reuse their established `ExerciseSet(...)` construction pattern rather than inventing a new one.)

- [ ] **Step 3: Run to verify it fails, then wire the fallback into `getRecentExerciseOptions`**

Replace the current:
```swift
            // web falls back to inferMuscleGroupFromName() when muscle_group is blank; that
            // heuristic port is out of scope for this task, so an empty string is used instead.
            options.append(RecentExerciseOption(
                name: row.name, muscleGroup: row.muscleGroup ?? "", exerciseDbId: row.exerciseDbId, lastSession: session
            ))
```
with:
```swift
            let muscleGroup = row.muscleGroup?.isEmpty == false
                ? row.muscleGroup!
                : inferMuscleGroupFromName(row.name)
            options.append(RecentExerciseOption(
                name: row.name, muscleGroup: muscleGroup, exerciseDbId: row.exerciseDbId, lastSession: session
            ))
```

- [ ] **Step 4: Run full suite, build, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -30
cd .. && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
git add ios/AthlixCore/Sources/AthlixCore/Data/ExerciseLibraryRepository.swift ios/AthlixCore/Tests
git commit -m "Port inferMuscleGroupFromName fallback for blank muscle groups in getRecentExerciseOptions (closes known gap #3)"
```

---

## Task 5: Known gap #8 — dedupe `touchedExerciseNames` before PR lookup

**Files:**
- Modify: `ios/Athlix/Features/Workout/FinishSheetView.swift:78-80`

- [ ] **Step 1: Read current implementation**
```swift
    private var touchedExerciseNames: [String] {
        viewModel.exercises.filter { $0.sets.contains { $0.done } }.map(\.name)
    }
```

- [ ] **Step 2: Add dedup**
```swift
    private var touchedExerciseNames: [String] {
        var seen = Set<String>()
        return viewModel.exercises
            .filter { $0.sets.contains { $0.done } }
            .map(\.name)
            .filter { seen.insert($0).inserted }
    }
```

- [ ] **Step 3: Build and commit**
```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/FinishSheetView.swift
git commit -m "Dedupe touchedExerciseNames before PR-count lookup (closes known gap #8)"
```

---

## Task 6: Draft resumability — match web's 8-hour TTL, not same-calendar-day

**Files:**
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift:151-153`
- Test: find the existing `ActiveWorkoutViewModelTests.swift`'s draft-resumability tests

- [ ] **Step 1: Confirm the finding**

`ios/Athlix/Data/WorkoutDraftStore.swift` already enforces a real 8-hour TTL at `load()` (`private let ttl: TimeInterval = 8 * 3600`, and `load()` returns `nil`/clears if `draft.isExpired(now:ttl:)`). `ActiveWorkoutViewModel.isDraftResumable` adds an EXTRA, over-restrictive check on top of that:
```swift
    private func isDraftResumable(_ draft: WorkoutDraft) -> Bool {
        Calendar.current.isDate(draft.startAt, inSameDayAs: Date())
    }
```
This means a draft started at 11pm is resumable until midnight (same-day check fails after that), even though the underlying store would happily serve it until 7am (8-hour TTL) — narrower than web, which relies on the TTL alone with no calendar-day restriction.

- [ ] **Step 2: Write the failing test**

Find the existing test file's draft-resumability tests (`grep -rn "isDraftResumable\|resolveEntry" ios/AthlixTests/ActiveWorkoutViewModelTests.swift`) and add, matching that file's established `ActiveWorkoutViewModel` construction pattern:
```swift
func testDraftResumableAcrossMidnightWithinEightHourTTL() async {
    // A draft started 1 hour ago at 11pm yesterday (relative to "now") must
    // still resolve as .resumedDraft even though `Date()` is now a different
    // calendar day -- matching web's TTL-only (not calendar-day) resumability.
    let almostMidnight = Date().addingTimeInterval(-3600) // 1 hour ago
    // Construct a WorkoutDraft with startAt: almostMidnight (reuse this test
    // file's existing draft-construction helper if one exists), save it via
    // the mock/real WorkoutDraftStore this test file already uses, then call
    // resolveEntry(deepLink: nil) and assert entryMode == .resumedDraft.
}
```

- [ ] **Step 3: Remove the over-restrictive check**

Delete `isDraftResumable` entirely and simplify its call site:
```swift
        if let draft = draftStore.load() {
            applyDraft(draft)
            entryMode = .resumedDraft
            return
        }
```
(`draftStore.load()` already returns `nil` for an expired draft, so the `isDraftResumable` wrapper was purely additive restriction, not additional safety — removing it doesn't weaken any guarantee.)

- [ ] **Step 4: Run tests, build, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -20
cd .. && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift ios/AthlixTests
git commit -m "Match web's 8-hour-TTL-only draft resumability, removing the extra same-calendar-day restriction"
```

---

## Task 7: Past-date load merges ALL workouts for that date

**Files:**
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift:173-225` (`loadPastDate`, `groupExerciseRows`)
- Test: `ios/AthlixTests/ActiveWorkoutViewModelTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func testLoadPastDateMergesExercisesFromAllWorkoutsSavedThatDate() async throws {
    // Web's Log.tsx forcedWorkoutDate path merges exercises from EVERY workout
    // saved on the target date (allSaved.flatMap), not just the first. Set up
    // a mock WorkoutRepository (reuse this file's existing mock pattern) whose
    // fetchWorkouts(userId:from:to:) returns TWO Workout rows for the same
    // date, and whose fetchWorkoutExercises returns different exercise rows
    // per workoutId. After resolveEntry(deepLink: .pastDate(dateString)),
    // assert `exercises` contains entries from BOTH workouts' exercise sets,
    // not only the first workout's.
}
```

- [ ] **Step 2: Run to verify it fails** — current code does `guard let workout = workouts.first else { return }`, so only one workout's data is ever fetched.

- [ ] **Step 3: Rework `loadPastDate` to merge all workouts**

```swift
    private func loadPastDate(_ dateString: String) async {
        entryMode = .pastDateEdit(date: dateString)
        exercises = []

        guard let date = Self.parseISODate(dateString) else { return }

        do {
            let workouts = try await workoutRepository.fetchWorkouts(userId: userId, from: date, to: date)
            guard let firstWorkout = workouts.first else { return }
            // Title/notes/startAt/elapsed still come from the FIRST workout only
            // (mirroring web, which also only surfaces one workout's metadata
            // fields even while merging all workouts' exercise rows) -- this
            // asymmetry is web's actual behavior, not an oversight to "fix"
            // into full symmetry.
            title = firstWorkout.title
            notes = firstWorkout.notes
            startAt = date
            elapsedSeconds = (firstWorkout.durationMinutes ?? 0) * 60
            isPaused = true

            var allRows: [ExerciseSet] = []
            for workout in workouts {
                let rows = try await workoutRepository.fetchWorkoutExercises(userId: userId, workoutId: workout.id)
                allRows.append(contentsOf: rows)
            }
            exercises = Self.groupExerciseRows(allRows)
        } catch {
            // Per-action isolation, matching design spec's Error Handling stance.
        }
    }
```
Note: `groupExerciseRows` itself needs no change — it already groups by name across whatever flat row list it's given, so feeding it a merged multi-workout row list works without modification. Update the doc comment above `loadPastDate` to describe the merge (the existing comment says "the given date's saved workout" singular — reword to plural/merged).

- [ ] **Step 4: Run tests, build, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -20
cd .. && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift ios/AthlixTests
git commit -m "Merge exercises from all workouts saved on a past date, not just the first (matches web's allSaved.flatMap)"
```

---

## Task 8: Wire up `optionalWeight` for reps-only exercises

**Files:**
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift` (add a setter method)
- Modify: `ios/Athlix/Features/Workout/ExerciseDetailView.swift` (add a toggle UI)
- Test: `ios/AthlixTests/ActiveWorkoutViewModelTests.swift`

- [ ] **Step 1: Write the failing test for the view-model setter**

```swift
func testSetOptionalWeightUpdatesExerciseEntryFlag() {
    // Construct a viewModel with one reps-only ExerciseEntry (optionalWeight: nil),
    // call viewModel.setOptionalWeight(exerciseId: id, enabled: true), then
    // assert viewModel.exercises.first(where: { $0.id == id })?.optionalWeight == true.
}
```

- [ ] **Step 2: Add the setter to `ActiveWorkoutViewModel`**

Find where sibling per-exercise mutation methods live (e.g. `addSet`, `removeSet` — same file) and add, following their established `guard let index = exercises.firstIndex(where: { $0.id == exerciseId })` pattern:
```swift
    /// Toggles whether a reps-only exercise opts into tracking added weight
    /// alongside its reps (e.g. weighted push-ups). `nil`/`false`/`true` per
    /// `ExerciseEntry.optionalWeight`'s existing tri-state doc comment --
    /// this method only ever writes `true`/`false`, never resets to `nil`.
    func setOptionalWeight(exerciseId: String, enabled: Bool) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        exercises[index].optionalWeight = enabled
    }
```

- [ ] **Step 3: Run test to verify it passes**

```bash
xcodebuild test -project ios/Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests/ActiveWorkoutViewModelTests/testSetOptionalWeightUpdatesExerciseEntryFlag 2>&1 | tail -20
```

- [ ] **Step 4: Add the toggle UI to `ExerciseDetailView`**

In `statsHeader` or near it (read the current file first — it was shown in full earlier in this session's context, re-read from disk to confirm no drift from other tasks), add a toggle that only renders when `inputType` is reps-only (check however `ExerciseInputType` already exposes a reps-only predicate, e.g. `inputType.isRepsOnlyExerciseType` or similar — grep the enum's existing predicates like `isWeightExerciseType`/`isDistanceExerciseType` used elsewhere in this same file for the naming convention to match):
```swift
            if inputType.isRepsOnlyExerciseType {
                Toggle("Track weight", isOn: Binding(
                    get: { exercise?.optionalWeight ?? false },
                    set: { viewModel.setOptionalWeight(exerciseId: exerciseId, enabled: $0) }
                ))
                .font(.caption)
                .foregroundStyle(ColorTokens.textSecondary)
                .tint(ColorTokens.accent)
            }
```
When `optionalWeight` is `true`, the existing weight-input UI for this exercise should become visible even though its underlying `ExerciseInputType` is reps-only — check `SetRowView`'s current rendering logic for how it decides whether to show a weight field, and gate that on `exercise?.optionalWeight == true` in addition to the existing `inputType` check, so toggling this flag actually surfaces a weight field rather than only flipping inert model state.

- [ ] **Step 5: Manual verification** — no clean unit-test path for the SwiftUI toggle-to-weight-field wiring; verify via careful code reading (confirm the `SetRowView` gate you added is reachable and correctly scoped) since simulator UI interaction isn't available in this environment.

- [ ] **Step 6: Build, run full test suite, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -20
cd .. && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift ios/Athlix/Features/Workout/ExerciseDetailView.swift ios/Athlix/Features/Workout/SetRowView.swift ios/AthlixTests
git commit -m "Wire up optionalWeight: a toggle lets reps-only exercises opt into weight tracking"
```

---

## Task 9: Live unit-preference toggle

**Files:**
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift`
- Modify: `ios/Athlix/Features/Workout/ExerciseDetailView.swift` (activates the currently-disabled toggle)
- Test: `ios/AthlixTests/ActiveWorkoutViewModelTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
func testSetUnitPreferenceUpdatesLocalStateAndPersistsViaProfileRepository() async {
    // Construct viewModel with a MockProfileRepository (add one to this test
    // target if it doesn't exist yet, matching the Mock*Repository actor
    // pattern already established for MockWorkoutRepository) and a known userId.
    // Call `await viewModel.setUnitPreference(.kg)`.
    // Assert: viewModel.unitPreference == .kg (local state updates immediately)
    // AND the mock's updateProfile was called once with userId and
    // ProfileUpdate(unitPreference: .kg).
}

func testSetUnitPreferenceKeepsLocalChangeEvenIfPersistFails() async {
    // Same setup but mock's updateProfile throws. Assert viewModel.unitPreference
    // still updated locally to the new value -- per the design spec's Error
    // Handling section ("failed persist just means the preference doesn't
    // survive to the next session, not a broken current one"), a failed write
    // must NOT roll back the in-session value.
}
```

- [ ] **Step 2: Add `profileRepository`/`userId` access and the setter**

Check `ActiveWorkoutViewModel`'s existing `init` — if it doesn't already take a `ProfileRepository` and expose the constructor's `userId`, add both (matching the constructor-injection pattern already used for `workoutRepository`/`draftStore`). Add:
```swift
    private(set) var unitPreference: WeightUnit

    /// Updates the in-session display unit immediately (so open set rows/stats
    /// reflect the change without waiting on the network), then persists it to
    /// the profile in the background. A failed persist is silently swallowed --
    /// per this milestone's design spec, a failed write shouldn't interrupt an
    /// in-progress workout, it just means the preference reverts to its old
    /// value next session.
    func setUnitPreference(_ unit: WeightUnit) async {
        unitPreference = unit
        do {
            _ = try await profileRepository.updateProfile(userId: userId, updates: ProfileUpdate(unitPreference: unit))
        } catch {
            // Intentionally swallowed -- see doc comment above.
        }
    }
```
Every existing call site that constructs `ActiveWorkoutViewModel` (grep `ActiveWorkoutViewModel(` across `ios/Athlix/` and `ios/AthlixTests/`) needs a `profileRepository:` argument added — for `ios/Athlix/Features/Workout/LogEntryView.swift`'s real construction, pass `LiveProfileRepository()` (matching the pattern `DashboardView.swift` already uses); for test call sites, pass a `MockProfileRepository`.

- [ ] **Step 3: Run tests to verify they pass**

- [ ] **Step 4: Wire the toggle in `ExerciseDetailView`**

Replace the currently-disabled toggle (documented in the file's own header comment as a known no-op — re-read the current file from disk, since Task 8 may have touched it):
```swift
                Picker("", selection: Binding(
                    get: { viewModel.unitPreference == .kg },
                    set: { isMetric in
                        Task { await viewModel.setUnitPreference(isMetric ? .kg : .lbs) }
                    }
                )) {
                    Text(inputType.isDistanceExerciseType ? "km" : "kg").tag(true)
                    Text(inputType.isDistanceExerciseType ? "mi" : "lbs").tag(false)
                }
                .pickerStyle(.segmented)
                .frame(width: 110)
```
Remove the `.disabled(true).opacity(0.5)` and the `displayUnitIsMetric` dead `@State` var, and the header comment documenting the no-op limitation (no longer accurate). The distance-unit half of this toggle (`km`/`mi`) is explicitly a SEPARATE, still-not-live control per the file's existing scope note — only wire the weight half (`kg`/`lbs`) in this task; leave a narrower version of the existing no-op comment on just the distance-unit case if this view doesn't cleanly separate the two, or split the `Picker` into two independent controls if that's cleaner (your judgment during implementation — the weight-unit live-wiring is this task's actual requirement, distance-unit remains explicitly out of scope here since there's no `ActiveWorkoutViewModel.distanceUnitPreference` equivalent being added in this plan).

- [ ] **Step 5: Build, run full suite, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -20
cd .. && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift ios/Athlix/Features/Workout/ExerciseDetailView.swift ios/Athlix/Features/Workout/LogEntryView.swift ios/AthlixTests
git commit -m "Wire the weight-unit toggle live: updates in-session display and persists via ProfileRepository.updateProfile"
```

---

## Task 10: Known gap #6 — wire up `PlanEditorViewModel.pendingDecision` UI

**Files:**
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutView.swift`
- Test: manual verification (this is pure SwiftUI presentation wiring for an already-tested view-model state machine)

- [ ] **Step 1: Read `PlanEditorViewModel`'s existing `pendingDecision`/`resolvePendingDecision`** (already excerpted above — re-read from disk for exact current state) and confirm `PlanPendingDecision`'s cases (`.none`, `.awaitingUpdateOrSessionOnly(name:muscleGroup:exerciseDbId:)`) and `PlanDecisionChoice`'s cases (grep the type definition — likely something like `.updatePlan`, `.thisSessionOnly`, `.cancel`).

- [ ] **Step 2: Determine where `handleAddedExerciseWhilePlanLoaded` is (or should be) triggered**

Per the design spec and the known-gap's own description, this fires "when an exercise is added while a plan is loaded." Find where `ActiveWorkoutView`/`ActiveWorkoutViewModel` currently handles adding an exercise while a plan is active (grep `planEditorViewModel` usage and `addExercise` call sites in `ActiveWorkoutView.swift`) and call `planEditorViewModel.handleAddedExerciseWhilePlanLoaded(exerciseName:muscleGroup:exerciseDbId:)` from that path if it isn't already being called (the known-gap description says this trigger currently has NO call site at all — confirm and add one at the correct point, immediately after a new exercise is successfully added while `planEditorViewModel` has a loaded plan).

- [ ] **Step 3: Add the confirmation dialog**

In `ActiveWorkoutView.swift`'s body, add (adjust exact binding/property names to match whatever `planEditorViewModel` is actually called in this file):
```swift
        .confirmationDialog(
            "Update Plan?",
            isPresented: Binding(
                get: { planEditorViewModel.pendingDecision != .none },
                set: { if !$0 { planEditorViewModel.resolvePendingDecision(.cancel) } }
            ),
            titleVisibility: .visible
        ) {
            Button("Update Plan") { planEditorViewModel.resolvePendingDecision(.updatePlan) }
            Button("This Session Only") { planEditorViewModel.resolvePendingDecision(.thisSessionOnly) }
            Button("Cancel", role: .cancel) { planEditorViewModel.resolvePendingDecision(.cancel) }
        } message: {
            Text("You added an exercise while a plan is loaded. Save it to the plan, or keep it for this session only?")
        }
```
(Confirm `PlanPendingDecision`/`PlanDecisionChoice` are `Equatable` for the `!= .none` comparison — add conformance if missing; confirm the exact `PlanDecisionChoice` case names against the real enum definition rather than guessing.)

- [ ] **Step 4: Build, manual verification, commit**

Manual verification: no clean automated path for a confirmation-dialog trigger tied to live plan-editing state — verify via careful code reading that the trigger call site (Step 2) and the dialog binding (Step 3) are correctly wired, consistent with this codebase's established practice of falling back to documented manual/code-reading verification when UI interaction testing isn't available.

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ActiveWorkoutView.swift
git commit -m "Wire up the 3-way update-plan/session-only/cancel confirmation dialog (closes known gap #6)"
```

---

## Task 11: `SetRowView` rework

**Files:**
- Modify: `ios/Athlix/Features/Workout/SetRowView.swift`

- [ ] **Step 1: Read the current full file** (230 lines) and `src/components/log/SetRow.tsx` + `src/components/log/ExerciseContent.tsx`'s `SetSeparator` (for the copy/remove buttons) in full before implementing.

- [ ] **Step 2: Larger value-box tap targets with step-amount labels**

Web's value boxes are dedicated ~82px-tall tap targets with flanking ± steppers, each stepper showing its step amount as a subscript label. Rework the current `valueBox` (currently `minWidth: 52`, plain `Image(systemName:)` steppers with no step-amount label) to match: increase the tap-target height/padding substantially (target roughly web's proportions — full-width-ish value display, not a cramped horizontal pill), and add a small caption-sized label under each ± button showing the step amount (e.g. "2.5" under a weight stepper, "1" under a reps stepper) — read whatever step-amount value this view already computes/receives for its stepper buttons (it must already know the step size to perform the increment) and surface that same value as a label rather than introducing a new source of truth for it.

- [ ] **Step 3: "Set N" pill badge**

Replace the current plain `Text("\(index+1)")` numeral with a rounded-pill badge (background `ColorTokens.bgElevated` when not done, `ColorTokens.accent`-outlined when done, per the design spec's done-state color-swap requirement) containing "Set N" text, not just the bare number.

- [ ] **Step 4: Always-visible Copy/Remove buttons + confirmation dialog**

Remove the `.swipeActions(edge: .trailing, allowsFullSwipe: false)` modifier entirely. Add two always-visible small icon+label buttons (matching web's `SetSeparator` "Copy set"/"Remove" pill buttons) rendered between/alongside each row — exact placement is an implementation judgment call (a trailing `HStack` within the row, or a thin separator row below each set, whichever reads cleaner in SwiftUI; web places them as a distinct separator row between sets, which is the closer visual match if layout allows). Copy calls whatever `viewModel.copySet(...)` method already exists (grep for it — referenced in the audit as living in `AthlixCore`'s `SetCRUDEngine`). Remove now requires a confirmation `.alert` before calling `viewModel.removeSet(...)`:
```swift
    @State private var showingRemoveConfirmation = false

    // in body, on the Remove button's action:
    Button {
        showingRemoveConfirmation = true
    } label: {
        Label("Remove", systemImage: "trash")
    }
    .alert("Remove Set \(index + 1)?", isPresented: $showingRemoveConfirmation) {
        Button("Remove", role: .destructive) {
            viewModel.removeSet(exerciseId: exerciseId, setId: loggedSet.id)
        }
        Button("Cancel", role: .cancel) {}
    } message: {
        Text("This action cannot be undone.")
    }
```
(Confirm `viewModel.removeSet`'s exact parameter names against the real method signature — grep it rather than guessing.)

- [ ] **Step 5: Manual verification** — side-by-side comparison against `SetRow.tsx`'s actual rendering (or its JSX/CSS values if no live screenshot is available), per this milestone's fidelity requirement; confirm no simulator/screenshot tooling is available and document that a code-level comparison was done instead if so.

- [ ] **Step 6: Build, run full suite, commit**

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/SetRowView.swift
git commit -m "Rework SetRowView: larger value boxes, Set N pill badge, always-visible Copy/Remove with remove-confirmation (closes known gap #5)"
```

---

## Task 12: `ExerciseDetailView` stats card + prefill banner + input-type selector

**Files:**
- Modify: `ios/Athlix/Features/Workout/ExerciseDetailView.swift`

- [ ] **Step 1: Read the current full file** (already re-touched by Tasks 8 and 9 — re-read from disk) and `src/components/log/ExerciseContent.tsx` lines ~138-224 in full.

- [ ] **Step 2: 3-column stats card**

Rework `statsHeader`'s stats row from the current single-line `HStack` of `Label`s into a 3-column card layout (Sets / Volume+xBW / the now-live unit toggle from Task 9), matching web's distinct-per-cell card styling as closely as SwiftUI allows — each cell its own bordered/backgrounded sub-card within the header, not a flat row.

- [ ] **Step 3: Prefill-from-last-session banner**

`exercise?.lastSession` (an existing, already-populated field per `ActiveWorkoutViewModel.patchLastSession`) is currently never rendered anywhere in this view. Add a banner, shown when `exercise?.lastSession != nil` AND the exercise's current sets are all still at their initial/unedited state (check however this view or the view model already distinguishes "untouched prefilled defaults" from "user has started editing" — if no such distinction exists yet, showing the banner whenever `lastSession` is non-nil regardless of edit-state is an acceptable simpler fallback, since web's own exact suppression condition wasn't confirmed byte-for-byte in the audit):
```swift
    if let lastSession = exercise?.lastSession {
        HStack(spacing: 8) {
            Image(systemName: "sparkles")
                .foregroundStyle(ColorTokens.accent)
            Text("Prefilled from your last session")
                .font(.caption)
                .foregroundStyle(ColorTokens.textSecondary)
            Spacer()
            Button("Reset") {
                // Reset action's exact target behavior (clear prefilled values
                // back to blank) depends on whatever prefill mechanism actually
                // populated the current sets from lastSession -- read
                // ActiveWorkoutViewModel.patchLastSession and addExercise to
                // confirm what "reset" should concretely do (e.g. clear
                // weight/reps back to nil/0 on all sets for this exercise)
                // before wiring this button's action.
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(ColorTokens.accent)
        }
        .padding(10)
        .background(ColorTokens.accent.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
```

- [ ] **Step 4: Weight/Reps/Time input-type segmented control**

`ActiveWorkoutViewModel.cycleInputType(exerciseId:forced:)` (lines 536-559 per the audit) is fully implemented and tested but has no UI anywhere. Add a 3-way segmented control (or equivalent tappable row of 3 options) wired to it:
```swift
    Picker("Input Type", selection: Binding(
        get: { exercise?.inputTypeOverride ?? inputType },
        set: { viewModel.cycleInputType(exerciseId: exerciseId, forced: $0) }
    )) {
        Text("Weight").tag(ExerciseInputType.weightReps) // confirm exact case names against the real enum
        Text("Reps").tag(ExerciseInputType.repsOnly)
        Text("Time").tag(ExerciseInputType.time)
    }
    .pickerStyle(.segmented)
```
(Confirm `ExerciseInputType`'s exact case names by reading the enum definition rather than guessing — `weightReps`/`repsOnly`/`time` above are placeholders for whatever the real names are.)

- [ ] **Step 5: Manual verification + build**

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ExerciseDetailView.swift
git commit -m "ExerciseDetailView: 3-column stats card, prefill-from-last-session banner, weight/reps/time input-type selector"
```

---

## Task 13: `ExercisePickerView` muscle filters, grouping, unit-bug fix, consistent Create-Exercise placement

**Files:**
- Modify: `ios/Athlix/Features/Workout/ExercisePickerView.swift`

- [ ] **Step 1: Read the current full file** and `src/components/log/ExercisePicker.tsx` in full (both already substantially excerpted in the audit — re-read from disk for exact current line numbers, since earlier tasks may not have touched this file but confirm regardless).

- [ ] **Step 2: Fix the unit display bug**

`row(for:subtitle:)`'s `lastSessionSubtitle` hardcodes `WeightUnit.format(summary.weight, unit: .lbs)` regardless of the user's actual preference. Thread the real unit preference through (this view likely already receives a `weightUnit`/`unitPreference` parameter for other purposes — check; if not, add one, sourced from wherever `ActiveWorkoutViewModel.unitPreference` — added in Task 9 — is accessible to this view's caller) and use it in place of the hardcoded `.lbs`.

- [ ] **Step 3: Muscle-filter chip row + grouped History tab**

Add a horizontal scrollable chip row above the History tab's list (one chip per muscle group present in the current `recentOptions`, plus an "All" chip), filtering the flat list when a chip is selected. Change `historyTab`'s flat `List` into a grouped `List` with `Section` headers per muscle group (when unfiltered — i.e. "All" selected, matching web's grouped-when-unfiltered / flat-when-filtered behavior described in the audit).

- [ ] **Step 4: Consistent Create-Exercise placement**

`createCustomRow` currently appears in History/Search/muscle-drilldown but not in `myPlansTab` or the top-level muscle-grid view. Move it to a persistent location visible regardless of active tab (a sticky footer button matching web's placement, per the design spec) rather than duplicating it per-tab — this likely means hoisting it out of each tab's individual list and into the picker's outer container as a fixed bottom element.

- [ ] **Step 5: Known gap #7 — lighter-weight Edit-plan fix**

Currently `.sheet(item: $editingTemplate, ...)` (line 129) stacks a full second sheet on top of the already-presented picker sheet. Per the design spec's chosen lighter-weight fix, replace this with an in-place content swap: instead of presenting `PlanEditorView` as a second `.sheet`, use a local `@State` enum (e.g. `PickerContent { case browsing, editingTemplate(Template) }`) that swaps the picker's OWN body content to show the editor inline within the same single sheet presentation, with a back button to return to `browsing`. This avoids a second modal layer entirely rather than just re-styling the existing stacked-sheet approach.

- [ ] **Step 6: Manual verification, build, commit**

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ExercisePickerView.swift
git commit -m "ExercisePickerView: muscle filters, grouped History tab, fix hardcoded-lbs display bug, consistent Create-Exercise placement, inline plan-edit (closes known gap #7)"
```

---

## Task 14: `FinishSheetView` Duration tile + exercise summary list + button order

**Files:**
- Modify: `ios/Athlix/Features/Workout/FinishSheetView.swift`

- [ ] **Step 1: Read the current full file** (already touched by Task 5 — re-read from disk) and `src/components/log/FinishSheet.tsx` lines ~88-172 in full.

- [ ] **Step 2: Add the Duration stat tile**

`statsGrid` currently has 3 tiles (Sets Completed, Total Volume, conditionally Relative Load), missing web's Duration tile entirely. Add a 4th tile computing elapsed duration from `viewModel.elapsedSeconds` (or whatever the actual property is called — grep it), formatted consistently with however duration is already formatted elsewhere in this codebase (check `ActiveWorkoutView`'s existing elapsed-time display for the formatting convention to reuse, don't invent a new one):
```swift
            statTile(label: "Duration", value: formattedDuration)
```

- [ ] **Step 3: Add the per-exercise summary list**

Below `statsGrid`, add a list of touched exercises with their completed-set counts:
```swift
    private var exerciseSummaryList: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(viewModel.exercises.filter { $0.sets.contains { $0.done } }, id: \.id) { exercise in
                HStack {
                    Text(exercise.name)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(ColorTokens.textPrimary)
                    Spacer()
                    Text("\(exercise.sets.filter(\.done).count) sets")
                        .font(.caption2)
                        .foregroundStyle(ColorTokens.textSecondary)
                }
            }
        }
        .padding(12)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
```
Insert this into `body`'s `ScrollView` content, near `statsGrid`.

- [ ] **Step 4: Swap button ordering**

In `actions`'s `.editing, .failure` case, move "Add More Exercise" above "Save Workout" to match web's ordering.

- [ ] **Step 5: Build, run full suite, commit**

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/FinishSheetView.swift
git commit -m "FinishSheetView: add Duration tile and per-exercise summary list, reorder action buttons to match web"
```

---

## Task 15: Rest-timer presets

**Files:**
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutView.swift` (`restTimerBar`, lines ~404-441)
- Modify: `ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift` (if the timer-start method needs a duration parameter it doesn't already take)

- [ ] **Step 1: Read the current `restTimerBar` implementation and whatever view-model method starts the timer** (grep `startRestTimer`/similar).

- [ ] **Step 2: Add preset chips**

Add a row of 4 tappable chips (60/90/120/180s) above or alongside the existing progress bar, each calling the timer-start method with that duration:
```swift
    private var restPresetRow: some View {
        HStack(spacing: 8) {
            ForEach([60, 90, 120, 180], id: \.self) { seconds in
                Button {
                    viewModel.startRestTimer(seconds: seconds) // confirm exact method name/signature
                } label: {
                    Text("\(seconds)s")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                }
                .foregroundStyle(ColorTokens.textPrimary)
                .background(ColorTokens.bgElevated)
                .clipShape(Capsule())
            }
        }
    }
```
If `startRestTimer` currently reads its duration only from `UserDefaults` with no parameter, add a `seconds: Int` parameter and have it also persist that as the new default for next time (matching how web's presets both start immediately AND presumably become the new default — check `RestTimer.tsx`'s exact behavior on this point before assuming).

- [ ] **Step 3: Wire the preset row into the view**

Add `restPresetRow` above the existing `restTimerBar`'s progress bar, visible whenever the rest-timer UI is shown (or as an always-visible row that also lets the user START a rest timer preemptively, not just adjust an already-running one — check web's `RestTimer.tsx` for whether presets are visible before or only during an active timer, and match that visibility condition).

- [ ] **Step 4: Manual verification, build, commit**

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/ActiveWorkoutView.swift ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift
git commit -m "Add 60/90/120/180s rest-timer preset chips, matching web's RestTimer.tsx"
```

---

## Task 16: `Profile.showStartSheet` field

**Files:**
- Modify: `ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift`
- Test: `ios/AthlixCore/Tests/AthlixCoreTests/Models/ProfileTests.swift`

- [ ] **Step 1: Read the current full `Profile.swift`** (shown in full earlier in this session — re-read from disk to confirm no drift).

- [ ] **Step 2: Add the field**

Add `showStartSheet: Bool` to the struct, `CodingKeys` (`case showStartSheet = "show_start_sheet"`), the explicit memberwise `init`, and the custom `init(from decoder:)` — following the EXACT same defensive-decode pattern already established for `bodyWeightUnit` (NULL-safe, since `show_start_sheet` is a nullable boolean column per `src/lib/supabaseData.ts:776`, `Boolean(row?.show_start_sheet)`, which coerces `null`/`undefined` to `false`):
```swift
            showStartSheet = (try? container.decodeIfPresent(Bool.self, forKey: .showStartSheet)) ?? false
```

- [ ] **Step 3: Write/update tests**

Add two tests mirroring `bodyWeightUnit`'s existing NULL/missing-key fallback tests:
```swift
func testFallsBackToFalseWhenShowStartSheetIsNull() { /* decode a fixture with "show_start_sheet": null, assert showStartSheet == false */ }
func testFallsBackToFalseWhenShowStartSheetKeyIsMissing() { /* decode a fixture missing the key entirely, assert showStartSheet == false */ }
```
Update every existing `Profile(...)` explicit-init test fixture in this file to include the new required `showStartSheet:` argument.

- [ ] **Step 4: Run tests, build, commit**

```bash
cd ios/AthlixCore && swift test 2>&1 | tail -30
cd .. && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/AthlixCore/Sources/AthlixCore/Models/Profile.swift ios/AthlixCore/Tests/AthlixCoreTests/Models/ProfileTests.swift
git commit -m "Add Profile.showStartSheet (show_start_sheet), NULL-safe decoded, needed to gate the Quick Start sheet"
```

---

## Task 17: `QuickStartSheetView` + wire into `LogEntryView`

**Files:**
- Create: `ios/Athlix/Features/Workout/QuickStartSheetView.swift`
- Modify: `ios/Athlix/Features/Workout/LogEntryView.swift`

- [ ] **Step 1: Read `LogEntryView.swift`'s current `resolveEntry`-consuming logic** and `src/components/log/QuickStartSheet.tsx` in full.

- [ ] **Step 2: Build `QuickStartSheetView`**

```swift
struct QuickStartSheetView: View {
    let workoutRepository: WorkoutRepository
    let templateRepository: TemplateRepository // confirm exact protocol name used by TemplatesListView.swift
    let userId: String
    let onStartEmpty: () -> Void
    let onPlanToday: () -> Void
    let onRepeatLast: ([ExerciseEntry]) -> Void
    let onStartPlan: (Template) -> Void

    @State private var lastWorkout: Workout?
    @State private var recentWorkouts: [Workout] = []
    @State private var templates: [Template] = []

    var body: some View {
        // Repeat Last Workout card (if lastWorkout != nil), Start Empty / Plan
        // Today primary buttons, My Plans list (templates, each with inline
        // start/edit/delete matching QuickStartSheet.tsx's row actions), More
        // Recent list (recentWorkouts, dropping the first/most-recent one
        // already shown in the "repeat last" card).
    }

    private func load() async {
        // fetch via workoutRepository.fetchWorkouts / templateRepository's
        // existing list method (reuse TemplatesListView's exact fetch call,
        // don't reinvent it) -- populate lastWorkout = fetched.first,
        // recentWorkouts = Array(fetched.dropFirst().prefix(4)).
    }
}
```
Fill in the actual layout/styling to match `QuickStartSheet.tsx`'s structure (card + 2 primary buttons + 2 lists) using this codebase's established `ColorTokens`/card conventions (compare against `FinishSheetView`'s `statTile`/card patterns for the established visual language, don't invent new styling primitives).

- [ ] **Step 3: Wire into `LogEntryView`/`ActiveWorkoutViewModel.resolveEntry`**

`resolveEntry`'s `case nil:` branch currently always sets `entryMode = .blank`. Change it to check the new `Profile.showStartSheet` (fetched via `profileRepository.fetchProfile` — `ActiveWorkoutViewModel` already gained `profileRepository` access in Task 9, reuse it) and set `entryMode = .quickStart` when true:
```swift
        case nil:
            let showStartSheet = (try? await profileRepository.fetchProfile(userId: userId))?.showStartSheet ?? false
            entryMode = showStartSheet ? .quickStart : .blank
```
In `LogEntryView.swift`, add a case for `.quickStart` in whatever switch/conditional currently branches on `entryMode` to decide which view to show, presenting `QuickStartSheetView` with its callbacks wired to however `LogEntryView` already transitions into `ActiveWorkoutView` for the other entry modes (reuse that same transition mechanism, don't build a parallel one).

- [ ] **Step 4: Manual verification, build, commit**

```bash
cd ios && xcodegen generate && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/QuickStartSheetView.swift ios/Athlix/Features/Workout/LogEntryView.swift ios/Athlix/Features/Workout/ActiveWorkoutViewModel.swift ios/Athlix.xcodeproj
git commit -m "Add QuickStartSheetView, wire the previously-dead .quickStart entry mode"
```

---

## Task 18: `CreateExerciseSheetView` with muscle body-diagram

**Files:**
- Create: `ios/Athlix/Features/Workout/CreateExerciseSheetView.swift`
- Modify: `ios/Athlix/Features/Workout/ExercisePickerView.swift` (replace the nested `CreateCustomExerciseView` with the new view)

- [ ] **Step 1: Read the current nested `CreateCustomExerciseView`** (lines 587-648 of `ExercisePickerView.swift` per the audit) and `src/components/log/CreateExerciseSheet.tsx` in full.

- [ ] **Step 2: Build `CreateExerciseSheetView`**

```swift
struct CreateExerciseSheetView: View {
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let userId: String
    let onCreated: (ExerciseLibraryItem) -> Void

    @State private var name = ""
    @State private var isWeighted = true
    @State private var selectionBySlug: [String: MuscleSelectionState] = [:]
    @State private var bodySide: MuscleBodyViewSide = .front
    @State private var duplicateCheckTask: Task<Void, Never>?
    @State private var isDuplicateName = false
    @State private var isSaving = false

    var body: some View {
        // Name TextField with .onChange debounced duplicate-check (cancel
        // duplicateCheckTask, start a new one with Task.sleep(400ms) then
        // check against exerciseLibraryRepository's existing search/list call).
        // Weighted/Reps-Only segmented Toggle.
        // MuscleBodyView(intensityBySlug: [:], view: $bodySide,
        //                onTapSlug: { slug in cycleSelection(slug) },
        //                selectionBySlug: selectionBySlug)
        // Live primary/secondary muscle chip list derived from selectionBySlug.
        // Save button calling exerciseLibraryRepository.addCustomExercise.
    }

    /// Cycles a tapped region: none -> primary -> secondary -> none. The
    /// FIRST primary tap (when no other slug is already primary) also
    /// auto-suggests the exercise's overall muscleGroup from that slug via
    /// whatever slug->group mapping already exists (ExerciseMuscleMapper.
    /// slugRegionMap, reused rather than re-derived -- confirm its exact
    /// name/module during implementation).
    private func cycleSelection(_ slug: String) {
        switch selectionBySlug[slug] {
        case nil:
            selectionBySlug[slug] = .primary
        case .primary:
            selectionBySlug[slug] = .secondary
        case .secondary:
            selectionBySlug.removeValue(forKey: slug)
        }
    }
}
```
Fill in the actual name/duplicate-check/toggle/chip-list UI matching `CreateExerciseSheet.tsx`'s layout using this codebase's established conventions (compare against `PlanEditorView`'s existing `TextField`/`.alert` patterns for name-collision handling, reuse rather than reinvent). Confirm `addCustomExercise`'s exact signature (`func addCustomExercise(userId: String, name: String, muscleGroup: String) async throws -> ExerciseLibraryItem`, per the earlier grep) only takes a single `muscleGroup` string, not per-slug primary/secondary data — if the real save call can't represent the full primary/secondary selection, the auto-suggested overall `muscleGroup` (from the first primary tap) is what gets sent to `addCustomExercise`, and the richer slug-level selection is a local-only UI enhancement for this creation flow, not something persisted beyond the single `muscleGroup` field. State this clearly in a code comment so a future reader doesn't assume slug-level data is being saved when the underlying repository method doesn't support it.

- [ ] **Step 3: Replace the nested view in `ExercisePickerView.swift`**

Remove `CreateCustomExerciseView` and its `.sheet` presentation; present `CreateExerciseSheetView` in its place with equivalent wiring (same trigger, same `onCreated` callback behavior).

- [ ] **Step 4: Manual verification, build, commit**

```bash
cd ios && xcodegen generate && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/CreateExerciseSheetView.swift ios/Athlix/Features/Workout/ExercisePickerView.swift ios/Athlix.xcodeproj
git commit -m "Add CreateExerciseSheetView: real muscle body-diagram tap-to-select creation, replacing the bare name+picker form"
```

---

## Task 19: `CelebrationScreenView`

**Files:**
- Create: `ios/Athlix/Features/Workout/CelebrationScreenView.swift`
- Modify: `ios/Athlix/Features/Workout/FinishSheetView.swift` (present this instead of the inline `successBanner`)

- [ ] **Step 1: Read `FinishSheetView`'s current `.success` state handling** (re-read from disk, touched by Tasks 5/14) and `src/components/log/CelebrationScreen.tsx` in full.

- [ ] **Step 2: Build `CelebrationScreenView`**

```swift
struct CelebrationScreenView: View {
    let prCount: Int?
    let onBackToDashboard: () -> Void

    @State private var trophyScale: CGFloat = 0.3
    @State private var ringRotation: Double = 0

    var body: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [4, 6]))
                    .foregroundStyle(ColorTokens.accent.opacity(0.4))
                    .rotationEffect(.degrees(ringRotation))
                Image(systemName: "trophy.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(ColorTokens.prGold)
            }
            .frame(width: 120, height: 120)
            .scaleEffect(trophyScale)

            Text("Workout Complete!")
                .font(.title2.weight(.bold))
                .foregroundStyle(ColorTokens.textPrimary)

            // stat grid (2-up, matching web's layout)

            Button("Back to Dashboard", action: onBackToDashboard)
                .buttonStyle(.borderedProminent)
                .tint(ColorTokens.accent)

            // "Share Summary" -- present but inert, matching web's own no-op.
            Button("Share Summary") {}
                .foregroundStyle(ColorTokens.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ColorTokens.bgBase.ignoresSafeArea())
        .overlay(ConfettiView())
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) { trophyScale = 1.0 }
            withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) { ringRotation = 360 }
        }
    }
}

/// A lightweight, self-contained particle effect scoped to this one screen --
/// not a general-purpose effects library. Web uses canvas-confetti fired from
/// both screen edges for ~3s; this ports the same visual intent (colored
/// particles falling/fading from top corners) via a TimelineView-driven
/// particle system, not a byte-for-byte physics port.
private struct ConfettiView: View {
    var body: some View {
        // TimelineView(.animation) driving N particle positions/opacities
        // over a ~3s window, auto-removing itself after completion.
    }
}
```
Fill in the actual particle system and stat-grid content — the stat grid mirrors web's own hardcoded, not-real-data values per the audit ("3 New PRs" / "450 Calories" are hardcoded on web itself), EXCEPT this Swift version should use the REAL `prCount` already computed by `FinishSheetView`'s existing `countNewPRs` call (passed in via the `prCount` parameter above) rather than porting web's fake hardcoded number — this mirrors the same "Swift's version is already more correct, don't regress it to match web's fake data" principle applied to the PR-count decision in Task 14/the design spec.

- [ ] **Step 3: Wire into `FinishSheetView`**

Replace the `.success(let prCount)` case's `successBanner`+`Done` button with full-screen presentation of `CelebrationScreenView(prCount: prCount, onBackToDashboard: onDone)` — likely via `.fullScreenCover` rather than inline content, matching web's full-screen-takeover behavior rather than an inline banner.

- [ ] **Step 4: Manual verification, build, commit**

```bash
cd ios && xcodegen generate && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/CelebrationScreenView.swift ios/Athlix/Features/Workout/FinishSheetView.swift ios/Athlix.xcodeproj
git commit -m "Add CelebrationScreenView (trophy animation + confetti + real PR count), replacing the inline success banner"
```

---

## Task 20: Unify the two "plan today" flows

**Files:**
- Modify: `ios/Athlix/Features/Workout/PlanEditorView.swift`
- Modify: `ios/Athlix/Features/Workout/PlanEditorViewModel.swift`
- Modify: `ios/Athlix/Features/Workout/ExercisePickerView.swift` (the `startPlan` path)

- [ ] **Step 1: Read `PlanEditorView.swift`/`PlanEditorViewModel.swift`'s current save-only flow and `ExercisePickerView.startPlan` (lines 433-438 per the audit) in full**, plus `src/components/log/PlanTodaySheet.tsx`'s `handleStart` (lines 460-507) and duplicate-name rename popup (lines 839-908).

- [ ] **Step 2: Add a "Start Workout" action to `PlanEditorViewModel`**

```swift
    /// Starts a live workout session directly from the plan being edited,
    /// without requiring a save-as-template step first -- mirrors web's
    /// PlanTodaySheet.handleStart, which can both save AND start from the
    /// same sheet. Returns the exercises to hand off to the caller's
    /// ActiveWorkoutViewModel construction, matching whatever shape
    /// ExercisePickerView.startPlan currently produces (read that method's
    /// exact return/callback shape and match it here rather than inventing
    /// a new one).
    func startWorkout() -> [ExerciseEntry] {
        // Build [ExerciseEntry] from the plan's current exercises (this
        // view model already holds them for the save flow -- reuse that
        // same source of truth, don't refetch).
    }
```

- [ ] **Step 3: Add the "Start Workout" button to `PlanEditorView`**

Alongside the existing save button, add a second action calling `viewModel.startWorkout()` and invoking whatever transition `ExercisePickerView.startPlan` currently performs (reuse that exact transition/callback mechanism — likely a closure passed down from `ExercisePickerView` into `PlanEditorView`, added as a new parameter if `PlanEditorView` doesn't already have one).

- [ ] **Step 4: Inline duplicate-name rename**

Replace the current blocking `.alert` (lines 87-91, "OK" only, forcing dismiss-and-manually-retype) with an inline rename affordance: on a name collision, show a small inline text field pre-filled with a suggested alternate name (e.g. append " (2)", matching whatever suggestion logic web's popup uses — read `PlanTodaySheet.tsx` lines 839-908 for the exact suggestion behavior) with Save/Cancel actions directly in that popup, rather than dismissing the whole flow.

- [ ] **Step 5: Manual verification, build, commit**

```bash
cd ios && xcodebuild build -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -40
xcodebuild test -project Athlix.xcodeproj -scheme Athlix -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:AthlixTests 2>&1 | tail -40
git add ios/Athlix/Features/Workout/PlanEditorView.swift ios/Athlix/Features/Workout/PlanEditorViewModel.swift ios/Athlix/Features/Workout/ExercisePickerView.swift
git commit -m "Unify plan-today flows: PlanEditorView can now start a live session directly, inline duplicate-name rename replaces the blocking alert"
```

---

## Self-Review Notes (from the plan author, addressed inline above)

- **Spec coverage**: all 6 chunks from the design spec map to tasks — Chunk A → Tasks 3-14, Chunk B → Task 15, Chunk C → Tasks 16-17, Chunk D → Task 18 (plus shared infra Task 2), Chunk E → Task 19, Chunk F → Task 20. Shared infrastructure (`ProfileRepository.updateProfile`, `MuscleBodyView` extension) is Tasks 1-2, built first since Tasks 9, 16-18 depend on them.
- **Type consistency check**: `ProfileUpdate` (Task 1) is constructed identically in Task 9's `setUnitPreference` and Task 16/17's Quick Start gating. `MuscleSelectionState`/`onTapSlug`/`selectionBySlug` (Task 2) are consumed identically in Task 18's `CreateExerciseSheetView`. `ActiveWorkoutViewModel.unitPreference` (Task 9) is read identically by Task 12's `ExerciseDetailView` wiring and Task 13's `ExercisePickerView` unit-bug fix.
- **Dependency ordering**: Task 9 (live unit toggle) must land before Task 12 references `viewModel.unitPreference`, and before Task 13's unit-bug fix has a real preference source to thread through — both are sequenced after Task 9 in this plan. Task 16 (`Profile.showStartSheet`) must land before Task 17 reads it — sequenced immediately before. Task 2 (`MuscleBodyView` extension) must land before Task 18 uses it — sequenced early, in the shared-infrastructure pair.
- **Known-gap coverage**: all 8 are covered — #1 (Task 3), #2 (explicitly tracked, not fixed, per the design spec's Explicitly Out of Scope), #3 (Task 4), #5 (Task 11), #6 (Task 10), #7 (Task 13), #8 (Task 5). Item #4 (Quick Start) is Tasks 16-17.
