# Athlix — Log Workout Web Parity Design

**Date**: 2026-07-20
**Status**: Approved (design), pending implementation plan
**Depends on**: Swift Workout Logger milestone (`2026-07-15-swift-workout-logger-design.md`, all 20 tasks) and the Dashboard Completion milestone (`2026-07-19-dashboard-completion-design.md`, which added `ProfileRepository` and `MuscleBodyView`, both reused here).

## Goal

Bring the native iOS Workout Logger (`/log`) to full design and behavioral parity with web's `Log.tsx` and its `src/components/log/*` components, per explicit user direction: **"same exact theme"** — a hard fidelity requirement, the same bar applied to the Dashboard's Weekly Goal Ring and Muscle Radar rework.

A full audit (see "Audit findings" below) found the gap is larger than styling: four web components have no Swift port at all, several existing Swift screens have UI controls that are visually present but functionally inert (a unit toggle that does nothing, an input-type selector with no UI despite a working view-model method behind it), and a handful of real behavior differences exist beyond the 8 gaps the prior Workout Logger milestone already documented and deliberately deferred.

## Audit findings (summary — full detail lives in the implementation plan's per-task context)

**Entirely missing from Swift:**
- `CelebrationScreen.tsx` — full-screen post-save celebration (confetti, trophy, stat grid). Swift has only an inline success banner inside `FinishSheetView`.
- `CreateExerciseSheet.tsx` — full custom-exercise creation with an interactive muscle body-diagram. Swift has a bare name+picker form with none of the muscle-selection interaction.
- `QuickStartSheet.tsx` — start-of-session interstitial (repeat last workout / start empty / plan today / my plans / recent). Swift's `LogEntryView.resolveEntry` has a `.quickStart` enum case that is never assigned.
- Rest-timer preset picker (60/90/120/180s tap-to-set chips) — Swift's inline rest-timer bar has no equivalent; only a fixed, non-editable duration.

**Functionally inert controls (present in UI, do nothing):**
- `ExerciseDetailView`'s unit toggle — `@State`-only, `.disabled(true)`, documented as a no-op pending a live setter.
- No UI at all for `ActiveWorkoutViewModel.cycleInputType` (weight/reps/time), despite the method being fully implemented and tested.

**Real behavior gaps beyond the 8 previously-documented ones:**
- Draft resumability: Swift ties resumability to same-calendar-day; web uses an 8-hour rolling TTL regardless of date boundary.
- Past-date load only takes the first workout saved that date; web merges all of them.
- `ExerciseEntry.optionalWeight` (letting a reps-only exercise opt into weight tracking) is always `nil` in Swift — the model field exists, nothing ever sets it.
- `ExercisePickerView`'s last-session weight preview is hardcoded to `.lbs` regardless of the user's actual unit preference — a real display bug for kg users.

**Confirmed NOT gaps (explicitly out of scope, called out to prevent scope creep):**
- Web's `RestTimerContext` app-wide floating pill is dead code on web itself (unused by the actual Log flow, which has its own local timer state) — not a port target.
- `ExerciseBlock.tsx`/legacy `SetRow` variant appears to be orphaned/unused on web — not a port target.
- Swift's `FinishSheetView` PR count (real, server-verified via `countNewPRs`) is already *more correct* than web's own broken always-zero `isPR` logic. This chunk explicitly does **not** touch that logic — matching web here would be a regression, not a fix.

## Architecture

### New shared infrastructure (built once, used by multiple chunks)

**`ProfileRepository.updateProfile(userId:updates:)`** — the repository is currently read-only (`fetchProfile` only, added in the Dashboard Completion milestone). Two chunks below need writes: the live unit-toggle (Chunk A) and the `show_start_sheet` preference (Chunk C). Add:
```swift
public protocol ProfileRepository: Sendable {
    func fetchProfile(userId: String) async throws -> Profile
    func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile
}
```
`ProfileUpdate` is a small struct with optional fields for exactly what this work needs (`unitPreference: WeightUnit?`, `showStartSheet: Bool?`) — not a general-purpose partial-update surface, matching the "no general profile-editing UI beyond what these fixes need" scoping precedent set by the Dashboard Completion design.

**`MuscleBodyView` tap-interaction extension** — currently a pure read-only intensity display (`intensityBySlug: [String: Int]`, no gesture handling). Chunk D's custom-exercise creation needs tap-to-cycle-primary→secondary→none selection on the same body diagram. Add an optional `onTapSlug: ((String) -> Void)?` callback, attached per-region via `.onTapGesture` on each filled `Path` in the existing `ForEach`. When `onTapSlug` is `nil` (the Dashboard's existing usage), behavior is unchanged — this is purely additive. A new `selectionBySlug: [String: MuscleSelectionState]?` (nil for Dashboard, populated for exercise-creation) overlay drives selected-state coloring (primary/secondary/none) independently of the existing intensity-tier coloring, since the two callers have different visual semantics (intensity heatmap vs. selection state).

### Chunk A — Existing-screen fixes + all 8 known gaps

No new files/screens; targeted changes to `SetRowView`, `ExerciseDetailView`, `ExercisePickerView`, `FinishSheetView`, `ActiveWorkoutViewModel`, plus the `AthlixCore` pure-logic layer.

- **`SetRowView`**: larger value-box tap targets with step-amount subscript labels under the ± steppers (matching web's finger-friendly sizing), a real "Set N" pill badge (currently plain numeral text), always-visible Copy/Remove buttons replacing the current swipe-only affordance (closes known gap #5), and a confirmation `.alert` before removal (closes a real accidental-permanent-delete risk the audit found — Swift currently deletes immediately on swipe with zero confirmation, unlike web's modal).
- **`ExerciseDetailView`**: 3-column stats card layout matching web's `Sets / Volume+xBW / Unit toggle` grid; the unit toggle becomes live — `ActiveWorkoutViewModel` gains a `setUnitPreference(_:)` method that updates in-session display AND persists via the new `updateProfile`; a "prefilled from last session" banner (accent-colored, Reset action) renders `exercise.lastSession` data that already flows into the model but is currently never displayed; the weight/reps/time segmented control gets built and wired to the existing, already-tested `cycleInputType` method.
- **`ExercisePickerView`**: muscle-filter chip row + grouped/sectioned History tab (matching web's per-muscle-group headers); fix the last-session-preview unit bug (hardcoded `.lbs` → actual `unitPreference`); consistent Create-Exercise entry-point placement across all three tabs (currently absent from My Plans and the muscle-grid view). Known gap #7 (My Plans "Edit" opening as sheet-over-sheet) gets a lighter-weight fix — presenting the editor by replacing the picker's sheet content in place rather than stacking a second full-screen sheet, avoiding the nav-architecture rework a full fix would otherwise require.
- **`FinishSheetView`**: add the missing Duration stat tile and a per-exercise summary list (name + completed-set-count per row) — both present on web, absent on Swift; swap Save/Add-More button ordering to match web (Add More above Save). PR-count logic is explicitly untouched (see "Confirmed NOT gaps" above).
- **Known gaps #1, #3, #6, #8** — direct, self-contained fixes: `ExerciseTypeResolver.normalizeKey` collapses all whitespace (not just ASCII spaces); `getRecentExerciseOptions` falls back to `inferMuscleGroupFromName()` for blank muscle groups; `PlanEditorViewModel.pendingDecision`'s 3-way prompt gets a `.confirmationDialog` wired up in `ActiveWorkoutView`; `FinishSheetView.touchedExerciseNames` dedupes before the PR-count lookup.
- **Known gap #2** (no test coverage on `Live*Repository` implementations) — remains tracked, not fixed here. It's a testing-infrastructure investment orthogonal to design/behavior parity, consistent with its original scoping.
- **Additional logic fixes**: draft-resumability switches from same-calendar-day to web's real 8-hour rolling TTL (a pure `AthlixCore` change with direct unit tests); past-date loading merges all workouts saved that date instead of only the first (`Log.tsx`'s `allSaved.flatMap` pattern, ported); `optionalWeight` gets wired up — a toggle in `ExerciseDetailView` lets a reps-only exercise opt into weight tracking, setting the field that already exists on the model but is currently always `nil`.

### Chunk B — Rest timer presets

Add a 60/90/120/180s tap-to-set preset chip row to the existing `restTimerBar` in `ActiveWorkoutView`. Tapping a preset starts the timer at that duration (replacing the current fixed-duration-only behavior read from `UserDefaults`). Purely additive to an existing view — no new files.

### Chunk C — Quick Start sheet

New `QuickStartSheetView.swift`: a "Repeat Last Workout" card (loads the most recent saved workout's exercises via the existing `WorkoutRepository`), "Start Empty" / "Plan Today" primary actions, a "My Plans" list (reusing `TemplatesListView`'s data access, presented inline rather than as a separate screen), and a "More Recent" list (workouts 2-5). Wired into `LogEntryView.resolveEntry`'s existing-but-dead `.quickStart` case, gated on the new `Profile.showStartSheet` field (added to `Profile.swift`'s `Codable` mapping — `show_start_sheet` already exists in the `profiles` table schema, just wasn't decoded). No Settings UI to toggle this preference is built in this pass — out of scope, matching the Dashboard Completion precedent of not building settings surfaces beyond what a specific fix needs; the data path just becomes real so a future settings toggle has something to control.

### Chunk D — Custom exercise creation

Rework the existing `CreateCustomExerciseView` (currently a bare `Form` nested in `ExercisePickerView.swift`) into its own file, `CreateExerciseSheetView.swift`, matching web's `CreateExerciseSheet.tsx`: name input with a debounced live duplicate-check against the exercise library, a Weighted/Reps-Only segmented toggle, and the interactive muscle body-diagram using the extended `MuscleBodyView` (tap a region to cycle primary → secondary → none; the first primary tap auto-suggests the muscle group; live primary/secondary muscle chip list below the diagram reflecting current selection). This is the largest single chunk — the diagram interaction is genuinely new interactive surface, not a restyle.

### Chunk E — Celebration screen

New `CelebrationScreenView.swift`, presented in place of `FinishSheetView`'s current inline success banner after a successful save: a spring-in trophy icon with a slow-rotating dashed ring, a lightweight hand-rolled particle/confetti effect (SwiftUI has no built-in confetti primitive — a small `TimelineView`-driven particle system, scoped to this one screen, not a general-purpose effects library), "Workout Complete!" headline, a stat grid, and a "Back to Dashboard" action. The "Share Summary" button ports as present-but-inert, matching web's own no-op — not a gap to fix, since web itself doesn't implement it.

### Chunk F — Unify the two "plan today" flows

Web's `PlanTodaySheet` is one sheet that can both save-as-template and immediately start a live session. Swift currently splits this across two disconnected paths: `PlanEditorView` (save-only, reachable from the picker's edit action) and `ExercisePickerView.startPlan` (start-only, bypasses `PlanEditorView` entirely). Consolidate: `PlanEditorView` gains a "Start Workout" action alongside its existing save action, and duplicate-name handling changes from a blocking `.alert` (dismiss-and-manually-retype) to an inline rename-and-retry affordance, matching web's `PlanTodaySheet` popup behavior.

## Data Flow

- `updateProfile` writes go through the same `SupabaseClient` pattern as every other `Live*Repository` — a targeted `UPDATE profiles SET ... WHERE id = userId` via PostgREST's update builder, not a full-row replace.
- Quick Start's "Repeat Last Workout" and "More Recent" lists reuse the existing `WorkoutRepository.fetchWorkouts` — no new fetch method needed, just a call with a wider date range and `.first`/`.dropFirst().prefix(4)` slicing.
- The muscle body-diagram's tap events flow: `MuscleBodyView.onTapSlug` → `CreateExerciseSheetView`'s local `@State` selection dictionary → on save, mapped into whatever shape `addCustomExercise`'s existing muscle-group/slug parameters expect (read `AthlixCore`'s `ExerciseLibraryRepository.addCustomExercise` signature during implementation to confirm the exact shape expected).

## Error Handling

- `updateProfile` failures (unit-toggle change, show-start-sheet change): non-blocking, matching this codebase's established per-widget-isolation pattern — the in-session state still updates locally even if the persist call fails, with no user-facing error interrupting the workout; a failed persist just means the preference doesn't survive to the next session, not a broken current one.
- Quick Start's "Repeat Last Workout" / "My Plans" / "Recent" fetch failures: each list shows its own empty/error state independently, not a full-sheet failure — consistent with the Dashboard's per-widget isolation precedent.
- Custom-exercise duplicate-name check failures (network error during the debounce check): fail open — allow the save attempt to proceed and let the actual save call's own duplicate-constraint handling (already implemented) be the final authority, rather than blocking the user on a transient live-check failure.

## Testing

- Pure-logic changes (draft TTL, past-date merge-all, `inferMuscleGroupFromName` fallback, whitespace normalization, `optionalWeight` wiring, muscle-diagram tap-cycling state machine) get direct unit tests in `AthlixCore`, matching this project's established rigor for ported logic.
- New/reworked views (`QuickStartSheetView`, `CreateExerciseSheetView`, `CelebrationScreenView`, the reworked `SetRowView`/`ExerciseDetailView`/`ExercisePickerView`/`FinishSheetView`) get manual on-device verification with side-by-side web comparison, per the same fidelity standard applied throughout the Dashboard Completion work.
- `ProfileRepository.updateProfile`: unit-tested against a mock, same pattern as every other repository method in this codebase.

## Explicitly Out of Scope

- A Settings UI toggle for `show_start_sheet` — Chunk C makes the data path real but doesn't build a settings surface to control it.
- Fixing web's own broken PR-count logic in `FinishSheet.tsx` (not this codebase's job) or "regressing" Swift's already-correct version to match it.
- Porting web's dead-code `RestTimerContext` floating pill or the apparently-unused `ExerciseBlock.tsx`/legacy `SetRow` component pair — confirmed not real gaps during the audit.
- Known gap #2 (`Live*Repository` test coverage) — remains tracked as a separate testing-infrastructure item, not addressed here.
- General profile-editing UI beyond the two specific fields (`unitPreference`, `showStartSheet`) these fixes need.
