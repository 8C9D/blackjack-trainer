import Foundation

/// localStorage-parity storage keys (the iOS app reuses the web app's keys for
/// conceptual parity; the values are Codable JSON in UserDefaults per D4).
enum StatsKeys {
    static let basicStrategy = "blackjack-basic-strategy-stats"
    static let cardCounting = "blackjack-card-counting-stats" // running count
    static let trueCount = "blackjack-true-count-stats"
    static let deviation = "blackjack-deviation-stats"
    static let deckEstimation = "blackjack-deck-estimation-stats"

    // Flow redesign stores (additive; mirror the web's new localStorage keys).
    static let flowPrefs = "blackjack-flow-prefs"
    static let practiceHistory = "blackjack-practice-history"
    static let missTally = "blackjack-miss-tally"
    static let countDrift = "blackjack-count-drift" // which side a running count lands on

    /// Keys from earlier versions, wiped once at launch. Keys belonging to
    /// archived features (deck speed, key count, bet spread, the showdown) are
    /// deliberately NOT listed: their stored data stays on disk untouched.
    static let legacy = ["blackjack-trainer:stats:v1"]
}

/// Correct/incorrect session stats shared by the trainers and the deck-
/// estimation panel. Mirrors `SessionStats` in stats-store.ts.
struct SessionStats: Codable, Equatable {
    var attempts: Int
    var correct: Int
    var streak: Int
    var longestStreak: Int

    static let empty = SessionStats(attempts: 0, correct: 0, streak: 0, longestStreak: 0)

    var isValid: Bool {
        let values = [attempts, correct, streak, longestStreak]
        return values.allSatisfy { $0 >= 0 }
            && correct <= attempts
            && streak <= correct
            && longestStreak <= correct
            && streak <= longestStreak
    }

    /// The next stats after recording an attempt (streak resets on a miss).
    func recording(correct: Bool) -> SessionStats {
        let nextStreak = correct ? streak + 1 : 0
        return SessionStats(
            attempts: attempts + 1,
            correct: self.correct + (correct ? 1 : 0),
            streak: nextStreak,
            longestStreak: max(longestStreak, nextStreak)
        )
    }
}
