import Foundation

/// Pure betting math for the post-count showdown, ported from the web
/// `bankroll.model.ts` (the source of truth) and checked against the
/// `payoutCases` / `betClampCases` vectors in `showdown-vectors.json`.
///
/// Chips are abstract units, not a currency: what is being drilled is the *ratio*
/// between a bet and the bankroll, so only the spread matters.
enum Bankroll {
    /// Chips a fresh bankroll starts with.
    static let defaultBankroll = 500.0

    /// Selectable bet sizes. A 1-to-25 spread is the range a counter actually
    /// varies across, which is the skill being drilled.
    static let betOptions = [1.0, 2.0, 5.0, 10.0, 25.0]

    static let minBet = 1.0

    /// Clamp a bet to something playable: at least the minimum, never more than
    /// the bankroll can cover, and a whole number of chips.
    static func clampBet(_ bet: Double, bankroll: Double) -> Double {
        guard bet.isFinite else { return minBet }
        let affordable = max(minBet, bankroll.rounded(.down))
        return min(affordable, max(minBet, bet.rounded(.down)))
    }

    /// The largest of `betOptions` the bankroll still covers, so the bet control
    /// can fall back sensibly after a losing streak.
    static func largestAffordableBet(_ bankroll: Double) -> Double {
        betOptions.last { $0 <= bankroll } ?? minBet
    }

    /// Chips at risk on a hand: a double puts a second bet up alongside the first.
    static func stake(bet: Double, doubled: Bool) -> Double {
        doubled ? bet * 2 : bet
    }

    /// Net chips a settled hand returns, relative to the bet already committed: a
    /// win pays the stake, a natural pays 3:2 *on the bet*, a push returns the
    /// stake (net zero), and a loss forfeits it. A natural settles at the deal and
    /// so can never be doubled, which is why the 3:2 branch reads `bet`.
    static func payout(settlement: Settlement, bet: Double, doubled: Bool) -> Double {
        let atRisk = stake(bet: bet, doubled: doubled)
        switch settlement.outcome {
        case .push: return 0
        case .lose: return -atRisk
        case .win: return settlement.playerBlackjack ? bet * 1.5 : atRisk
        }
    }
}
