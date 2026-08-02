import Foundation

/// One rendered chart cell: the engine's action for this row against one dealer
/// upcard.
struct ChartCell: Identifiable {
    /// The dealer upcard key, unique within its row.
    let id: String
    let action: Action

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

/// The pure half of the strategy-chart screen, mirroring the web
/// `chart-page.component`: the chart is *rendered by asking the engine*, not by
/// reading the chart data a second time, so the reference the trainee reads and
/// the decision a drill grades cannot drift apart.
///
/// The engine decides on cards, not chart keys, so each row is drawn as a hand
/// that lands on it.
enum StrategyChartGrid {
    /// Chart shorthand. Surrender is "R", not the BJA charts' "SUR": ten columns
    /// have to fit a phone's width, where three glyphs overrun their cell. Each
    /// cell's accessibility label spells the action out.
    static func symbol(for action: Action) -> String {
        action == .surrender ? "R" : action.rawValue
    }

    static func sections(
        engine: BasicStrategyEngine,
        ruleSet: RuleSet,
        options: EngineOptions
    ) -> [ChartSection] {
        [
            ChartSection(
                id: "hard",
                title: "Hard totals",
                rowHeader: "Total",
                rows: ChartKeys.hardTotals.map { total in
                    row(
                        label: total,
                        player: hardHand(total: Int(total) ?? 5),
                        engine: engine, ruleSet: ruleSet, options: options
                    )
                }
            ),
            ChartSection(
                id: "soft",
                title: "Soft totals",
                rowHeader: "Hand",
                rows: ChartKeys.softKeys.map { key in
                    row(
                        label: "A,\(key)",
                        player: softHand(nonAce: key),
                        engine: engine, ruleSet: ruleSet, options: options
                    )
                }
            ),
            ChartSection(
                id: "pair",
                title: "Pairs",
                rowHeader: "Hand",
                rows: ChartKeys.pairKeys.map { key in
                    row(
                        label: "\(key),\(key)",
                        player: pairHand(key: key),
                        engine: engine, ruleSet: ruleSet, options: options
                    )
                }
            )
        ]
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
        label: String,
        player: TwoCardHand,
        engine: BasicStrategyEngine,
        ruleSet: RuleSet,
        options: EngineOptions
    ) -> ChartRow {
        ChartRow(
            label: label,
            cells: ChartKeys.dealerUpcards.map { upcard in
                let decision = engine.decide(EngineInput(
                    player: player,
                    dealerUpcard: upcardCard(upcard),
                    ruleSet: ruleSet,
                    options: options
                ))
                return ChartCell(id: upcard, action: decision.action)
            }
        )
    }

    /// Suits differ only so a pair row is physically dealable; no engine reads
    /// them.
    private static func card(_ rank: String, _ suit: Suit = .spades) -> Card {
        Card(rank: Rank(rawValue: rank) ?? .ten, suit: suit)
    }
}
