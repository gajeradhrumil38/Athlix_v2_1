import Foundation
import Supabase

public protocol WorkoutRepository: Sendable {
    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout]
    func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout
    func deleteWorkout(userId: String, workoutId: String) async throws
    func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws
    func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String])
}

public struct NewWorkoutExercise: Sendable {
    public let name: String
    public let muscleGroup: String?
    public let exerciseDbId: String?
    public let completedSets: [(reps: Int, weight: Double, unit: String)]
    public init(name: String, muscleGroup: String?, exerciseDbId: String?, completedSets: [(reps: Int, weight: Double, unit: String)]) {
        self.name = name; self.muscleGroup = muscleGroup; self.exerciseDbId = exerciseDbId; self.completedSets = completedSets
    }
}

public struct NewWorkoutInput: Sendable {
    public let title: String
    public let date: String
    public let durationMinutes: Int
    public let notes: String?
    public let exercises: [NewWorkoutExercise]
    public init(title: String, date: String, durationMinutes: Int, notes: String?, exercises: [NewWorkoutExercise]) {
        self.title = title; self.date = date; self.durationMinutes = max(0, durationMinutes)
        self.notes = notes; self.exercises = exercises
    }
}

public final class LiveWorkoutRepository: WorkoutRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withFullDate]
        do {
            let workouts: [Workout] = try await client
                .from("workouts")
                .select()
                .eq("user_id", value: userId)
                .gte("date", value: formatter.string(from: from))
                .lte("date", value: formatter.string(from: to))
                .order("date", ascending: false)
                .execute()
                .value
            return workouts
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    // MARK: - saveWorkout

    private struct CompletedSetPayload: Encodable {
        let reps: Int
        let weight: Double
        let unit: String
    }

    private struct WorkoutExercisePayload: Encodable {
        let name: String
        let muscle_group: String?
        let exercise_db_id: String?
        let completed_sets: [CompletedSetPayload]
    }

    private struct SaveWorkoutRPCParams: Encodable {
        let p_title: String
        let p_workout_date: String
        let p_duration_minutes: Int
        let p_notes: String?
        let p_exercises: [WorkoutExercisePayload]
    }

    // Mirrors web's saveWorkout (src/lib/supabaseData.ts ~L1571-1725): filter each exercise's
    // completed sets to only those with reps>0 or weight>0, drop exercises left with none, and
    // throw before any network call if nothing survives. Try the RPC first; on success, re-fetch
    // and return the workout row. On RPC failure, fall back to a direct insert path that also
    // recomputes per-exercise-name personal records (best-of by weight, then reps).
    public func saveWorkout(userId: String, input: NewWorkoutInput) async throws -> Workout {
        let validExercises: [(exercise: NewWorkoutExercise, sets: [(reps: Int, weight: Double, unit: String)])] =
            input.exercises.compactMap { ex in
                let sets = ex.completedSets.filter { $0.reps > 0 || $0.weight > 0 }
                return sets.isEmpty ? nil : (ex, sets)
            }
        if validExercises.isEmpty {
            throw RepositoryError.unknown("Complete at least one set before saving.")
        }

        let payload = validExercises.map { pair in
            WorkoutExercisePayload(
                name: pair.exercise.name,
                muscle_group: pair.exercise.muscleGroup,
                exercise_db_id: pair.exercise.exerciseDbId,
                completed_sets: pair.sets.map { CompletedSetPayload(reps: $0.reps, weight: $0.weight, unit: $0.unit) }
            )
        }
        let params = SaveWorkoutRPCParams(
            p_title: input.title, p_workout_date: input.date, p_duration_minutes: input.durationMinutes,
            p_notes: input.notes, p_exercises: payload
        )

        do {
            let workoutId: String = try await client.rpc("save_workout_with_sets", params: params).execute().value
            let workout: Workout = try await client
                .from("workouts")
                .select()
                .eq("id", value: workoutId)
                .single()
                .execute()
                .value
            return workout
        } catch {
            print("WorkoutRepository: RPC save failed, falling back to direct path: \(error)")
        }

        do {
            return try await saveWorkoutDirect(userId: userId, input: input, validExercises: validExercises)
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    private struct WorkoutRow: Encodable {
        let id: String
        let user_id: String
        let title: String
        let date: String
        let duration_minutes: Int
        let notes: String?
        let muscle_groups: [String]
    }

    private struct ExerciseInsert: Encodable {
        let id: String
        let workout_id: String
        let name: String
        let muscle_group: String?
        let sets: Int
        let reps: Int
        let weight: Double
        let unit: String
        let order_index: Int
        let exercise_db_id: String?
    }

    private struct PersonalRecordUpsert: Encodable {
        let id: String
        let user_id: String
        let exercise_name: String
        let best_weight: Double
        let best_reps: Int
        let achieved_date: String
        let created_at: String
        let exercise_db_id: String?
    }

    private func saveWorkoutDirect(
        userId: String, input: NewWorkoutInput,
        validExercises: [(exercise: NewWorkoutExercise, sets: [(reps: Int, weight: Double, unit: String)])]
    ) async throws -> Workout {
        let workoutId = UUID().uuidString.lowercased()
        let createdAt = ISO8601DateFormatter().string(from: Date())
        let muscleGroups = Array(Set(validExercises.compactMap { $0.exercise.muscleGroup }.filter { !$0.isEmpty }))

        _ = try await client
            .from("workouts")
            .upsert(WorkoutRow(
                id: workoutId, user_id: userId, title: input.title, date: input.date,
                duration_minutes: input.durationMinutes, notes: input.notes, muscle_groups: muscleGroups
            ), onConflict: "id")
            .execute()

        var rows: [ExerciseInsert] = []
        var order = 0
        var bestFromNewWorkout: [String: (weight: Double, reps: Int, exerciseDbId: String?)] = [:]

        for pair in validExercises {
            for set in pair.sets {
                rows.append(ExerciseInsert(
                    id: UUID().uuidString.lowercased(), workout_id: workoutId, name: pair.exercise.name,
                    muscle_group: pair.exercise.muscleGroup, sets: 1, reps: set.reps, weight: set.weight,
                    unit: set.unit, order_index: order, exercise_db_id: pair.exercise.exerciseDbId
                ))
                order += 1

                let candidate = (weight: set.weight, reps: set.reps, exerciseDbId: pair.exercise.exerciseDbId)
                if let existing = bestFromNewWorkout[pair.exercise.name] {
                    if candidate.weight > existing.weight ||
                        (candidate.weight == existing.weight && candidate.reps > existing.reps) {
                        bestFromNewWorkout[pair.exercise.name] = candidate
                    }
                } else {
                    bestFromNewWorkout[pair.exercise.name] = candidate
                }
            }
        }

        if !rows.isEmpty {
            _ = try await client.from("exercises").insert(rows).execute()
        }

        let exerciseNames = Array(bestFromNewWorkout.keys)
        let existingRecords: [PersonalRecord] = try await client
            .from("personal_records")
            .select()
            .eq("user_id", value: userId)
            .in("exercise_name", values: exerciseNames)
            .execute()
            .value
        let existingByName = Dictionary(uniqueKeysWithValues: existingRecords.map { ($0.exerciseName, $0) })

        var rowsToUpsert: [PersonalRecordUpsert] = []
        for (exerciseName, candidate) in bestFromNewWorkout {
            let existing = existingByName[exerciseName]
            let shouldReplace = existing == nil ||
                candidate.weight > existing!.bestWeight ||
                (candidate.weight == existing!.bestWeight && candidate.reps > existing!.bestReps)
            if !shouldReplace { continue }

            rowsToUpsert.append(PersonalRecordUpsert(
                id: existing?.id ?? UUID().uuidString.lowercased(), user_id: userId, exercise_name: exerciseName,
                best_weight: candidate.weight, best_reps: candidate.reps, achieved_date: input.date,
                created_at: existing?.createdAt ?? createdAt,
                exercise_db_id: candidate.exerciseDbId ?? existing?.exerciseDbId
            ))
        }
        if !rowsToUpsert.isEmpty {
            _ = try await client.from("personal_records").upsert(rowsToUpsert, onConflict: "id").execute()
        }

        return Workout(
            id: workoutId, userId: userId, title: input.title, date: input.date,
            durationMinutes: input.durationMinutes, notes: input.notes, muscleGroups: muscleGroups,
            createdAt: createdAt
        )
    }

    // MARK: - deleteWorkout

    public func deleteWorkout(userId: String, workoutId: String) async throws {
        do {
            _ = try await client
                .from("workouts")
                .delete()
                .eq("id", value: workoutId)
                .eq("user_id", value: userId)
                .execute()
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    // MARK: - renameWorkout

    private struct TitleUpdate: Encodable {
        let title: String
    }

    // Mirrors web's renameWorkout (~L1817-1826): trims the new title and no-ops (no network call
    // at all) if the trimmed result is blank. Does not compare against the current title.
    public func renameWorkout(userId: String, workoutId: String, newTitle: String) async throws {
        let trimmed = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return }
        do {
            _ = try await client
                .from("workouts")
                .update(TitleUpdate(title: trimmed))
                .eq("id", value: workoutId)
                .eq("user_id", value: userId)
                .execute()
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    // MARK: - updateWorkoutSets

    private struct WorkoutIdRow: Decodable {
        let id: String
    }

    private struct MuscleGroupsUpdate: Encodable {
        let muscle_groups: [String]
    }

    // Mirrors web's updateWorkoutSets (~L1743-1815): verify ownership first, filter exercises the
    // same way saveWorkout does, throw a distinct message if nothing survives, then replace all
    // exercise rows for the workout and recompute muscle_groups as the distinct non-empty set.
    public func updateWorkoutSets(userId: String, workoutId: String, exercises: [NewWorkoutExercise]) async throws -> (exercises: [ExerciseSet], muscleGroups: [String]) {
        do {
            let owned: [WorkoutIdRow] = try await client
                .from("workouts")
                .select("id")
                .eq("id", value: workoutId)
                .eq("user_id", value: userId)
                .execute()
                .value
            if owned.isEmpty {
                throw RepositoryError.unknown("Workout not found.")
            }

            let valid = exercises.compactMap { ex -> (exercise: NewWorkoutExercise, sets: [(reps: Int, weight: Double, unit: String)])? in
                let sets = ex.completedSets.filter { $0.reps > 0 || $0.weight > 0 }
                return sets.isEmpty ? nil : (ex, sets)
            }
            if valid.isEmpty {
                throw RepositoryError.unknown("Keep at least one set, or delete the workout instead.")
            }

            var rows: [ExerciseInsert] = []
            var order = 0
            for pair in valid {
                for set in pair.sets {
                    rows.append(ExerciseInsert(
                        id: UUID().uuidString.lowercased(), workout_id: workoutId, name: pair.exercise.name,
                        muscle_group: pair.exercise.muscleGroup, sets: 1, reps: set.reps, weight: set.weight,
                        unit: set.unit, order_index: order, exercise_db_id: pair.exercise.exerciseDbId
                    ))
                    order += 1
                }
            }

            _ = try await client.from("exercises").delete().eq("workout_id", value: workoutId).execute()
            if !rows.isEmpty {
                _ = try await client.from("exercises").insert(rows).execute()
            }

            let muscleGroups = Array(Set(valid.compactMap { $0.exercise.muscleGroup }.filter { !$0.isEmpty }))
            _ = try await client
                .from("workouts")
                .update(MuscleGroupsUpdate(muscle_groups: muscleGroups))
                .eq("id", value: workoutId)
                .eq("user_id", value: userId)
                .execute()

            let resultExercises = rows.map {
                ExerciseSet(
                    id: $0.id, workoutId: $0.workout_id, name: $0.name, muscleGroup: $0.muscle_group,
                    sets: $0.sets, reps: $0.reps, weight: $0.weight, unit: $0.unit,
                    orderIndex: $0.order_index, exerciseDbId: $0.exercise_db_id
                )
            }
            return (resultExercises, muscleGroups)
        } catch let error as RepositoryError {
            throw error
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
