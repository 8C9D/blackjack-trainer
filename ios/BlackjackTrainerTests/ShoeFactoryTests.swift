import Testing
@testable import BlackjackTrainer

/// The shoe factory is the live-shoe RNG seam; these check it preserves the deck
/// composition and is deterministic for a given random source.
struct ShoeFactoryTests {
    @Test func createPreservesCompositionAndSize() {
        let shoe = ShoeFactory(random: { 0.5 }).create(numberOfDecks: 2, penetration: 0.75)
        #expect(shoe.size == 104)
        let all = shoe.deal(104)
        #expect(all.count == 104)
        // Each rank appears 2 decks × 4 suits = 8 times after a shuffle.
        #expect(all.filter { $0.rank == .two }.count == 8)
        #expect(all.filter { $0.rank == .ace }.count == 8)
    }

    @Test func shuffleIsDeterministicForAGivenSource() {
        let first = ShoeFactory(random: seededSource()).create(numberOfDecks: 1, penetration: 0.75)
        let second = ShoeFactory(random: seededSource()).create(numberOfDecks: 1, penetration: 0.75)
        #expect(first.deal(52) == second.deal(52))
    }

    /// A small deterministic LCG in [0, 1), so two factories built from it shuffle
    /// identically.
    private func seededSource() -> () -> Double {
        var state: UInt64 = 0x2545_F491_4F6C_DD1D
        return {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            return Double(state >> 11) / Double(UInt64(1) << 53)
        }
    }
}
