import Foundation
import Testing
@testable import BlackjackTrainer

/// Exercises the Deviations trainer loop, the next-hand gating, and the
/// deviation-only candidate flag.
struct DeviationsModelTests {
    private func make(
        random: @escaping () -> Double = { 0.5 }
    ) throws -> (model: DeviationsModel, evaluator: DeviationEvaluator) {
        let loaded = try GameData.loadValidated()
        let basic = BasicStrategyEngine(charts: loaded.charts)
        let evaluator = DeviationEvaluator(engine: DeviationEngine(
            basic: basic,
            charts: loaded.charts
        ))
        let suite = "dev-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let store = SessionStatsStore(key: StatsKeys.deviation, defaults: defaults)
        let model = DeviationsModel(
            evaluator: evaluator, charts: loaded.charts, statsStore: store, random: random
        )
        return (model, evaluator)
    }

    @Test func correctAnswerRecordsThenNextHandResets() throws {
        let (model, evaluator) = try make()
        let expected = evaluator.evaluate(
            model.scenario, userAction: .hit, ruleSet: model.ruleSet, options: model.options
        ).expectedAction
        model.answer(expected)
        #expect(model.result?.correct == true)
        #expect(model.sessionStats.attempts == 1)
        model.answer(.stand) // ignored once graded
        #expect(model.sessionStats.attempts == 1)
        model.nextHand()
        #expect(model.result == nil)
    }

    @Test func manualSourceGatesNextHandOnAValidValue() throws {
        let (model, _) = try make()
        model.setTrueCountSource(.manual)
        #expect(model.canDealNextHand) // defaults to 0
        model.manualTrueCount = nil
        #expect(!model.canDealNextHand)
        model.manualTrueCount = 5
        #expect(model.canDealNextHand)
    }

    @Test func switchingToManualWithNilResetsToZero() throws {
        let (model, _) = try make()
        model.manualTrueCount = nil
        model.setTrueCountSource(.manual)
        #expect(model.manualTrueCount == 0)
    }

    @Test func deviationOnlyModeFlagsCandidate() throws {
        let (model, _) = try make()
        model.practiceMode = .deviationOnly
        model.nextHand()
        #expect(model.lastWasDeviationCandidate)
    }

    @Test func resetClearsStats() throws {
        let (model, evaluator) = try make()
        let expected = evaluator.evaluate(
            model.scenario, userAction: .hit, ruleSet: model.ruleSet, options: model.options
        ).expectedAction
        model.answer(expected)
        #expect(model.sessionStats.attempts == 1)
        model.reset()
        #expect(model.sessionStats == .empty)
    }
}
