import Foundation

/// N-card, soft-aware hand evaluation shared by the showdown's dealer-play and
/// settlement logic. Mirrors `hand.model.ts`.
enum Hand {
    private struct Score {
        let total: Int
        let softAces: Int
    }

    /// Sum every ace as 11, then demote aces to 1 (−10 each) while the hand
    /// busts and an 11-valued ace remains. The leftover 11-valued ace count
    /// distinguishes a soft hand from a hard one.
    private static func score(_ cards: [Card]) -> Score {
        var total = 0
        var softAces = 0
        for card in cards {
            total += card.highValue
            if card.isAce { softAces += 1 }
        }
        while total > 21, softAces > 0 {
            total -= 10
            softAces -= 1
        }
        return Score(total: total, softAces: softAces)
    }

    /// The hand's best blackjack total (aces softened as needed). Empty hand → 0.
    static func total(_ cards: [Card]) -> Int {
        score(cards).total
    }

    /// A hand is soft when at least one ace is still counted as 11 in its best
    /// total. A busted hand is never soft.
    static func isSoft(_ cards: [Card]) -> Bool {
        let s = score(cards)
        return s.softAces > 0 && s.total <= 21
    }

    /// True once the hand's best total exceeds 21.
    static func isBust(_ cards: [Card]) -> Bool {
        score(cards).total > 21
    }

    /// A natural blackjack: exactly two cards totalling 21 (ace + ten-value).
    static func isBlackjack(_ cards: [Card]) -> Bool {
        cards.count == 2 && score(cards).total == 21
    }
}

/// Pair / soft / hard classification helpers for the initial two-card hand,
/// shared by the basic-strategy and deviation engines.
enum HandClassification {
    /// Pair key for two-card hands: ten-value pairs collapse to `"10"`, a
    /// matching rank yields that rank, otherwise `nil`. (A,A is a pair of aces.)
    static func pairKey(_ player: TwoCardHand) -> String? {
        let (a, b) = (player.first, player.second)
        if a.isTenValue, b.isTenValue { return "10" }
        if a.rank == b.rank { return a.rank.rawValue }
        return nil
    }

    /// Soft hand = exactly one ace among the two initial cards (A,A is a pair).
    static func isSoftTwoCard(_ player: TwoCardHand) -> Bool {
        player.first.isAce != player.second.isAce
    }

    /// Canonical hand label for the natural classification (the engine's
    /// `handDescription` when the hand resolves on its own category): pairs,
    /// soft totals, the A,10 natural, and hard totals.
    static func canonicalLabel(_ player: TwoCardHand) -> String {
        if let pair = pairKey(player) {
            switch pair {
            case "A": return "Pair of Aces"
            case "10": return "Pair of ten-value cards"
            default: return "Pair of \(pair)s"
            }
        }
        if isSoftTwoCard(player) {
            let nonAce = softNonAceValue(player)
            if nonAce == 10 { return "Blackjack (A + 10)" }
            return "Soft \(11 + nonAce) (A, \(nonAce))"
        }
        let total = player.first.highValue + player.second.highValue
        return "Hard \(total)"
    }
}
