import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors the Flow-shell parts of `card-counting-page.component.spec.ts`: the
/// session wrapper around the counting mechanics — last-trainer, target math, one
/// hand recorded per graded rep, and the Done/one-more-round lifecycle.
@MainActor
struct CardCountingFlowModelTests {
    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private struct Harness {
        let model: CardCountingFlowModel
        let prefs: FlowPrefsStore
        let history: PracticeHistoryStore
    }

    private func makeHarness(dailyGoal: Int = 20, cards: Int = 1, ms: Int = 100) -> Harness {
        let defaults = freshDefaults()
        let prefs = FlowPrefsStore(defaults: defaults)
        prefs.setDailyGoal(Double(dailyGoal))
        prefs.updateCounting {
            $0.numberOfCards = cards
            $0.millisecondsBetweenCards = ms
            $0.mode = .runningCount
            $0.systemId = "hi-lo"
        }
        let history = PracticeHistoryStore(defaults: defaults)
        let app = TestEngines.shared
        let counting = CountingModel(
            systems: app.countingSystems,
            engine: app.counting,
            runningStore: SessionStatsStore(key: StatsKeys.cardCounting, defaults: defaults),
            trueCountStore: SessionStatsStore(key: StatsKeys.trueCount, defaults: defaults),
            deckEstimationStore: SessionStatsStore(
                key: StatsKeys.deckEstimation,
                defaults: defaults
            )
        )
        let model = CardCountingFlowModel(
            counting: counting,
            prefs: prefs,
            history: history,
            countDrift: CountDriftStore(key: StatsKeys.countDrift, defaults: defaults)
        )
        return Harness(model: model, prefs: prefs, history: history)
    }

    private func waitForAnswering(_ model: CardCountingFlowModel) async {
        for _ in 0 ..< 400 where model.state != .answering {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    @Test func recordsItselfAsTheLastTrainer() {
        let h = makeHarness()
        #expect(h.prefs.prefs.lastTrainer == .cardCounting)
    }

    @Test func targetsTheDailyGoal() {
        let h = makeHarness(dailyGoal: 20)
        #expect(h.model.target == 20)
    }

    @Test func recordsOneHandAndSessionPerGradedRepThenReachesDone() async {
        let h = makeHarness(dailyGoal: 1)
        #expect(h.model.target == 1)
        h.model.start()
        await waitForAnswering(h.model)
        #expect(h.model.state == .answering)
        h.model.answer(0)
        #expect(h.model.state == .feedback)
        #expect(h.history.handsToday() == 1)
        #expect(h.model.session.attempts == 1)
        h.model.runAgain()
        #expect(h.model.done)
    }

    /// Which side a wrong count landed on is recorded beside the rep, so the
    /// Progress screen can say whether the misses lean or scatter.
    @Test func recordsWhichSideTheRunningCountLandedOn() async {
        let h = makeHarness(dailyGoal: 20)
        h.model.start()
        await waitForAnswering(h.model)
        let real = h.model.counting.engine.runningCount(
            h.model.counting.cards,
            system: h.model.counting.system
        )
        h.model.answer(real + 2)
        #expect(h.model.countDrift.drifts == [2])
    }

    @Test func oneMoreRoundRetargetsAndClearsDone() async {
        let h = makeHarness(dailyGoal: 1)
        h.model.start()
        await waitForAnswering(h.model)
        h.model.answer(0)
        h.model.runAgain()
        #expect(h.model.done)
        h.model.oneMoreRound()
        #expect(!h.model.done)
        #expect(h.model.target == 2)
        h.model.exit()
    }
}
