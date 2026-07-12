import Testing
@testable import BlackjackTrainer

/// Mirrors `drill-hand.spec.ts`: question labels, action legality (poka-yoke),
/// session-target math, and weak-spot scenario reconstruction.
struct DrillHandTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private let lsOn = EngineOptions(doubleAfterSplit: false, lateSurrender: true)

    /// Cycles varied fractions so suits/orderings differ but stay valid.
    private func seededRandom() -> () -> Double {
        var index = 0
        let sequence = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8]
        return {
            defer { index += 1 }
            return sequence[index % sequence.count]
        }
    }

    // MARK: handQuestion

    @Test func labelsHardTotals() {
        #expect(handQuestion(TwoCardHand(card(.two), card(.eight)), dealerUpcard: card(.six))
            == HandQuestion(prefix: "Hard", value: "10", dealer: "6"))
    }

    @Test func labelsSoftTotalsAndNormalizesTenValueDealers() {
        #expect(handQuestion(TwoCardHand(card(.ace), card(.seven)), dealerUpcard: card(.queen))
            == HandQuestion(prefix: "Soft", value: "18", dealer: "10"))
    }

    @Test func labelsPairsWithoutAPrefix() {
        #expect(handQuestion(
            TwoCardHand(card(.eight), card(.eight, .hearts)),
            dealerUpcard: card(.ace)
        )
            == HandQuestion(prefix: "", value: "8,8", dealer: "A"))
        #expect(handQuestion(
            TwoCardHand(card(.king), card(.jack, .hearts)),
            dealerUpcard: card(.five)
        )
            == HandQuestion(prefix: "", value: "10,10", dealer: "5"))
    }

    // MARK: legalActionsFor

    private var nonPair: TwoCardHand {
        TwoCardHand(card(.two), card(.eight))
    }

    @Test func alwaysAllowsHitStandDoubleOnAnInitialHand() {
        #expect(legalActionsFor(nonPair, dealerUpcard: card(.six), options: .default)
            == [.hit, .stand, .double])
    }

    @Test func allowsSplitOnlyOnPairsIncludingMixedTenValues() {
        #expect(legalActionsFor(
            TwoCardHand(card(.eight), card(.eight, .hearts)), dealerUpcard: card(.six),
            options: .default
        ).contains(.split))
        #expect(legalActionsFor(
            TwoCardHand(card(.king), card(.ten, .hearts)), dealerUpcard: card(.six),
            options: .default
        ).contains(.split))
        #expect(!legalActionsFor(nonPair, dealerUpcard: card(.six), options: .default)
            .contains(.split))
    }

    @Test func allowsInsuranceOnlyAgainstADealerAce() {
        #expect(legalActionsFor(nonPair, dealerUpcard: card(.ace), options: .default)
            .contains(.insurance))
        #expect(!legalActionsFor(nonPair, dealerUpcard: card(.ten), options: .default)
            .contains(.insurance))
    }

    @Test func gatesSurrenderOnTheLateSurrenderRule() {
        #expect(!legalActionsFor(nonPair, dealerUpcard: card(.ten), options: .default)
            .contains(.surrender))
        #expect(legalActionsFor(nonPair, dealerUpcard: card(.ten), options: lsOn)
            .contains(.surrender))
    }

    @Test func offersSurrenderRegardlessOfTheRuleWhenSurrenderAlwaysIsSet() {
        #expect(legalActionsFor(
            nonPair, dealerUpcard: card(.ten), options: .default, surrenderAlways: true
        ).contains(.surrender))
    }

    // MARK: nextSessionTarget

    @Test func targetsTheDailyGoalWhileUnderIt() {
        #expect(nextSessionTarget(handsToday: 0, goal: 20) == 20)
        #expect(nextSessionTarget(handsToday: 14, goal: 20) == 20)
        #expect(nextSessionTarget(handsToday: 19, goal: 20) == 20)
    }

    @Test func extendsByAFullGoalOnceMet() {
        #expect(nextSessionTarget(handsToday: 20, goal: 20) == 40)
        #expect(nextSessionTarget(handsToday: 27, goal: 20) == 40)
        #expect(nextSessionTarget(handsToday: 40, goal: 20) == 60)
    }

    @Test func toleratesDegenerateInputs() {
        #expect(nextSessionTarget(handsToday: -1, goal: 20) == 20)
        #expect(nextSessionTarget(handsToday: 5, goal: 0) == 6)
    }

    // MARK: scenarioFromRef

    @Test func rebuildsAHardTotalAsANonPairHandWithTheRightDealer() {
        let ref = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
        for _ in 0 ..< 10 {
            let s = scenarioFromRef(ref, random: { Double.random(in: 0 ..< 1) })
            #expect(HandClassification.pairKey(s.player) == nil)
            #expect(!HandClassification.isSoftTwoCard(s.player))
            #expect(s.player.first.highValue + s.player.second.highValue == 16)
            #expect(s.dealerUpcard.highValue == 10)
        }
    }

    @Test func rebuildsASoftTotal() {
        let s = scenarioFromRef(
            ScenarioRef(kind: "soft", hand: "18", dealer: "9"), random: seededRandom()
        )
        #expect(HandClassification.isSoftTwoCard(s.player))
        let values = [s.player.first.highValue, s.player.second.highValue].sorted()
        #expect(values == [7, 11])
        #expect(s.dealerUpcard.rank == .nine)
    }

    @Test func rebuildsPairsIncludingTenValueAndAcePairs() {
        let eights = scenarioFromRef(
            ScenarioRef(kind: "pair", hand: "8", dealer: "6"), random: seededRandom()
        )
        #expect(eights.player.cards.map(\.rank) == [.eight, .eight])

        let tens = scenarioFromRef(
            ScenarioRef(kind: "pair", hand: "10", dealer: "A"), random: seededRandom()
        )
        #expect(HandClassification.pairKey(tens.player) == "10")
        #expect(tens.dealerUpcard.rank == .ace)

        let aces = scenarioFromRef(
            ScenarioRef(kind: "pair", hand: "A", dealer: "5"), random: seededRandom()
        )
        #expect(aces.player.cards.map(\.rank) == [.ace, .ace])
    }
}
