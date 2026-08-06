import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `basic-strategy-drill-page.component.spec.ts`: session setup, grade-in-
/// place / auto-advance, the miss pause, poka-yoke, recording, and session end.
@MainActor
struct BasicStrategyDrillModelTests {
    private var hitScenario: Scenario {
        DrillFixture.hitScenario
    }

    private var standScenario: Scenario {
        DrillFixture.standScenario
    }

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        DrillFixture.card(rank, suit)
    }

    // The app has graded every rep and never said how long it took, which at a
    // table is half of whether the chart is any use to you.

    @Test func timesTheAnswerAndReportsTheRoundMedian() {
        let h = DrillFixture.makeHarness(dailyGoal: 1)
        h.model.deal(DrillFixture.standScenario)
        h.clock.advance(2.5)
        h.model.answer(.stand)
        #expect(h.history.paceLast7() == 2.5)
        #expect(h.model.session.medianSeconds == 2.5)
    }

    @Test func restartsTheClockOnEveryDeal() {
        let h = DrillFixture.makeHarness()
        h.model.deal(DrillFixture.standScenario)
        h.clock.advance(1)
        h.model.answer(.stand)
        h.scheduler.fire()
        h.model.deal(DrillFixture.standScenario)
        h.clock.advance(3)
        h.model.answer(.stand)
        // 1s then 3s — the second hand is not timed from the first deal.
        #expect(h.history.paceLast7() == 2)
    }

    /// A hand you walked away from is not a hand you were slow on.
    @Test func leavesAnAbandonedHandOutOfTheFigureEntirely() {
        let h = DrillFixture.makeHarness()
        h.model.deal(DrillFixture.standScenario)
        h.clock.advance(2)
        h.model.answer(.stand)
        h.scheduler.fire()

        h.model.deal(DrillFixture.standScenario)
        h.clock.advance(Double(maxTimedDecisionMs) / 1000 + 1)
        h.model.answer(.stand)

        #expect(h.history.paceLast7() == 2)
        #expect(h.model.handsToday == 2)
    }

    // MARK: session setup

    @Test func recordsItselfAsTheLastTrainer() {
        let h = DrillFixture.makeHarness()
        #expect(h.prefs.prefs.lastTrainer == .basicStrategy)
    }

    @Test func targetsTheDailyGoal() {
        let h = DrillFixture.makeHarness(dailyGoal: 20)
        #expect(h.model.target == 20)
        #expect(h.model.handsToday == 0)
    }

    @Test func opensOnTheRecordedWeakSpot() {
        let h = DrillFixture.makeHarness(seedWeak: ScenarioRef(
            kind: "hard",
            hand: "16",
            dealer: "10"
        ))
        #expect(h.model.question == HandQuestion(prefix: "Hard", value: "16", dealer: "10"))
        #expect(h.model.phase == .question)
    }

    // MARK: correct answer — grade in place, auto-advance

    @Test func flashesThenAutoAdvancesWithZeroExtraTaps() {
        let h = DrillFixture.makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.hit)
        #expect(h.model.phase == .flash)
        #expect(h.model.correctAction == .hit)
        h.scheduler.fire()
        #expect(h.model.phase == .question)
        #expect(h.model.result == nil)
        #expect(h.model.handsToday == 1)
    }

    @Test func ignoresFurtherAnswersWhileFlashing() {
        let h = DrillFixture.makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.hit)
        h.model.answer(.stand)
        #expect(h.model.handsToday == 1)
    }

    // MARK: miss — the only pause

    @Test func missShowsTheRuleAndWaits() {
        let h = DrillFixture.makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.stand)
        #expect(h.model.phase == .miss)
        #expect(h.model.correctAction == .hit)
        #expect(h.model.picked == .stand)
        #expect(h.model.result?.reason.contains("Hard 7 vs dealer 6 under S17: hit.") == true)
        // A miss schedules nothing; firing the (empty) scheduler cannot advance.
        h.scheduler.fire()
        #expect(h.model.phase == .miss)
    }

    @Test func continuesFromAMiss() {
        let h = DrillFixture.makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.stand)
        #expect(h.model.phase == .miss)
        h.model.continueFromMiss()
        #expect(h.model.phase == .question)
        #expect(h.model.result == nil)
    }

    // MARK: poka-yoke

    @Test func disablesIllegalActionsAndKeepsThemInert() {
        let h = DrillFixture.makeHarness()
        h.model.deal(hitScenario) // non-pair, no ace up, LS off
        #expect(h.model.legalActions == [.hit, .stand, .double])
        h.model.answer(.split)
        h.model.answer(.insurance)
        h.model.answer(.surrender)
        #expect(h.model.phase == .question)
        #expect(h.model.handsToday == 0)
    }

    @Test func offersSurrenderOnceLateSurrenderIsOn() {
        let h = DrillFixture.makeHarness(options: EngineOptions(
            doubleAfterSplit: false,
            lateSurrender: true
        ))
        h.model.deal(hitScenario)
        #expect(h.model.legalActions.contains(.surrender))
    }

    @Test func offersInsuranceAgainstADealerAceAndGradesItViaTheEngine() {
        let h = DrillFixture.makeHarness()
        h.model.deal(Scenario(
            player: TwoCardHand(card(.three), card(.four, .hearts)),
            dealerUpcard: card(.ace, .clubs)
        ))
        #expect(h.model.legalActions.contains(.insurance))
        h.model.answer(.insurance)
        #expect(h.model.phase == .miss)
        #expect(h.model.result?.reason.contains("never takes insurance") == true)
    }

    // MARK: recording

    @Test func feedsStatsHistoryAndTheMissTally() {
        let h = DrillFixture.makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.hit)
        #expect(h.stats.stats.attempts == 1)
        #expect(h.stats.stats.correct == 1)
        #expect(h.history.handsToday() == 1)
        #expect(h.missTally.weakSpotFor(.basicStrategy) == nil)

        h.scheduler.fire()
        h.model.deal(hitScenario)
        h.model.answer(.stand)
        let weak = h.missTally.weakSpotFor(.basicStrategy)
        #expect(weak?.label == "7 vs 6")
        #expect(weak?.misses == 1)
        #expect(weak?.attempts == 2)
    }

    // MARK: session end

    @Test func reachesDoneAtTheSessionTarget() {
        let h = DrillFixture.makeHarness(dailyGoal: 3)
        #expect(h.model.target == 3)
        for _ in 0 ..< 3 {
            h.model.deal(standScenario)
            h.model.answer(.stand)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)
        #expect(h.model.session.bestStreak == 3)
        #expect(h.model.session.accuracy == 100)
    }

    @Test func reachesDoneThroughAFinalMiss() {
        let h = DrillFixture.makeHarness(dailyGoal: 1)
        h.model.deal(hitScenario)
        h.model.answer(.stand)
        #expect(h.model.phase == .miss)
        h.model.continueFromMiss()
        #expect(h.model.phase == .done)
    }

    @Test func oneMoreRoundStartsAFreshRoundTargetingOneMoreGoal() {
        let h = DrillFixture.makeHarness(dailyGoal: 2)
        for _ in 0 ..< 2 {
            h.model.deal(standScenario)
            h.model.answer(.stand)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)
        h.model.oneMoreRound()
        #expect(h.model.phase == .question)
        #expect(h.model.target == 4)
    }

    // MARK: review rounds

    /// The queued weakness promises the next round drills it. A review round makes
    /// that every hand, not just the first.
    @Test func reviewRoundsDealTheWeakSpotOnEveryHand() {
        let pair8s = ScenarioRef(kind: "pair", hand: "8", dealer: "10")
        let h = DrillFixture.makeHarness(dailyGoal: 10, seedWeak: pair8s)
        for _ in 0 ..< 10 {
            h.model.deal(standScenario)
            h.model.answer(.stand)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)

        h.model.reviewMisses()
        #expect(h.model.phase == .question)
        #expect(h.model.target == 20)

        // Hands answered without ever seeding a scenario: in a review round every
        // one has to be the recorded weak spot, whatever the RNG does. Splitting
        // 8,8 is correct, so this also walks the spot to cleared — which takes it
        // out of the weak list on the hand after the last correct answer.
        for _ in 0 ..< clearStreak {
            #expect(h.model.question == HandQuestion(prefix: "", value: "8,8", dealer: "10"))
            h.model.answer(.split)
            h.scheduler.fire()
        }

        // Weak list now empty: the round falls back to fresh hands rather than
        // stalling. (Asserting the hand *isn't* 8,8 vs 10 would flake — a random
        // deal can land on it — so assert the round still makes progress.)
        #expect(h.model.weakSpots.isEmpty)
        #expect(h.model.clearedSpots.map(\.label) == ["8,8 vs 10"])
        #expect(h.model.phase == .question)
        let before = h.model.handsToday
        h.model.answer(h.model.legalActions[0])
        #expect(h.model.handsToday == before + 1)
    }

    /// Progress lists the same weak spots and, until now, could do nothing about
    /// them. `review: true` is that card's entry into this round.
    @Test func opensStraightIntoAReviewRoundWhenAskedTo() {
        let pair8s = ScenarioRef(kind: "pair", hand: "8", dealer: "10")
        let h = DrillFixture.makeHarness(
            dailyGoal: 20,
            seedWeak: pair8s,
            review: true
        )

        // Hand one opens on the weakness in any round; the hands after it are what
        // separate a review round from an ordinary one, which only weights toward
        // the list. Two is as far as this can go before the spot clears.
        for _ in 0 ..< 2 {
            #expect(h.model.question == HandQuestion(prefix: "", value: "8,8", dealer: "10"))
            h.model.answer(.split)
            h.scheduler.fire()
        }
    }

    @Test func anOrdinaryRoundIsTheDefaultEntry() {
        let pair8s = ScenarioRef(kind: "pair", hand: "8", dealer: "10")
        let h = DrillFixture.makeHarness(dailyGoal: 20, seedWeak: pair8s)
        // The opening hand is the weak spot either way, so the mode shows up only
        // in whether the round *forces* it; that is covered above. Here the point
        // is that nothing about an ordinary entry changed.
        #expect(h.model.question == HandQuestion(prefix: "", value: "8,8", dealer: "10"))
        #expect(h.model.phase == .question)
    }

    @Test func reviewRoundsAreDeclinedWithNothingToReview() {
        let h = DrillFixture.makeHarness(dailyGoal: 1)
        h.model.deal(standScenario)
        h.model.answer(.stand)
        h.scheduler.fire()
        #expect(h.model.phase == .done)
        #expect(h.model.weakSpot == nil)

        h.model.reviewMisses()
        #expect(h.model.phase == .done)
    }

    @Test func aClearedScenarioLeavesTheWeakList() {
        let pair8s = ScenarioRef(kind: "pair", hand: "8", dealer: "10")
        let h = DrillFixture.makeHarness(dailyGoal: 40, seedWeak: pair8s)
        for _ in 0 ..< clearStreak {
            h.missTally.record(.basicStrategy, ref: pair8s, correct: true)
        }
        #expect(h.model.weakSpots.isEmpty)
        #expect(h.model.clearedSpots.map(\.label) == ["8,8 vs 10"])
    }
}

/// Shared engines built once from the bundled data for the drill-model tests.
@MainActor
enum TestEngines {
    static let shared = AppModel()
}
