import Foundation
import AthlixCore

/// On-disk persistence for the in-progress `WorkoutDraft`, mirroring the web
/// app's `sessionStorage` in-progress-workout draft (8hr TTL), but as a JSON
/// file since there's no equivalent session storage on iOS. Local-only —
/// no cloud sync happens until the workout is finished.
struct WorkoutDraftStore {
    private let fileURL: URL
    private let ttl: TimeInterval = 8 * 3600

    init(directory: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.fileURL = directory.appendingPathComponent("athlix_active_workout.json")
    }

    private func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        // Must match WorkoutDraftTests' encoding strategy in AthlixCore so
        // Date round-trips exactly through disk without precision loss.
        encoder.dateEncodingStrategy = .secondsSince1970
        return encoder
    }

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return decoder
    }

    func save(_ draft: WorkoutDraft) {
        guard let data = try? makeEncoder().encode(draft) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    func load() -> WorkoutDraft? {
        guard let data = try? Data(contentsOf: fileURL),
              let draft = try? makeDecoder().decode(WorkoutDraft.self, from: data) else { return nil }
        if draft.isExpired(now: Date(), ttl: ttl) {
            clear()
            return nil
        }
        return draft
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
