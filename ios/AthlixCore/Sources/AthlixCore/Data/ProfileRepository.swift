import Foundation
import Supabase

/// A narrow partial-update surface for `Profile` -- only the fields this
/// milestone's fixes actually need to write (live unit-preference toggle,
/// Quick Start gating). NOT a general profile-editing API; add fields here
/// only when a specific caller needs to write them.
public struct ProfileUpdate: Sendable {
    public var unitPreference: WeightUnit?
    public var showStartSheet: Bool?

    public init(unitPreference: WeightUnit? = nil, showStartSheet: Bool? = nil) {
        self.unitPreference = unitPreference
        self.showStartSheet = showStartSheet
    }

    // Only non-nil fields are included so an unset field isn't sent as an
    // explicit `null` and doesn't overwrite the server-side value.
    func encodablePayload() -> JSONObject {
        var payload: JSONObject = [:]
        if let unitPreference {
            payload["unit_preference"] = .string(unitPreference.rawValue)
        }
        if let showStartSheet {
            payload["show_start_sheet"] = .bool(showStartSheet)
        }
        return payload
    }
}

public protocol ProfileRepository: Sendable {
    func fetchProfile(userId: String) async throws -> Profile
    func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile
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

    public func updateProfile(userId: String, updates: ProfileUpdate) async throws -> Profile {
        do {
            let profile: Profile = try await client
                .from("profiles")
                .update(updates.encodablePayload())
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
