import Foundation
import Observation

/// Per-round answer counters for a drill session: attempts, correct, the current
/// correct-streak, and the round's best streak. Reset when a new round starts
/// ("one more round"). Persistent stats live elsewhere — this is the peak-end
/// material for the Done screen and the top bar's streak chip. Mirrors the web
/// `DrillSession`.
@Observable
final class DrillSession {
    private(set) var attempts = 0
    private(set) var correct = 0
    private(set) var streak = 0
    private(set) var bestStreak = 0
    /// Every timed decision of the round, in the order they were answered.
    private(set) var times: [Int] = []

    /// Whole-percent accuracy, or nil before the first answer.
    var accuracy: Int? {
        attempts == 0 ? nil : Int((Double(correct) / Double(attempts) * 100).rounded())
    }

    /// Seconds for the round's middle decision, to one decimal, or nil when
    /// nothing was timed. The median rather than the mean because one interrupted
    /// hand — a doorbell inside a twenty-hand round — would otherwise decide the
    /// figure, and the round is small enough for that to matter.
    var medianSeconds: Double? {
        guard !times.isEmpty else { return nil }
        let sorted = times.sorted()
        let middle = sorted.count / 2
        let ms = sorted.count % 2 == 1
            ? Double(sorted[middle])
            : Double(sorted[middle - 1] + sorted[middle]) / 2
        return (ms / 100).rounded() / 10
    }

    func record(_ correct: Bool, elapsedMs: Int? = nil) {
        if let elapsedMs { times.append(elapsedMs) }
        attempts += 1
        if correct {
            self.correct += 1
            streak += 1
            bestStreak = max(bestStreak, streak)
        } else {
            streak = 0
        }
    }

    func reset() {
        attempts = 0
        correct = 0
        streak = 0
        bestStreak = 0
        times = []
    }
}
