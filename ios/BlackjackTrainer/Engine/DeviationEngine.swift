import Foundation

/// Port of `deviation-engine.service.ts`. Resolves the BJA Hi-Lo overlay on top
/// of the live basic-strategy action, honoring surrender precedence and the
/// insurance overlay. Graded (via `DeviationEvaluator`) against the exhaustive
/// `deviation-vectors.json`.
struct DeviationEngine {
    private let basic: BasicStrategyEngine
    private let deviations: [String: [DeviationRule]]

    init(basic: BasicStrategyEngine, charts: ChartsFile) {
        self.basic = basic
        deviations = charts.deviations
    }

    func findRule(ruleSet: RuleSet, category: String, playerHand: String,
                  dealerUpcard: String) -> DeviationRule? {
        deviations[ruleSet.rawValue]?.first {
            $0.category == category && $0.playerHand == playerHand && $0
                .dealerUpcard == dealerUpcard
        }
    }

    func isThresholdMet(_ rule: DeviationRule, trueCount: Int) -> Bool {
        switch rule.direction {
        case "at-or-above": trueCount >= rule.index
        case "at-or-below": trueCount <= rule.index
        case "positive": trueCount > 0
        case "negative": trueCount < 0
        default: false
        }
    }

    /// Resolution order: surrender deviation (checked first — a hand can have
    /// both a surrender and a natural deviation) → respect a live surrender →
    /// natural-category deviation → otherwise the live basic action stands.
    func resolveDeviationDecision(_ input: EngineInput, trueCount: Int) -> DeviationDecision {
        let basicAction = basic.decide(input).action
        let dealerKey = normalizeUpcardKey(input.dealerUpcard)
        let (category, playerHand) = Self.classifyForDeviation(input.player)

        let surrenderRule = findRule(ruleSet: input.ruleSet, category: "surrender",
                                     playerHand: playerHand, dealerUpcard: dealerKey)
        if let surrenderRule, isThresholdMet(surrenderRule, trueCount: trueCount) {
            return DeviationDecision(basicAction: basicAction,
                                     finalAction: Self.action(surrenderRule.deviationAction),
                                     deviationApplied: true, matchedRule: surrenderRule,
                                     trueCount: trueCount)
        }

        if basicAction == .surrender {
            // Don't let a natural-category deviation downgrade a live surrender;
            // surface the (sub-threshold) surrender candidate for UI hints.
            return DeviationDecision(basicAction: basicAction, finalAction: basicAction,
                                     deviationApplied: false, matchedRule: surrenderRule,
                                     trueCount: trueCount)
        }

        let rule = findRule(ruleSet: input.ruleSet, category: category,
                            playerHand: playerHand, dealerUpcard: dealerKey)
        if let rule, isThresholdMet(rule, trueCount: trueCount) {
            return DeviationDecision(basicAction: basicAction,
                                     finalAction: Self.action(rule.deviationAction),
                                     deviationApplied: true, matchedRule: rule,
                                     trueCount: trueCount)
        }

        return DeviationDecision(basicAction: basicAction, finalAction: basicAction,
                                 deviationApplied: false, matchedRule: rule, trueCount: trueCount)
    }

    /// Insurance overlay (dealer Ace only). Declines unless the insurance rule's
    /// threshold (TC ≥ +3) is met.
    func resolveInsuranceDecision(trueCount: Int, ruleSet: RuleSet) -> DeviationDecision {
        let rule = findRule(ruleSet: ruleSet, category: "insurance",
                            playerHand: "insurance", dealerUpcard: "A")
        let decline = Action.hit
        if let rule, isThresholdMet(rule, trueCount: trueCount) {
            return DeviationDecision(
                basicAction: decline,
                finalAction: Self.action(rule.deviationAction),
                deviationApplied: true,
                matchedRule: rule,
                trueCount: trueCount
            )
        }
        return DeviationDecision(basicAction: decline, finalAction: decline,
                                 deviationApplied: false, matchedRule: rule, trueCount: trueCount)
    }

    /// Classify a two-card hand into the (category, playerHand) tuple used to
    /// look up natural-category deviation rules (pairs take precedence).
    static func classifyForDeviation(_ player: TwoCardHand)
        -> (category: String, playerHand: String) {
        if let pairKey = HandClassification.pairKey(player) {
            return ("pair", pairKey)
        }
        if HandClassification.isSoftTwoCard(player) {
            return ("soft", String(11 + softNonAceValue(player)))
        }
        return ("hard", String(player.first.highValue + player.second.highValue))
    }

    private static func action(_ raw: String) -> Action {
        guard let action = Action(rawValue: raw) else {
            preconditionFailure("illegal deviation action '\(raw)'")
        }
        return action
    }
}

/// Port of `deviation-evaluator.service.ts`: the insurance overlay (dealer Ace,
/// TC ≥ +3) dominates the playing-decision deviation overlay. (The feedback
/// explanation strings are formatted alongside the Deviations screen, Slice 3.5.)
struct DeviationEvaluator {
    private let engine: DeviationEngine

    init(engine: DeviationEngine) {
        self.engine = engine
    }

    func evaluate(
        _ scenario: DeviationScenario,
        userAction: Action,
        ruleSet: RuleSet,
        options: EngineOptions
    ) -> DeviationTrainerResult {
        let input = EngineInput(player: scenario.player, dealerUpcard: scenario.dealerUpcard,
                                ruleSet: ruleSet, options: options)
        let playing = engine.resolveDeviationDecision(input, trueCount: scenario.trueCount)
        let insurance = scenario.dealerUpcard.isAce
            ? engine.resolveInsuranceDecision(trueCount: scenario.trueCount, ruleSet: ruleSet)
            : nil

        if let insurance, insurance.deviationApplied {
            return DeviationTrainerResult(
                userAction: userAction, expectedAction: .insurance,
                basicAction: playing.basicAction,
                trueCount: scenario.trueCount, deviationApplied: true,
                matchedRule: insurance.matchedRule,
                source: .insurance, correct: userAction == .insurance
            )
        }
        return DeviationTrainerResult(
            userAction: userAction, expectedAction: playing.finalAction,
            basicAction: playing.basicAction,
            trueCount: scenario.trueCount, deviationApplied: playing.deviationApplied,
            matchedRule: playing.matchedRule, source: .playing,
            correct: userAction == playing.finalAction
        )
    }
}
