import Foundation

/// localStorage-parity storage keys (the iOS app reuses the web app's keys for
/// conceptual parity; the values are Codable JSON in UserDefaults per D4).
enum StatsKeys {
    static let basicStrategy = "blackjack-basic-strategy-stats"
    static let cardCounting = "blackjack-card-counting-stats" // running count
    static let trueCount = "blackjack-true-count-stats"
    static let deviation = "blackjack-deviation-stats"
    static let deckEstimation = "blackjack-deck-estimation-stats"
    static let showdown = "blackjack-showdown-stats"

    /// Keys from earlier versions, wiped once at launch.
    static let legacy = ["blackjack-trainer:stats:v1"]
}

/// Correct/incorrect session stats shared by the four trainers and the deck-
/// estimation panel. Mirrors `SessionStats` in stats-store.ts.
struct SessionStats: Codable, Equatable {
    var attempts: Int
    var correct: Int
    var streak: Int
    var longestStreak: Int

    static let empty = SessionStats(attempts: 0, correct: 0, streak: 0, longestStreak: 0)

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

/// Post-count showdown tally (win/lose/push + player naturals). Its own shape,
/// mirroring `ShowdownStats`. No money or bet sizing is tracked.
struct ShowdownStats: Codable, Equatable {
    var hands: Int
    var wins: Int
    var losses: Int
    var pushes: Int
    var blackjacks: Int

    static let empty = ShowdownStats(hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0)

    func recording(outcome: ShowdownOutcome, playerBlackjack: Bool = false) -> ShowdownStats {
        ShowdownStats(
            hands: hands + 1,
            wins: wins + (outcome == .win ? 1 : 0),
            losses: losses + (outcome == .lose ? 1 : 0),
            pushes: pushes + (outcome == .push ? 1 : 0),
            blackjacks: blackjacks + (outcome == .win && playerBlackjack ? 1 : 0)
        )
    }
}
