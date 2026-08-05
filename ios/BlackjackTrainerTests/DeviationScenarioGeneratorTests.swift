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

    /// The point of pickTrueCount is to land the count on the intended side of
    /// the rule's threshold — not merely within range. A swapped met/unmet
    /// branch in `range(for:wantMet:)` would train the user backwards yet still
    /// pass the bounds check above.
    @Test func pickedTrueCountLandsOnTheIntendedSideOfEachThreshold() throws {
        let charts = try GameData.loadCharts()
        func meets(_ rule: DeviationRule, _ tc: Int) -> Bool {
            switch rule.direction {
            case "at-or-above": tc >= rule.index
            case "at-or-below": tc <= rule.index
            case "positive": tc > 0
            case "negative": tc < 0
            default: false
            }
        }
        // random() < 0.5 forces the "met" side; >= 0.5 forces "not met". With a
        // constant source pickInt is deterministic; wide bounds keep every range
        // non-empty so there is no fallback flip to the other side.
        for (source, wantMet) in [(0.0, true), (0.9, false)] {
            let generator = DeviationScenarioGenerator(
                random: { source }, rulesByRuleSet: charts.deviations
            )
            for ruleSet in RuleSet.allCases {
                for rule in generator.rules(for: ruleSet) {
                    let tc = generator.pickTrueCount(for: rule, minTc: -20, maxTc: 20)
                    #expect(
                        meets(rule, tc) == wantMet,
                        "\(rule.direction) idx \(rule.index): tc \(tc), wantMet \(wantMet)"
                    )
                }
            }
        }
    }

    /// The surrender overlay needs Late Surrender to fire, so without it a
    /// surrender rule would build a hand around an index that cannot apply — and
    /// pick a count to straddle a threshold with nothing on the other side.
    @Test func neverDrawsASurrenderRuleWithoutLateSurrender() throws {
        let charts = try GameData.loadCharts()
        var drawn: Set<String> = []
        for step in stride(from: 0.0, to: 1.0, by: 0.01) {
            let generator = DeviationScenarioGenerator(
                random: { step }, rulesByRuleSet: charts.deviations
            )
            for ruleSet in RuleSet.allCases {
                let off = generator.pickRule(for: ruleSet, options: .default)
                #expect(off?.category != "surrender")
                if let category = generator.pickRule(for: ruleSet, options: .surrenderOffered)?
                    .category {
                    drawn.insert(category)
                }
            }
        }
        // And the rest of the chart is still reachable, surrender included, at a
        // table that deals it.
        #expect(drawn.contains("surrender"))
        #expect(drawn.count > 2)
    }
}
