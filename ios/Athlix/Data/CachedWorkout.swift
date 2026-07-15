import Foundation
import SwiftData
import AthlixCore

@Model
final class CachedWorkout {
    @Attribute(.unique) var id: String
    var userId: String
    var title: String
    var date: String
    var durationMinutes: Int?
    var notes: String?
    var muscleGroups: [String]?
    var createdAt: String
    var cachedAt: Date

    init(from workout: Workout) {
        self.id = workout.id
        self.userId = workout.userId
        self.title = workout.title
        self.date = workout.date
        self.durationMinutes = workout.durationMinutes
        self.notes = workout.notes
        self.muscleGroups = workout.muscleGroups
        self.createdAt = workout.createdAt
        self.cachedAt = Date()
    }

    var asWorkout: Workout {
        Workout(
            id: id, userId: userId, title: title, date: date,
            durationMinutes: durationMinutes, notes: notes,
            muscleGroups: muscleGroups, createdAt: createdAt
        )
    }
}
