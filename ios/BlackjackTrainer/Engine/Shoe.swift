import Foundation

enum ShoeConstants {
    static let cardsPerDeck = 52
    /// Shoe sizes offered: single/double-deck plus the common 6/8-deck shoes.
    static let deckOptions = [1, 2, 6, 8]
    static let defaultNumberOfDecks = 6
    static let penetrationPresets = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]
    static let minPenetration = 0.5
    static let maxPenetration = 0.9
    static let defaultPenetration = 0.75
}

/// Build an ordered N-deck multiset: 52×N cards, one of every rank × suit per
/// deck. Kept pure so tests can assert the pre-shuffle composition.
func buildShoeCards(numberOfDecks: Int) -> [Card] {
    var cards: [Card] = []
    for _ in 0 ..< numberOfDecks {
        for rank in Card.allRanks {
            for suit in Card.allSuits {
                cards.append(Card(rank: rank, suit: suit))
            }
        }
    }
    return cards
}

/// A finite, depleting shoe. Each physical card is dealt exactly once;
/// `decksRemaining` is measured to the bottom of the shoe, while the cut card
/// (at `penetration` of the shoe) flags when a reshuffle is due. Port of
/// `shoe.model.ts`.
final class Shoe {
    private let cards: [Card]
    private var index = 0

    let size: Int
    /// Number of cards dealt at which the cut card surfaces.
    let cutCardPosition: Int

    init(cards: [Card], penetration: Double) {
        self.cards = cards
        size = cards.count
        let raw = Int((Double(cards.count) * penetration).rounded(.down))
        cutCardPosition = min(max(raw, 1), cards.count)
    }

    var cardsDealt: Int {
        index
    }

    var cardsRemaining: Int {
        size - index
    }

    /// Decks remaining to the bottom of the shoe (not to the cut card).
    var decksRemaining: Double {
        Double(cardsRemaining) / Double(ShoeConstants.cardsPerDeck)
    }

    /// True once dealing reaches or passes the cut card.
    var needsReshuffle: Bool {
        index >= cutCardPosition
    }

    /// Deal up to `n` cards without replacement, never past the bottom.
    func deal(_ n: Int) -> [Card] {
        let count = max(0, min(n, cardsRemaining))
        let dealt = Array(cards[index ..< (index + count)])
        index += count
        return dealt
    }
}
