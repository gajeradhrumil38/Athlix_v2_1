# Athlix — Native Swift Dashboard Completion Design

**Date**: 2026-07-19
**Status**: Approved (design), pending implementation plan
**Depends on**: Swift Dashboard milestone (`2026-07-14-swift-dashboard-design.md`) — all 8 widgets, `DashboardViewModel`, `ColorTokens` already exist. This closes the 3 "Known Limitations" that milestone's final review deliberately deferred rather than fixed.

## Goal

Close all three documented gaps from the Dashboard milestone's Known Limitations section:
1. Weekly Goal Ring shows a fabricated metric (`workouts.count * 4` / `20`) instead of the real trained-days-vs-goal-days web behavior.
2. Muscle Map/Radar intensity uses raw load instead of body-weight-relative load when the user has a body weight on file.
3. Rapid Date Navigator taps have no request cancellation, risking a stale fetch briefly overwriting fresher data.

**Visual fidelity requirement**: per explicit user direction, the Weekly Goal Ring's rework (ring + 7-day bar chart + edit sheet) must match the web app's `WeeklyRing.tsx`/`GoalEditSheet.tsx` as closely as SwiftUI reasonably allows — same information layout, same day-state color coding, same edit-sheet day-picker grid — not a simplified reinterpretation. This is a harder fidelity bar than the milestone's general "close enough" standard, same treatment the Muscle Map got originally.

## Architecture

### New: `ProfileRepository` (AthlixCore)

No `ProfileRepository` exists anywhere in this codebase today — only the `Profile` model. Both gap #1 (goal editing, which doesn't strictly need Profile, see below) and gap #2 (body-weight-relative load, which reads `profiles.body_weight`/`body_weight_unit` directly, per web's `bodyWeightKg` computation — **not** the `body_weight_logs` table) need it.

- Add `bodyWeightUnit: WeightUnit` to `Profile.swift` — the schema (`profiles.body_weight_unit`) has this column; the Swift model is currently missing it, a real gap independent of this design's other goals.
- `ProfileRepository` protocol: `func fetchProfile(userId: String) async throws -> Profile`. A minimal, single-method surface — this design doesn't need profile *writes* (goal-days lives in `UserDefaults`, not `profiles`), so no `updateProfile` is built now; add it when a real settings-editing feature needs it.
- `LiveProfileRepository`, matching the established `Live*Repository` pattern (`do/catch` → `RepositoryError`, default-constructed `SupabaseClient`).

### Gap #1: Weekly Goal Ring — real metric + matching visual

**The current Swift widget is scoped wrong, not just computed wrong.** Web fetches `workouts` (feeding the ring) as a fetch *always* scoped to the calendar week containing `currentDate` (Mon–Sun via `startOfWeek(currentDate, {weekStartsOn: 1})`), completely independent of the Date Navigator's Day/Week/Month selection — a second, separate fetch from `rangeWorkouts` (which *is* viewMode-scoped and feeds the other widgets). The current Swift `DashboardViewModel` only has the viewMode-scoped fetch, so today's ring is wrong both in formula *and* in date range (e.g. switching to Day view shrinks the ring's input to a single day).

- `DashboardViewModel` gains a second `@Published`-equivalent (`private(set) var weeklyGoalWorkouts: [Workout]`) populated by a fetch always scoped to `[startOfWeek(currentDate), endOfWeek(currentDate)]` (Monday-start, matching web), reloaded whenever `currentDate` changes (not `viewMode`).
- `trainedDaysCount`: count of the 7 week-days where a workout exists AND the day is not in the future (today counts if trained) — ported directly from web's `weekDays`/`trainedDaysCount` logic (`src/pages/Home.tsx:349-377`).
- Goal-days: `Int` in `[1, 7]`, default `4`, persisted to `UserDefaults` under a dedicated key (matching the established rest-timer-duration pattern from the Workout Logger milestone, not a new persistence mechanism).
- `WeeklyGoalRingView` rework — two parts, both required for the fidelity bar:
  - **Ring header**: trained/goal count, percentage, matching web's layout (`WeeklyRing.tsx` lines 15-21).
  - **7-day bar chart**: one bar per day of the current week, color/height per day-state (`trained`, `rest`, `today-trained`, `today-rest`, `future`) — ported 1:1 from `WeeklyRing.tsx`'s `switch(day.status)` block, using `ColorTokens.accent`/`.bgElevated`/`.border` for the equivalent CSS var mappings (`--accent`, `--bg-elevated`, `--border`). `today-trained`'s pulsing glow and `today-rest`'s dashed-border treatment are both worth replicating via SwiftUI's native equivalents (`.overlay` with a dashed `StrokeStyle`, a subtle `.opacity`/`.scaleEffect` pulse animation) rather than dropped as "too hard" — they're small, well-scoped visual details.
- **Goal edit sheet** (`GoalEditSheetView`, new file): a `.sheet` presenting a 1–7 day-picker grid (7 tappable cells, selected state highlighted in `ColorTokens.accent` with black text per web's contrast choice) + a "Set Goal" confirm button, matching `GoalEditSheet.tsx`'s layout and the contextual hint text ("Great for recovery-focused training" / "Balanced training frequency" / "High-intensity schedule") ported verbatim by day-count threshold.

### Gap #2: Body-weight-relative muscle load

- `DashboardViewModel` fetches the user's `Profile` once (via the new `ProfileRepository`) alongside its existing widget data.
- `muscleLoadBySlug`/`muscleIntensityBySlug` reworked to compute relative load when `profile.bodyWeight` is present and `> 0`: convert to kg if `bodyWeightUnit == .lbs` (`* 0.45359237`, matching web's exact conversion constant), then `relativeLoad = load / bodyWeightKg` per slug — falling back to raw load when no body weight is on file, matching web's `relativeLoad || load || sets` fallback chain exactly (`src/pages/Home.tsx:276,285,315`, `MuscleMap.tsx:66`).
- `BodyWeightRepository`/`BodyWeightLog` remain unused after this change — web's relative-load math reads `profiles.body_weight`, not `body_weight_logs`, so wiring `BodyWeightRepository` in isn't actually needed for this specific gap despite the original Known Limitations note implying it. (`body_weight_logs` is a history table for a body-weight *tracking* feature that doesn't exist in this app yet — out of scope here, not silently dropped, just genuinely a different feature.)

### Gap #3: Date Navigator request cancellation

- `DashboardView` gains a private `reloadGeneration: Int` counter, incremented at the start of every `reloadData(_:)` call. Each async fetch captures its own generation number and, after `await`-ing, only applies its result to `@State` if `reloadGeneration` still matches what it captured — a stale, slower response from an earlier tap is discarded rather than overwriting fresher data. (A `Task`-cancellation approach is the other standard option; the generation-token approach is preferred here since `DashboardViewModel.loadWorkouts`/`loadPersonalRecords` don't currently accept a `Task` to cancel mid-flight, and adding that plumbing is a larger change than a simple guard.)

## Data Flow

- New `weeklyGoalWorkouts` fetch: same `WorkoutRepository.fetchWorkouts(userId:from:to:)` call already used elsewhere, just a second call with week-anchored (not viewMode-anchored) bounds.
- `ProfileRepository.fetchProfile`: simple `profiles` select scoped to `id = userId` (the `profiles` table's primary key is the user id, per schema — not a `user_id` foreign-key column like most other tables).
- Goal-days: pure `UserDefaults` read/write, no network round-trip, instant.

## Error Handling

- `ProfileRepository.fetchProfile` failure: per-widget isolation, same as every other Dashboard fetch — Weekly Goal Ring and Muscle Map/Radar fall back to their pre-fix behavior (fabricated metric / raw load) rather than showing a broken widget, with no user-visible error (a missing profile fetch shouldn't block the whole dashboard).
- `weeklyGoalWorkouts` fetch failure: ring shows its last-known cached state if any, else a neutral empty state — same isolation pattern as the milestone's existing widgets.

## Testing

- `ProfileRepository`: unit-tested against a mock, same pattern as every other repository this project.
- Trained-days-count logic, goal-days UserDefaults round-trip, relative-load computation (including the fallback chain and the kg/lbs conversion constant): direct unit tests in `AthlixCore`, following the project's established rigor for pure-logic ports.
- Generation-token cancellation: a targeted test simulating an out-of-order async response, asserting the stale result is discarded — if `DashboardViewModel`'s current test setup makes this awkward to test directly, a manual on-device verification (rapid-tap the Date Navigator, confirm no visible flicker to stale data) is an acceptable fallback, documented as such.
- Widgets (`WeeklyGoalRingView`, `GoalEditSheetView`): manual on-device verification, consistent with the rest of this app's view-layer testing convention — including a side-by-side visual comparison against the web app's rendering, per this design's explicit fidelity requirement.

## Explicitly Out of Scope

- `BodyWeightRepository`/`body_weight_logs`-backed body-weight *tracking* UI (logging new weigh-ins) — unrelated to closing the relative-load gap, which reads `profiles.body_weight` directly.
- Any general `ProfileRepository` write/settings-editing surface beyond what these two fixes need.
- Migrating goal-days to a synced `profiles` column — explicitly decided against; `UserDefaults` matches web's own current (also device-local) behavior.
