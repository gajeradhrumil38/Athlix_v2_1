import XCTest
@testable import Athlix
import AthlixCore
import SwiftData

// MARK: - Mocks

actor MockDashboardWorkoutRepository: WorkoutRepository {
    var stubbedWorkouts: [Workout] = []
    var stubbedExercisesForWorkouts: [ExerciseSet] = []
    var shouldThrowOnFetch = false
    var shouldThrowOnFetchExercisesForWorkouts = false
    private(set) var lastFetchRange: (from: Date, to: Date)?
    private(set) var lastFetchExercisesForWorkoutsIds: [String]?

    func setStubbedWorkouts(_ workouts: [Workout]) { stubbedWorkouts = workouts }
    func setStubbedExercisesForWorkouts(_ rows: [ExerciseSet]) { stubbedExercisesForWorkouts = rows }
    func setShouldThrowOnFetch(_ value: Bool) { shouldThrowOnFetch = value }
    func setShouldThrowOnFetchExercisesForWorkouts(_ value: Bool) { shouldThrowOnFetchExercisesForWorkouts = value }

    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        lastFetchRange = (from, to)
        if shouldThrowOnFetch { throw RepositoryError.network }
        return stubbedWorkouts
    }

    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout {
        Workout(
            id: "saved-1", userId: userId, title: input.title, date: input.date,
            durationMinutes: input.durationMinutes, notes: input.notes, muscleGroups: nil,
            createdAt: "2026-07-14T00:00:00Z"
        )
    }

    func deleteWorkout(userId: String, workoutId: String) async throws {}
    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws {}
    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String]) {
        ([], [])
    }
    func fetchWorkoutExercises(userId: String, workoutId: String) async throws -> [ExerciseSet] { [] }

    func fetchExercisesForWorkouts(userId: String, workoutIds: [String]) async throws -> [ExerciseSet] {
        lastFetchExercisesForWorkoutsIds = workoutIds
        if shouldThrowOnFetchExercisesForWorkouts { throw RepositoryError.network }
        return stubbedExercisesForWorkouts
    }
}

actor MockDashboardPersonalRecordRepository: PersonalRecordRepository {
    var stubbedRecords: [PersonalRecord] = []
    var shouldThrow = false

    func setStubbedRecords(_ records: [PersonalRecord]) { stubbedRecords = records }
    func setShouldThrow(_ value: Bool) { shouldThrow = value }

    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord] {
        if shouldThrow { throw RepositoryError.network }
        return stubbedRecords
    }

    func countNewPRs(userId: String, exerciseNames: [String], achievedOn date: String) async throws -> Int { 0 }
}

actor MockProfileRepository: ProfileRepository {
    var stubbedProfile: Profile?
    var shouldThrow = false
    private(set) var fetchCount = 0

    func setStubbedProfile(_ profile: Profile?) { stubbedProfile = profile }
    func setShouldThrow(_ value: Bool) { shouldThrow = value }

    func fetchProfile(userId: String) async throws -> Profile {
        fetchCount += 1
        if shouldThrow { throw RepositoryError.network }
        guard let stubbedProfile else { throw RepositoryError.unknown("no profile stubbed") }
        return stubbedProfile
    }
}

// MARK: - Test suite

@MainActor
final class DashboardViewModelTests: XCTestCase {
    var workoutRepo: MockDashboardWorkoutRepository!
    var recordRepo: MockDashboardPersonalRecordRepository!
    var profileRepo: MockProfileRepository!
    var container: ModelContainer!

    override func setUp() {
        super.setUp()
        workoutRepo = MockDashboardWorkoutRepository()
        recordRepo = MockDashboardPersonalRecordRepository()
        profileRepo = MockProfileRepository()
        container = try! ModelContainer(
            for: CachedWorkout.self, CachedPersonalRecord.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        UserDefaults.standard.removeObject(forKey: "athlix_weekly_goal_days")
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: "athlix_weekly_goal_days")
        super.tearDown()
    }

    private func makeSUT() -> DashboardViewModel {
        DashboardViewModel(
            workoutRepository: workoutRepo,
            personalRecordRepository: recordRepo,
            profileRepository: profileRepo,
            userId: "user-1",
            modelContext: ModelContext(container)
        )
    }

    private func makeWorkout(id: String, date: String, muscleGroups: [String]? = nil) -> Workout {
        Workout(
            id: id, userId: "user-1", title: "Workout", date: date, durationMinutes: 45,
            notes: nil, muscleGroups: muscleGroups, createdAt: "\(date)T00:00:00Z"
        )
    }

    private func makeExerciseSet(
        id: String, workoutId: String, name: String, muscleGroup: String?,
        weight: Double, reps: Int, sets: Int = 1, unit: String
    ) -> ExerciseSet {
        ExerciseSet(
            id: id, workoutId: workoutId, name: name, muscleGroup: muscleGroup,
            sets: sets, reps: reps, weight: weight, unit: unit, orderIndex: 0, exerciseDbId: nil
        )
    }

    // MARK: - loadWeeklyGoalData

    func testLoadWeeklyGoalDataFetchesMondayStartWeekIndependentOfViewMode() async {
        // 2026-07-15 is a Wednesday. Its Monday-start week runs 2026-07-13...2026-07-19.
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        var components = DateComponents()
        components.year = 2026; components.month = 7; components.day = 15
        let wednesday = utcCalendar.date(from: components)!

        let sut = makeSUT()
        await sut.loadWeeklyGoalData(for: wednesday)

        let range = await workoutRepo.lastFetchRange
        XCTAssertNotNil(range)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        formatter.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(formatter.string(from: range!.from), "2026-07-13")
        XCTAssertEqual(formatter.string(from: range!.to), "2026-07-19")
    }

    func testLoadWeeklyGoalDataStoresWorkoutsAndReferenceDate() async {
        let workout = makeWorkout(id: "w1", date: "2026-07-14")
        await workoutRepo.setStubbedWorkouts([workout])

        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        var components = DateComponents()
        components.year = 2026; components.month = 7; components.day = 15
        let date = utcCalendar.date(from: components)!

        let sut = makeSUT()
        await sut.loadWeeklyGoalData(for: date)

        XCTAssertEqual(sut.weeklyGoalWorkouts.map(\.id), ["w1"])
        XCTAssertEqual(sut.weeklyGoalReferenceDate, date)
    }

    func testLoadWeeklyGoalDataFailureLeavesWorkoutsAtLastKnownValue() async {
        let workout = makeWorkout(id: "w1", date: "2026-07-14")
        await workoutRepo.setStubbedWorkouts([workout])
        let sut = makeSUT()
        await sut.loadWeeklyGoalData(for: Date())
        XCTAssertEqual(sut.weeklyGoalWorkouts.map(\.id), ["w1"])

        await workoutRepo.setShouldThrowOnFetch(true)
        await sut.loadWeeklyGoalData(for: Date())

        XCTAssertEqual(sut.weeklyGoalWorkouts.map(\.id), ["w1"], "must not clear on failure")
    }

    // MARK: - weekDays / trainedDaysCount

    func testWeekDaysAndTrainedDaysCountMatchTrainedDaysCalculator() async {
        // Monday 2026-07-13 and Wednesday 2026-07-15 trained.
        let workouts = [
            makeWorkout(id: "w1", date: "2026-07-13"),
            makeWorkout(id: "w2", date: "2026-07-15"),
        ]
        await workoutRepo.setStubbedWorkouts(workouts)

        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        var components = DateComponents()
        components.year = 2026; components.month = 7; components.day = 15
        let date = utcCalendar.date(from: components)!

        let sut = makeSUT()
        await sut.loadWeeklyGoalData(for: date)

        let expected = TrainedDaysCalculator.weekDays(
            containing: date, workoutDates: Set(["2026-07-13", "2026-07-15"])
        )
        XCTAssertEqual(sut.weekDays, expected)
        XCTAssertEqual(sut.trainedDaysCount, TrainedDaysCalculator.trainedDaysCount(expected))
    }

    // MARK: - loadProfile

    func testLoadProfileFetchesAndStoresProfile() async {
        let profile = Profile(
            id: "user-1", fullName: "A", unitPreference: .lbs, themePreference: "dark",
            bodyWeight: 180, bodyWeightUnit: .lbs, heightFeet: nil, heightInches: nil
        )
        await profileRepo.setStubbedProfile(profile)

        let sut = makeSUT()
        XCTAssertNil(sut.profile)

        await sut.loadProfile()

        XCTAssertEqual(sut.profile, profile)
    }

    func testLoadProfileFailureLeavesProfileAtLastKnownValueNil() async {
        await profileRepo.setShouldThrow(true)
        let sut = makeSUT()

        await sut.loadProfile()

        XCTAssertNil(sut.profile, "should remain nil, not crash or throw")
    }

    func testLoadProfileFailureAfterSuccessLeavesProfileAtLastKnownValue() async {
        let profile = Profile(
            id: "user-1", fullName: "A", unitPreference: .lbs, themePreference: "dark",
            bodyWeight: 180, bodyWeightUnit: .lbs, heightFeet: nil, heightInches: nil
        )
        await profileRepo.setStubbedProfile(profile)
        let sut = makeSUT()
        await sut.loadProfile()
        XCTAssertEqual(sut.profile, profile)

        await profileRepo.setShouldThrow(true)
        await sut.loadProfile()

        XCTAssertEqual(sut.profile, profile, "must keep the last-known profile on a subsequent failure")
    }

    // MARK: - setGoalDays

    func testSetGoalDaysClampsToOneAndSeven() {
        let sut = makeSUT()

        sut.setGoalDays(0)
        XCTAssertEqual(sut.goalDays, 1)

        sut.setGoalDays(-5)
        XCTAssertEqual(sut.goalDays, 1)

        sut.setGoalDays(8)
        XCTAssertEqual(sut.goalDays, 7)

        sut.setGoalDays(100)
        XCTAssertEqual(sut.goalDays, 7)

        sut.setGoalDays(5)
        XCTAssertEqual(sut.goalDays, 5)
    }

    func testSetGoalDaysPersistsToUserDefaults() {
        let sut = makeSUT()

        sut.setGoalDays(6)

        XCTAssertEqual(UserDefaults.standard.integer(forKey: "athlix_weekly_goal_days"), 6)
    }

    func testInitLoadsGoalDaysFromUserDefaultsOrDefaultsToFour() {
        UserDefaults.standard.set(3, forKey: "athlix_weekly_goal_days")
        let sut = makeSUT()
        XCTAssertEqual(sut.goalDays, 3)
    }

    func testInitDefaultsGoalDaysToFourWhenUnset() {
        UserDefaults.standard.removeObject(forKey: "athlix_weekly_goal_days")
        let sut = makeSUT()
        XCTAssertEqual(sut.goalDays, 4)
    }

    // MARK: - loadExercisesInRange / muscleLoadBySlug

    func testLoadExercisesInRangeFetchesForCurrentWorkoutIds() async {
        let workouts = [makeWorkout(id: "w1", date: "2026-07-14"), makeWorkout(id: "w2", date: "2026-07-15")]
        await workoutRepo.setStubbedWorkouts(workouts)
        let sut = makeSUT()
        await sut.loadWorkouts(from: Date(), to: Date())

        await sut.loadExercisesInRange()

        let ids = await workoutRepo.lastFetchExercisesForWorkoutsIds
        XCTAssertEqual(Set(ids ?? []), Set(["w1", "w2"]))
    }

    func testMuscleLoadBySlugReflectsCachedComputationAndIsStableAcrossRepeatedAccess() async {
        await workoutRepo.setStubbedWorkouts([makeWorkout(id: "w1", date: "2026-07-14")])
        await workoutRepo.setStubbedExercisesForWorkouts([
            makeExerciseSet(id: "e1", workoutId: "w1", name: "Bench Press", muscleGroup: "Chest", weight: 100, reps: 10, sets: 1, unit: "lbs"),
        ])
        let sut = makeSUT()
        await sut.loadWorkouts(from: Date(), to: Date())
        await sut.loadExercisesInRange()

        let expected = MuscleLoadCalculator.loadBySlug(
            exercises: [MuscleLoadCalculator.ExerciseInput(name: "Bench Press", muscleGroup: "Chest", weight: 100, reps: 10, sets: 1, unit: .lbs)],
            displayUnit: .lbs
        )
        XCTAssertEqual(sut.muscleLoadBySlug["chest"], expected["chest"])
        XCTAssertGreaterThan(sut.muscleLoadBySlug["chest"] ?? 0, 0)

        // Repeated access must return the exact same cached value -- it's a
        // stored property populated once by loadExercisesInRange, not a
        // computed `var { ... }` that recomputes ExerciseMuscleMapper regex
        // matching (an expensive, cache-less call) on every access.
        let first = sut.muscleLoadBySlug
        let second = sut.muscleLoadBySlug
        let third = sut.muscleLoadBySlug
        XCTAssertEqual(first, second)
        XCTAssertEqual(second, third)
    }

    func testLoadExercisesInRangeFailureResetsToEmptyWithoutCrashing() async {
        await workoutRepo.setStubbedWorkouts([makeWorkout(id: "w1", date: "2026-07-14")])
        await workoutRepo.setShouldThrowOnFetchExercisesForWorkouts(true)
        let sut = makeSUT()
        await sut.loadWorkouts(from: Date(), to: Date())

        await sut.loadExercisesInRange()

        XCTAssertTrue(sut.exercisesInRange.isEmpty)
        XCTAssertTrue(sut.muscleLoadBySlug.isEmpty)
    }

    // MARK: - km/mi distance-unit filtering

    // Judgment call (documented per Task 6 spec): a row whose `unit` is "km"/"mi" holds a
    // DISTANCE value in its `weight` field (running-type exercises reuse the same flat
    // `exercises` table/column), not an actual weight -- feeding it into
    // MuscleLoadCalculator.loadBySlug (which multiplies weight * reps * sets) would produce a
    // meaningless "volume" number. Only "kg"/"lbs" rows represent real weight and are included.
    func testDistanceUnitExercisesAreExcludedFromMuscleLoadVolume() async {
        await workoutRepo.setStubbedWorkouts([makeWorkout(id: "w1", date: "2026-07-14")])
        await workoutRepo.setStubbedExercisesForWorkouts([
            makeExerciseSet(id: "e1", workoutId: "w1", name: "Bench Press", muscleGroup: "Chest", weight: 100, reps: 10, sets: 1, unit: "lbs"),
            makeExerciseSet(id: "e2", workoutId: "w1", name: "Outdoor Run", muscleGroup: "Legs", weight: 5, reps: 1, sets: 1, unit: "km"),
            makeExerciseSet(id: "e3", workoutId: "w1", name: "Treadmill Run", muscleGroup: "Legs", weight: 3, reps: 1, sets: 1, unit: "mi"),
        ])
        let sut = makeSUT()
        await sut.loadWorkouts(from: Date(), to: Date())
        await sut.loadExercisesInRange()

        // Only the "lbs" bench press row should have contributed load. If the km/mi rows leaked
        // in, "legs"-adjacent slugs (e.g. quadriceps/hamstrings/glutes) driven by weight=5/weight=3
        // would show up with non-zero load despite there being no real weight lifted for legs.
        let legSlugs = ["quadriceps", "hamstrings", "glutes", "calves"]
        for slug in legSlugs {
            XCTAssertEqual(sut.muscleLoadBySlug[slug] ?? 0, 0, "distance-unit row for \(slug) must not contribute volume")
        }
        XCTAssertGreaterThan(sut.muscleLoadBySlug["chest"] ?? 0, 0)
    }
}
