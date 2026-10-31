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
                              trueCount: 1),
            userAction: .stand, ruleSet: .h17, options: .default
        )
        #expect(deviation.expectedAction == .stand) // I18 #1
    }

    /// The tally learns the table from the prefs the Settings screen edits, so a
    /// weak spot from the composition root arrives priced.
    @MainActor
    @Test func compositionRootPricesAWeakSpot() throws {
        let model = AppModel()
        let ref = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
        model.missTally.record(.basicStrategy, ref: ref, correct: false)
        defer { model.resetPracticeData() }
        #expect(model.missTally.weakSpotFor(.basicStrategy)?.costPerMiss
            == model.playCost.cheapestMiss(ref, model.flowPrefs.prefs.playContext))
        let cost = try #require(model.missTally.weakSpotFor(.basicStrategy)?.costPerMiss)
        #expect(cost > 0)
    }

    @MainActor
    @Test func resetPracticeDataClearsEveryStoreButTheSettings() {
        let model = AppModel()
        model.basicStrategyStats.recordAttempt(correct: true)
        model.deviationStats.recordAttempt(correct: false)
        model.runningCountStats.recordAttempt(correct: true)
        model.trueCountStats.recordAttempt(correct: true)
        model.deckEstimationStats.recordAttempt(correct: true)
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
            model.deviationStats.key, model.deckEstimationStats.key
        ]
        #expect(Set(keys).count == keys.count)
    }
}
