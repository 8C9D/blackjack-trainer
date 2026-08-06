import Foundation
import Testing
@testable import BlackjackTrainer

/// The insurance path through the showdown: with betting on, a dealer ace pauses
/// the round on the take/skip decision before the hole card is checked. The pure
/// cost/payout math is covered by the parity vectors in `ShowdownParityTests`;
/// these cover the wiring around it. Split from `BankrollTests` for length.
@MainActor
struct ShowdownInsuranceTests {
    private func defaults() -> UserDefaults {
        let suite = "insurance-test-\(UUID().uuidString)"
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
        betting: Bool = true
    ) -> ShowdownModel {
        let store = defaults()
        return ShowdownModel(
            shoe: stacked(cards),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            spots: spots,
            betting: betting,
            bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: store)
        )
    }

    /// player [9,7]=16; the dealer shows an ace with a 6 in the hole — no natural.
    private var noNatural: [Card] {
        [card(.nine), card(.ace), card(.seven), card(.six)]
    }

    /// Same upcard, but a king in the hole: a dealer natural.
    private var natural: [Card] {
        [card(.nine), card(.ace), card(.seven), card(.king)]
    }

    @Test func pausesOnInsuranceWhenTheDealerShowsAnAce() {
        let showdown = model(noNatural)
        showdown.setBet(10)
        showdown.dealAfterBet()
        #expect(showdown.phase == .insurance)
        #expect(showdown.insuranceTotal == 5)
        #expect(showdown.hands[0].settlement == nil) // the hole card is unchecked
    }

    @Test func insuranceAgainstANaturalPaysTwoToOne() {
        let showdown = model(natural)
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.takeInsurance()
        #expect(showdown.phase == .resolved)
        #expect(showdown.insuranceNet == 10)
        #expect(showdown.hands[0].settlement?.outcome == .lose)
        // The insurance win exactly covers the hand's loss.
        #expect(showdown.roundNet == 0)
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 500, wagered: 15, net: 0))
    }

    @Test func insuranceAgainstNoNaturalIsForfeited() {
        let showdown = model(noNatural)
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.takeInsurance()
        #expect(showdown.phase == .playerTurn)
        #expect(showdown.insuranceNet == -5)
        #expect(showdown.bankrollStore.bankroll == 495)
        showdown.onAction(.stand) // 16 stands; dealer soft 17 stands under S17 → lose
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 485, wagered: 15, net: -15))
        #expect(showdown.roundNet == -15)
    }

    @Test func decliningInsuranceLeavesTheBankrollAlone() {
        let showdown = model(natural)
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.declineInsurance()
        #expect(showdown.phase == .resolved)
        #expect(showdown.insuranceNet == nil)
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 490, wagered: 10, net: -10))
    }

    @Test func insuranceIsNeverOfferedWithBettingOff() {
        let showdown = model(noNatural, betting: false)
        #expect(showdown.phase == .playerTurn)
    }

    @Test func insuranceIsSkippedWhenTheFreeChipsCannotBackIt() {
        // The whole bankroll is on the box: nothing left for the side bet.
        let showdown = model(noNatural)
        showdown.setBet(500)
        showdown.dealAfterBet()
        #expect(showdown.phase == .playerTurn)
    }

    @Test func insuranceCoversEveryOccupiedBox() {
        // boxes [9,7] and [8,4]; dealer [A,6] — no natural.
        let cards = [
            card(.nine), card(.eight), card(.ace), card(.seven), card(.four), card(.six)
        ]
        let showdown = model(cards, spots: 2)
        showdown.setBet(10)
        showdown.dealAfterBet()
        #expect(showdown.phase == .insurance)
        #expect(showdown.insuranceTotal == 10)
        showdown.takeInsurance()
        #expect(showdown.insuranceNet == -10)
        #expect(showdown.bankrollStore.bankroll == 490)
    }

    @Test func insuranceResetsBetweenRounds() {
        let showdown = model(natural + [card(.nine, .hearts), card(.ten),
                                        card(.seven, .hearts), card(.six)])
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.takeInsurance()
        showdown.dealAnother()
        showdown.dealAfterBet()
        #expect(showdown.insuranceNet == nil)
    }
}
