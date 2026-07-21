import SwiftUI
import AthlixCore

/// Top-level entry point for the `/log` flow, mirroring web's `Log.tsx`:
/// owns `ActiveWorkoutViewModel`'s construction/lifecycle, resolves entry
/// state, and routes to the right presentation.
///
/// SCOPE DECISION (quick-start sheet): web's `Log.tsx` shows an interstitial
/// "Quick Start" sheet when there's no resumable draft and no deep link,
/// driven by `Profile.show_start_sheet`. `ActiveWorkoutViewModel.resolveEntry`
/// deliberately never assigns `.quickStart` itself (see its doc comment) --
/// that decision requires a `ProfileRepository`, which does not exist
/// anywhere in this codebase yet (confirmed: no such file under
/// `AthlixCore/Sources/AthlixCore/Data/`). Building one is out of scope for
/// this task. This milestone therefore SKIPS the quick-start sheet entirely:
/// `LogEntryView` always calls `resolveEntry(deepLink:)` with either `nil`
/// (default) or an explicit `DeepLinkIntent` supplied by a future caller --
/// never anything that would produce `.quickStart` -- so the "nothing else
/// going on" case resolves to `.blank` and goes straight into
/// `ActiveWorkoutView`. This mirrors other "no backing repository yet" gaps
/// already documented in this codebase (e.g. `bodyWeight: Double?` always nil
/// in `ExerciseDetailView`/`FinishSheetView`).
///
/// `deepLink` defaults to `nil` since nothing in this milestone yet produces
/// a non-nil value (e.g. a future Dashboard "Add Exercise" quick action could
/// pass `.addExercise`); accepting the parameter now is a cheap forward hook,
/// not new UI.
struct LogEntryView: View {
    @Environment(AuthManager.self) private var authManager

    var deepLink: DeepLinkIntent?
    var onDismiss: () -> Void = {}

    @State private var viewModel: ActiveWorkoutViewModel?
    @State private var resolvedUserId: String?

    var body: some View {
        Group {
            if let viewModel, let resolvedUserId {
                ActiveWorkoutView(
                    viewModel: viewModel,
                    userId: resolvedUserId,
                    exerciseLibraryRepository: LiveExerciseLibraryRepository(),
                    templateRepository: LiveTemplateRepository(),
                    personalRecordRepository: LivePersonalRecordRepository(),
                    onDismiss: onDismiss
                )
            } else {
                ZStack {
                    ColorTokens.bgBase.ignoresSafeArea()
                    ProgressView()
                        .tint(ColorTokens.accent)
                }
            }
        }
        .task {
            guard viewModel == nil, let userId = authManager.user?.id else { return }
            let vm = ActiveWorkoutViewModel(
                userId: userId,
                workoutRepository: LiveWorkoutRepository(),
                exerciseLibraryRepository: LiveExerciseLibraryRepository(),
                profileRepository: LiveProfileRepository(),
                draftStore: WorkoutDraftStore()
            )
            await vm.resolveEntry(deepLink: deepLink)
            resolvedUserId = userId
            viewModel = vm
        }
    }
}
