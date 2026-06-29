import Foundation
import Testing
@testable import BlackjackTrainer

/// Exercises the Basic Strategy trainer loop (deal → answer → feedback → next),
/// mirroring the web `BasicStrategyPageComponent` spec.
struct BasicStrategyModelTests {
    private func make(
        random: @escaping () -> Double = { 0 }
    ) throws -> (model: BasicStrategyModel, engine: BasicStrategyEngine) {
        let loaded = try GameData.loadValidated()
        let suite = "bs-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let engine = BasicStrategyEngine(charts: loaded.charts)
        let store = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        let model = BasicStrategyModel(
            engine: engine,
            statsStore: store,
            generator: CardGenerator(random: random)
        )
        return (model, engine)
    }

    private func currentInput(_ model: BasicStrategyModel) -> EngineInput {
        EngineInput(
            player: model.scenario.player,
            dealerUpcard: model.scenario.dealerUpcard,
            ruleSet: model.ruleSet,
            options: model.options
        )
    }

    @Test func correctAnswerSetsResultAndRecordsStreak() throws {
        let (model, engine) = try make()
        let expected = engine.decide(currentInput(model))
        model.answer(expected.action)
        #expect(model.result?.correct == true)
        #expect(model.sessionStats.attempts == 1)
        #expect(model.sessionStats.correct == 1)
        #expect(model.sessionStats.streak == 1)
    }

    @Test func insuranceIsAlwaysIncorrect() throws {
        let (model, _) = try make()
        model.answer(.insurance)
        #expect(model.result?.correct == false)
        #expect(model.sessionStats.attempts == 1)
        #expect(model.sessionStats.correct == 0)
    }

    @Test func secondAnswerIsIgnoredUntilNextHand() throws {
        let (model, _) = try make()
        model.answer(.insurance)
        let snapshot = model.sessionStats
        model.answer(.hit) // ignored: hand already graded
        #expect(model.sessionStats == snapshot)
        #expect(model.result?.userAction == .insurance)
    }

    @Test func nextHandClearsResult() throws {
        let (model, _) = try make()
        model.answer(.insurance)
        #expect(model.result != nil)
        model.nextHand()
        #expect(model.result == nil)
    }

    @Test func resetClearsStats() throws {
        let (model, _) = try make()
        model.answer(.insurance)
        #expect(model.sessionStats.attempts == 1)
        model.reset()
        #expect(model.sessionStats == .empty)
    }
}
