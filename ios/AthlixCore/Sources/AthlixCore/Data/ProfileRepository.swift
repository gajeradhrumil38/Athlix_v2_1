import Foundation
import Supabase

public protocol ProfileRepository: Sendable {
    func fetchProfile(userId: String) async throws -> Profile
}

public final class LiveProfileRepository: ProfileRepository, @unchecked Sendable {
    private let client: SupabaseClient

    public init(client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )) {
        self.client = client
    }

    // profiles.id (not a user_id column) is the primary key -- scope by "id".
    public func fetchProfile(userId: String) async throws -> Profile {
        do {
            let profile: Profile = try await client
                .from("profiles")
                .select()
                .eq("id", value: userId)
                .single()
                .execute()
                .value
            return profile
        } catch {
            throw RepositoryError.unknown("\(error)")
        }
    }
}
