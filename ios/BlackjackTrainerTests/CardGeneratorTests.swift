import Testing
@testable import BlackjackTrainer

/// The card generator is the RNG seam (not domain logic); these lock down its
/// index math against the web's `Math.floor(random * length)` with replacement.
struct CardGeneratorTests {
    /// A scripted random source returning the given values in order, then 0.
    private func source(_ values: [Double]) -> () -> Double {
        var index = 0
        return {
            defer { index += 1 }
            return index < values.count ? values[index] : 0
        }
    }

    /// Mid-bin fraction that maps to `index` for a list of `count` items,
    /// robust to floating-point rounding at bin boundaries.
    private func frac(_ index: Int, of count: Int) -> Double {
        (Double(index) + 0.5) / Double(count)
    }

    @Test func zeroPicksFirstRankAndSuit() {
        let card = CardGenerator(random: source([0, 0])).generateCard()
        #expect(card.rank == .two)
        #expect(card.suit == .spades)
    }

    @Test func nearOnePicksLastRankAndSuit() {
        let card = CardGenerator(random: source([0.999, 0.999])).generateCard()
        #expect(card.rank == .ace)
        #expect(card.suit == .clubs)
    }

    @Test func generateDrawsPlayerThenDealerInOrder() {
        let generator = CardGenerator(random: source([
            frac(0, of: 13), frac(0, of: 4), // player card 1 → 2♠
            frac(6, of: 13), frac(0, of: 4), // player card 2 → 8♠
            frac(12, of: 13), frac(0, of: 4) // dealer upcard → A♠
        ]))
        let scenario = generator.generate()
        #expect(scenario.player.first.rank == .two)
        #expect(scenario.player.second.rank == .eight)
        #expect(scenario.dealerUpcard.rank == .ace)
    }

    @Test func generateSequenceHasRequestedLength() {
        let generator = CardGenerator(random: source([]))
        #expect(generator.generateSequence(5).count == 5)
        #expect(generator.generateSequence(0).isEmpty)
        #expect(generator.generateSequence(-3).isEmpty)
    }
}
