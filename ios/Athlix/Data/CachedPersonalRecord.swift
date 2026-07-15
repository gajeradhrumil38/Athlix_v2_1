import Foundation
import SwiftData
import AthlixCore

@Model
final class CachedPersonalRecord {
    @Attribute(.unique) var id: String
    var userId: String
    var exerciseName: String
    var bestWeight: Double
    var bestReps: Int
    var achievedDate: String
    var createdAt: String
    var exerciseDbId: String?
    var cachedAt: Date

    init(from record: PersonalRecord) {
        self.id = record.id
        self.userId = record.userId
        self.exerciseName = record.exerciseName
        self.bestWeight = record.bestWeight
        self.bestReps = record.bestReps
        self.achievedDate = record.achievedDate
        self.createdAt = record.createdAt
        self.exerciseDbId = record.exerciseDbId
        self.cachedAt = Date()
    }

    var asPersonalRecord: PersonalRecord {
        PersonalRecord(
            id: id, userId: userId, exerciseName: exerciseName,
            bestWeight: bestWeight, bestReps: bestReps,
            achievedDate: achievedDate, createdAt: createdAt, exerciseDbId: exerciseDbId
        )
    }
}
