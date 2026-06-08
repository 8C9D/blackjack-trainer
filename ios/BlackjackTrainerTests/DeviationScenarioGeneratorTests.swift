import Testing
@testable import BlackjackTrainer

/// The deviation-only generator must build hands the deviation engine routes back
/// to the chosen rule, and bias the true count within range.
struct DeviationScenarioGeneratorTests {
    @Test func generatedHandsRouteToTheirRule() throws {
        let charts = try GameData.loadCharts()
        let generator = DeviationScenarioGenerator(
            random: { 0.5 },
            rulesByRuleSet: charts.deviations
        )
        for ruleSet in RuleSet.allCases {
            for rule in generator.rules(for: ruleSet) where rule.category != "insurance" {
                let scenario = generator.scenario(for: rule, trueCount: 0)
                let (category, playerHand) = DeviationEngine.classifyForDeviation(scenario.player)
                // Surrender hands are hard totals → classify as "hard".
                let expectedCategory = rule.category == "surrender" ? "hard" : rule.category
                #expect(category == expectedCategory, "\(rule.category) \(rule.playerHand)")
                #expect(playerHand == rule.playerHand, "\(rule.category) \(rule.playerHand)")
                #expect(normalizeUpcardKey(scenario.dealerUpcard) == rule.dealerUpcard)
            }
        }
    }

    @Test func pickedTrueCountStaysInRange() throws {
        let charts = try GameData.loadCharts()
        for source in [0.0, 0.25, 0.5, 0.75, 0.99] {
            let generator = DeviationScenarioGenerator(
                random: { source }, rulesByRuleSet: charts.deviations
            )
            for ruleSet in RuleSet.allCases {
                for rule in generator.rules(for: ruleSet) {
                    let trueCount = generator.pickTrueCount(for: rule, minTc: -5, maxTc: 8)
                    #expect(trueCount >= -5 && trueCount <= 8, "\(rule.direction) \(rule.index)")
                }
            }
        }
    }
}
