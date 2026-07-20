import SwiftUI
import AthlixCore

struct DashboardView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel: DashboardViewModel?
    @State private var currentDate = Date()
    @State private var viewMode: DashboardViewMode = .week
    @State private var showingGoalEdit = false

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                DateNavigatorView(currentDate: $currentDate, viewMode: $viewMode)

                if let viewModel {
                    WeeklyGoalRingView(
                        trainedDays: viewModel.trainedDaysCount,
                        goalDays: viewModel.goalDays,
                        weekDays: viewModel.weekDays,
                        onEditGoal: { showingGoalEdit = true }
                    )
                    MuscleMapWidgetView(intensityBySlug: viewModel.muscleIntensityBySlug)
                    TrainNextView(muscleIntensityBySlug: viewModel.muscleIntensityBySlug)
                    PRBannerView(personalRecords: viewModel.personalRecords)
                    TodayWorkoutView(todaysWorkout: todaysWorkout(from: viewModel.workouts))
                    MuscleRadarView(regionSetCounts: viewModel.regionSetCounts)
                    AIWeeklySummaryView(trainedMuscleGroups: uniqueOrdered(viewModel.workouts.flatMap { $0.muscleGroups ?? [] }))
                } else {
                    ProgressView().tint(ColorTokens.accent)
                }
            }
            .padding(10)
        }
        .background(ColorTokens.bgBase.ignoresSafeArea())
        .sheet(isPresented: $showingGoalEdit) {
            if let viewModel {
                GoalEditSheetView(current: viewModel.goalDays, onConfirm: { viewModel.setGoalDays($0) })
            }
        }
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
                profileRepository: LiveProfileRepository(),
                userId: userId,
                modelContext: modelContext
            )
            viewModel = vm
            await reloadData(vm)
        }
        .onChange(of: currentDate) { _, _ in
            Task { if let viewModel { await reloadData(viewModel) } }
        }
        .onChange(of: viewMode) { _, _ in
            Task { if let viewModel { await reloadData(viewModel) } }
        }
    }

    /// Obtains a generation token from the ViewModel (`vm.beginReload()`) and threads it into
    /// every load call so each load method gates ITS OWN mutation against the CURRENT
    /// generation the instant its own network await resolves (see DashboardViewModel's
    /// `reloadGeneration`/`beginReload()` doc comments). That is the fix for the Task 9 code
    /// review finding: a View-level check run only BETWEEN awaited steps can't stop a slower,
    /// superseded call from unconditionally overwriting state the moment its own await
    /// resolves, because that overwrite happens inside the very step being awaited, not between
    /// steps. The `guard vm.reloadGeneration == myGeneration` lines below are kept only as an
    /// optimization to skip starting further already-stale awaited work early -- they are not
    /// what makes this correct; the per-load-method gate inside the ViewModel is.
    private func reloadData(_ vm: DashboardViewModel) async {
        let myGeneration = vm.beginReload()

        let range = DashboardViewModel.rangeUTC(for: currentDate, viewMode: viewMode)

        await vm.loadWorkouts(from: range.from, to: range.to, generation: myGeneration)
        guard vm.reloadGeneration == myGeneration else { return }

        // loadProfile before loadExercisesInRange: recomputeMuscleLoad() reads `profile` for
        // unit conversion / body-weight-relative normalization, so this ordering avoids the
        // (harmless but avoidable) one-frame lbs-only fallback noted in DashboardViewModel.
        await vm.loadProfile(generation: myGeneration)
        guard vm.reloadGeneration == myGeneration else { return }

        await vm.loadExercisesInRange(generation: myGeneration)
        guard vm.reloadGeneration == myGeneration else { return }

        await vm.loadPersonalRecords(generation: myGeneration)
        guard vm.reloadGeneration == myGeneration else { return }

        await vm.loadWeeklyGoalData(for: currentDate, generation: myGeneration)
    }

    private func todaysWorkout(from workouts: [Workout]) -> Workout? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return workouts.first { workout in
            guard let date = formatter.date(from: workout.date) else { return false }
            return Calendar.current.isDateInToday(date)
        }
    }

    private func uniqueOrdered(_ items: [String]) -> [String] {
        var seen = Set<String>()
        return items.filter { seen.insert($0).inserted }
    }
}
