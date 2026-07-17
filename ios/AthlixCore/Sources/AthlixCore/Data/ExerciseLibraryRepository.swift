import Foundation
import Supabase

public protocol ExerciseLibraryRepository: Sendable {
    func searchLibrary(userId: String, query: String) async throws -> [ExerciseLibraryItem]
    func libraryByGroup(userId: String, muscleGroup: String) async throws -> [ExerciseLibraryItem]
    func lastSession(userId: String, exerciseName: String) async throws -> LastSessionSummary?
    func recentExerciseOptions(userId: String) async throws -> [RecentExerciseOption]
    func renameExerciseEverywhere(userId: String, oldName: String, newName: String, exerciseDbId: String?) async throws
    func addCustomExercise(userId: String, name: String, muscleGroup: String) async throws -> ExerciseLibraryItem
}

public final class LiveExerciseLibraryRepository: ExerciseLibraryRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    // MARK: - Shared row shape / pure helpers
    //
    // Extracted as internal (non-private) pure functions, mirroring Task 7's fix pattern
    // (WorkoutRepository.isBetterRecord), so tests exercise the real production logic
    // directly rather than a hand-copied reimplementation in a mock.

    // Mirrors web's per-exercise row + joined workout date shape built by
    // getExerciseRowsWithWorkoutDates (src/lib/supabaseData.ts ~L2116).
    struct JoinedExerciseRow: Equatable {
        let workoutId: String
        let date: String
        let name: String
        let muscleGroup: String?
        let reps: Int
        let weight: Double
        let sets: Int
        let orderIndex: Int
        let exerciseDbId: String?
    }

    // Mirrors web's getLastExerciseSession (~L2160-2190): filter to exact name matches, sort
    // desc by (date, order_index), take the LATEST workout's rows (matched by workout_id OR
    // date -- intentionally an OR, matching web verbatim), sort those asc by order_index, and
    // summarize. Returns nil when there are no matches at all.
    static func buildLastSessionSummary(from rows: [JoinedExerciseRow], exerciseName: String) -> LastSessionSummary? {
        let matches = rows
            .filter { $0.name == exerciseName }
            .sorted { a, b in
                if a.date != b.date { return a.date > b.date }
                return a.orderIndex > b.orderIndex
            }
        guard let first = matches.first else { return nil }

        let latestDate = first.date
        let latestWorkoutId = first.workoutId
        let sessionRows = matches
            .filter { $0.workoutId == latestWorkoutId || $0.date == latestDate }
            .sorted { $0.orderIndex < $1.orderIndex }

        guard let lastRow = sessionRows.last else { return nil }
        let totalVolume = sessionRows.reduce(0.0) { $0 + $1.weight * Double($1.reps) * Double($1.sets) }

        return LastSessionSummary(
            date: latestDate,
            sets: sessionRows.count,
            reps: lastRow.reps,
            weight: lastRow.weight,
            totalVolume: totalVolume,
            perSetData: sessionRows.map { LastSessionSummary.PerSetDatum(weight: $0.weight, reps: $0.reps) }
        )
    }

    // Mirrors web's getRecentExerciseOptions (~L2410-2460): sort all rows desc by
    // (date, order_index), then walk that order taking the first occurrence of each
    // lowercased exercise name (i.e. most-recent-first, deduped). Each option's session is
    // computed from that exercise's rows filtered to the SAME workout_id only (NOT the
    // date-OR-workout_id match that buildLastSessionSummary uses) -- this asymmetry exists in
    // the web source itself and is preserved here verbatim.
    static func buildRecentExerciseOptions(from rows: [JoinedExerciseRow]) -> [RecentExerciseOption] {
        let sorted = rows.sorted { a, b in
            if a.date != b.date { return a.date > b.date }
            return a.orderIndex > b.orderIndex
        }

        var byName: [String: [JoinedExerciseRow]] = [:]
        for row in rows {
            byName[row.name.lowercased(), default: []].append(row)
        }

        var seen = Set<String>()
        var options: [RecentExerciseOption] = []

        for row in sorted {
            let key = row.name.lowercased()
            if seen.contains(key) { continue }
            seen.insert(key)

            let allRowsForExercise = byName[key] ?? []
            let latestWorkoutId = row.workoutId
            let sessionRows = allRowsForExercise
                .filter { $0.workoutId == latestWorkoutId }
                .sorted { $0.orderIndex < $1.orderIndex }

            let lastRow = sessionRows.last ?? row
            let totalVolume = sessionRows.reduce(0.0) { $0 + $1.weight * Double($1.reps) * Double($1.sets == 0 ? 1 : $1.sets) }

            let session = LastSessionSummary(
                date: row.date,
                sets: sessionRows.count,
                reps: lastRow.reps,
                weight: lastRow.weight,
                totalVolume: totalVolume,
                perSetData: sessionRows.map { LastSessionSummary.PerSetDatum(weight: $0.weight, reps: $0.reps) }
            )

            // web falls back to inferMuscleGroupFromName() when muscle_group is blank; that
            // heuristic port is out of scope for this task, so an empty string is used instead.
            options.append(RecentExerciseOption(
                name: row.name, muscleGroup: row.muscleGroup ?? "", exerciseDbId: row.exerciseDbId, lastSession: session
            ))
        }

        return options
    }

    // Mirrors web's searchExerciseLibrary (~L2340-2370), reduced per the approved design-spec
    // scope: tier 1 is a case-insensitive substring match on name (not full fuzzy matching), the
    // alias-table tier is skipped entirely (out of scope), and tier 3 is a muscle-group-name
    // substring match applied only to exercises not already picked up by tier 1.
    static func searchTiers(all: [ExerciseLibraryItem], query: String) -> [ExerciseLibraryItem] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return all.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }

        let q = trimmed.lowercased()
        let nameMatches = all.filter { $0.name.lowercased().contains(q) }
        let nameMatchedNames = Set(nameMatches.map { $0.name.lowercased() })
        let muscleGroupExtras = all.filter {
            !nameMatchedNames.contains($0.name.lowercased()) && $0.muscleGroup.lowercased().contains(q)
        }
        return nameMatches + muscleGroupExtras
    }

    // Mirrors web's getExerciseLibraryByGroup (~L2213-2219): filter to the given group and to
    // rows visible to this user (default, or their own custom entries), sorted alphabetically.
    static func filterLibraryByGroup(all: [ExerciseLibraryItem], muscleGroup: String, userId: String) -> [ExerciseLibraryItem] {
        all
            .filter { $0.muscleGroup == muscleGroup && (!$0.isCustom || $0.userId == userId) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    // Mirrors web's addCustomExercise collision check (~L2247-2255): an exact case-insensitive
    // name match within the same muscle group, among rows visible to this user, is treated as
    // "already exists" rather than creating a duplicate.
    static func findExistingExercise(in rows: [ExerciseLibraryItem], name: String, muscleGroup: String, userId: String) -> ExerciseLibraryItem? {
        let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return rows.first {
            $0.muscleGroup == muscleGroup &&
            $0.name.lowercased() == normalized &&
            (!$0.isCustom || $0.userId == userId)
        }
    }

    // Mirrors web's renameExerciseEverywhere no-op guard (~L2278-2280): a blank or unchanged
    // trimmed name means no network call at all.
    static func renameNoOp(oldName: String, newName: String) -> (noOp: Bool, trimmed: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed.isEmpty || trimmed == oldName, trimmed)
    }

    // MARK: - Shared network helpers

    private struct WorkoutIdDateRow: Decodable {
        let id: String
        let date: String
    }

    private struct WorkoutIdRow: Decodable {
        let id: String
    }

    // Mirrors web's getExerciseRowsWithWorkoutDates (~L2116-2144): fetch this user's workouts,
    // then batch-fetch exercises by workout_id in chunks of 400 (avoids URL/query-length
    // limits), joining each exercise row with its workout's date. Shared by lastSession and
    // recentExerciseOptions, mirroring Task 7's extracted-helper pattern.
    private func fetchJoinedExerciseRows(userId: String) async throws -> [JoinedExerciseRow] {
        let workouts: [WorkoutIdDateRow] = try await client
            .from("workouts")
            .select("id,date")
            .eq("user_id", value: userId)
            .execute()
            .value

        if workouts.isEmpty { return [] }

        var dateByWorkoutId: [String: String] = [:]
        for workout in workouts { dateByWorkoutId[workout.id] = workout.date }
        let workoutIds = workouts.map { $0.id }

        var rows: [JoinedExerciseRow] = []
        for batch in workoutIds.chunked(400) {
            let exerciseBatch: [ExerciseSet] = try await client
                .from("exercises")
                .select()
                .in("workout_id", values: batch)
                .execute()
                .value

            for exercise in exerciseBatch {
                guard let date = dateByWorkoutId[exercise.workoutId] else { continue }
                rows.append(JoinedExerciseRow(
                    workoutId: exercise.workoutId, date: date, name: exercise.name,
                    muscleGroup: exercise.muscleGroup, reps: exercise.reps, weight: exercise.weight,
                    sets: exercise.sets, orderIndex: exercise.orderIndex, exerciseDbId: exercise.exerciseDbId
                ))
            }
        }

        return rows.sorted { $0.date < $1.date }
    }

    // Mirrors web's fetchExerciseLibraryRows (~L2196-2211): rows visible to this user are
    // default (non-custom) exercises OR this user's own custom exercises, with optional
    // server-side name/muscle-group filters layered on top.
    private func fetchExerciseLibraryRows(userId: String, query: String? = nil, muscleGroup: String? = nil) async throws -> [ExerciseLibraryItem] {
        var builder = client
            .from("exercise_library")
            .select()
            .or("is_custom.eq.false,user_id.eq.\(userId)")

        if let query, !query.isEmpty {
            builder = builder.ilike("name", pattern: "%\(query)%")
        }
        if let muscleGroup {
            builder = builder.eq("muscle_group", value: muscleGroup)
        }

        let rows: [ExerciseLibraryItem] = try await builder.execute().value
        return rows
    }

    // MARK: - Protocol methods

    public func searchLibrary(userId: String, query: String) async throws -> [ExerciseLibraryItem] {
        do {
            let all = try await fetchExerciseLibraryRows(userId: userId)
            return Self.searchTiers(all: all, query: query)
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func libraryByGroup(userId: String, muscleGroup: String) async throws -> [ExerciseLibraryItem] {
        do {
            let rows = try await fetchExerciseLibraryRows(userId: userId, muscleGroup: muscleGroup)
            return Self.filterLibraryByGroup(all: rows, muscleGroup: muscleGroup, userId: userId)
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func lastSession(userId: String, exerciseName: String) async throws -> LastSessionSummary? {
        do {
            let rows = try await fetchJoinedExerciseRows(userId: userId)
            return Self.buildLastSessionSummary(from: rows, exerciseName: exerciseName)
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func recentExerciseOptions(userId: String) async throws -> [RecentExerciseOption] {
        do {
            let rows = try await fetchJoinedExerciseRows(userId: userId)
            return Self.buildRecentExerciseOptions(from: rows)
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    private struct NameUpdate: Encodable {
        let name: String
    }

    private struct ExerciseNameUpdate: Encodable {
        let exercise_name: String
    }

    // Renames an exercise everywhere: the library entry (if custom), all historical sets, and
    // personal records.
    //
    // DEVIATION FROM WEB: the real web source (src/lib/supabaseData.ts renameExerciseEverywhere,
    // ~L2280-2296) updates the `exercises` table with
    // `.update({ exercise_name: trimmed }).eq('exercise_name', oldName)` -- but the `exercises`
    // table's actual column is `name`, not `exercise_name` (see schema: exercises(id, workout_id,
    // name, muscle_group, sets, reps, weight, unit, order_index, exercise_db_id)). That's a real
    // latent bug on web: historical exercise rows silently fail to rename (the column doesn't
    // exist, so PostgREST either no-ops or errors depending on config; the `personal_records`
    // update in the same function IS correct there, since that table really does have an
    // `exercise_name` column). This is a fresh Swift implementation, not a verbatim port of this
    // particular code path (verbatim-porting in this milestone's spec was scoped to the
    // muscle-map/exercise-type heuristics, not to reproducing incidental bugs elsewhere), so this
    // uses the correct `name` column here.
    public func renameExerciseEverywhere(userId: String, oldName: String, newName: String, exerciseDbId: String?) async throws {
        let (noOp, trimmed) = Self.renameNoOp(oldName: oldName, newName: newName)
        if noOp { return }

        do {
            if let exerciseDbId {
                _ = try await client
                    .from("exercise_library")
                    .update(NameUpdate(name: trimmed))
                    .eq("id", value: exerciseDbId)
                    .eq("user_id", value: userId)
                    .eq("is_custom", value: true)
                    .execute()
            }

            let workoutRows: [WorkoutIdRow] = try await client
                .from("workouts")
                .select("id")
                .eq("user_id", value: userId)
                .execute()
                .value
            let workoutIds = workoutRows.map { $0.id }
            if workoutIds.isEmpty { return }

            _ = try await client
                .from("exercises")
                .update(NameUpdate(name: trimmed))
                .eq("name", value: oldName)
                .in("workout_id", values: workoutIds)
                .execute()

            _ = try await client
                .from("personal_records")
                .update(ExerciseNameUpdate(exercise_name: trimmed))
                .eq("user_id", value: userId)
                .eq("exercise_name", value: oldName)
                .execute()
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    private struct ExerciseLibraryInsert: Encodable {
        let id: String
        let name: String
        let muscle_group: String
        let is_custom: Bool
        let user_id: String
        let exercise_db_id: String?
    }

    // Mirrors web's addCustomExercise (~L2237-2266), minus the opentraining-catalog image
    // matching (exercise_db_id always nil here), per this milestone's approved
    // "no exercise thumbnail images" scope decision.
    public func addCustomExercise(userId: String, name: String, muscleGroup: String) async throws -> ExerciseLibraryItem {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let searchRows = try await fetchExerciseLibraryRows(userId: userId, query: normalizedName, muscleGroup: muscleGroup)
            if let existing = Self.findExistingExercise(in: searchRows, name: normalizedName, muscleGroup: muscleGroup, userId: userId) {
                return existing
            }

            let item = ExerciseLibraryItem(
                id: UUID().uuidString.lowercased(), name: normalizedName, muscleGroup: muscleGroup,
                isCustom: true, userId: userId, exerciseDbId: nil
            )
            _ = try await client
                .from("exercise_library")
                .insert(ExerciseLibraryInsert(
                    id: item.id, name: item.name, muscle_group: item.muscleGroup,
                    is_custom: true, user_id: userId, exercise_db_id: nil
                ))
                .execute()
            return item
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}

private extension Array {
    func chunked(_ size: Int) -> [[Element]] {
        guard size > 0 else { return [self] }
        return stride(from: 0, to: count, by: size).map {
            Array(self[$0..<Swift.min($0 + size, count)])
        }
    }
}
