import Foundation
import Testing
@testable import BlackjackTrainer

/// Multi-box showdown rounds: one dealer against one to three player boxes.
/// Opening deal order is one card to each box, the dealer upcard, a second to
/// each box, then the dealer hole card. Mirrors the web multi-box specs.
@MainActor
struct ShowdownMultiBoxTests {
    private func store() -> ShowdownStatsStore {
        let suite = "showdown-multibox-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults)
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

    @Test func dealsOneTwoCardHandPerBox() {
        let cards = [
            card(.nine), card(.eight), card(.ten), card(.seven), card(.four), card(.six)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        #expect(model.hands.count == 2)
        #expect(model.hands[0].cards.map(\.rank) == [.nine, .seven])
        #expect(model.hands[1].cards.map(\.rank) == [.eight, .four])
        #expect(model.dealerCards.map(\.rank) == [.ten, .six])
        #expect(model.activeIndex == 0)
    }

    @Test func settlesEachBoxIndependently() {
        // box1 20 wins, box2 15 loses, dealer 19 stands.
        let cards = [
            card(.ten), card(.nine), card(.ten, .hearts), card(.ten, .clubs), card(.six),
            card(.nine, .diamonds)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        model.onAction(.stand)
        model.onAction(.stand)
        #expect(model.phase == .resolved)
        #expect(model.hands[0].settlement?.outcome == .win)
        #expect(model.hands[1].settlement?.outcome == .lose)
    }

    @Test func paysANaturalInALaterBoxAtThreeToTwo() {
        // box1 16, box2 [A,K] natural; dealer [10,6] — no dealer natural.
        let cards = [
            card(.nine), card(.ace), card(.ten), card(.seven), card(.king), card(.six)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        #expect(model.hands[1].settlement?.outcome == .win)
        #expect(model.hands[1].settlement?.playerBlackjack == true)
        #expect(model.hands[1].done)
        // The natural sits out; play falls to the box that still owes a decision.
        #expect(model.activeIndex == 0)
        #expect(model.phase == .playerTurn)
    }

    @Test func aDealerNaturalEndsEveryBoxAtOnce() {
        let cards = [
            card(.nine), card(.nine, .hearts), card(.ace), card(.seven),
            card(.seven, .hearts), card(.king)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        #expect(model.phase == .resolved)
        #expect(model.hands.allSatisfy { $0.settlement?.outcome == .lose })
        #expect(model.hands.allSatisfy { $0.settlement?.dealerBlackjack == true })
    }

    @Test func recordsExactlyOneTallyEntryPerBox() {
        let cards = [
            card(.ten), card(.nine), card(.ten, .hearts), card(.ten, .clubs), card(.six),
            card(.nine, .diamonds)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        model.onAction(.stand)
        model.onAction(.stand)
        #expect(model.showdownStats.hands == 2)
        #expect(model.showdownStats.wins == 1)
        #expect(model.showdownStats.losses == 1)
    }

    @Test func doesNotDoubleCountABoxSettledByAnOpeningNatural() {
        let cards = [
            card(.nine), card(.ace), card(.ten), card(.seven), card(.king), card(.six)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        model.onAction(.stand) // stand box1 on 16; the dealer draws from 16
        #expect(model.phase == .resolved)
        #expect(model.showdownStats.hands == 2)
        #expect(model.showdownStats.blackjacks == 1)
    }

    @Test func summarizesAFinishedMultiBoxRound() {
        let cards = [
            card(.ten), card(.nine), card(.ten, .hearts), card(.ten, .clubs), card(.six),
            card(.nine, .diamonds)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        model.onAction(.stand)
        model.onAction(.stand)
        #expect(model.roundSummary == "1 won, 1 lost")
    }

    @Test func leavesASingleBoxRoundWithoutASummary() {
        let cards = [card(.ten), card(.ten, .hearts), card(.nine), card(.eight)]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store())
        model.onAction(.stand)
        #expect(model.roundSummary.isEmpty)
    }

    @Test func clampsTheSpotsArgumentToTheSupportedRange() {
        let cards = [
            card(.nine), card(.eight), card(.ten), card(.seven), card(.four), card(.six)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 99)
        #expect(model.spots == 3)
    }

    @Test func accumulatesEveryDealtCardForTheCountCarryBack() {
        // The drill folds these cards' running-count value into its carried count
        // on exit, so the opening round must hand back all six in dealing order.
        let cards = [
            card(.nine), card(.eight), card(.ten), card(.seven), card(.four), card(.six)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        #expect(model.dealtCards.map(\.rank) == [.nine, .eight, .ten, .seven, .four, .six])
        model.onAction(.hit) // one more card off the shoe joins the tally
        #expect(model.dealtCards.count == 7)
    }

    @Test func givesEachBoxItsOwnFourHandSplitCap() {
        // Three boxes each dealt 8,8. Splitting box 1 must not spend box 2's
        // allowance — the cap is four hands per box, not four across the table.
        let cards = [
            card(.eight), card(.eight, .hearts), card(.eight, .clubs), card(.ten),
            card(.eight, .diamonds), card(.eight), card(.eight, .hearts), card(.six)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 3)
        model.onAction(.split) // box 1 → two hands, the first drawing a five → 13
        model.onAction(.stand) // stand box 1 hand 1
        model.onAction(.stand) // stand box 1 hand 2
        #expect(model.hands.count == 4)
        // Play is now on box 2, a fresh 8,8 pair that has never been split.
        #expect(model.hands[model.activeIndex].cards.map(\.rank) == [.eight, .eight])
        #expect(model.canSplit)
    }

    @Test func stillCapsOneBoxAtFourHandsHoweverManyBoxesAreInPlay() {
        // Two boxes; box 1 keeps pairing eights. It may split three times (four
        // hands) and no more, regardless of box 2 sitting alongside it.
        let cards = [
            card(.eight), card(.nine), card(.ten), card(.eight, .hearts),
            card(.nine, .hearts), card(.six),
            card(.eight, .clubs), card(.eight, .diamonds), card(.eight)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store(), spots: 2)
        model.onAction(.split) // box 1 → 2 hands, active draws an eight → 8,8
        model.onAction(.split) // box 1 → 3 hands, active draws an eight → 8,8
        model.onAction(.split) // box 1 → 4 hands, active draws an eight → 8,8
        #expect(model.hands[model.activeIndex].cards.map(\.rank) == [.eight, .eight])
        #expect(!model.canSplit)
    }

    @Test func marksSplitHandsSoASplitTwentyOneIsNotANatural() {
        let cards = [
            card(.ace), card(.ten), card(.ace, .diamonds), card(.ten, .hearts),
            card(.king), card(.queen)
        ]
        let model = ShowdownModel(shoe: stacked(cards), ruleSet: .s17, stats: store())
        model.onAction(.split)
        // Bound first: `#expect` cannot host the key-path form swiftformat prefers.
        let allFromSplit = model.hands.allSatisfy(\.fromSplit)
        #expect(allFromSplit)
        #expect(model.hands.allSatisfy { $0.settlement?.playerBlackjack == false })
    }
}
