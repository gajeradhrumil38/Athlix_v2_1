import XCTest
@testable import AthlixCore

// In-memory reimplementation of the web's exercise-library / recent-history / rename logic
// (src/lib/supabaseData.ts ~L2098-2477), following this codebase's established convention (see
// WorkoutRepositorySaveTests) of testing repository contracts via a hand-written mock actor
// rather than the real Live* implementation against a network layer. Where the underlying logic
// is pure (search tiers, group filtering, last-session aggregation, dedupe), this mock calls
// straight into LiveExerciseLibraryRepository's internal static helpers so tests exercise real
// production code, not a hand-copied duplicate -- mirroring Task 7's `isBetterRecord` convention.
actor InMemoryExerciseLibraryRepository: ExerciseLibraryRepository {
    typealias Row = LiveExerciseLibraryRepository.JoinedExerciseRow

    var libraryRows: [ExerciseLibraryItem] = []
    var exerciseRows: [Row] = []

    var libraryUpdateCalls: [(id: String, name: String)] = []
    var exercisesUpdateCalls: [(oldName: String, newName: String, workoutIds: [String])] = []
    var personalRecordUpdateCalls: [(oldName: String, newName: String)] = []
    var insertCalls: [ExerciseLibraryItem] = []
    var workoutIdsForUser: [String] = []

    func searchLibrary(userId: String, query: String) async throws -> [ExerciseLibraryItem] {
        let visible = libraryRows.filter { LiveExerciseLibraryRepository.isVisible($0, to: userId) }
        return LiveExerciseLibraryRepository.searchTiers(all: visible, query: query)
    }

    func libraryByGroup(userId: String, muscleGroup: String) async throws -> [ExerciseLibraryItem] {
        let visible = libraryRows.filter { LiveExerciseLibraryRepository.isVisible($0, to: userId) }
        return LiveExerciseLibraryRepository.filterLibraryByGroup(all: visible, muscleGroup: muscleGroup, userId: userId)
    }

    func lastSession(userId: String, exerciseName: String) async throws -> LastSessionSummary? {
        LiveExerciseLibraryRepository.buildLastSessionSummary(from: exerciseRows, exerciseName: exerciseName)
    }

    func recentExerciseOptions(userId: String) async throws -> [RecentExerciseOption] {
        LiveExerciseLibraryRepository.buildRecentExerciseOptions(from: exerciseRows)
    }

    func renameExerciseEverywhere(userId: String, oldName: String, newName: String, exerciseDbId: String?) async throws {
        let (noOp, trimmed) = LiveExerciseLibraryRepository.renameNoOp(oldName: oldName, newName: newName)
        if noOp { return }

        if let exerciseDbId {
            libraryUpdateCalls.append((exerciseDbId, trimmed))
            if let idx = libraryRows.firstIndex(where: { $0.id == exerciseDbId }) {
                let row = libraryRows[idx]
                libraryRows[idx] = ExerciseLibraryItem(
                    id: row.id, name: trimmed, muscleGroup: row.muscleGroup,
                    isCustom: row.isCustom, userId: row.userId, exerciseDbId: row.exerciseDbId
                )
            }
        }

        if workoutIdsForUser.isEmpty { return }

        exercisesUpdateCalls.append((oldName, trimmed, workoutIdsForUser))
        exerciseRows = exerciseRows.map { row in
            guard row.name == oldName, workoutIdsForUser.contains(row.workoutId) else { return row }
            return Row(
                workoutId: row.workoutId, date: row.date, name: trimmed, muscleGroup: row.muscleGroup,
                reps: row.reps, weight: row.weight, sets: row.sets, orderIndex: row.orderIndex, exerciseDbId: row.exerciseDbId
            )
        }

        personalRecordUpdateCalls.append((oldName, trimmed))
    }

    func addCustomExercise(userId: String, name: String, muscleGroup: String) async throws -> ExerciseLibraryItem {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let visible = libraryRows.filter { LiveExerciseLibraryRepository.isVisible($0, to: userId) }
        if let existing = LiveExerciseLibraryRepository.findExistingExercise(in: visible, name: normalizedName, muscleGroup: muscleGroup, userId: userId) {
            return existing
        }
        let item = ExerciseLibraryItem(
            id: "new-\(insertCalls.count)", name: normalizedName, muscleGroup: muscleGroup,
            isCustom: true, userId: userId, exerciseDbId: nil
        )
        insertCalls.append(item)
        libraryRows.append(item)
        return item
    }
}

extension InMemoryExerciseLibraryRepository {
    func setLibraryRows(_ rows: [ExerciseLibraryItem]) { libraryRows = rows }
    func setExerciseRows(_ rows: [Row]) { exerciseRows = rows }
    func setWorkoutIdsForUser(_ ids: [String]) { workoutIdsForUser = ids }
}

final class ExerciseLibraryRepositoryTests: XCTestCase {
    private typealias Row = LiveExerciseLibraryRepository.JoinedExerciseRow

    private func item(
        id: String, name: String, group: String, isCustom: Bool = false, userId: String? = nil
    ) -> ExerciseLibraryItem {
        ExerciseLibraryItem(id: id, name: name, muscleGroup: group, isCustom: isCustom, userId: userId, exerciseDbId: nil)
    }

    private func row(
        workoutId: String, date: String, name: String, group: String? = "Chest",
        reps: Int = 8, weight: Double = 100, sets: Int = 1, order: Int = 0, exerciseDbId: String? = nil
    ) -> Row {
        Row(workoutId: workoutId, date: date, name: name, muscleGroup: group, reps: reps, weight: weight, sets: sets, orderIndex: order, exerciseDbId: exerciseDbId)
    }

    // MARK: - searchLibrary

    func testSearchLibraryEmptyQueryReturnsAllSortedAlphabetically() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([
            item(id: "1", name: "Squat", group: "Legs"),
            item(id: "2", name: "Bench Press", group: "Chest"),
            item(id: "3", name: "Deadlift", group: "Back"),
        ])

        let result = try await mock.searchLibrary(userId: "u1", query: "")

        XCTAssertEqual(result.map { $0.name }, ["Bench Press", "Deadlift", "Squat"])
    }

    func testSearchLibraryNameMatchesComeBeforeMuscleGroupMatchesNoDuplicates() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([
            item(id: "1", name: "Leg Press", group: "Legs"),      // name match on "leg"
            item(id: "2", name: "Squat", group: "Legs"),          // muscle-group match only
            item(id: "3", name: "Bench Press", group: "Chest"),   // no match
        ])

        let result = try await mock.searchLibrary(userId: "u1", query: "leg")

        XCTAssertEqual(result.map { $0.name }, ["Leg Press", "Squat"], "name-tier result must precede muscle-group-tier result, with no duplicate of Leg Press")
    }

    func testSearchLibraryQueryMatchingBothNameAndGroupDoesNotDuplicate() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([
            item(id: "1", name: "Leg Press", group: "Legs"),
        ])

        let result = try await mock.searchLibrary(userId: "u1", query: "leg")

        XCTAssertEqual(result.count, 1, "An exercise matching both tiers must appear only once")
    }

    // MARK: - libraryByGroup

    func testLibraryByGroupFiltersToGroupAndExcludesOtherUsersCustomExercises() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([
            item(id: "1", name: "Bench Press", group: "Chest"),                                   // default, in group
            item(id: "2", name: "Squat", group: "Legs"),                                           // default, other group
            item(id: "3", name: "My Custom Chest Move", group: "Chest", isCustom: true, userId: "u1"),  // this user's custom, in group
            item(id: "4", name: "Someone Else's Move", group: "Chest", isCustom: true, userId: "u2"),   // other user's custom, in group
        ])

        let result = try await mock.libraryByGroup(userId: "u1", muscleGroup: "Chest")

        XCTAssertEqual(Set(result.map { $0.name }), Set(["Bench Press", "My Custom Chest Move"]))
    }

    func testLibraryByGroupSortsAlphabetically() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([
            item(id: "1", name: "Zercher Squat", group: "Legs"),
            item(id: "2", name: "Air Squat", group: "Legs"),
        ])

        let result = try await mock.libraryByGroup(userId: "u1", muscleGroup: "Legs")

        XCTAssertEqual(result.map { $0.name }, ["Air Squat", "Zercher Squat"])
    }

    // MARK: - lastSession

    func testLastSessionReturnsNilWhenNoMatches() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setExerciseRows([row(workoutId: "w1", date: "2026-07-01", name: "Squat")])

        let result = try await mock.lastSession(userId: "u1", exerciseName: "Bench Press")

        XCTAssertNil(result)
    }

    func testLastSessionPicksLatestWorkoutNotJustLatestRow() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        // Two separate workouts contain "Bench Press". The earlier workout (by date) has a row
        // with a higher order_index than any row in the later workout -- if the aggregation
        // picked "latest row" instead of "latest workout", it would wrongly pick the earlier
        // workout's higher-order_index row.
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "Bench Press", reps: 5, weight: 135, order: 9),
            row(workoutId: "w2", date: "2026-07-10", name: "Bench Press", reps: 8, weight: 145, order: 0),
            row(workoutId: "w2", date: "2026-07-10", name: "Bench Press", reps: 6, weight: 155, order: 1),
            row(workoutId: "w1", date: "2026-07-01", name: "Squat", reps: 5, weight: 225, order: 0),
        ])

        let result = try await mock.lastSession(userId: "u1", exerciseName: "Bench Press")

        XCTAssertEqual(result?.date, "2026-07-10")
        XCTAssertEqual(result?.sets, 2, "Should aggregate both rows from the latest workout (w2), not the single row from w1")
        XCTAssertEqual(result?.reps, 6, "reps should come from the LAST row (highest order_index) of the latest workout")
        XCTAssertEqual(result?.weight, 155)
        XCTAssertEqual(result?.totalVolume, 145 * 8 * 1 + 155 * 6 * 1)
        XCTAssertEqual(result?.perSetData.map { $0.reps }, [8, 6])
    }

    // MARK: - recentExerciseOptions

    func testRecentExerciseOptionsDedupesByNameCaseInsensitiveMostRecentFirst() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "squat", reps: 5, weight: 225, order: 0),
            row(workoutId: "w2", date: "2026-07-05", name: "Bench Press", reps: 8, weight: 135, order: 0),
            row(workoutId: "w3", date: "2026-07-10", name: "Squat", reps: 3, weight: 315, order: 0),
        ])

        let result = try await mock.recentExerciseOptions(userId: "u1")

        XCTAssertEqual(result.map { $0.name }, ["Squat", "Bench Press"], "Most-recent-first, deduped case-insensitively on 'squat'/'Squat'")
    }

    func testRecentExerciseOptionsEachOptionReflectsItsOwnMostRecentSession() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "Squat", reps: 5, weight: 225, order: 0),
            row(workoutId: "w2", date: "2026-07-05", name: "Bench Press", reps: 8, weight: 135, order: 0),
            row(workoutId: "w3", date: "2026-07-10", name: "Squat", reps: 3, weight: 315, order: 0),
        ])

        let result = try await mock.recentExerciseOptions(userId: "u1")

        let squat = result.first { $0.name == "Squat" }
        let bench = result.first { $0.name == "Bench Press" }
        XCTAssertEqual(squat?.lastSession.date, "2026-07-10")
        XCTAssertEqual(squat?.lastSession.weight, 315)
        XCTAssertEqual(bench?.lastSession.date, "2026-07-05")
        XCTAssertEqual(bench?.lastSession.weight, 135)
    }

    func testGetRecentExerciseOptionsInfersMuscleGroupWhenBlank() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "Bench Press", group: nil),
        ])

        let result = try await mock.recentExerciseOptions(userId: "u1")

        XCTAssertEqual(result.first?.muscleGroup, "Chest", "Blank muscle_group should be inferred from the exercise name via the muscle-pattern matcher, not left empty")
    }

    func testGetRecentExerciseOptionsUsesProfilePrimaryNotTopWeightedTargetRegion() async throws {
        // "Running" matches ExerciseMuscleMapper's treadmill/run pattern, whose explicit
        // primaryRegions override is ["Cardio", "Legs"] -- "Cardio" isn't reachable via
        // slugRegionMap (no slug maps to it), so a version of inferMuscleGroupFromName that
        // reconstructs a region from the top-weighted target's slug (quadriceps -> "Legs")
        // instead of reading profile.primary directly would wrongly return "Legs" here.
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "Running", group: nil),
        ])

        let result = try await mock.recentExerciseOptions(userId: "u1")

        XCTAssertEqual(result.first?.muscleGroup, "Cardio", "Must use profile.primary (web's exact field), not a slugRegionMap lookup on the top-weighted target")
    }

    func testGetRecentExerciseOptionsFallsBackToCoreWhenNoMuscleMatch() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "Zzyzx Wobble Frobnicate", group: nil),
        ])

        let result = try await mock.recentExerciseOptions(userId: "u1")

        XCTAssertEqual(result.first?.muscleGroup, "Core", "An unrecognizable exercise name with no muscle-group match must ultimately fall back to Core")
    }

    // MARK: - renameExerciseEverywhere

    func testRenameExerciseEverywhereNoOpsOnBlankName() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setWorkoutIdsForUser(["w1"])

        try await mock.renameExerciseEverywhere(userId: "u1", oldName: "Squat", newName: "   ", exerciseDbId: nil)

        let libCalls = await mock.libraryUpdateCalls
        let exCalls = await mock.exercisesUpdateCalls
        let prCalls = await mock.personalRecordUpdateCalls
        XCTAssertTrue(libCalls.isEmpty)
        XCTAssertTrue(exCalls.isEmpty)
        XCTAssertTrue(prCalls.isEmpty)
    }

    func testRenameExerciseEverywhereNoOpsOnUnchangedName() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setWorkoutIdsForUser(["w1"])

        try await mock.renameExerciseEverywhere(userId: "u1", oldName: "Squat", newName: "Squat", exerciseDbId: nil)

        let exCalls = await mock.exercisesUpdateCalls
        XCTAssertTrue(exCalls.isEmpty, "Zero network calls expected when the trimmed new name equals the old name")
    }

    func testRenameExerciseEverywhereUpdatesLibraryExercisesAndPersonalRecordsWithCorrectScoping() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([item(id: "lib-1", name: "Squat", group: "Legs", isCustom: true, userId: "u1")])
        await mock.setWorkoutIdsForUser(["w1", "w2"])
        await mock.setExerciseRows([
            row(workoutId: "w1", date: "2026-07-01", name: "Squat"),
            row(workoutId: "w2", date: "2026-07-05", name: "Squat"),
        ])

        try await mock.renameExerciseEverywhere(userId: "u1", oldName: "Squat", newName: "Back Squat", exerciseDbId: "lib-1")

        let libCalls = await mock.libraryUpdateCalls
        XCTAssertEqual(libCalls.count, 1)
        XCTAssertEqual(libCalls.first?.id, "lib-1")
        XCTAssertEqual(libCalls.first?.name, "Back Squat")

        let exCalls = await mock.exercisesUpdateCalls
        XCTAssertEqual(exCalls.count, 1)
        XCTAssertEqual(exCalls.first?.oldName, "Squat")
        XCTAssertEqual(exCalls.first?.newName, "Back Squat")
        XCTAssertEqual(Set(exCalls.first?.workoutIds ?? []), Set(["w1", "w2"]), "exercises update must be scoped to this user's workout ids")

        let prCalls = await mock.personalRecordUpdateCalls
        XCTAssertEqual(prCalls.count, 1)
        XCTAssertEqual(prCalls.first?.oldName, "Squat")
        XCTAssertEqual(prCalls.first?.newName, "Back Squat")

        let updatedRows = await mock.exerciseRows
        XCTAssertTrue(updatedRows.allSatisfy { $0.name == "Back Squat" }, "Uses the real `name` column, not web's buggy `exercise_name`")
    }

    func testRenameExerciseEverywhereReturnsEarlyWhenUserHasNoWorkouts() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([item(id: "lib-1", name: "Squat", group: "Legs", isCustom: true, userId: "u1")])
        await mock.setWorkoutIdsForUser([])

        try await mock.renameExerciseEverywhere(userId: "u1", oldName: "Squat", newName: "Back Squat", exerciseDbId: "lib-1")

        // Library update still happens (it doesn't depend on workout ids), but the exercises/PR
        // updates must not fire once we discover there are no workouts to scope them to.
        let libCalls = await mock.libraryUpdateCalls
        XCTAssertEqual(libCalls.count, 1)
        let exCalls = await mock.exercisesUpdateCalls
        let prCalls = await mock.personalRecordUpdateCalls
        XCTAssertTrue(exCalls.isEmpty)
        XCTAssertTrue(prCalls.isEmpty)
    }

    // MARK: - addCustomExercise

    func testAddCustomExerciseReturnsExistingItemOnCollisionAndDoesNotInsert() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        let existing = item(id: "lib-1", name: "Cable Fly", group: "Chest", isCustom: true, userId: "u1")
        await mock.setLibraryRows([existing])

        let result = try await mock.addCustomExercise(userId: "u1", name: "cable fly", muscleGroup: "Chest")

        XCTAssertEqual(result, existing)
        let inserts = await mock.insertCalls
        XCTAssertTrue(inserts.isEmpty, "A name+group collision must not create a duplicate")
    }

    func testAddCustomExerciseCreatesNewItemWhenNoCollision() async throws {
        let mock = InMemoryExerciseLibraryRepository()
        await mock.setLibraryRows([item(id: "lib-1", name: "Cable Fly", group: "Chest", isCustom: true, userId: "u1")])

        let result = try await mock.addCustomExercise(userId: "u1", name: "Pec Deck", muscleGroup: "Chest")

        XCTAssertEqual(result.name, "Pec Deck")
        XCTAssertEqual(result.muscleGroup, "Chest")
        XCTAssertTrue(result.isCustom)
        XCTAssertEqual(result.userId, "u1")
        XCTAssertNil(result.exerciseDbId)
        let inserts = await mock.insertCalls
        XCTAssertEqual(inserts.count, 1)
    }

    // MARK: - chunked(_:) batching boundary
    //
    // fetchJoinedExerciseRows batches workout ids into groups of 400 to avoid URL/query-length
    // limits (mirroring web's `chunk(workoutIds, 400)`). That call itself needs a real network
    // layer to exercise end-to-end, so these tests hit the `chunked(_:)` Array extension
    // directly -- the actual boundary logic -- rather than only indirectly through a mock that
    // bypasses chunking by working off pre-seeded rows.

    func testChunkedExactlyOneChunkSizeReturnsSingleFullChunk() {
        let items = Array(0..<400)

        let chunks = items.chunked(400)

        XCTAssertEqual(chunks.count, 1)
        XCTAssertEqual(chunks.first?.count, 400)
    }

    func testChunkedOneOverChunkSizeReturnsTwoChunksWithTrailingRemainder() {
        let items = Array(0..<401)

        let chunks = items.chunked(400)

        XCTAssertEqual(chunks.count, 2)
        XCTAssertEqual(chunks.first?.count, 400)
        XCTAssertEqual(chunks.last?.count, 1)
        XCTAssertEqual(chunks.last?.first, 400)
    }

    func testChunkedExactlyTwoChunkSizesReturnsTwoFullChunks() {
        let items = Array(0..<800)

        let chunks = items.chunked(400)

        XCTAssertEqual(chunks.count, 2)
        XCTAssertEqual(chunks[0].count, 400)
        XCTAssertEqual(chunks[1].count, 400)
        XCTAssertEqual(chunks[0], Array(0..<400))
        XCTAssertEqual(chunks[1], Array(400..<800))
    }

    func testChunkedEmptyArrayReturnsNoChunks() {
        let items: [Int] = []

        let chunks = items.chunked(400)

        XCTAssertTrue(chunks.isEmpty, "An empty array in must produce zero chunks, not a single empty chunk")
    }
}
