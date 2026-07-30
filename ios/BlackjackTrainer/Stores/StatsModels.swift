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
    static let showdownBankroll = "blackjack-showdown-bankroll"

    // Flow redesign stores (additive; mirror the web's new localStorage keys).
    static let flowPrefs = "blackjack-flow-prefs"
    static let practiceHistory = "blackjack-practice-history"
    static let missTally = "blackjack-miss-tally"

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

/// The showdown's chip position when bet sizing is on. `wagered` is the total put
/// at risk and `net` the running result, so a session reads as "risked 320, up
/// 45" — the figures a bet-sizing drill is judged on. Mirrors `BankrollState`.
struct BankrollState: Codable, Equatable {
    var bankroll: Double
    var wagered: Double
    var net: Double

    static let empty = BankrollState(bankroll: Bankroll.defaultBankroll, wagered: 0, net: 0)

    var isValid: Bool {
        bankroll.isFinite
            && wagered.isFinite
            && net.isFinite
            && bankroll >= 0
            && wagered >= 0
            && bankroll == Bankroll.defaultBankroll + net
    }

    func recording(stake: Double, payout: Double) -> BankrollState {
        BankrollState(bankroll: bankroll + payout, wagered: wagered + stake, net: net + payout)
    }
}

/// Post-count showdown tally (win/lose/push + player naturals). Its own shape,
/// mirroring `ShowdownStats`. Chips live in `BankrollState`, alongside it.
struct ShowdownStats: Codable, Equatable {
    var hands: Int
    var wins: Int
    var losses: Int
    var pushes: Int
    var blackjacks: Int

    static let empty = ShowdownStats(hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0)

    var isValid: Bool {
        let values = [hands, wins, losses, pushes, blackjacks]
        return values.allSatisfy { $0 >= 0 }
            && wins + losses + pushes == hands
            && blackjacks <= wins
    }

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
