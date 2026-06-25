import Testing
@testable import BlackjackTrainer

/// Slice 1.5 — deviation engine + evaluator, graded against the exhaustive
/// deviation-vectors.json (62,560 rows: every canonical hand × upcard × true
/// count [-10,+12] × rule set × DAS × LS). The evaluator's expected action,
/// basic action, deviationApplied, matched-rule source, and eval source must all
/// match — including the insurance overlay and surrender precedence.
struct DeviationParityTests {
    private func evaluator() throws -> DeviationEvaluator {
        let charts = try GameData.loadCharts()
        let engine = DeviationEngine(basic: BasicStrategyEngine(charts: charts), charts: charts)
        return DeviationEvaluator(engine: engine)
    }

    @Test func everyDeviationVectorMatches() throws {
        let evaluator = try evaluator()
        let file = try Fixtures.load(DeviationVectorsFile.self, "deviation-vectors")
        #expect(file.count == 62560)
        #expect(file.rows.count == file.count)

        var mismatches = 0
        var firstMismatch = ""
        for row in file.rows {
            guard let ruleSet = RuleSet(rawValue: row.ruleSet) else { continue }
            let scenario = DeviationScenario(player: row.player, dealerUpcard: card(row.dealer),
                                             trueCount: row.trueCount)
            let result = evaluator.evaluate(
                scenario, userAction: .hit, ruleSet: ruleSet,
                options: EngineOptions(doubleAfterSplit: row.das, lateSurrender: row.lateSurrender)
            )
            let expectedSource = file.source(row.matchedRuleSourceIndex)
            let ok = result.expectedAction.rawValue == row.expectedAction
                && result.basicAction.rawValue == row.basicAction
                && result.deviationApplied == row.deviationApplied
                && result.source.rawValue == row.evalSource
                && result.matchedRule?.source == expectedSource
            if !ok {
                mismatches += 1
                if firstMismatch.isEmpty {
                    firstMismatch = "[\(row.handCard1),\(row.handCard2)] v\(row.dealer) tc=\(row.trueCount) "
                        + "\(row.ruleSet) das=\(row.das) ls=\(row.lateSurrender): "
                        + "got (\(result.expectedAction.rawValue),\(result.basicAction.rawValue),"
                        + "\(result.deviationApplied),\(result.source.rawValue),"
                        + "\(result.matchedRule?.source ?? "nil")) "
                        + "want (\(row.expectedAction),\(row.basicAction),\(row.deviationApplied),"
                        + "\(row.evalSource),\(expectedSource ?? "nil"))"
                }
            }
        }
        #expect(mismatches == 0, "\(mismatches) mismatches; first: \(firstMismatch)")
    }

    @Test func insuranceOverlayAtThreshold() throws {
        let evaluator = try evaluator()
        let hand = TwoCardHand(card("10"), card("6")) // hard 16
        // Dealer Ace, TC +3 → insurance is the expected action.
        let atThree = evaluator.evaluate(
            DeviationScenario(player: hand, dealerUpcard: card("A"), trueCount: 3),
            userAction: .insurance, ruleSet: .h17, options: .default
        )
        #expect(atThree.expectedAction == .insurance)
        #expect(atThree.source == .insurance)
        #expect(atThree.correct)
        // TC +2 → no insurance; play the hand.
        let atTwo = evaluator.evaluate(
            DeviationScenario(player: hand, dealerUpcard: card("A"), trueCount: 2),
            userAction: .insurance, ruleSet: .h17, options: .default
        )
        #expect(atTwo.expectedAction != .insurance)
        #expect(atTwo.source == .playing)
        #expect(!atTwo.correct)
    }

    @Test func famousSixteenVsTenStands() throws {
        let evaluator = try evaluator()
        let result = evaluator.evaluate(
            DeviationScenario(player: TwoCardHand(card("10"), card("6")), dealerUpcard: card("10"),
                              trueCount: 0),
            userAction: .stand, ruleSet: .h17, options: .default
        )
        // Illustrious 18 #1: 16 vs 10 stands at TC ≥ 0 (basic would hit).
        #expect(result.expectedAction == .stand)
        #expect(result.deviationApplied)
        #expect(result.basicAction == .hit)
    }
}
