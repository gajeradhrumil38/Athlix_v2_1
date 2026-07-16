import Foundation
import AthlixCore

/// On-disk persistence for the in-progress `WorkoutDraft`, mirroring the web
/// app's `sessionStorage` in-progress-workout draft (8hr TTL), but as a JSON
/// file since there's no equivalent session storage on iOS. Local-only —
/// no cloud sync happens until the workout is finished.
///
/// Single-writer assumption: this type is `@MainActor`-confined and expects
/// all calls (a UI-triggered save, a periodic autosave timer, etc.) to come
/// from the main actor, serialized with the rest of the UI. It does no
/// internal locking/coordination and is NOT safe to call concurrently from
/// background queues — two overlapping `save()` calls could interleave their
/// `Data.write` calls despite `.atomic`, since atomicity only guarantees a
/// single write can't leave a half-written file, not that two concurrent
/// writers won't race to decide which one's content wins.
@MainActor
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

    /// Returns whether the write actually succeeded (encode + disk write),
    /// so callers that care — e.g. to log a failure or surface a subtle
    /// "not saved" indicator — can react. `@discardableResult` so existing
    /// fire-and-forget callers are unaffected.
    @discardableResult
    func save(_ draft: WorkoutDraft) -> Bool {
        guard let data = try? makeEncoder().encode(draft) else { return false }
        do {
            try data.write(to: fileURL, options: .atomic)
            return true
        } catch {
            return false
        }
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
