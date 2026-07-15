import Foundation
import Supabase

public protocol WorkoutRepository: Sendable {
    func fetchWorkouts(userId: String, from: Date, to: Date) async throws -> [Workout]
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
}
