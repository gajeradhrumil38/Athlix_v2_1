import SwiftUI
import AthlixCore

struct DashboardView: View {
    @Environment(AuthManager.self) private var authManager
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel: DashboardViewModel?
    @State private var currentDate = Date()
    @State private var viewMode: DashboardViewMode = .week

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                DateNavigatorView(currentDate: $currentDate, viewMode: $viewMode)

                if let viewModel {
                    WeeklyGoalRingView(completedSets: viewModel.workouts.count * 4, goalSets: 20)
                    MuscleMapWidgetView(intensityBySlug: viewModel.muscleIntensityBySlug)
                    TrainNextView(muscleIntensityBySlug: viewModel.muscleIntensityBySlug)
                    PRBannerView(personalRecords: viewModel.personalRecords)
                    TodayWorkoutView(todaysWorkout: todaysWorkout(from: viewModel.workouts))
                    MuscleRadarView(regionLoads: regionLoads(from: viewModel))
                    AIWeeklySummaryView(trainedMuscleGroups: uniqueOrdered(viewModel.workouts.flatMap { $0.muscleGroups ?? [] }))
                } else {
                    ProgressView().tint(ColorTokens.accent)
                }
            }
            .padding(10)
        }
        .background(ColorTokens.bgBase.ignoresSafeArea())
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

    private func reloadData(_ vm: DashboardViewModel) async {
        let range = DashboardViewModel.rangeUTC(for: currentDate, viewMode: viewMode)
        await vm.loadWorkouts(from: range.from, to: range.to)
        await vm.loadPersonalRecords()
    }

    private func todaysWorkout(from workouts: [Workout]) -> Workout? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        return workouts.first { workout in
            guard let date = formatter.date(from: workout.date) else { return false }
            return Calendar.current.isDateInToday(date)
        }
    }

    private func regionLoads(from viewModel: DashboardViewModel) -> [String: Double] {
        var byRegion: [String: Double] = [:]
        for (slug, load) in viewModel.muscleLoadBySlug {
            guard let region = ExerciseMuscleMapper.slugRegionMap[slug] else { continue }
            byRegion[region, default: 0] += load
        }
        let maxLoad = byRegion.values.max() ?? 1
        guard maxLoad > 0 else { return byRegion }
        return byRegion.mapValues { $0 / maxLoad }
    }

    private func uniqueOrdered(_ items: [String]) -> [String] {
        var seen = Set<String>()
        return items.filter { seen.insert($0).inserted }
    }
}
