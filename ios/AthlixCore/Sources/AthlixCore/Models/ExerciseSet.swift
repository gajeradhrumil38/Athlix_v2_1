import Foundation

public struct ExerciseSet: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let workoutId: String
    public let name: String
    public let muscleGroup: String?
    public let sets: Int
    public let reps: Int
    public let weight: Double
    public let unit: String
    public let orderIndex: Int
    public let exerciseDbId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case workoutId = "workout_id"
        case name
        case muscleGroup = "muscle_group"
        case sets, reps, weight, unit
        case orderIndex = "order_index"
        case exerciseDbId = "exercise_db_id"
    }
}
