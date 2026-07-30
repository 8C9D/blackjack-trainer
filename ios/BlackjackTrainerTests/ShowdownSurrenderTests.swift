import Foundation
import Testing
@testable import BlackjackTrainer

/// The late-surrender path through the showdown: a box's original two cards may
/// be given up for half the bet, never after a split, and the option lapses once
/// a card is drawn. The pure forfeit math is covered by the parity vectors in
/// `ShowdownParityTests`; these cover the wiring around it.
@MainActor
struct ShowdownSurrenderTests {
    private func defaults() -> UserDefaults {
        let suite = "surrender-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// A shoe dealing the given cards in order, padded so nothing runs dry.
    private func stacked(_ cards: [Card]) -> Shoe {
        Shoe(
            cards: cards + Array(repeating: Card(rank: .five, suit: .clubs), count: 10),
            penetration: 0.9
        )
    }

    private func model(
        _ cards: [Card],
        spots: Int = 1,
        betting: Bool = false
    ) -> ShowdownModel {
        let store = defaults()
        return ShowdownModel(
            shoe: stacked(cards),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            options: EngineOptions(doubleAfterSplit: false, lateSurrender: true),
            spots: spots,
            betting: betting,
            bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: store)
        )
    }

    @Test func followsTheLateSurrenderTableRule() {
        let store = defaults()
        let showdown = ShowdownModel(
            shoe: stacked([card(.ten), card(.ten, .hearts), card(.six), card(.nine)]),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            options: .default
        )
        #expect(!showdown.canSurrender)
    }

    @Test func settlesTheHandAsAnImmediateLossWithoutADealerDraw() {
        // player [10,6]=16, dealer [10,9]=19; the dealer must take no card once
        // the only box has surrendered.
        let showdown = model([card(.ten), card(.ten, .hearts), card(.six), card(.nine)])
        #expect(showdown.canSurrender)
        showdown.onAction(.surrender)
        #expect(showdown.phase == .resolved)
        #expect(showdown.hands[0].surrendered)
        #expect(showdown.hands[0].settlement?.outcome == .lose)
        #expect(showdown.dealerCards.count == 2) // never drew the padding fives
        #expect(showdown.showdownStats.losses == 1)
        #expect(showdown.verdict(showdown.hands[0]) == "Surrendered.")
    }

    @Test func lapsesOnceACardIsHitAndNeverAppliesToSplitHands() {
        // A pair of eights: surrender is offered on the opening pair, but the
        // split halves are fresh two-card hands that must not offer it.
        let showdown = model([
            card(.eight), card(.ten), card(.eight, .hearts), card(.seven),
            card(.eight, .clubs), card(.five, .hearts)
        ])
        #expect(showdown.canSurrender)
        showdown.onAction(.split)
        #expect(!showdown.canSurrender)
    }

    @Test func forfeitsHalfTheBetWithBettingOn() {
        let showdown = model(
            [card(.ten), card(.ten, .hearts), card(.six), card(.nine)], betting: true
        )
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.onAction(.surrender)
        #expect(showdown.payout(showdown.hands[0]) == -5)
        #expect(showdown.roundNet == -5)
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 495, wagered: 10, net: -5))
        #expect(showdown.verdict(showdown.hands[0]) == "Surrendered — half the bet back.")
    }

    @Test func givesUpOneBoxWhileTheOthersPlayOn() {
        // box1 [9,7]=16 surrenders; box2 [10,9]=19 stands; dealer [J,6]=16 draws
        // the king for box2's sake and busts.
        let showdown = model([
            card(.nine), card(.ten), card(.jack), card(.seven),
            card(.nine, .hearts), card(.six), card(.king)
        ], spots: 2)
        showdown.onAction(.surrender)
        #expect(showdown.activeIndex == 1) // play moved to the second box
        showdown.onAction(.stand)
        #expect(showdown.phase == .resolved)
        #expect(showdown.hands[0].surrendered)
        #expect(showdown.hands[1].settlement?.outcome == .win)
        #expect(showdown.dealerCards.count == 3)
        #expect(showdown.roundSummary == "1 won, 1 lost")
    }
}
