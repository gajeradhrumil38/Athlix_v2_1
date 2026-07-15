# Athlix — Native Swift Workout Logger Milestone Design

**Date**: 2026-07-15
**Status**: Approved (design), pending implementation plan
**Depends on**: Swift Foundation milestone (auth, navigation shell, `AthlixCore`/`Athlix` project structure, `ColorTokens`, `AuthManager`) and Swift Dashboard milestone (`WorkoutRepository`, `PersonalRecordRepository`, `Workout`/`ExerciseSet`/`PersonalRecord` models, SwiftData cache pattern) — all already exist and are unaffected by this milestone.

## Goal

Build the third milestone of the Athlix Swift rewrite: a fully native SwiftUI Workout Logger (the app's `/log` flow), replacing `PlaceholderLogView`. This is the core write path of the app — starting a session, adding exercises, logging sets, and persisting a finished workout — plus the supporting Plans/Templates system and Exercise Picker.

## Scope

**In scope** — full parity with the live web `/log` flow:

1. **Session entry & state machine**: resume an in-progress draft, start blank, start from a deep "add exercise" entry, start from "Plan Today", or reopen a past date's already-saved workout for editing — matching `Log.tsx`'s entry logic.
2. **Active workout session**: two-pane list/detail exercise navigation, elapsed-time timer (starts paused), inline rest timer (bottom bar, haptic-driven), set CRUD (add/copy/remove/mark-done, capped at 20 sets/exercise), exercise CRUD (add/remove/rename/change muscle group/cycle input type), retroactive date editing via a calendar picker — matching `ActiveWorkout.tsx`.
3. **Set value entry**: a native SwiftUI wheel picker (`.pickerStyle(.wheel)`) replacing the web's custom 3D CSS dial, for weight/reps/distance/time/height/calories fields per `DialFieldKind`.
4. **Exercise Picker**: full-screen sheet, 3 tabs (History / Muscle / My Plans) plus search-overrides-tabs behavior, single-select (session) and multi-select (plan editing) modes — matching `ExercisePicker.tsx`.
5. **Plans/Templates**: standalone Templates list + editor, and the same editor reused inline during an active session (shared `PlanEditorViewModel` — see Architecture), including the "newly added exercise while a plan is loaded → Update Plan / This Session Only / Cancel" flow.
6. **Finish flow**: stats review sheet (completed sets, total volume, relative load, **real** PR count), save to Supabase, navigate home.
7. **Exercise input-type system**: full port of `exerciseTypes.ts` — `ExerciseInputType`, `DialFieldKind`, the exact/pattern-based name-to-type heuristic, default set values, completion-readiness gating, formatting.

**Explicitly out of scope**:

- **Dead web code, not ported**: `ExerciseBlock.tsx`, `WeightRepsModal.tsx`/`WeightRepsPicker.tsx`, `ExerciseTabBar.tsx`, `RestTimerContext.tsx`/`RestTimer.tsx`, `CelebrationScreen.tsx`. None of these are reachable in the live web app; porting them would replicate abandoned prototypes, not current behavior.
- **Plate calculator**: not in the live web app (only existed in the dead `WeightRepsModal` prototype) — not built for iOS either.
- **Celebration/confetti screen**: not in the live web app (dead, unwired, hardcoded stats) — iOS finish flow matches the live behavior (toast + navigate home), not the unused prototype.
- **Exercise thumbnail images**: the `opentrainingCatalog` image set is skipped for this milestone. Exercise rows show name + muscle-group icon only.
- **Schema changes**: no migration. The flat `exercises` table (one row per completed set) and the averaged/flattened `template_exercises` columns are kept exactly as-is — this milestone ports client behavior against the existing shared backend, since the web app remains live during the transition.
- **Rest duration sync**: stored in `UserDefaults` (matching web's `localStorage`), not wired to the existing-but-unused `rest_timer_preferences` table.
- **Offline write queue**: matching the Foundation milestone's "basic caching only" decision — the in-progress draft is persisted locally (see below), but nothing syncs to Supabase until Finish. No background sync engine.

## Architecture

### New `AthlixCore` additions

- **`ExerciseInputType`** (7 cases: `weightReps`, `distanceTime`, `timeOnly`, `distanceOnly`, `repsOnly`, `heightReps`, `caloriesTime`) and **`DialFieldKind`** (7 cases: `weight`, `reps`, `distance`, `minutes`, `seconds`, `height`, `calories`) — ported verbatim from `exerciseTypes.ts`.
- **`ExerciseTypeResolver`**: three-tier resolution ported verbatim — (1) exact lowercase-normalized name lookup against the full hardcoded map, (2) word-boundary-safe regex pattern fallback, (3) default `.weightReps`. Given the size of the exact-match table (several hundred entries), this is extracted programmatically from `exerciseTypes.ts` via a Python script, the same proven technique used for the Dashboard milestone's SVG paths and muscle-mapping rules — not hand-transcribed.
- **`SetCompletionRules`**: `isSetReadyForCompletion(type:values:)` ported per-type exactly (e.g. `.weightReps` needs `reps > 0` only; `.distanceOnly` needs the repurposed weight-field value `> 0`).
- **`TemplateRepository`** (new, alongside the existing `WorkoutRepository`/`PersonalRecordRepository`): async wrapper for `templates`/`template_exercises`, same protocol + `Live*Repository` pattern already established.
- **`PersonalRecordRepository`** (already exists from Dashboard milestone) is extended with a "PRs touched by workout X" query, used by the Finish flow's real PR count.

### Consolidating duplicated web logic

The web app hand-duplicates its "add an exercise while a plan is loaded" 3-way prompt (Update Plan / This Session Only / Cancel) separately in `ActiveWorkout.tsx` and `PlanTodaySheet.tsx`, and duplicates `getFieldBinding`-style field logic between `ActiveWorkout.tsx` and `ExerciseContent.tsx`. iOS consolidates these:

- **`PlanEditorViewModel`**: one shared view model backing both the standalone Templates create/edit screen and the in-session "plan loaded" editing flow. Owns dirty-tracking, duplicate-name checks, and the Update/Session-Only/Cancel prompt logic in one place.
- **Field-binding logic** (mapping input type → primary/secondary field) lives once in `AthlixCore` (alongside `DialFieldKind`), consumed by both the exercise detail view and the plan editor.

### Session state

- **`ActiveWorkoutViewModel`** (`@Observable`): owns the `WorkoutState`-equivalent (title, start time, elapsed seconds, exercises, notes). Responsibilities mirror `Log.tsx` + `ActiveWorkout.tsx` combined:
  - Entry resolution: resume local draft (if present and not expired) → deep "add exercise" entry → "Plan Today" entry → past-date edit (fetch + regroup flat rows into exercises) → quick-start sheet → blank session.
  - Elapsed timer: starts paused; a 1-second tick while running increments `elapsedSeconds` and recomputes end time.
  - Inline rest timer: started on any set marked done, duration read from `UserDefaults`, countdown with haptic ticks in the final seconds and a completion haptic at zero; stopped if the same set is un-marked.
  - Set CRUD: add (seeded from the last set), copy (insert duplicate after source), remove (minimum 1 set), mark-done (gated by `SetCompletionRules`), all capped at 20 sets/exercise.
  - Exercise CRUD: add (case-insensitive dedupe against existing session exercises; optimistic UI using picker-supplied last-session data, with a non-blocking background fetch patch-in if the user hasn't touched the seeded sets yet), remove, rename (fire-and-forget rename-everywhere call), change muscle group, cycle input type (resets that exercise's sets — matching web's destructive-but-current behavior).
  - Date editing: retroactively moves the whole session's date, recomputing start/end times and resetting the elapsed timer, disallowing future dates.

### Draft persistence

The in-progress `WorkoutState`-equivalent is serialized to local on-disk storage (e.g. a JSON file in the app's Application Support directory) with the same TTL semantics as web's 8-hour `sessionStorage` draft — written whenever the exercise count changes and on a periodic interval. Nothing is written to Supabase until Finish. This matches the Foundation milestone's "basic caching only" stance and requires no new sync infrastructure.

### Views

- `LogEntryView` — routes to Quick Start / Plan Today / Active session based on `ActiveWorkoutViewModel`'s resolved entry state (mirrors `Log.tsx`).
- `ActiveWorkoutView` — two-pane list/detail (mirrors `ActiveWorkout.tsx`, minus dead-code paths).
- `ExerciseDetailView` — sticky stats header (sets done/total, volume, relative load, unit toggle), per-set rows, add-set button (mirrors `ExerciseContent.tsx`).
- `SetRowView` — value box (tap opens `SetValuePicker`), +/- steppers with type-appropriate step size, done toggle, target hint when a plan-provided target exists (mirrors `SetRow.tsx`).
- `SetValuePicker` — native `.pickerStyle(.wheel)` sheet, 1-2 columns per `DialFieldKind`, replacing the web's custom 3D dial per the approved design decision.
- `ExercisePickerView` — 3-tab sheet (History/Muscle/My Plans) + search-overrides-tabs, single/multi-select modes (mirrors `ExercisePicker.tsx`, minus the unused `ExerciseTabBar`).
- `PlanEditorView` — shared between standalone Templates editing and in-session plan editing, backed by `PlanEditorViewModel`.
- `FinishSheetView` — stats review + real PR count + save (mirrors `FinishSheet.tsx`, without the unused `CelebrationScreen`).

## Data Flow

- **No schema change.** The flat `exercises` table (one row per completed set) is kept; the client reconstructs exercises-with-sets by grouping same-named rows, matching web's `attachExercises`/past-date-reload logic exactly.
- **Save**: primary path calls the existing `save_workout_with_sets` RPC; if it errors, falls back to a manual multi-step insert (workouts row → exercises rows → personal_records upsert), mirroring web's defensive fallback. Both paths already exist server-side — no RPC changes needed.
- **PR count (fixed, not replicated)**: web's Finish sheet always shows 0 PRs because the client-side `isPR` flag is dead code, even though the RPC does upsert `personal_records` correctly server-side. iOS queries `personal_records` for the exercises touched by the just-saved workout and shows the real count — a pure client-side improvement with no schema or RPC impact.
- **Templates**: saving a plan's sets continues to flatten to averaged `default_reps`/`default_weight` per exercise (matching web's existing fidelity loss) — no schema change, no attempt to preserve per-set progression.
- **Rest duration**: read from `UserDefaults` (default 90s), matching web's `localStorage` key, not the unused `rest_timer_preferences` table.
- **Exercise thumbnails**: skipped. Rows show name + a muscle-group icon (from the existing `AppIcon`/`ICONS` registry) only.

## Error Handling

- Per-action isolation: an exercise picker search failure, a template save failure, or a set-completion gate rejection each surface inline, without blocking the rest of the session.
- RPC save failure falls back to the manual insert path (matching web); if that also fails, the Finish sheet shows an inline error and the draft is preserved locally so the user doesn't lose data.
- Template name collisions prompt an inline rename, matching web.
- Set-completion gating (`SetCompletionRules`) enforced per input type exactly as today, preventing invalid "done" states (e.g. a weight-only set with 0 reps).

## Testing

- **`ExerciseTypeResolver`/`DialFieldKind`/`SetCompletionRules`**: heavy unit testing given the large heuristic table size, following the same TDD rigor given to `SVGPathParser` and `ExerciseMuscleMapper` in the Dashboard milestone — tests run against real exercise names extracted from the web app's data, not synthetic examples.
- **`TemplateRepository`/extended `PersonalRecordRepository`**: unit-tested against mock Supabase clients, following the established `AuthManager`/`MockSupabaseAuthClient` pattern.
- **`ActiveWorkoutViewModel`/`PlanEditorViewModel`**: unit tests for set/exercise CRUD, draft save/restore + TTL expiry, plan-load merge logic, and the Update/Session-Only/Cancel decision flow.
- **Views (`SetValuePicker`, `ExercisePickerView`, etc.)**: manual on-device verification only, consistent with prior milestones — no XCUITest harness in scope.

## Explicitly Out of Scope for This Design

- Plate calculator, celebration/confetti screen, exercise thumbnail images (all confirmed non-goals above).
- Schema migration to a normalized `workout_exercises`/`sets` model, or a normalized per-set template column — both deliberately deferred to keep this milestone client-side only against the existing shared backend.
- Offline write queue / background sync engine.
- `rest_timer_preferences` table wiring.
