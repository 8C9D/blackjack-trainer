import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `basic-strategy-drill-page.component.spec.ts`: session setup, grade-in-
/// place / auto-advance, the miss pause, poka-yoke, recording, and session end.
@MainActor
struct BasicStrategyDrillModelTests {
    /// Hard 7 (3+4) vs 6 always hits under S17 — "hit" is correct, "stand" wrong.
    private var hitScenario: Scenario {
        Scenario(
            player: TwoCardHand(card(.three), card(.four, .hearts)),
            dealerUpcard: card(.six, .clubs)
        )
    }

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private struct Harness {
        let model: BasicStrategyDrillModel
        let scheduler: ManualFlowAdvanceScheduler
        let prefs: FlowPrefsStore
        let history: PracticeHistoryStore
        let missTally: MissTallyStore
        let stats: SessionStatsStore
    }

    private func makeHarness(
        dailyGoal: Int = 20,
        options: EngineOptions = .default,
        seedWeak: ScenarioRef? = nil
    ) -> Harness {
        let defaults = freshDefaults()
        let prefs = FlowPrefsStore(defaults: defaults)
        prefs.setDailyGoal(Double(dailyGoal))
        prefs.setOptions(options)
        let history = PracticeHistoryStore(defaults: defaults)
        let missTally = MissTallyStore(defaults: defaults)
        if let ref = seedWeak { missTally.record(.basicStrategy, ref: ref, correct: false) }
        let stats = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        let scheduler = ManualFlowAdvanceScheduler()
        let model = BasicStrategyDrillModel(
            engine: TestEngines.shared.basicStrategy,
            stats: stats,
            prefs: prefs,
            history: history,
            missTally: missTally,
            scheduler: scheduler,
            advanceDelay: .zero
        )
        return Harness(
            model: model, scheduler: scheduler, prefs: prefs,
            history: history, missTally: missTally, stats: stats
        )
    }

    // MARK: session setup

    @Test func recordsItselfAsTheLastTrainer() {
        let h = makeHarness()
        #expect(h.prefs.prefs.lastTrainer == .basicStrategy)
    }

    @Test func targetsTheDailyGoal() {
        let h = makeHarness(dailyGoal: 20)
        #expect(h.model.target == 20)
        #expect(h.model.handsToday == 0)
    }

    @Test func opensOnTheRecordedWeakSpot() {
        let h = makeHarness(seedWeak: ScenarioRef(kind: "hard", hand: "16", dealer: "10"))
        #expect(h.model.question == HandQuestion(prefix: "Hard", value: "16", dealer: "10"))
        #expect(h.model.phase == .question)
    }

    // MARK: correct answer — grade in place, auto-advance

    @Test func flashesThenAutoAdvancesWithZeroExtraTaps() {
        let h = makeHarness()
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
        let h = makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.hit)
        h.model.answer(.stand)
        #expect(h.model.handsToday == 1)
    }

    // MARK: miss — the only pause

    @Test func missShowsTheRuleAndWaits() {
        let h = makeHarness()
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
        let h = makeHarness()
        h.model.deal(hitScenario)
        h.model.answer(.stand)
        #expect(h.model.phase == .miss)
        h.model.continueFromMiss()
        #expect(h.model.phase == .question)
        #expect(h.model.result == nil)
    }

    // MARK: poka-yoke

    @Test func disablesIllegalActionsAndKeepsThemInert() {
        let h = makeHarness()
        h.model.deal(hitScenario) // non-pair, no ace up, LS off
        #expect(h.model.legalActions == [.hit, .stand, .double])
        h.model.answer(.split)
        h.model.answer(.insurance)
        h.model.answer(.surrender)
        #expect(h.model.phase == .question)
        #expect(h.model.handsToday == 0)
    }

    @Test func offersSurrenderOnceLateSurrenderIsOn() {
        let h = makeHarness(options: EngineOptions(doubleAfterSplit: false, lateSurrender: true))
        h.model.deal(hitScenario)
        #expect(h.model.legalActions.contains(.surrender))
    }

    @Test func offersInsuranceAgainstADealerAceAndGradesItViaTheEngine() {
        let h = makeHarness()
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
        let h = makeHarness()
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
        let h = makeHarness(dailyGoal: 3)
        #expect(h.model.target == 3)
        for _ in 0 ..< 3 {
            h.model.deal(hitScenario)
            h.model.answer(.hit)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)
        #expect(h.model.session.bestStreak == 3)
        #expect(h.model.session.accuracy == 100)
    }

    @Test func reachesDoneThroughAFinalMiss() {
        let h = makeHarness(dailyGoal: 1)
        h.model.deal(hitScenario)
        h.model.answer(.stand)
        #expect(h.model.phase == .miss)
        h.model.continueFromMiss()
        #expect(h.model.phase == .done)
    }

    @Test func oneMoreRoundStartsAFreshRoundTargetingOneMoreGoal() {
        let h = makeHarness(dailyGoal: 2)
        for _ in 0 ..< 2 {
            h.model.deal(hitScenario)
            h.model.answer(.hit)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)
        h.model.oneMoreRound()
        #expect(h.model.phase == .question)
        #expect(h.model.target == 4)
    }
}

/// Shared engines built once from the bundled data for the drill-model tests.
@MainActor
enum TestEngines {
    static let shared = AppModel()
}
