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

        // Surrender deviations are HARD-total rules ('15'/'16'). Only apply them
        // to a hard hand: a soft hand's total key collides with a hard total
        // (soft 15 (A,4) → '15', soft 16 (A,5) → '16'), and surrendering a soft
        // 15/16 — which can never bust — is never correct.
        let surrenderRule = category == "hard"
            ? findRule(ruleSet: input.ruleSet, category: "surrender",
                       playerHand: playerHand, dealerUpcard: dealerKey)
            : nil
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

    /// The same question asked at a table instead of off a chart: the hand may
    /// be three cards deep and doubling, splitting or surrender may already be
    /// gone, so it wraps `decidePlay` rather than `decide`. The showdown is
    /// where the count a trainee has been keeping finally meets a hand, and
    /// grading that hand on basic strategy alone would mark the Illustrious 18
    /// wrong at the one table the app owns.
    ///
    /// The index only overrides a play the felt is actually offering. A
    /// deviation calling for a double the bankroll cannot back, or a split past
    /// the box's four-hand cap, is not a play the trainee declined — so the
    /// chart's own answer stands. Mirrors `resolvePlayDecision`.
    /// The chart's own answer for a hand under way, before any index. Exposed so
    /// the evaluator can report `basicAction` beside a deviated one (`private` is
    /// file-scoped to the declaring type, so it cannot reach the engine's own).
    func basicPlay(_ input: PlayInput) -> StrategyDecision {
        basic.decidePlay(input)
    }

    func resolvePlayDecision(_ input: PlayInput, trueCount: Int) -> PlayDeviationDecision {
        let basic = basic.decidePlay(input)
        let opening = input.player.count == 2
        guard let classified = Self.classifyPlayForDeviation(
            input.player, splitOnOffer: opening && input.canSplit
        ) else {
            return PlayDeviationDecision(decision: basic, deviationApplied: false, matchedRule: nil)
        }
        let dealerKey = normalizeUpcardKey(input.dealerUpcard)

        // Surrender deviations are hard-total rules over a first-two-card
        // action, so the overlay is gated the way `decidePlay` gates the chart's
        // own SUR cells — see `resolveDeviationDecision` for why category
        // matters here.
        let surrenderOffered = opening && input.canSurrender && input.options.lateSurrender
        let surrenderRule = classified.category == "hard" && surrenderOffered
            ? findRule(ruleSet: input.ruleSet, category: "surrender",
                       playerHand: classified.playerHand, dealerUpcard: dealerKey)
            : nil
        if let surrenderRule, isThresholdMet(surrenderRule, trueCount: trueCount),
           let play = Self.deviationPlay(surrenderRule, input) {
            return Self.deviated(basic, rule: surrenderRule, action: play, trueCount: trueCount)
        }

        // A surrender the chart already calls for is not downgraded to a stand
        // or a hit by a natural-category index — the same precedence the
        // trainer keeps.
        if basic.action == .surrender {
            return PlayDeviationDecision(decision: basic, deviationApplied: false,
                                         matchedRule: surrenderRule)
        }

        let rule = findRule(ruleSet: input.ruleSet, category: classified.category,
                            playerHand: classified.playerHand, dealerUpcard: dealerKey)
        if let rule, isThresholdMet(rule, trueCount: trueCount),
           let play = Self.deviationPlay(rule, input) {
            return Self.deviated(basic, rule: rule, action: play, trueCount: trueCount)
        }
        return PlayDeviationDecision(decision: basic, deviationApplied: false, matchedRule: rule)
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

    /// The same classification for a hand mid-round, which may be more than two
    /// cards. An index is written against a total, so a three-card 16 vs 10 is
    /// the same chart cell as a two-card one; only the pair row needs the hand
    /// to still be two cards with the split on offer, mirroring how `decidePlay`
    /// takes a lapsed split straight to the total. Nil when there is no cell to
    /// look up: a single card, or a hand already past 21.
    static func classifyPlayForDeviation(_ cards: [Card], splitOnOffer: Bool)
        -> (category: String, playerHand: String)? {
        guard cards.count >= 2 else { return nil }
        if cards.count == 2, splitOnOffer,
           let pairKey = HandClassification.pairKey(TwoCardHand(cards[0], cards[1])) {
            return ("pair", pairKey)
        }
        let total = Hand.total(cards)
        guard total <= 21 else { return nil }
        return (Hand.isSoft(cards) ? "soft" : "hard", String(total))
    }

    /// The play a rule calls for, or nil when the felt is not offering it.
    /// Insurance is filtered here too: it has its own overlay and its own
    /// decision point, and must never surface as a playing action.
    private static func deviationPlay(_ rule: DeviationRule, _ input: PlayInput) -> Action? {
        let opening = input.player.count == 2
        switch action(rule.deviationAction) {
        case .insurance: return nil
        case .double: return input.canDouble && opening ? .double : nil
        case .split: return input.canSplit && opening ? .split : nil
        case .surrender:
            return input.canSurrender && opening && input.options.lateSurrender ? .surrender : nil
        case let other: return other
        }
    }

    private static func deviated(_ basic: StrategyDecision, rule: DeviationRule,
                                 action: Action, trueCount: Int) -> PlayDeviationDecision {
        // The index is quoted from the rule that just fired rather than
        // restated, so a corrected chart cannot leave this sentence citing a
        // stale number.
        let reason = "\(rule.playerHandLabel) vs dealer \(rule.dealerUpcard): "
            + "\(action.label.lowercased()) \(rule.thresholdClause), and the count is "
            + "\(CountFormat.signedCount(Double(trueCount))). "
            + "Basic strategy alone would \(basic.action.label.lowercased())."
        let decision = StrategyDecision(
            action: action,
            source: DecisionSource(rawValue: rule.category) ?? .hard,
            handDescription: basic.handDescription,
            reason: reason
        )
        return PlayDeviationDecision(decision: decision, deviationApplied: true, matchedRule: rule)
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
/// A deviation question about a hand already under way: the cards as they
/// stand, the count they are being played at, and the table rules. Bundled
/// rather than passed loose so `evaluatePlay` stays inside the parameter limit.
struct PlayedOutHand {
    let player: [Card]
    let dealerUpcard: Card
    let trueCount: Int
    let ruleSet: RuleSet
    let options: EngineOptions
}

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

    /// The same verdict for a hand already under way. An index is written against
    /// a total, so it applies to a three-card 16 exactly as it does to a two-card
    /// one — which is what the showdown grades and what the drill can now teach.
    /// Two things are gone by then: doubling, splitting and surrender are
    /// first-two-card actions, and insurance was settled before the hand was
    /// played. Mirrors the web `evaluatePlay`.
    func evaluatePlay(_ hand: PlayedOutHand, userAction: Action) -> DeviationTrainerResult {
        let input = PlayInput(
            player: hand.player, dealerUpcard: hand.dealerUpcard,
            ruleSet: hand.ruleSet, options: hand.options,
            canDouble: false, canSplit: false, canSurrender: false
        )
        let basic = engine.basicPlay(input)
        let resolved = engine.resolvePlayDecision(input, trueCount: hand.trueCount)
        return DeviationTrainerResult(
            userAction: userAction, expectedAction: resolved.action,
            basicAction: basic.action,
            trueCount: hand.trueCount, deviationApplied: resolved.deviationApplied,
            matchedRule: resolved.matchedRule, source: .playing,
            correct: userAction == resolved.action
        )
    }
}
