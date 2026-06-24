import Testing
@testable import BlackjackTrainer

/// Slice 1.3 — basic-strategy engine, graded against the exhaustive
/// basic-strategy-vectors.json (every canonical hand × upcard × rule set ×
/// DAS × LS). Action, source, label, and rationale must all match.
struct BasicStrategyParityTests {
    private func engine() throws -> BasicStrategyEngine {
        try BasicStrategyEngine(charts: GameData.loadCharts())
    }

    @Test func everyBasicStrategyVectorMatches() throws {
        let engine = try engine()
        let file = try Fixtures.load(BasicStrategyVectorFile.self, "basic-strategy-vectors")
        #expect(file.vectors.count == 2720)

        var mismatches: [String] = []
        for v in file.vectors {
            guard let ruleSet = RuleSet(rawValue: v.ruleSet) else {
                mismatches.append("bad ruleSet \(v.ruleSet)")
                continue
            }
            let input = EngineInput(
                player: v.player,
                dealerUpcard: card(v.dealer),
                ruleSet: ruleSet,
                options: EngineOptions(doubleAfterSplit: v.das, lateSurrender: v.ls)
            )
            let d = engine.decide(input)
            if d.action.rawValue != v.action || d.source.rawValue != v.source
                || d.handDescription != v.label || d.reason != v.rationale {
                mismatches.append(
                    "\(v.hand) v\(v.dealer) \(v.ruleSet) das=\(v.das) ls=\(v.ls): "
                        + "got (\(d.action.rawValue),\(d.source.rawValue),\(d.handDescription),\(d.reason)) "
                        + "want (\(v.action),\(v.source),\(v.label),\(v.rationale))"
                )
            }
        }
        #expect(
            mismatches.isEmpty,
            "\(mismatches.count) mismatches; first: \(mismatches.first ?? "")"
        )
    }

    @Test func insuranceIsAlwaysWrong() throws {
        let engine = try engine()
        // 16 vs 10 H17 (no LS) → hit; clicking insurance is wrong and explains why.
        let input = EngineInput(
            player: TwoCardHand(card("10"), card("6")),
            dealerUpcard: card("A"),
            ruleSet: .h17,
            options: .default
        )
        let result = engine.evaluate(input, userAction: .insurance)
        #expect(!result.correct)
        #expect(result.source == .insurance)
        #expect(result.reason.hasPrefix("Basic strategy never takes insurance"))
        #expect(result.reason.contains("The correct action here is"))
    }

    @Test func correctActionEvaluatesTrue() throws {
        let engine = try engine()
        let input = EngineInput(
            player: TwoCardHand(card("10"), card("10")),
            dealerUpcard: card("6"),
            ruleSet: .s17,
            options: .default
        )
        // Pair of tens never splits → hard 20 → stand.
        let result = engine.evaluate(input, userAction: .stand)
        #expect(result.correct)
        #expect(result.action == .stand)
        #expect(result.handDescription == "Hard 20")
    }
}
