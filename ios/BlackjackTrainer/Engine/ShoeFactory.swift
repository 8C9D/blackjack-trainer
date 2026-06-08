import Foundation

/// Builds and shuffles finite shoes for the live-shoe true-count trainer, the
/// Swift mirror of `ShoeService`. The randomness is an injectable seam (RNG is
/// not domain logic — see the parity strategy), so the Fisher–Yates shuffle is
/// deterministic in tests.
struct ShoeFactory {
    var random: () -> Double = { Double.random(in: 0 ..< 1) }

    /// Build, shuffle, and return a fresh shoe of the given size and penetration.
    func create(numberOfDecks: Int, penetration: Double) -> Shoe {
        var cards = buildShoeCards(numberOfDecks: numberOfDecks)
        shuffle(&cards)
        return Shoe(cards: cards, penetration: penetration)
    }

    /// In-place Fisher–Yates using the injected random source.
    private func shuffle(_ cards: inout [Card]) {
        guard cards.count > 1 else { return }
        for index in stride(from: cards.count - 1, to: 0, by: -1) {
            let swap = min(max(Int(random() * Double(index + 1)), 0), index)
            cards.swapAt(index, swap)
        }
    }
}
