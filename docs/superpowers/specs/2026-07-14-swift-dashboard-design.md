# Athlix — Native Swift Dashboard Milestone Design

**Date**: 2026-07-14
**Status**: Approved (design), pending implementation plan
**Depends on**: Swift Foundation milestone (`2026-07-14-swift-rewrite-design.md`, `2026-07-14-swift-foundation.md`) — auth, navigation shell, `AthlixCore`/`Athlix` project structure, `ColorTokens`, `AuthManager` all already exist and are unaffected by this milestone.

## Goal

Build the second milestone of the Athlix Swift rewrite: a fully data-driven, native SwiftUI Dashboard (the app's Home tab), replacing the current `PlaceholderDashboardView`. This is a read-only milestone — no new write paths, no workout logging.

## Scope

**In scope**: 8 widgets, in this fixed order, matching the web app's default layout:

1. Date Navigator (week switcher + Day/Week/Month toggle)
2. Weekly Goal Ring
3. Muscle Map (real anatomical body diagram, front/back toggle)
4. Train Next (heuristic training suggestion, no AI API call)
5. PR Banner (personal records this week)
6. Today's Workout (status card; tapping into the actual logger is a disabled placeholder until the Workout Logger milestone exists)
7. Week Strip / Muscle Radar (spider chart of weekly muscle-group distribution)
8. AI Weekly Summary (templated text from workout data — no Gemini call; matches current web behavior including its non-functional "Generate" button)

**Explicitly out of scope for this milestone**:
- Drag-and-drop widget reordering / show-hide editor (`DashboardLayoutEditor`). Widgets render in a fixed default order (matching `src/config/widgets.ts`'s `defaultOrder`). This can be a fast follow-up once the widgets themselves are proven.
- The WHOOP wearable widget (`whoop_row`). No slot reserved for it — it will be added when the WHOOP integration milestone is built.
- Timeline (workout history list). Bundled originally as a candidate for this milestone, deliberately split out as its own fast follow-up milestone once Dashboard's data patterns are proven.
- Any write functionality (editing goals, logging workouts) — this milestone is entirely read-only.

## Architecture

### Layout

Direct port of the web app's layout: a single vertical `ScrollView` stack of widget cards, in the fixed order above, matching the web's card spacing/styling via `ColorTokens`. (Chosen over a grouped-list or bento-grid alternative — see the milestone's brainstorming session for the visual comparison; direct port was selected for simplicity and lower risk, matching a proven design.)

### Data Layer (new additions to `AthlixCore`)

- **Repositories**: `WorkoutRepository`, `PersonalRecordRepository`, `BodyWeightRepository` — thin async wrappers over the `SupabaseClient` (via the existing `LiveSupabaseAuthClient`'s underlying client, or a new shared `SupabaseClient` accessor), each returning `Codable` models. Same pattern as the Foundation milestone's `AuthManager`/`SupabaseAuthClient` split: a protocol per repository so each is unit-testable against a mock.
- **New models** (`Workout`, `ExerciseSet`, `PersonalRecord`, `BodyWeightLog`): ported from the corresponding Postgres tables. **Every field must be verified against the actual `supabase/schema.sql`, not assumed from the web TypeScript types** — the Foundation milestone caught a real schema mismatch (`Profile.height_cm` vs. the actual `height_feet`/`height_inches` columns) this same way, and that discipline carries forward.
- **SwiftData cache**: one `@Model` per repository return type. Read-cache only (instant display of last-known data, background refresh on load) — no offline write queue, matching the Foundation design doc's "basic caching only" decision.
- **Derived/pure-function logic** (ported from `Home.tsx` and `exerciseMuscles.ts`, placed in `AthlixCore` for testability): `calculateStreak`, muscle-group training-load aggregation, `loadToIntensity` tiering.

### Muscle Map — SVG path extraction & parsing

The web app's Muscle Map uses a third-party package (`react-muscle-highlighter`) containing real anatomical SVG path data for front/back body views, per muscle group, as structured JS data (confirmed: 159 total path strings across front+back, using SVG path commands `M`, `m`, `l`, `c`, `q`, `a`, `z`).

- **Extraction**: pull the raw path-string data out of `node_modules/react-muscle-highlighter/dist/esm/assets/{bodyFront,bodyBack}.js` into a static Swift data file (`MuscleBodyPaths.swift`) — this is a one-time data-porting step, not a runtime dependency on the npm package.
- **`SVGPathParser`** (new, in `AthlixCore`, fully unit-testable): parses the extracted path strings into SwiftUI `Path`. Handles all 7 command types found in the real data, including elliptical arcs (`a`/`A`) via the standard SVG-arc-to-cubic-Bézier conversion algorithm. **This is the highest-risk, most novel piece of this milestone** and gets dedicated TDD treatment: tests run against real extracted path fixtures (not synthetic toy paths), asserting parsed `Path` geometry (bounding box, subpath count) matches expectations — not just "doesn't crash."
- **`MuscleBodyView`**: SwiftUI view rendering the parsed front/back silhouettes, coloring each muscle-group region by training intensity (`SLUG_HEX` + `INTENSITY_ALPHA` ported 1:1 from `MuscleMap.tsx`), with a front/back toggle control.

## Loading & Error Handling

- **Per-widget, not global**: each widget manages its own loading/error state independently. A skeleton placeholder (matching `ColorTokens.bgSurface` card shape) shows while loading; SwiftData cache means repeat visits typically resolve instantly.
- **Isolated failures**: if one widget's data fetch fails, only that widget shows an inline "Couldn't load" state — it never blocks or crashes the rest of the dashboard.

## Testing

- **`SVGPathParser`**: heavy TDD against real extracted path fixtures (multiple muscle groups, front and back) — the most rigorously tested new component in this milestone given its novelty and risk.
- **Repositories**: unit-tested against mock Supabase clients, following the `AuthManager`/`MockSupabaseAuthClient` pattern already established and proven in the Foundation milestone.
- **Derived/pure-function logic**: direct unit tests (streak calculation, intensity tiering, muscle aggregation).
- **Widgets (SwiftUI views)**: manual on-device verification only, consistent with the Foundation milestone's approach — no XCUITest harness in scope.

## Explicitly Out of Scope for This Design

- Drag-and-drop dashboard layout editor (deferred, fast follow-up).
- WHOOP widget (deferred to the WHOOP integration milestone).
- Timeline / workout history screen (deferred, fast follow-up milestone).
- Any workout-logging write paths (belongs to the Workout Logger milestone).
