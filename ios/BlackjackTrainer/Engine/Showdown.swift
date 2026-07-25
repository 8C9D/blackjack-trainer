import Foundation

/// Post-count showdown outcome.
enum ShowdownOutcome: String {
    case win
    case lose
    case push
}

struct Settlement: Equatable {
    let outcome: ShowdownOutcome
    /// The player won (or pushed) with a two-card natural (a real game pays 3:2).
    let playerBlackjack: Bool
    let dealerBlackjack: Bool
}

/// Pure dealer-play and settlement logic. Port of `showdown.model.ts`. Graded
/// against `showdown-vectors.json`; the live shoe (RNG seam) is tested
/// separately.
enum Showdown {
    /// Fewest cards for a single-box opening showdown hand (two player + two
    /// dealer).
    static let minShowdownCards = 4

    /// How many simultaneous boxes the player may occupy. One dealer plays
    /// against all of them from the same shoe.
    static let minShowdownSpots = 1
    static let maxShowdownSpots = 3

    /// Selectable box counts, for the settings picker.
    static let showdownSpotOptions = [1, 2, 3]

    /// Clamps a box count into the supported range. Mirrors the web `clampSpots`.
    static func clampSpots(_ spots: Int) -> Int {
        min(maxShowdownSpots, max(minShowdownSpots, spots))
    }

    /// Cards consumed by the opening deal for `spots` boxes: two per box plus the
    /// dealer's two. Mirrors the web `minCardsForSpots`.
    static func minCards(forSpots spots: Int) -> Int {
        clampSpots(spots) * 2 + 2
    }

    /// Whether the dealer must draw: hits anything under 17 and a soft 17 only
    /// under H17; stands on hard 17 and any total of 18+.
    static func dealerShouldHit(_ hand: [Card], ruleSet: RuleSet) -> Bool {
        let total = Hand.total(hand)
        if total < 17 { return true }
        if total > 17 { return false }
        return ruleSet == .h17 && Hand.isSoft(hand)
    }

    /// Play the dealer's hand to completion, drawing via the callback. Stops if
    /// the draw source is exhausted.
    static func playDealerHand(_ initial: [Card], ruleSet: RuleSet, draw: () -> Card?) -> [Card] {
        var hand = initial
        while dealerShouldHit(hand, ruleSet: ruleSet) {
            guard let card = draw() else { break }
            hand.append(card)
        }
        return hand
    }

    /// Resolve a finished player hand against a finished dealer hand. Naturals
    /// settle before bust logic; a player bust loses even if the dealer also
    /// busts; a dealer bust pays any standing hand; else higher total wins and
    /// equal totals push.
    /// `playerNatural` overrides whether the player hand counts as a natural
    /// blackjack (3:2); it defaults to a real two-card 21. Split hands pass
    /// `false`: a 21 made after splitting is not a natural and pays even money.
    static func settle(player: [Card], dealer: [Card],
                       playerNatural: Bool? = nil) -> Settlement {
        let playerBlackjack = playerNatural ?? Hand.isBlackjack(player)
        let dealerBlackjack = Hand.isBlackjack(dealer)

        if playerBlackjack || dealerBlackjack {
            let outcome: ShowdownOutcome = playerBlackjack && dealerBlackjack
                ? .push
                : (playerBlackjack ? .win : .lose)
            return Settlement(outcome: outcome, playerBlackjack: playerBlackjack,
                              dealerBlackjack: dealerBlackjack)
        }

        if Hand.isBust(player) {
            return Settlement(outcome: .lose, playerBlackjack: playerBlackjack,
                              dealerBlackjack: dealerBlackjack)
        }
        if Hand.isBust(dealer) {
            return Settlement(outcome: .win, playerBlackjack: playerBlackjack,
                              dealerBlackjack: dealerBlackjack)
        }

        let playerTotal = Hand.total(player)
        let dealerTotal = Hand.total(dealer)
        let outcome: ShowdownOutcome = playerTotal > dealerTotal
            ? .win
            : (playerTotal < dealerTotal ? .lose : .push)
        return Settlement(outcome: outcome, playerBlackjack: playerBlackjack,
                          dealerBlackjack: dealerBlackjack)
    }
}
