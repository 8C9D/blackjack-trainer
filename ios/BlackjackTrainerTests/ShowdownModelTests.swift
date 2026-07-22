import Foundation
import Testing
@testable import BlackjackTrainer

/// Exercises the post-count showdown loop over a stacked (deterministic) shoe.
/// The settlement math itself is covered by the 1.6 parity sweep.
@MainActor
struct ShowdownModelTests {
    private func store() -> ShowdownStatsStore {
        let suite = "showdown-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults)
    }

    /// A shoe stacked so the opening deal (player, dealer, player, dealer) yields
    /// the given hands, followed by filler so draws never run dry.
    private func stackedShoe(
        player: [Card],
        dealer: [Card],
        filler: Card = Card(rank: .five, suit: .clubs)
    ) -> Shoe {
        var cards = [player[0], dealer[0], player[1], dealer[1]]
        cards.append(contentsOf: Array(repeating: filler, count: 20))
        return Shoe(cards: cards, penetration: 0.9)
    }

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// A shoe dealing the given cards in order (opening: player, dealer, player,
    /// dealer; then split/hit draws), padded so nothing runs dry.
    private func stacked(_ cards: [Card]) -> Shoe {
        Shoe(
            cards: cards + Array(repeating: Card(rank: .five, suit: .clubs), count: 10),
            penetration: 0.9
        )
    }

    @Test func playerHigherTotalStandsAndWins() {
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .king, suit: .spades), Card(rank: .queen, suit: .diamonds)], // 20
            dealer: [Card(rank: .ten, suit: .hearts), Card(
                rank: .seven,
                suit: .clubs
            )] // 17, stands
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        #expect(model.phase == .playerTurn)
        model.onAction(.stand)
        #expect(model.phase == .resolved)
        #expect(model.settlement?.outcome == .win)
        #expect(model.showdownStats.wins == 1)
        #expect(model.showdownStats.hands == 1)
    }

    @Test func playerNaturalResolvesImmediatelyAsBlackjack() {
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .ace, suit: .spades), Card(
                rank: .king,
                suit: .diamonds
            )], // blackjack
            dealer: [Card(rank: .ten, suit: .hearts), Card(rank: .seven, suit: .clubs)]
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        #expect(model.phase == .resolved) // a natural settles on the deal
        #expect(model.settlement?.outcome == .win)
        #expect(model.settlement?.playerBlackjack == true)
        #expect(model.showdownStats.blackjacks == 1)
    }

    @Test func playerBustLoses() {
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .ten, suit: .spades), Card(rank: .six, suit: .diamonds)], // 16
            dealer: [Card(rank: .ten, suit: .hearts), Card(rank: .seven, suit: .clubs)],
            filler: Card(rank: .king, suit: .clubs) // hitting draws a ten-value → bust
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        #expect(model.phase == .playerTurn)
        model.onAction(.hit)
        #expect(model.phase == .resolved)
        #expect(model.settlement?.outcome == .lose)
        #expect(model.showdownStats.losses == 1)
    }

    @Test func dealsInWebAlternatingOrder() {
        // Distinct-value cards where the deal order changes the outcome. Stacked
        // shoe top four = 10♠, A♥, 6♦, 10♣. Alternating (player, dealer, player,
        // dealer, matching web) gives player 10♠+6♦ = hard 16 vs dealer A♥+10♣ =
        // natural 21, so the player LOSES. The wrong player,player,dealer,dealer
        // order would hand the player 10♠+A♥ = a blackjack and a win instead.
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .ten, suit: .spades), Card(rank: .six, suit: .diamonds)],
            dealer: [Card(rank: .ace, suit: .hearts), Card(rank: .ten, suit: .clubs)]
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        #expect(model.phase == .resolved) // dealer natural settles on the deal
        #expect(model.settlement?.outcome == .lose)
        #expect(model.settlement?.playerBlackjack == false)
    }

    @Test func doubleIsOfferedOnlyOnTheOpeningHand() {
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .nine, suit: .spades), Card(rank: .seven, suit: .diamonds)], // 16
            dealer: [Card(rank: .ten, suit: .hearts), Card(rank: .two, suit: .clubs)],
            filler: Card(rank: .five, suit: .clubs) // hit → 21, no bust
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        #expect(model.canDouble)
        model.onAction(.hit)
        #expect(model.playerCards.count == 3)
        #expect(!model.canDouble) // no Double after a hit
    }

    @Test func doubleTakesOneCardAndMarksTheWinDoubled() throws {
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .five, suit: .spades), Card(rank: .six, suit: .diamonds)], // 11
            dealer: [Card(rank: .ten, suit: .hearts), Card(rank: .seven, suit: .clubs)], // 17
            filler: Card(rank: .king, suit: .clubs) // double draws a ten → 21
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        model.onAction(.double)
        #expect(model.doubled)
        #expect(model.playerCards.count == 3) // exactly one card taken
        #expect(model.phase == .resolved)
        #expect(model.settlement?.outcome == .win)
        #expect(try model.verdict(#require(model.hands.first)).contains("(doubled)"))
    }

    @Test func doubleThatBustsLoses() {
        let stats = store()
        let shoe = stackedShoe(
            player: [Card(rank: .ten, suit: .spades), Card(rank: .six, suit: .diamonds)], // 16
            dealer: [Card(rank: .ten, suit: .hearts), Card(rank: .seven, suit: .clubs)],
            filler: Card(rank: .king, suit: .clubs) // double draws a ten → 26 bust
        )
        let model = ShowdownModel(shoe: shoe, ruleSet: .s17, stats: stats)
        model.onAction(.double)
        #expect(model.phase == .resolved)
        #expect(model.settlement?.outcome == .lose)
        #expect(model.showdownStats.losses == 1)
    }

    @Test func doesNotOfferSplitOnANonPair() {
        let stats = store()
        let model = ShowdownModel(
            shoe: stacked([card(.nine), card(.ten, .hearts), card(.seven), card(.six)]),
            ruleSet: .s17, stats: stats
        )
        #expect(!model.canSplit) // 9,7 is not a pair
    }

    @Test func splitsAPairIntoTwoIndependentHands() {
        let stats = store()
        // player 8,8 vs dealer 10,7=17. hand 1 draws 10 → 18 (win); hand 2 draws
        // 5 → 13 (lose). Dealer stands on 17.
        let cards = [
            card(.eight), card(.ten, .hearts), card(.eight, .diamonds), card(.seven),
            card(.ten, .clubs), card(.five, .hearts)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: stats)
        #expect(model.canSplit)
        model.onAction(.split)
        model.onAction(.stand) // hand 1
        model.onAction(.stand) // hand 2
        #expect(model.hands.count == 2)
        #expect(model.phase == .resolved)
        #expect(model.hands[0].settlement?.outcome == .win)
        #expect(model.hands[1].settlement?.outcome == .lose)
        #expect(model.showdownStats.hands == 2)
        #expect(model.showdownStats.wins == 1)
        #expect(model.showdownStats.losses == 1)
    }

    @Test func splitAcesTakeOneCardEachAndAreNotNaturals() {
        let stats = store()
        // A,A vs dealer 10,7=17. Aces draw 10 → 21 and 9 → 20; both win but
        // neither is a blackjack (a split 21 pays even money).
        let cards = [
            card(.ace), card(.ten, .hearts), card(.ace, .diamonds), card(.seven),
            card(.ten, .clubs), card(.nine, .hearts)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: stats)
        model.onAction(.split)
        #expect(model.phase == .resolved) // aces auto-stand after one card
        #expect(model.hands.count == 2)
        #expect(model.hands[0].cards.count == 2) // one card each, no hits
        #expect(model.hands[0].settlement?.outcome == .win)
        #expect(model.hands[0].settlement?.playerBlackjack == false)
        #expect(model.showdownStats.wins == 2)
        #expect(model.showdownStats.blackjacks == 0)
    }

    @Test func offersReSplitWhenASplitHandPairsAgain() {
        let stats = store()
        let cards = [
            card(.eight), card(.ten, .hearts), card(.eight, .diamonds), card(.seven),
            card(.eight, .clubs), card(.five, .hearts)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: stats)
        model.onAction(.split) // hand 1 draws another 8 → 8,8
        #expect(model.playerCards.map(\.highValue) == [8, 8])
        #expect(model.canSplit) // re-split available
    }
}
