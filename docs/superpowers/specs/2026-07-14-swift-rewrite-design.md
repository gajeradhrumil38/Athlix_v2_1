# Athlix — Native Swift Rewrite Design

**Date**: 2026-07-14
**Status**: Approved (design), pending implementation plan

## Goal

Rewrite Athlix (currently a React 18 + TypeScript + Vite + Tailwind PWA backed by
Supabase) as a native iOS app in Swift/SwiftUI, for distribution on the App Store.
The existing web app will be retired once the Swift app ships — no long-term
parallel maintenance of both clients is required, so the Supabase backend does not
need to preserve web-app backward compatibility during this work.

## Scope

In scope (full feature parity, native-idiomatic implementation):

- Auth (email/password + new: Sign in with Apple)
- Dashboard / widget layout
- Timeline (workout history)
- Workout Logger (`/log`)
- Running Tracker (GPS)
- Food Scanner (Gemini vision + FatSecret)
- WHOOP wearable integration
- AI Coach chat (Gemini)
- Settings

**Out of scope**: Skincare Routine feature. This is being removed from the product
entirely (not just deprioritized for iOS) — no data model or migration work needed
for it in this project.

## Architecture

- **Language/UI**: Swift 6, SwiftUI-first. UIKit only where SwiftUI can't cleanly
  express the interaction, wrapped via `UIViewRepresentable`:
  - The scroll-snap `WeightRepsPicker` dial (rebuilt on `UIScrollView`).
  - The dashboard drag-and-drop layout editor, if SwiftUI's native
    `.draggable`/`.dropDestination` (iOS 17+) proves too limited — decided during
    that milestone, not upfront.
- **Pattern**: MVVM. Each screen is a SwiftUI `View` + an `@Observable` view model,
  mirroring the current page → component decomposition.
- **Project structure**: single Xcode app target (no SPM modularization at this
  stage — YAGNI; extract packages later only if a Watch app/widget extension needs
  shared code), organized by feature folders:

  ```
  ios/Athlix/
    App/            # App entry, theming, navigation shell
    Features/
      Auth/
      Dashboard/
      Workout/      # was pages/Log.tsx + components/log/
      Running/
      Food/
      Whoop/
      AICoach/
      Settings/
    Core/
      Data/         # Supabase client wrapper, repositories
      Models/       # Codable structs mirroring DB tables
      DesignSystem/ # Colors, typography, reusable components
  ```
- **Target**: iOS 17+.
- **Backend**: unchanged Supabase project — same Postgres schema, RLS policies,
  and Edge Functions (`food-scan`, `whoop-oauth`). Swap `supabase-js` for the
  official `supabase-swift` SDK.
- **Local cache**: SwiftData models mirroring key tables (workouts, exercises,
  templates, profile) as a read cache for offline viewing. Writes go straight to
  Supabase when online; no full offline-first write queue (basic caching only, not
  a parallel local-first implementation like today's `localData.ts`).
- **Secrets**: Gemini API key is BYOK (user supplies their own free key today,
  stored in `localStorage`) — in the Swift app this moves to iOS Keychain. No
  server-side AI cost or proxy needed; FatSecret search still goes through the
  existing `food-scan` Edge Function (OAuth 1.0a signing stays server-side).

## Auth & Data Layer

- **Auth methods**: email/password (parity with today, confirmed via
  `AuthContext.tsx`/`Auth.tsx` — no existing social login in the codebase) +
  Sign in with Apple (new, added proactively for a better native experience even
  though not strictly required by Guideline 4.8 given no competing social login
  exists today).
- **Password recovery**: Supabase deep-link flow via custom URL scheme /
  Universal Link, replacing the web's `athlix:password-recovery` window event.
- **Session state**: `AuthManager`, an `@Observable` singleton injected via the
  SwiftUI environment (`@Environment(AuthManager.self)`), replacing `useAuth()` as
  the app's central auth dependency.
- **Repositories**: one per domain — `WorkoutRepository`, `TemplateRepository`,
  `ProfileRepository`, `RunRepository`, `FoodRepository`, `WhoopRepository` — each
  a direct port of the corresponding functions in `supabaseData.ts`
  (`saveWorkout()`, `getWorkouts()`, `getTemplates()`, RPCs
  `save_workout_with_sets` / `log_body_weight`, etc.).
- **Models**: `Codable` structs matching existing table shapes 1:1 (`Workout`,
  `ExerciseSet`, `Profile`, `Template`, `PersonalRecord`, `BodyWeightLog`,
  `FoodScan`, `WhoopToken`, etc.) — no schema changes required.
- **Units**: `WeightUnit` enum + `convertWeight()`/`formatWeight()` ported 1:1
  from `units.ts` as pure Swift functions.

## Milestones (incremental, each testable on-device)

1. **Foundation** — Xcode project setup, Supabase SDK wiring, Auth (email/password
   + Sign in with Apple), navigation shell (tab bar, 5-item constraint carried
   over from mobile nav), theming (dark/darker as SwiftUI design tokens).
2. **Dashboard / Timeline** — read-heavy, low risk. Proves repositories + SwiftData
   cache end-to-end before tackling harder UI.
3. **Workout Logger** — core feature. Port of `ActiveWorkout` →
   `ExerciseBlock`/`ExerciseContent`/`SetRow`. Custom dial picker rebuilt in
   UIKit. Rest timer as an `@Observable RestTimerManager` replacing
   `RestTimerContext`.
4. **Running Tracker** — CoreLocation replaces browser geolocation (with
   background location mode for locked-screen tracking); MapKit replaces
   Leaflet. Kalman filter and haversine math port directly as pure Swift.
5. **Food Scanner** — camera capture via `PhotosPicker`/`AVFoundation`; Gemini
   vision calls direct from Swift using the Keychain-stored BYOK key; FatSecret
   search via the existing Edge Function.
6. **WHOOP Integration** — OAuth2 via `ASWebAuthenticationSession` instead of a
   browser redirect; same `whoop-oauth` Edge Function and `whoop_cache` table.
7. **AI Coach** — chat as a SwiftUI sheet/overlay; same Gemini REST calls;
   system prompt built from local repository data.
8. **Dashboard widget editor** — drag-and-drop reorder, SwiftUI-native first,
   UIKit `UICollectionView` compositional layout as fallback if needed.

## Testing & App Store Readiness

- **Testing**: XCTest for repository/model logic and pure-function ports (units,
  GPS math, weight conversion). Manual on-device verification per milestone
  rather than exhaustive UI test automation, given solo-dev scope and the
  incremental-delivery approach.
- **Privacy/compliance**:
  - `PrivacyInfo.xcprivacy` declaring data collection: health/fitness data,
    location (Running), camera (Food Scanner), third-party data (WHOOP).
  - Background location usage description with justification (Running).
  - Camera/Photo Library usage descriptions (Food Scanner).
  - Onboarding copy explaining the BYOK Gemini key requirement (free Google AI
    Studio key) since there is no server-side AI cost model.
- **Branch strategy**: work happens on a dedicated branch (e.g. `swift-rewrite`)
  in this same repository, under a new `/ios` directory. Each milestone merges
  incrementally; the existing web app on `main` is unaffected until retirement.

## Explicitly Out of Scope for This Design

- Skincare Routine feature (removed from the product entirely).
- Backend schema changes (Supabase stays as-is).
- Maintaining web/iOS client parity long-term (web app is retired once iOS ships).
- Full offline-first write support (only read caching).
