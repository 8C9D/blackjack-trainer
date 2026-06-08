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
}
