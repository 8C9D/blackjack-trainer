import Foundation

/// Port of `basic-strategy-engine.service.ts`. Resolution priority:
///   1. Insurance — handled in `evaluate` (never a correct chart action).
///   2. Pair check (with Y/N/YN fall-through to hard/soft when DAS is off).
///   3. Soft total chart (one ace, total ≤ 21).
///   4. Hard total chart.
/// `SUR_*` cells resolve in place against `EngineOptions`. Graded against the
/// exhaustive `basic-strategy-vectors.json`.
struct BasicStrategyEngine {
    private let charts: ChartsFile

    init(charts: ChartsFile) {
        self.charts = charts
    }

    func decide(_ input: EngineInput) -> StrategyDecision {
        let chart = chart(for: input.ruleSet)
        let dealerKey = normalizeUpcardKey(input.dealerUpcard)

        if let pairKey = HandClassification.pairKey(input.player) {
            let cell = cell(
                chart.pairCell(key: pairKey, upcard: dealerKey),
                "pair[\(pairKey)][\(dealerKey)]"
            )
            if let fromPair = resolvePair(
                cell,
                pairKey: pairKey,
                dealerKey: dealerKey,
                chart: chart,
                options: input.options
            ) {
                return fromPair
            }
            // 'N' / 'YN' with DAS off — fall through to hard/soft resolution.
        }

        if HandClassification.isSoftTwoCard(input.player) {
            return resolveSoft(input.player, dealerKey: dealerKey, chart: chart)
        }
        return resolveHard(input.player, dealerKey: dealerKey, chart: chart, options: input.options)
    }

    func evaluate(_ input: EngineInput, userAction: Action) -> EvaluationResult {
        grade(decide(input), userAction: userAction)
    }

    /// Decide a hand deeper than two cards, where double, split and surrender
    /// have lapsed as a matter of the rules: the soft/hard total row, narrowed
    /// to hit or stand. Mirrors the web `decidePlay`'s total path. The one
    /// dealt opening that reaches it is the pinned hard 20 (F4), whose only
    /// two-card form is the 10,10 pair.
    func decideMultiCard(_ cards: [Card], dealerUpcard: Card,
                         ruleSet: RuleSet) -> StrategyDecision {
        let chart = chart(for: ruleSet)
        let dealerKey = normalizeUpcardKey(dealerUpcard)
        let total = Hand.total(cards)

        if Hand.isSoft(cards) {
            let description = "Soft \(total)"
            let prefix = "\(description) vs dealer \(dealerKey) under \(chart.ruleSet.rawValue)"
            // Soft 21 is off the top of the chart, soft 12 off the bottom; a
            // soft 12 cannot bust, so it hits.
            if total >= 21 {
                return StrategyDecision(action: .stand, source: .soft, handDescription: description,
                                        reason: "\(prefix): stand.")
            }
            if total < 13 {
                return StrategyDecision(action: .hit, source: .soft, handDescription: description,
                                        reason: "\(prefix): hit.")
            }
            let cell = cell(chart.softCell(key: String(total - 11), upcard: dealerKey),
                            "soft[\(total - 11)][\(dealerKey)]")
            switch cell {
            case "H", "D": // doubling has lapsed: D means double-else-hit
                return StrategyDecision(action: .hit, source: .soft, handDescription: description,
                                        reason: "\(prefix): hit (doubling is a first-two-card action).")
            case "S", "Ds": // Ds means double-else-stand
                return StrategyDecision(action: .stand, source: .soft, handDescription: description,
                                        reason: "\(prefix): stand.")
            default:
                preconditionFailure("illegal soft cell '\(cell)'")
            }
        }

        let description = "Hard \(total)"
        let prefix = "\(description) vs dealer \(dealerKey) under \(chart.ruleSet.rawValue)"
        // Hard 21 and above is off the chart; below 5 every row hits.
        if total >= 21 {
            return StrategyDecision(action: .stand, source: .hard, handDescription: description,
                                    reason: "\(prefix): stand.")
        }
        let key = total < 5 ? 5 : total
        let cell = cell(chart.hardCell(total: String(key), upcard: dealerKey),
                        "hard[\(key)][\(dealerKey)]")
        switch cell {
        case "H", "D", "SUR_H": // doubling and surrender have lapsed
            return StrategyDecision(action: .hit, source: .hard, handDescription: description,
                                    reason: "\(prefix): hit.")
        case "S", "SUR_S":
            return StrategyDecision(action: .stand, source: .hard, handDescription: description,
                                    reason: "\(prefix): stand.")
        default:
            preconditionFailure("illegal hard cell '\(cell)'")
        }
    }

    func evaluateMultiCard(
        _ cards: [Card],
        dealerUpcard: Card,
        ruleSet: RuleSet,
        userAction: Action
    ) -> EvaluationResult {
        grade(
            decideMultiCard(cards, dealerUpcard: dealerUpcard, ruleSet: ruleSet),
            userAction: userAction
        )
    }

    private func grade(_ decision: StrategyDecision, userAction: Action) -> EvaluationResult {
        if userAction == .insurance {
            let reason = "Basic strategy never takes insurance (or even money) — the bet has a "
                + "negative expectation. The correct action here is \(decision.action.label): "
                + decision.reason
            return EvaluationResult(action: decision.action, source: .insurance,
                                    handDescription: decision.handDescription, reason: reason,
                                    userAction: userAction, correct: false)
        }
        return EvaluationResult(action: decision.action, source: decision.source,
                                handDescription: decision.handDescription, reason: decision.reason,
                                userAction: userAction, correct: userAction == decision.action)
    }

    // MARK: - resolution

    private func resolvePair(
        _ cell: String,
        pairKey: String,
        dealerKey: String,
        chart: StrategyChart,
        options: EngineOptions
    ) -> StrategyDecision? {
        let description = Self.describePair(pairKey)
        let prefix = "\(description) vs dealer \(dealerKey) under \(chart.ruleSet.rawValue)"

        switch cell {
        case "Y":
            return StrategyDecision(action: .split, source: .pair, handDescription: description,
                                    reason: "\(prefix): split.")
        case "YN":
            guard options.doubleAfterSplit else { return nil }
            return StrategyDecision(action: .split, source: .pair, handDescription: description,
                                    reason: "\(prefix): split (Double After Split is enabled).")
        case "N":
            return nil
        case "SUR_Y":
            if options.lateSurrender {
                return StrategyDecision(action: .surrender, source: .surrender,
                                        handDescription: description,
                                        reason: "\(prefix): surrender (Late Surrender available).")
            }
            return StrategyDecision(
                action: .split, source: .pair, handDescription: description,
                reason: "\(prefix): split (Late Surrender unavailable, so fall back to split)."
            )
        default:
            preconditionFailure("illegal pair cell '\(cell)'")
        }
    }

    private func resolveSoft(_ player: TwoCardHand, dealerKey: String,
                             chart: StrategyChart) -> StrategyDecision {
        let nonAceValue = softNonAceValue(player)

        if nonAceValue == 10 {
            return StrategyDecision(action: .stand, source: .soft,
                                    handDescription: "Blackjack (A + 10)",
                                    reason: "Blackjack — stand.")
        }

        let softTotal = 11 + nonAceValue
        let description = "Soft \(softTotal) (A, \(nonAceValue))"
        let prefix = "\(description) vs dealer \(dealerKey) under \(chart.ruleSet.rawValue)"
        let cell = cell(chart.softCell(key: String(nonAceValue), upcard: dealerKey),
                        "soft[\(nonAceValue)][\(dealerKey)]")

        switch cell {
        case "H":
            return StrategyDecision(action: .hit, source: .soft, handDescription: description,
                                    reason: "\(prefix): hit.")
        case "S":
            return StrategyDecision(action: .stand, source: .soft, handDescription: description,
                                    reason: "\(prefix): stand.")
        case "D", "Ds":
            return StrategyDecision(action: .double, source: .soft, handDescription: description,
                                    reason: "\(prefix): double.")
        default:
            preconditionFailure("illegal soft cell '\(cell)'")
        }
    }

    private func resolveHard(
        _ player: TwoCardHand,
        dealerKey: String,
        chart: StrategyChart,
        options: EngineOptions
    ) -> StrategyDecision {
        let total = player.first.highValue + player.second.highValue
        // Clamp the lookup key up to the lowest chart row (plays identically);
        // the description keeps the true total.
        let key = total < 5 ? 5 : total
        let description = "Hard \(total)"
        let prefix = "\(description) vs dealer \(dealerKey) under \(chart.ruleSet.rawValue)"
        let cell = cell(
            chart.hardCell(total: String(key), upcard: dealerKey),
            "hard[\(key)][\(dealerKey)]"
        )

        switch cell {
        case "H":
            return StrategyDecision(action: .hit, source: .hard, handDescription: description,
                                    reason: "\(prefix): hit.")
        case "S":
            return StrategyDecision(action: .stand, source: .hard, handDescription: description,
                                    reason: "\(prefix): stand.")
        case "D":
            return StrategyDecision(action: .double, source: .hard, handDescription: description,
                                    reason: "\(prefix): double.")
        case "SUR_H":
            if options.lateSurrender {
                return StrategyDecision(action: .surrender, source: .surrender,
                                        handDescription: description,
                                        reason: "\(prefix): surrender.")
            }
            return StrategyDecision(action: .hit, source: .hard, handDescription: description,
                                    reason: "\(prefix): hit (Late Surrender unavailable).")
        case "SUR_S":
            if options.lateSurrender {
                return StrategyDecision(action: .surrender, source: .surrender,
                                        handDescription: description,
                                        reason: "\(prefix): surrender.")
            }
            return StrategyDecision(action: .stand, source: .hard, handDescription: description,
                                    reason: "\(prefix): stand (Late Surrender unavailable).")
        default:
            preconditionFailure("illegal hard cell '\(cell)'")
        }
    }

    // MARK: - helpers

    private func chart(for ruleSet: RuleSet) -> StrategyChart {
        guard let chart = charts.basicStrategy[ruleSet.rawValue] else {
            preconditionFailure("missing chart for \(ruleSet.rawValue)")
        }
        return chart
    }

    private func cell(_ value: String?, _ location: String) -> String {
        guard let value else { preconditionFailure("missing chart cell \(location)") }
        return value
    }

    static func describePair(_ pairKey: String) -> String {
        switch pairKey {
        case "A": "Pair of Aces"
        case "10": "Pair of ten-value cards"
        default: "Pair of \(pairKey)s"
        }
    }
}
