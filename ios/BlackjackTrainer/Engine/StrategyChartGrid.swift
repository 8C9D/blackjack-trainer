import Foundation

/// One rendered chart cell: the engine's action for this row against one dealer
/// upcard.
struct ChartCell: Identifiable {
    /// The dealer upcard key, unique within its row.
    let id: String
    let action: Action
    /// "missed 3 of 7 this week" when the hand is still outstanding in the
    /// trainer's weak list, nil otherwise. The grid has no room for the words,
    /// so the ring carries it on screen and this carries it to VoiceOver.
    var missed: String?

    var symbol: String {
        StrategyChartGrid.symbol(for: action)
    }
}

struct ChartRow: Identifiable {
    /// The row label ("16", "A,7", "8,8"), unique within its section.
    var id: String {
        label
    }

    let label: String
    let cells: [ChartCell]
}

struct ChartSection: Identifiable {
    let id: String
    let title: String
    let rowHeader: String
    let rows: [ChartRow]
}

/// The chart screen's two halves.
enum ChartMode: String, CaseIterable, Identifiable {
    case basic
    case deviations

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .basic: "Basic strategy"
        case .deviations: "Deviations"
        }
    }
}

/// One row of the deviation list: the hand, the true count that turns the rule
/// on, and the play it switches to.
struct DeviationRuleRow: Identifiable {
    var id: String {
        hand
    }

    let hand: String
    let threshold: String
    let action: Action
    /// As `ChartCell.missed`; the list is text, so this one is also shown.
    var missed: String?

    var symbol: String {
        StrategyChartGrid.symbol(for: action)
    }

    var label: String {
        action.label
    }
}

struct DeviationSection: Identifiable {
    let id: String
    let title: String
    let rows: [DeviationRuleRow]
}

/// The pure half of the strategy-chart screen, mirroring the web
/// `chart-page.component`: the chart is *rendered by asking the engine*, not by
/// reading the chart data a second time, so the reference the trainee reads and
/// the decision a drill grades cannot drift apart.
///
/// The engine decides on cards, not chart keys, so each row is drawn as a hand
/// that lands on it.
enum StrategyChartGrid {
    /// A soft row's key is its non-ace card; the tally keys it by the total.
    static let softAceValue = 11

    /// Chart shorthand. Surrender is "R", not the BJA charts' "SUR": ten columns
    /// have to fit a phone's width, where three glyphs overrun their cell. Each
    /// cell's accessibility label spells the action out.
    static func symbol(for action: Action) -> String {
        switch action {
        case .surrender: "R"
        case .insurance: "I"
        default: action.rawValue
        }
    }

    /// Section order for the deviation list, matching how the source chart reads.
    static let deviationCategories: [(id: String, title: String)] = [
        ("insurance", "Insurance"),
        ("hard", "Hard totals"),
        ("soft", "Soft totals"),
        ("pair", "Pairs"),
        ("surrender", "Surrender")
    ]

    /// The deviation table for a rule set, grouped for display. Empty groups are
    /// dropped so a chart without, say, surrender rules shows no empty card.
    static func deviationSections(
        rules: [DeviationRule],
        misses: [String: WeakSpot] = [:]
    ) -> [DeviationSection] {
        deviationCategories.compactMap { category in
            let rows = rules
                .filter { $0.category == category.id }
                .map { deviationRow($0, misses: misses) }
            guard !rows.isEmpty else { return nil }
            return DeviationSection(id: category.id, title: category.title, rows: rows)
        }
    }

    /// The scenario a rule is about, in the tally's own terms. Surrender rules
    /// are written over a hard total, so they tally as one; insurance is filed
    /// against whatever hand was dealt rather than against the offer, so it has
    /// no ref of its own and stays unmarked. Mirrors `deviationScenarioRef`.
    static func scenarioRef(for rule: DeviationRule) -> ScenarioRef? {
        switch rule.category {
        case "insurance": nil
        case "surrender": ScenarioRef(
                kind: "hard",
                hand: rule.playerHand,
                dealer: rule.dealerUpcard
            )
        default: ScenarioRef(kind: rule.category, hand: rule.playerHand, dealer: rule.dealerUpcard)
        }
    }

    /// The weak spots a trainer is still carrying, keyed the way a chart cell
    /// looks one up. Mirrors the web page's own lookup map.
    static func missesByKey(_ spots: [WeakSpot]) -> [String: WeakSpot] {
        Dictionary(uniqueKeysWithValues: spots.map { (scenarioKey($0.ref), $0) })
    }

    /// "missed 3 of 7 this week", or nil when the scenario is not outstanding.
    static func missLabel(_ misses: [String: WeakSpot], _ ref: ScenarioRef) -> String? {
        guard let spot = misses[scenarioKey(ref)] else { return nil }
        return "missed \(spot.misses) of \(spot.attempts) this week"
    }

    /// "Take at +3 or above" reads as "≥ +3"; the two count-sign directions carry
    /// no index at all, so they print the comparison the chart legend uses.
    static func threshold(_ rule: DeviationRule) -> String {
        switch rule.direction {
        case "positive": "> 0"
        case "negative": "< 0"
        case "at-or-below": "≤ \(CountFormat.signedCount(Double(rule.index)))"
        default: "≥ \(CountFormat.signedCount(Double(rule.index)))"
        }
    }

    private static func deviationRow(
        _ rule: DeviationRule,
        misses: [String: WeakSpot]
    ) -> DeviationRuleRow {
        DeviationRuleRow(
            // Insurance has no player hand — the dealer's ace is the whole scenario.
            hand: rule.category == "insurance"
                ? "Dealer ace"
                : "\(rule.playerHandLabel) vs \(rule.dealerUpcard)",
            threshold: threshold(rule),
            action: Action(rawValue: rule.deviationAction) ?? .hit,
            missed: scenarioRef(for: rule).flatMap { missLabel(misses, $0) }
        )
    }

    static func sections(
        engine: BasicStrategyEngine,
        ruleSet: RuleSet,
        options: EngineOptions,
        misses: [String: WeakSpot] = [:]
    ) -> [ChartSection] {
        [
            ChartSection(
                id: "hard",
                title: "Hard totals",
                rowHeader: "Total",
                rows: ChartKeys.hardTotals.map { total in
                    row(
                        RowSpec(
                            kind: "hard", handKey: total, label: total,
                            player: hardHand(total: Int(total) ?? 5)
                        ),
                        engine: engine, ruleSet: ruleSet, options: options, misses: misses
                    )
                }
            ),
            ChartSection(
                id: "soft",
                title: "Soft totals",
                rowHeader: "Hand",
                // A soft row is keyed by its non-ace card and tallied by its
                // total, the way the drill files it: A,7 is the scenario 'soft 18'.
                rows: ChartKeys.softKeys.map { key in
                    row(
                        RowSpec(
                            kind: "soft", handKey: String(softAceValue + (Int(key) ?? 0)),
                            label: "A,\(key)", player: softHand(nonAce: key)
                        ),
                        engine: engine, ruleSet: ruleSet, options: options, misses: misses
                    )
                }
            ),
            ChartSection(
                id: "pair",
                title: "Pairs",
                rowHeader: "Hand",
                rows: ChartKeys.pairKeys.map { key in
                    row(
                        RowSpec(
                            kind: "pair", handKey: key, label: "\(key),\(key)",
                            player: pairHand(key: key)
                        ),
                        engine: engine, ruleSet: ruleSet, options: options, misses: misses
                    )
                }
            )
        ]
    }

    /// One row's identity: how the tally keys it (`kind`/`handKey`), how the
    /// chart labels it, and the hand the engine is asked about.
    private struct RowSpec {
        let kind: String
        let handKey: String
        let label: String
        let player: TwoCardHand
    }

    // MARK: - representative hands

    /// Two non-ace cards totalling `total`. Below 12 the partner is a 2 (no such
    /// total is a pair of 2s); from 12 up a ten carries it. Hard 20's only
    /// two-card form is 10,10 — a pair the chart never splits, so the engine
    /// falls through the pair row onto hard 20 and the cell is still this row's
    /// play.
    static func hardHand(total: Int) -> TwoCardHand {
        total < 12
            ? TwoCardHand(card(String(total - 2)), card("2", .hearts))
            : TwoCardHand(card("10"), card(String(total - 10), .hearts))
    }

    static func softHand(nonAce: String) -> TwoCardHand {
        TwoCardHand(card("A"), card(nonAce, .hearts))
    }

    static func pairHand(key: String) -> TwoCardHand {
        TwoCardHand(card(key), card(key, .hearts))
    }

    static func upcardCard(_ upcard: String) -> Card {
        card(upcard)
    }

    // MARK: - internals

    private static func row(
        _ spec: RowSpec,
        engine: BasicStrategyEngine,
        ruleSet: RuleSet,
        options: EngineOptions,
        misses: [String: WeakSpot]
    ) -> ChartRow {
        ChartRow(
            label: spec.label,
            cells: ChartKeys.dealerUpcards.map { upcard in
                let decision = engine.decide(EngineInput(
                    player: spec.player,
                    dealerUpcard: upcardCard(upcard),
                    ruleSet: ruleSet,
                    options: options
                ))
                let ref = ScenarioRef(kind: spec.kind, hand: spec.handKey, dealer: upcard)
                return ChartCell(
                    id: upcard,
                    action: decision.action,
                    missed: missLabel(misses, ref)
                )
            }
        )
    }

    /// Suits differ only so a pair row is physically dealable; no engine reads
    /// them.
    private static func card(_ rank: String, _ suit: Suit = .spades) -> Card {
        Card(rank: Rank(rawValue: rank) ?? .ten, suit: suit)
    }
}
