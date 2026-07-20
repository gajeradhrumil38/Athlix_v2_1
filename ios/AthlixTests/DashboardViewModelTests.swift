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
    private(set) var lastUpdate: ProfileUpdate?

    func setStubbedProfile(_ profile: Profile?) { stubbedProfile = profile }
    func setShouldThrow(_ value: Bool) { shouldThrow = value }

    func fetchProfile(userId: String) async throws -> Profile {
        fetchCount += 1
        if shouldThrow { throw RepositoryError.network }
        guard let stubbedProfile else { throw RepositoryError.unknown("no profile stubbed") }
        return stubbedProfile
    }

    func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile {
        lastUpdate = updates
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
        let beforeProfile = sut.muscleLoadBySlug

        // A test that only re-reads muscleLoadBySlug several times in a row (with nothing else
        // happening in between) would pass equally well against a reverted `var { ... }` computed
        // property, since no mutation occurs between those reads either way -- it wouldn't
        // actually discriminate stored-once-per-reload from recomputed-on-every-access.
        //
        // The genuinely discriminating sequence: load a NEW profile that changes what
        // recomputeMuscleLoad() would produce (switching on body-weight-relative normalization),
        // WITHOUT calling loadExercisesInRange() again. If muscleLoadBySlug were a computed
        // property, it would immediately reflect the new profile on the very next access. If it's
        // the stored property it's supposed to be, it must stay exactly as it was until
        // loadExercisesInRange() is explicitly called again.
        let profileWithBodyWeight = Profile(
            id: "user-1", fullName: "B", unitPreference: .lbs, themePreference: "dark",
            bodyWeight: 180, bodyWeightUnit: .lbs, heightFeet: nil, heightInches: nil
        )
        await profileRepo.setStubbedProfile(profileWithBodyWeight)
        await sut.loadProfile()
        XCTAssertEqual(sut.profile, profileWithBodyWeight)

        XCTAssertEqual(
            sut.muscleLoadBySlug, beforeProfile,
            "loading a new profile alone must NOT retroactively change muscleLoadBySlug -- it's only recomputed inside loadExercisesInRange()"
        )

        // Now explicitly ask for a recompute -- this time it must actually change, since the
        // now-loaded profile's body weight feeds relativeLoadBySlug's normalization.
        await sut.loadExercisesInRange()

        XCTAssertNotEqual(
            sut.muscleLoadBySlug, beforeProfile,
            "loadExercisesInRange() must recompute using the newly-loaded profile's body weight"
        )
        let expectedAfter = MuscleLoadCalculator.relativeLoadBySlug(
            rawLoad: expected, bodyWeightKg: WeightUnit.convert(180, from: .lbs, to: .kg)
        )
        XCTAssertEqual(sut.muscleLoadBySlug["chest"], expectedAfter["chest"])
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

    // MARK: - reload generation gating (Task 9 code review regression)

    // Reproduces the exact race from the code review finding: Date Navigator reload A starts
    // (older generation), reload B starts before A resolves (newer generation), B's fetch
    // resolves and applies first (correctly reflecting the current UI state), and only THEN
    // does A's slower fetch resolve. Before the fix, `loadWorkouts` wrote `workouts = fresh`
    // unconditionally, so A's stale write would clobber B's already-applied, correct data. The
    // fix gates that write on `generation != reloadGeneration`, checked immediately after the
    // await and immediately before the assignment -- so A's late write is skipped instead.
    //
    // Real concurrency isn't needed to prove this: `beginReload()` is what defines "generation,"
    // so calling it for A, then B, then fully awaiting B's `loadWorkouts(generation:)` to
    // completion BEFORE awaiting A's, faithfully reproduces "B resolved before A" even with
    // fully sequential/awaited test code.
    func testStaleGenerationLoadWorkoutsDoesNotOverwriteNewerGenerationResult() async {
        let sut = makeSUT()
        let workoutA = makeWorkout(id: "stale-a", date: "2026-07-13")
        let workoutB = makeWorkout(id: "fresh-b", date: "2026-07-15")

        // A starts first -- reserves the older generation token.
        let genA = sut.beginReload()
        // B starts before A resolves -- reserves the newer generation token.
        let genB = sut.beginReload()
        XCTAssertNotEqual(genA, genB)

        // B's fetch resolves first and is current (genB == reloadGeneration), so it applies.
        await workoutRepo.setStubbedWorkouts([workoutB])
        await sut.loadWorkouts(from: Date(), to: Date(), generation: genB)
        XCTAssertEqual(sut.workouts.map(\.id), ["fresh-b"], "B's fetch should apply -- it's the current generation")

        // A's fetch finally resolves, but genA is now stale (reloadGeneration has moved to
        // genB). Before the fix this write was unconditional and would clobber B's data with
        // A's -- asserting it does NOT is exactly what the code review flagged as broken.
        await workoutRepo.setStubbedWorkouts([workoutA])
        await sut.loadWorkouts(from: Date(), to: Date(), generation: genA)
        XCTAssertEqual(
            sut.workouts.map(\.id), ["fresh-b"],
            "stale generation A's late write must NOT overwrite the newer generation B's already-applied result"
        )
    }

    // Same race, but proving the ViewModel-owned `reloadGeneration` genuinely gates each load
    // method's OWN mutation point (not just inter-step progression in the View) -- this is what
    // distinguishes the fix from the original (broken) View-level-only guard.
    func testBeginReloadIncrementsGenerationAndDefaultGenerationParameterAlwaysApplies() async {
        let sut = makeSUT()
        XCTAssertEqual(sut.beginReload(), 1)
        XCTAssertEqual(sut.beginReload(), 2)
        XCTAssertEqual(sut.beginReload(), 3)

        // Existing call sites (this test file's other 15+ tests) omit `generation` entirely --
        // that must keep behaving as "always apply," regardless of reloadGeneration's value.
        await workoutRepo.setStubbedWorkouts([makeWorkout(id: "w1", date: "2026-07-14")])
        await sut.loadWorkouts(from: Date(), to: Date())
        XCTAssertEqual(sut.workouts.map(\.id), ["w1"], "omitting `generation` must always apply, ignoring reloadGeneration")
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
