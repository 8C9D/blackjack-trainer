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

    /// Fallback bet sizes for a table with no spread behind it (a preview, or a
    /// spec that does not care). A 1-to-25 range is what a counter varies across.
    static let betOptions = [1.0, 2.0, 5.0, 10.0, 25.0]

    static let minBet = 1.0

    /// The rungs the round's bet control offers. A counter rehearses the spread
    /// they intend to play, so the table offers exactly that spread — the ramp's
    /// own unit values at one chip per unit — rather than a generic chip tray
    /// whose rungs the ramp cannot land on. Without this the bet could never be
    /// graded: a spread calling for 4 units has nothing to put out on a
    /// 1/2/5/10/25 tray. Mirrors the web `betOptionsFor`.
    static func betOptions(for ramp: [Int]) -> [Double] {
        let rungs = Set(ramp).filter { Double($0) >= minBet }.sorted().map(Double.init)
        return rungs.isEmpty ? [minBet] : rungs
    }

    /// Clamp a bet to something playable: at least the minimum, never more than
    /// the bankroll can cover, and a whole number of chips.
    static func clampBet(_ bet: Double, bankroll: Double) -> Double {
        guard bet.isFinite else { return minBet }
        let affordable = max(minBet, bankroll.rounded(.down))
        return min(affordable, max(minBet, bet.rounded(.down)))
    }

    /// The largest offered rung the bankroll still covers, so the bet control can
    /// fall back sensibly after a losing streak.
    static func largestAffordableBet(_ bankroll: Double,
                                     options: [Double] = betOptions) -> Double {
        options.last { $0 <= bankroll } ?? minBet
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

    /// Surrendering forfeits half the bet and returns the rest. It is only ever
    /// the single opening bet at stake: surrender is a first decision, so no
    /// doubled or split stake can exist behind it.
    static func surrenderForfeit(bet: Double) -> Double {
        -(bet / 2)
    }

    /// Insurance is a side bet of half the box's bet, offered when the dealer
    /// shows an ace. Half of an odd bet is a genuine half chip, matching 3:2.
    static func insuranceCost(bet: Double) -> Double {
        bet / 2
    }

    /// Net chips an insurance bet returns: it pays 2:1 when the dealer turns over
    /// a natural (so it exactly covers the bet the hand is about to lose), and is
    /// forfeited otherwise.
    static func insurancePayout(bet: Double, dealerBlackjack: Bool) -> Double {
        let cost = insuranceCost(bet: bet)
        return dealerBlackjack ? cost * 2 : -cost
    }
}
