import Foundation
import Supabase

public protocol PersonalRecordRepository: Sendable {
    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord]
    func countNewPRs(userId: String, exerciseNames: [String], achievedOn date: String) async throws -> Int
}

public final class LivePersonalRecordRepository: PersonalRecordRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord] {
        do {
            let records: [PersonalRecord] = try await client
                .from("personal_records")
                .select()
                .eq("user_id", value: userId)
                .order("achieved_date", ascending: false)
                .execute()
                .value
            return records
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }

    // Fixes a real web-app bug: the web Finish sheet's client-side `isPR` flag is dead code, so it
    // always shows "0 PRs" even though the server-side RPC correctly upserts personal_records.
    // Since (user_id, exercise_name) is unique, a touched exercise "got a new PR on this save" iff
    // its personal_records row's achieved_date equals the workout's date -- if the RPC's upsert
    // condition didn't fire, the row's achieved_date stays at its prior value, not today's.
    public func countNewPRs(userId: String, exerciseNames: [String], achievedOn date: String) async throws -> Int {
        guard !exerciseNames.isEmpty else { return 0 }
        do {
            let records: [PersonalRecord] = try await client
                .from("personal_records")
                .select()
                .eq("user_id", value: userId)
                .in("exercise_name", values: exerciseNames)
                .eq("achieved_date", value: date)
                .execute()
                .value
            return records.count
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
