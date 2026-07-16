import Foundation
import Supabase

public protocol TemplateRepository: Sendable {
    func fetchTemplates(userId: String) async throws -> [Template]
    func checkNameExists(userId: String, title: String, excludeId: String?) async throws -> Bool
    func saveTemplate(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String
    func deleteTemplate(userId: String, templateId: String) async throws
}

public final class LiveTemplateRepository: TemplateRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchTemplates(userId: String) async throws -> [Template] {
        do {
            let templates: [Template] = try await client
                .from("templates")
                .select("*, template_exercises(*)")
                .eq("user_id", value: userId)
                .order("created_at", ascending: false)
                .execute()
                .value
            return templates
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    public func checkNameExists(userId: String, title: String, excludeId: String?) async throws -> Bool {
        do {
            let query = client
                .from("templates")
                .select("id")
                .eq("user_id", value: userId)
                .ilike("title", pattern: title.trimmingCharacters(in: .whitespaces))
            if let excludeId {
                _ = query.neq("id", value: excludeId)
            }
            let rows: [[String: String]] = try await query.limit(1).execute().value
            return !rows.isEmpty
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    // If templateId == nil, attempt the RPC-based create path (save_template_with_exercises).
    // If templateId != nil, ALWAYS use the direct update path (title update + delete-then-insert
    // template_exercises) -- matching web's saveTemplate, which deliberately skips the RPC entirely
    // on update (the RPC may always INSERT a new row instead of updating).
    public func saveTemplate(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String {
        do {
            if templateId == nil {
                if let newId = try await createViaRPC(title: title, exercises: exercises) {
                    return newId
                }
                // fall through to the direct path if the RPC failed
            }
            return try await saveDirect(userId: userId, templateId: templateId, title: title, exercises: exercises)
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    private struct TemplateExercisePayload: Encodable {
        let name: String
        let muscle_group: String?
        let default_sets: Int
        let default_reps: Int
        let default_weight: Double
        let order_index: Int
        let exercise_db_id: String?
    }

    private struct RPCParams: Encodable {
        let p_template_id: String?
        let p_title: String
        let p_exercises: [TemplateExercisePayload]
    }

    private func createViaRPC(title: String, exercises: [TemplateExercise]) async throws -> String? {
        let payload = exercises.map {
            TemplateExercisePayload(
                name: $0.name, muscle_group: $0.muscleGroup, default_sets: $0.defaultSets,
                default_reps: $0.defaultReps, default_weight: $0.defaultWeight,
                order_index: $0.orderIndex, exercise_db_id: $0.exerciseDbId
            )
        }
        let params = RPCParams(p_template_id: nil, p_title: title, p_exercises: payload)
        return try? await client.rpc("save_template_with_exercises", params: params).execute().value
    }

    private struct TemplateRow: Encodable {
        let id: String
        let user_id: String
        let title: String
    }

    private struct TemplateExerciseInsert: Encodable {
        let id: String
        let template_id: String
        let name: String
        let muscle_group: String?
        let default_sets: Int
        let default_reps: Int
        let default_weight: Double
        let order_index: Int
        let exercise_db_id: String?
    }

    private func saveDirect(userId: String, templateId: String?, title: String, exercises: [TemplateExercise]) async throws -> String {
        let resolvedId = templateId ?? UUID().uuidString.lowercased()

        _ = try await client
            .from("templates")
            .upsert(TemplateRow(id: resolvedId, user_id: userId, title: title))
            .execute()

        _ = try await client
            .from("template_exercises")
            .delete()
            .eq("template_id", value: resolvedId)
            .execute()

        let rows = exercises.map { ex in
            TemplateExerciseInsert(
                id: UUID().uuidString.lowercased(), template_id: resolvedId, name: ex.name,
                muscle_group: ex.muscleGroup, default_sets: ex.defaultSets, default_reps: ex.defaultReps,
                default_weight: ex.defaultWeight, order_index: ex.orderIndex, exercise_db_id: ex.exerciseDbId
            )
        }
        if !rows.isEmpty {
            _ = try await client
                .from("template_exercises")
                .insert(rows)
                .execute()
        }

        return resolvedId
    }

    public func deleteTemplate(userId: String, templateId: String) async throws {
        do {
            _ = try await client
                .from("templates")
                .delete()
                .eq("id", value: templateId)
                .eq("user_id", value: userId)
                .execute()
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
