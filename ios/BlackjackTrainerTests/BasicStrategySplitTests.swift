import Testing
@testable import BlackjackTrainer

/// A split is the other correct answer that leaves decisions behind it — two of
/// them, on hands the drill never used to ask about. The showdown's table has
/// played splits out since it shipped; the drill that teaches the play ended the
/// hand and dealt a fresh one, so "split 8s, then what" was the one question the
/// chart's most-drilled cell never led to. Mirrors the web spec's
/// "playing a split out".
@MainActor
struct BasicStrategySplitTests {
    /// 8,8 is a split against every upcard, so the split itself is always the
    /// correct answer here and what follows is the hand it made.
    private let pair8sVsSix = Scenario(
        player: TwoCardHand(DrillFixture.card(.eight), DrillFixture.card(.eight, .hearts)),
        dealerUpcard: DrillFixture.card(.six, .clubs)
    )

    private let pairAcesVsSix = Scenario(
        player: TwoCardHand(DrillFixture.card(.ace), DrillFixture.card(.ace, .hearts)),
        dealerUpcard: DrillFixture.card(.six, .clubs)
    )

    /// Split correctly; the harness has the drawn card pinned.
    private func splitOnce(_ h: DrillFixture.Harness) {
        h.model.answer(.split)
        h.scheduler.fire()
    }

    @Test func turnsOneHandIntoTwoAndAsksAboutTheFirst() {
        let h = DrillFixture.makeHarness(draws: .three)
        h.model.deal(pair8sVsSix)
        splitOnce(h)

        #expect(h.model.phase == .question)
        #expect(h.model.hands.count == 2)
        #expect(h.model.hand.count == 2) // 8 + 3
        #expect(h.model.question == HandQuestion(prefix: "Hard", value: "11", dealer: "6"))
    }

    /// The stage shows one hand at a time, so without this the second hand of a
    /// split is indistinguishable from a fresh deal.
    @Test func namesWhichHandOfTheSplitIsInFrontOfYou() {
        let h = DrillFixture.makeHarness(draws: .three)
        #expect(h.model.handLabel == "")

        h.model.deal(pair8sVsSix)
        splitOnce(h)
        #expect(h.model.handLabel == "Hand 1 of 2")
    }

    /// Insurance was settled on the deal and surrender is a first-two-cards
    /// action of the hand the dealer dealt. Both are gone for good.
    @Test func takesSurrenderAndInsuranceOffAHandOutOfASplit() {
        let h = DrillFixture.makeHarness(
            options: EngineOptions(doubleAfterSplit: false, lateSurrender: true),
            draws: .three
        )
        h.model.deal(Scenario(
            player: TwoCardHand(DrillFixture.card(.eight), DrillFixture.card(.eight, .hearts)),
            dealerUpcard: DrillFixture.card(.ace, .clubs)
        ))
        #expect(h.model.legalActions.contains(.surrender))
        #expect(h.model.legalActions.contains(.insurance))

        splitOnce(h)
        #expect(h.model.legalActions == [.hit, .stand])
    }

    @Test func offersTheDoubleBackOnlyUnderDASAndGradesItThatWay() {
        let h = DrillFixture.makeHarness(
            options: EngineOptions(doubleAfterSplit: true, lateSurrender: false),
            draws: .three
        )
        h.model.deal(pair8sVsSix)
        splitOnce(h) // hard 11 vs 6

        #expect(h.model.legalActions == [.hit, .stand, .double])
        h.model.answer(.double)
        #expect(h.model.result?.correct == true)
    }

    @Test func makesTheSame11AHitWhenTheTableHasNoDAS() {
        let h = DrillFixture.makeHarness(draws: .three)
        h.model.deal(pair8sVsSix)
        splitOnce(h)

        #expect(h.model.legalActions == [.hit, .stand])
        h.model.answer(.hit)
        #expect(h.model.result?.correct == true)
    }

    @Test func movesToTheSecondHandWhenTheFirstIsFinishedThenDealsOn() {
        let h = DrillFixture.makeHarness(draws: .ten)
        h.model.deal(pair8sVsSix)
        splitOnce(h) // 8 + 10 = hard 18 vs 6 — stand

        h.model.answer(.stand)
        h.scheduler.fire()
        #expect(h.model.handLabel == "Hand 2 of 2")
        #expect(h.model.hand.count == 2) // its second card was dealt on arrival

        h.model.answer(.stand)
        h.scheduler.fire()
        #expect(h.model.hands.count == 1)
        #expect(h.model.hand == h.model.scenario.player.cards)
    }

    /// Split aces take a single card each and stand — the rule the showdown's
    /// table already plays, and the reason a 21 made that way is not a natural.
    @Test func givesSplitAcesOneCardEachAndNeverAsks() {
        let h = DrillFixture.makeHarness(draws: .five)
        h.model.deal(pairAcesVsSix)
        splitOnce(h)

        #expect(h.model.phase == .over)
        #expect(h.model.handOver == "16 — split aces take one card.")

        h.scheduler.fire()
        #expect(h.model.phase == .over) // the second ace, same rule
        #expect(h.model.handLabel == "Hand 2 of 2")

        h.scheduler.fire()
        #expect(h.model.hands.count == 1)
    }

    @Test func reSplitsAPairUpToFourHandsThenReadsItAsATotal() {
        let h = DrillFixture.makeHarness(draws: .eight)
        h.model.deal(pair8sVsSix)
        splitOnce(h) // 8,8 again
        #expect(h.model.hands.count == 2)
        #expect(h.model.legalActions.contains(.split))

        splitOnce(h)
        #expect(h.model.hands.count == 3)
        splitOnce(h)
        #expect(h.model.hands.count == 4)

        // At the cap the pair is not a pair the table will act on, so the chart
        // is read at the total: hard 16 vs 6 stands.
        #expect(h.model.legalActions == [.hit, .stand])
        h.model.answer(.stand)
        #expect(h.model.result?.correct == true)
    }

    /// A hand out of a split is two cards again, but it is not the hand that was
    /// dealt: filing it would re-deal an 11 that can surrender and insure.
    @Test func neitherTimesNorFilesADecisionOnAHandOutOfASplit() {
        let clock = DrillFixture.TestClock()
        let h = DrillFixture.makeHarness(draws: .three, clock: clock)
        h.model.deal(pair8sVsSix)

        clock.advance(2)
        splitOnce(h)

        clock.advance(9)
        h.model.answer(.stand) // hard 11 vs 6 — wrong, and not the deal's question
        #expect(h.model.result?.correct == false)

        #expect(h.model.handsToday == 2)
        #expect(h.history.paceLast7() == 2) // the split alone, at 2.0s
        // The deal itself was answered correctly, so nothing is outstanding.
        #expect(h.missTally.weakSpotFor(.basicStrategy) == nil)
    }

    @Test func dealsAFreshHandInsteadWhenTheSettingIsOff() {
        let h = DrillFixture.makeHarness(playHandsOut: false, draws: .three)
        h.model.deal(pair8sVsSix)
        splitOnce(h)
        #expect(h.model.hands.count == 1)
        #expect(h.model.hand == h.model.scenario.player.cards)
    }
}
