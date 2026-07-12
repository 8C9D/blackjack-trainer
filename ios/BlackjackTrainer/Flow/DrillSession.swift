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

    /// Whole-percent accuracy, or nil before the first answer.
    var accuracy: Int? {
        attempts == 0 ? nil : Int((Double(correct) / Double(attempts) * 100).rounded())
    }

    func record(_ correct: Bool) {
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
    }
}
