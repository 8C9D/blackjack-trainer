import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `deviations-drill-page.component.spec.ts`: the true count on the
/// question line, deviation grading, the surrender/insurance overlays, and the
/// session lifecycle.
@MainActor
struct DeviationsDrillModelTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private func scenario(_ a: Rank, _ b: Rank, vs upcard: Rank, tc: Int) -> DeviationScenario {
        DeviationScenario(
            player: TwoCardHand(card(a), card(b, .hearts)),
            dealerUpcard: card(upcard, .clubs),
            trueCount: tc
        )
    }

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private struct Harness {
        let model: DeviationsDrillModel
        let scheduler: ManualFlowAdvanceScheduler
        let prefs: FlowPrefsStore
        let missTally: MissTallyStore
    }

    private func makeHarness(dailyGoal: Int = 20) -> Harness {
        let defaults = freshDefaults()
        let prefs = FlowPrefsStore(defaults: defaults)
        prefs.setDailyGoal(Double(dailyGoal))
        let history = PracticeHistoryStore(defaults: defaults)
        let missTally = MissTallyStore(defaults: defaults)
        let stats = SessionStatsStore(key: StatsKeys.deviation, defaults: defaults)
        let scheduler = ManualFlowAdvanceScheduler()
        let model = DeviationsDrillModel(
            evaluator: TestEngines.shared.deviationEvaluator,
            charts: TestEngines.shared.charts,
            stats: stats,
            prefs: prefs,
            history: history,
            missTally: missTally,
            scheduler: scheduler,
            advanceDelay: .zero
        )
        return Harness(model: model, scheduler: scheduler, prefs: prefs, missTally: missTally)
    }

    @Test func recordsItselfAsTheLastTrainer() {
        let h = makeHarness()
        #expect(h.prefs.prefs.lastTrainer == .deviations)
    }

    @Test func joinsTheTrueCountToTheQuestionLine() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 4))
        #expect(h.model.question == HandQuestion(prefix: "Hard", value: "16", dealer: "10"))
        #expect(h.model.trueCountLabel == "+4")
    }

    @Test func gradesTheDeviationWhenTheThresholdIsMet() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
        h.model.answer(.stand)
        #expect(h.model.result?.correct == true)
        #expect(h.model.result?.deviationApplied == true)
        #expect(h.model.phase == .flash)
    }

    @Test func gradesBasicStrategyBelowTheThreshold() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: -2))
        h.model.answer(.stand)
        #expect(h.model.result?.correct == false)
        #expect(h.model.correctAction == .hit)
        #expect(h.model.phase == .miss)
    }

    @Test func showsTheDeviationExplanationOnAMiss() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
        h.model.answer(.hit)
        #expect(h.model.correctAction == .stand)
        #expect(h.model.explanation.contains("deviation"))
    }

    @Test func keepsSurrenderAnswerableWithLateSurrenderOff() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .eight, tc: 4))
        #expect(h.model.legalActions.contains(.surrender))
        h.model.answer(.surrender)
        #expect(h.model.result?.correct == true)
        #expect(h.model.correctAction == .surrender)
    }

    @Test func offersInsuranceOnlyAgainstAnAceAndGradesItByTrueCount() {
        let h = makeHarness()
        h.model.deal(scenario(.three, .four, vs: .queen, tc: 0))
        #expect(!h.model.legalActions.contains(.insurance))

        h.model.deal(scenario(.three, .four, vs: .ace, tc: 3))
        #expect(h.model.legalActions.contains(.insurance))
        h.model.answer(.insurance)
        #expect(h.model.result?.correct == true)
        #expect(h.model.result?.source == .insurance)
    }

    @Test func decliningInsuranceBelowThreeIsCorrect() {
        let h = makeHarness()
        h.model.deal(scenario(.three, .four, vs: .ace, tc: 0))
        h.model.answer(.insurance)
        #expect(h.model.result?.correct == false)
        #expect(h.model.explanation.contains("Decline insurance"))
    }

    @Test func talliesMissesUnderTheDeviationsTrainer() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
        h.model.answer(.hit)
        #expect(h.missTally.weakSpotFor(.deviations)?.label == "16 vs 10")
        #expect(h.missTally.weakSpotFor(.basicStrategy) == nil)
    }

    @Test func reachesDoneAndOffersOneMoreRound() {
        let h = makeHarness(dailyGoal: 2)
        for _ in 0 ..< 2 {
            h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
            h.model.answer(.stand)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)
        h.model.oneMoreRound()
        #expect(h.model.phase == .question)
        #expect(h.model.target == 4)
    }
}
