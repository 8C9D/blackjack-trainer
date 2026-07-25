import Foundation

/// How a settled showdown reads: one verdict line per hand and a round tally.
/// Split from `ShowdownModel` so neither file outgrows the repo's length limits.
/// Mirrors the web `ShowdownComponent`'s `verdict` / `roundSummary`.
@MainActor
extension ShowdownModel {
    /// Backward-compatible views of the active/first hand for the single-hand path.
    var playerCards: [Card] {
        activeHand?.cards ?? []
    }

    var playerTotal: Int {
        Hand.total(playerCards)
    }

    var settlement: Settlement? {
        hands.first?.settlement
    }

    var doubled: Bool {
        activeHand?.doubled ?? false
    }

    var dealerTotal: Int {
        Hand.total(dealerCards)
    }

    var dealerUpcard: Card? {
        dealerCards.first
    }

    /// One-line tally of a finished multi-hand round ("2 won, 1 lost"). Empty for
    /// a single hand, whose own verdict line already says everything.
    var roundSummary: String {
        let outcomes = hands.compactMap(\.settlement?.outcome)
        guard outcomes.count > 1 else { return "" }
        let count = { (outcome: ShowdownOutcome) in outcomes.filter { $0 == outcome }.count }
        var parts: [String] = []
        if count(.win) > 0 { parts.append("\(count(.win)) won") }
        if count(.lose) > 0 { parts.append("\(count(.lose)) lost") }
        if count(.push) > 0 { parts.append("\(count(.push)) pushed") }
        return parts.joined(separator: ", ")
    }

    func verdict(_ hand: PlayerHand) -> String {
        guard let result = hand.settlement else { return "" }
        let doubledSuffix = hand.doubled ? " (doubled)" : ""
        switch result.outcome {
        case .win:
            let base = result.playerBlackjack ? "Blackjack! You win (pays 3:2)." : "You win!"
            return base + doubledSuffix
        case .lose:
            if Hand.isBust(hand.cards) { return "Bust — dealer wins." + doubledSuffix }
            return result.dealerBlackjack
                ? "Dealer blackjack — dealer wins."
                : "Dealer wins." + doubledSuffix
        case .push:
            let base = result.playerBlackjack && result.dealerBlackjack
                ? "Push — both blackjack." : "Push."
            return base + doubledSuffix
        }
    }
}
