import Foundation

/// Bet sizing for the showdown, read side: the bet ladder, what a hand has at risk,
/// and what it returned. Split from `ShowdownModel` so neither file outgrows the
/// repo's length limits. The state and the mutators stay with the model — `bet` and
/// `phase` are `private(set)`, which is file-scoped.
@MainActor
extension ShowdownModel {
    var betOptions: [Double] {
        Bankroll.betOptions
    }

    /// A bet option the bankroll cannot back across every box is offered disabled,
    /// so the ladder stays legible as the stack shrinks.
    func betAffordable(_ option: Double) -> Bool {
        option * Double(spots) <= bankrollStore.bankroll
    }

    /// Chips already committed to the felt this round. Only the bankroll's free
    /// chips can back another bet, so a double or split has to fit inside them.
    var committed: Double {
        hands.reduce(0) { $0 + Bankroll.stake(bet: $1.bet, doubled: $1.doubled) }
    }

    func canPostAnotherBet(_ hand: PlayerHand) -> Bool {
        guard betting else { return true }
        return bankrollStore.bankroll - committed >= hand.bet
    }

    func stake(_ hand: PlayerHand) -> Double {
        Bankroll.stake(bet: hand.bet, doubled: hand.doubled)
    }

    /// Chips a settled hand returned. Zero until it settles.
    func payout(_ hand: PlayerHand) -> Double {
        guard let settlement = hand.settlement else { return 0 }
        return Bankroll.payout(settlement: settlement, bet: hand.bet, doubled: hand.doubled)
    }
}
