import Testing
@testable import BlackjackTrainer

/// Slice 2.2 — the composition root loads validated data once and wires the
/// engines + stat stores the screens consume.
struct AppModelTests {
    @Test func compositionRootLoadsAndWiresEngines() {
        let model = AppModel()
        #expect(model.countingSystems.count == 58)
        #expect(model.charts.basicStrategy["H17"] != nil)
        #expect(model.charts.basicStrategy["S17"] != nil)

        let decision = model.basicStrategy.decide(
            EngineInput(player: TwoCardHand(card("10"), card("6")), dealerUpcard: card("9"),
                        ruleSet: .h17, options: .default)
        )
        #expect(decision.action == .hit) // hard 16 v 9, H17, no LS

        let deviation = model.deviationEvaluator.evaluate(
            DeviationScenario(player: TwoCardHand(card("10"), card("6")), dealerUpcard: card("10"),
                              trueCount: 0),
            userAction: .stand, ruleSet: .h17, options: .default
        )
        #expect(deviation.expectedAction == .stand) // I18 #1
    }

    @MainActor
    @Test func resetPracticeDataClearsEveryStoreButTheSettings() {
        let model = AppModel()
        model.basicStrategyStats.recordAttempt(correct: true)
        model.deviationStats.recordAttempt(correct: false)
        model.runningCountStats.recordAttempt(correct: true)
        model.trueCountStats.recordAttempt(correct: true)
        model.deckEstimationStats.recordAttempt(correct: true)
        model.keyCountStats.recordAttempt(correct: true)
        model.showdownStats.record(outcome: .win)
        model.showdownBankroll.record(stake: 10, payout: -10)
        model.practiceHistory.recordHand(correct: true)
        model.missTally.record(
            .basicStrategy,
            ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
            correct: false
        )
        model.flowPrefs.setDailyGoal(42)
        model.flowPrefs.setRuleSet(.h17)

        model.resetPracticeData()

        #expect(model.basicStrategyStats.stats == .empty)
        #expect(model.deviationStats.stats == .empty)
        #expect(model.runningCountStats.stats == .empty)
        #expect(model.trueCountStats.stats == .empty)
        #expect(model.deckEstimationStats.stats == .empty)
        #expect(model.keyCountStats.stats == .empty)
        #expect(model.showdownStats.stats == .empty)
        #expect(model.showdownBankroll.state == .empty)
        #expect(model.practiceHistory.handsToday() == 0)
        #expect(model.missTally.weakSpots(.basicStrategy).isEmpty)
        // Settings are not practice data.
        #expect(model.flowPrefs.prefs.dailyGoal == 42)
        #expect(model.flowPrefs.prefs.ruleSet == .h17)

        // AppModel writes to the standard defaults, so hand the shared prefs
        // back the way this test found them.
        model.flowPrefs.setDailyGoal(Double(FlowPrefs.default.dailyGoal))
        model.flowPrefs.setRuleSet(FlowPrefs.default.ruleSet)
    }

    @Test func statStoresUseDistinctKeys() {
        let model = AppModel()
        let keys = [
            model.basicStrategyStats.key, model.runningCountStats.key, model.trueCountStats.key,
            model.deviationStats.key, model.deckEstimationStats.key, model.showdownStats.key
        ]
        #expect(Set(keys).count == keys.count)
    }
}
