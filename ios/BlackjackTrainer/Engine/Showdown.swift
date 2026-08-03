import Foundation

/// The verdict on one decision at the table, as the felt shows it. The headline
/// is a sentence rather than an `Action` because not every decision here is one:
/// declining insurance is a correct play with no action to name. Mirrors the web
/// `PlayVerdict`.
struct PlayVerdict: Equatable {
    let correct: Bool
    let headline: String
    let reason: String
}

/// Whether the count the showdown is carrying can be graded against, and how.
///
/// The insurance index is a Hi-Lo true count and the playing indices are the
/// same — a level-2 or fractional system reads a different number off the same
/// shoe (see `DeviationIndexSystem.note`). KO is the one other system the app can
/// grade, because its book publishes a running-count schedule of its own.
/// Everything else is dealt and settled exactly as before, ungraded, rather than
/// scored against numbers that are not its own. Mirrors the web `CountBasis`.
/// This system's own true count, or nil when it has none to read.
///
/// Kept apart from `CountBasis` because the two questions are different. A
/// deviation index is a Hi-Lo number, so only Hi-Lo may be graded against it. A
/// bet ramp is the player's own, indexed by whatever true count they are keeping
/// — so any balanced system qualifies, exactly as the bet-spread drill allows.
/// Mirrors the web `trueCountFor`.
func trueCountFor(system: CountingSystem?, runningCount: Double,
                  decksRemaining: Double) -> Int? {
    guard let system, system.balanced, decksRemaining > 0 else { return nil }
    return Int((runningCount / decksRemaining).rounded(.towardZero))
}

enum CountBasis: Equatable {
    case trueCount(Int)
    case runningCount(count: Double, insuranceAt: Int)
    case ungraded

    /// The basis for a system, the count as the player can see it, and how much
    /// shoe is left. Mirrors `countBasisFor`.
    static func of(system: CountingSystem?, runningCount: Double,
                   decksRemaining: Double) -> CountBasis {
        guard let system else { return .ungraded }
        if system.id == DeviationIndexSystem.id {
            // A shoe dealt to the felt has no decks left to divide by; nothing is
            // dealt from it either, so the value is never actually consumed.
            guard decksRemaining > 0 else { return .ungraded }
            return .trueCount(Int((runningCount / decksRemaining).rounded(.towardZero)))
        }
        guard let insuranceAt = system.keyCounts?.insuranceCount else { return .ungraded }
        return .runningCount(count: runningCount, insuranceAt: insuranceAt)
    }

    /// The true count the Hi-Lo index is tested against; zero when this basis
    /// carries no true count, where the verdict comes from the running-count
    /// schedule instead and the index is never consulted.
    var trueCountForIndex: Int {
        if case let .trueCount(value) = self { return value }
        return 0
    }

    /// Whether the count says to take insurance, or nil when this system's count
    /// is not one the app can grade. The Hi-Lo threshold is not written here: it
    /// is read off the deviation chart by the caller, which is where the index
    /// lives. Mirrors `insuranceIsCorrect`.
    func insuranceIsCorrect(hiLoThresholdMet: Bool) -> Bool? {
        switch self {
        case .trueCount: hiLoThresholdMet
        case let .runningCount(count, insuranceAt): count >= Double(insuranceAt)
        case .ungraded: nil
        }
    }
}

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
