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

    @Test func statStoresUseDistinctKeys() {
        let model = AppModel()
        let keys = [
            model.basicStrategyStats.key, model.runningCountStats.key, model.trueCountStats.key,
            model.deviationStats.key, model.deckEstimationStats.key, model.showdownStats.key
        ]
        #expect(Set(keys).count == keys.count)
    }
}
