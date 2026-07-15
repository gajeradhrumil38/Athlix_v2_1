import Foundation
import Supabase

public protocol BodyWeightRepository: Sendable {
    func fetchBodyWeightLogs(userId: String) async throws -> [BodyWeightLog]
}

public final class LiveBodyWeightRepository: BodyWeightRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    public func fetchBodyWeightLogs(userId: String) async throws -> [BodyWeightLog] {
        do {
            let logs: [BodyWeightLog] = try await client
                .from("body_weight_logs")
                .select()
                .eq("user_id", value: userId)
                .order("date", ascending: false)
                .execute()
                .value
            return logs
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
