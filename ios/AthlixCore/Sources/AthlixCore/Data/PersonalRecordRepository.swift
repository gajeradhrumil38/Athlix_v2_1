import Foundation
import Supabase

public protocol PersonalRecordRepository: Sendable {
    func fetchPersonalRecords(userId: String) async throws -> [PersonalRecord]
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
}
