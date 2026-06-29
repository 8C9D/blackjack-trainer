import Foundation

/// A random initial-deal scenario: the player's two cards and the dealer upcard.
/// Mirrors the web `Scenario`.
struct Scenario: Equatable {
    let player: TwoCardHand
    let dealerUpcard: Card
}

/// Generates random initial-deal scenarios and card sequences. Cards are drawn
/// independently **with replacement** — duplicates are allowed by design (this
/// is a strategy trainer, not a deck simulation). Mirrors
/// `CardGeneratorService`; the random source is an injectable seam (RNG is not
/// domain logic — see the roadmap's parity strategy), defaulting to the system
/// generator.
struct CardGenerator {
    var random: () -> Double = { Double.random(in: 0 ..< 1) }

    /// A player two-card hand plus a dealer upcard.
    func generate() -> Scenario {
        Scenario(
            player: TwoCardHand(generateCard(), generateCard()),
            dealerUpcard: generateCard()
        )
    }

    /// A single random card drawn with replacement.
    func generateCard() -> Card {
        Card(rank: pick(Card.allRanks), suit: pick(Card.allSuits))
    }

    /// N independently-drawn random cards (with replacement).
    func generateSequence(_ count: Int) -> [Card] {
        (0 ..< max(0, count)).map { _ in generateCard() }
    }

    /// `Math.floor(random * length)` with a clamp so an out-of-range source can
    /// never index past the end.
    private func pick<Element>(_ items: [Element]) -> Element {
        let index = min(Int(random() * Double(items.count)), items.count - 1)
        return items[index]
    }
}
