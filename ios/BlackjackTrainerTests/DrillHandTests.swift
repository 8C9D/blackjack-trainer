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

    /// Past two cards there is no pair to name, and an ace may have softened.
    @Test func labelsAHandPlayedOutByItsNCardTotal() {
        #expect(handQuestion([card(.four), card(.four, .hearts), card(.eight)],
                             dealerUpcard: card(.six))
                == HandQuestion(prefix: "Hard", value: "16", dealer: "6"))
        #expect(handQuestion([card(.ace), card(.two), card(.four)], dealerUpcard: card(.six))
            == HandQuestion(prefix: "Soft", value: "17", dealer: "6"))
        // The ace demotes to 1 rather than reading as a soft 27.
        #expect(handQuestion([card(.ace), card(.nine), card(.seven)], dealerUpcard: card(.six))
            == HandQuestion(prefix: "Hard", value: "17", dealer: "6"))
    }

    /// Double, split and surrender are first-two-card actions, and insurance was
    /// settled before the hand was played, so a drawn card leaves hit and stand.
    @Test func leavesOnlyHitAndStandOnceTheHandIsPastTwoCards() {
        let deep = [card(.eight), card(.eight, .hearts), card(.two)]
        #expect(legalActionsFor(
            deep, dealerUpcard: card(.ace), options: lsOn, surrenderAlways: true
        ) == [.hit, .stand])
    }

    @Test func offersSurrenderRegardlessOfTheRuleWhenSurrenderAlwaysIsSet() {
        #expect(legalActionsFor(
            nonPair, dealerUpcard: card(.ten), options: .default, surrenderAlways: true
        ).contains(.surrender))
    }

    // MARK: after a split

    // A hand out of a split is two cards again but is not the hand that was
    // dealt: insurance was settled before it existed and surrender is a
    // first-two-cards action of the hand that was.

    private let fromSplit = SplitContext(fromSplit: true, canSplitAgain: true)
    private let atTheCap = SplitContext(fromSplit: true, canSplitAgain: false)

    @Test func aSplitTakesSurrenderAndInsuranceAwayForGood() {
        let legal = legalActionsFor(
            nonPair, dealerUpcard: card(.ace), options: lsOn,
            surrenderAlways: true, split: fromSplit
        )
        #expect(!legal.contains(.surrender))
        #expect(!legal.contains(.insurance))
    }

    @Test func aSplitGivesTheDoubleBackOnlyUnderDAS() {
        #expect(legalActionsFor(
            nonPair, dealerUpcard: card(.six), options: .default, split: fromSplit
        ) == [.hit, .stand])
        let das = EngineOptions(doubleAfterSplit: true, lateSurrender: false)
        #expect(legalActionsFor(
            nonPair, dealerUpcard: card(.six), options: das, split: fromSplit
        ).contains(.double))
    }

    @Test func aPairReSplitsUntilTheDealIsAtItsCap() {
        let pair = TwoCardHand(card(.eight), card(.eight, .hearts))
        #expect(legalActionsFor(
            pair, dealerUpcard: card(.six), options: .default, split: fromSplit
        ).contains(.split))
        #expect(!legalActionsFor(
            pair, dealerUpcard: card(.six), options: .default, split: atTheCap
        ).contains(.split))
    }

    @Test func anUnsplitHandKeepsEveryActionItHad() {
        #expect(legalActionsFor(
            nonPair, dealerUpcard: card(.ace), options: lsOn, split: .unsplit
        ) == legalActionsFor(nonPair, dealerUpcard: card(.ace), options: lsOn))
    }

    // MARK: splitHandAt

    @Test func splitGivesEachHalfOneCardInPlayingOrder() {
        let eights = [card(.eight), card(.eight, .hearts)]
        #expect(splitHandAt([eights], 0) == [[card(.eight)], [card(.eight, .hearts)]])
    }

    @Test func aReSplitLandsInPlaceSoTheHandsStayInPlayingOrder() {
        let eights = [card(.eight), card(.eight, .hearts)]
        let waiting = [card(.nine)]
        #expect(splitHandAt([eights, waiting], 0)
            == [[card(.eight)], [card(.eight, .hearts)], waiting])
    }

    /// Defensive: a one-card hand waiting behind the active one is not a pair to
    /// split, and nothing should be able to turn it into two.
    @Test func splitLeavesAnythingThatIsNotATwoCardHandAlone() {
        #expect(splitHandAt([[card(.eight)]], 0) == [[card(.eight)]])
        let eights = [card(.eight), card(.eight, .hearts)]
        #expect(splitHandAt([eights], 3) == [eights])
    }

    @Test func aDealIsCappedAtFourHands() {
        #expect(maxSplitHands == 4)
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

    // MARK: pickWeakSpot

    private func weak(_ label: String, _ misses: Int) -> WeakSpot {
        WeakSpot(
            ref: ScenarioRef(kind: "hard", hand: label, dealer: "10"),
            label: label,
            misses: misses,
            attempts: misses * 2,
            streak: 0
        )
    }

    /// Feeds the two `random()` calls in order: the share roll, then the weighted
    /// draw.
    private func rolls(_ values: [Double]) -> () -> Double {
        let box = RollBox(values)
        return { box.next() }
    }

    @Test func dealsAFreshHandWhenNothingHasBeenMissed() {
        #expect(pickWeakSpot([], random: rolls([0])) == nil)
    }

    @Test func dealsAFreshHandWhenTheShareRollMisses() {
        let spots = [weak("16", 3)]
        #expect(pickWeakSpot(spots, random: rolls([weakSpotShare])) == nil)
        #expect(pickWeakSpot(spots, random: rolls([0.99])) == nil)
    }

    @Test func drawsFromTheWeakListWhenTheShareRollHits() {
        #expect(pickWeakSpot([weak("16", 3)], random: rolls([0, 0]))?.label == "16")
    }

    @Test func weightsTheDrawByMissCount() {
        // Weights 3 and 1 over a total of 4: the first spot owns [0, 0.75).
        let spots = [weak("16", 3), weak("12", 1)]
        #expect(pickWeakSpot(spots, random: rolls([0, 0]))?.label == "16")
        #expect(pickWeakSpot(spots, random: rolls([0, 0.74]))?.label == "16")
        #expect(pickWeakSpot(spots, random: rolls([0, 0.76]))?.label == "12")
        // A share of 1 makes every hand a weak spot — the review round.
        #expect(pickWeakSpot(spots, random: rolls([0.99, 0.9]), share: 1)?.label == "12")
    }

    @Test func landsOnTheLastSpotWhenTheDrawRoundsPastTheEnd() {
        let spots = [weak("16", 3), weak("12", 1)]
        #expect(pickWeakSpot(spots, random: rolls([0, 1]))?.label == "12")
    }

    @Test func holdsTheShareItAdvertisesOverManyDraws() {
        let spots = [weak("16", 1)]
        var hits = 0
        for _ in 0 ..< 10000 where pickWeakSpot(spots, random: { .random(in: 0 ..< 1) }) != nil {
            hits += 1
        }
        // ±4 points is far outside sampling noise at n = 10,000 but immune to an
        // unlucky seed.
        #expect(abs(Double(hits) / 10000 - weakSpotShare) < 0.04)
    }
}

/// A mutable cursor over a fixed roll sequence, so the closure handed to
/// `pickWeakSpot` can stay non-escaping and non-mutating.
private final class RollBox {
    private let values: [Double]
    private var index = 0

    init(_ values: [Double]) {
        self.values = values
    }

    func next() -> Double {
        defer { index += 1 }
        return values[index]
    }
}
