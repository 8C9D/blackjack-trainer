import Testing
@testable import BlackjackTrainer

/// Slice 1.6 — showdown settlement (graded against showdown-vectors.json) and
/// the finite shoe (tested independently — RNG is a seam).
struct ShowdownParityTests {
    private func file() throws -> ShowdownVectorsFile {
        try Fixtures.load(ShowdownVectorsFile.self, "showdown-vectors")
    }

    @Test func dealerShouldHitMatches() throws {
        for testCase in try file().dealerShouldHitCases {
            let ruleSet = try #require(RuleSet(rawValue: testCase.ruleSet))
            let got = Showdown.dealerShouldHit(cards(testCase.hand), ruleSet: ruleSet)
            #expect(got == testCase.shouldHit,
                    "\(testCase.kind) \(testCase.total) \(testCase.ruleSet): got \(got)")
        }
    }

    @Test func playDealerHandMatches() throws {
        for testCase in try file().playCases {
            let ruleSet = try #require(RuleSet(rawValue: testCase.ruleSet))
            let queue = cards(testCase.draws)
            var next = 0
            let final = Showdown.playDealerHand(cards(testCase.initial), ruleSet: ruleSet) {
                defer { next += 1 }
                return next < queue.count ? queue[next] : nil
            }
            #expect(final.map(\.rank.rawValue) == testCase.finalHand, "case \(testCase.label)")
        }
    }

    @Test func settleMatches() throws {
        for testCase in try file().settleCases {
            let settlement = Showdown.settle(
                player: cards(testCase.player),
                dealer: cards(testCase.dealer)
            )
            let ok = settlement.outcome.rawValue == testCase.outcome
                && settlement.playerBlackjack == testCase.playerBlackjack
                && settlement.dealerBlackjack == testCase.dealerBlackjack
            #expect(ok, "case \(testCase.label): got \(settlement)")
        }
    }

    // MARK: shoe (independent of the parity vectors)

    @Test func shoeComposesAndDepletesWithoutReplacement() {
        let shoe = Shoe(cards: buildShoeCards(numberOfDecks: 1), penetration: 0.75)
        #expect(shoe.size == 52)
        #expect(shoe.cardsRemaining == 52)

        let dealt = shoe.deal(52)
        #expect(dealt.count == 52)
        // Each physical (rank, suit) appears exactly once — no replacement.
        #expect(Set(dealt).count == 52)
        #expect(shoe.cardsRemaining == 0)
        #expect(shoe.deal(5).isEmpty) // never deals past the bottom
    }

    @Test func shoeCutCardTriggersReshuffle() {
        let shoe = Shoe(cards: buildShoeCards(numberOfDecks: 1), penetration: 0.5)
        #expect(shoe.cutCardPosition == 26) // floor(52 * 0.5)
        _ = shoe.deal(25)
        #expect(!shoe.needsReshuffle)
        _ = shoe.deal(1)
        #expect(shoe.needsReshuffle)
    }

    @Test func shoeCarriesPositionAcrossDeals() {
        // Successive rounds continue from where dealing left off (so the running
        // count carries across rounds): two 10-card deals equal one 20-card deal.
        let split = Shoe(cards: buildShoeCards(numberOfDecks: 2), penetration: 0.75)
        let combined = split.deal(10) + split.deal(10)
        let whole = Shoe(cards: buildShoeCards(numberOfDecks: 2), penetration: 0.75)
        #expect(combined == whole.deal(20))
        #expect(split.cardsDealt == 20)
        #expect(split.decksRemaining == Double(104 - 20) / 52.0)
    }
}
