import Foundation

/// Rule set: dealer hits (H17) or stands (S17) on soft 17.
enum RuleSet: String, Codable, CaseIterable {
    case h17 = "H17"
    case s17 = "S17"
}

/// Structural constants shared by the chart models and the integrity check —
/// the Swift mirror of the web's chart key/symbol specs.
enum ChartKeys {
    /// Dealer upcard columns, in canonical order.
    static let dealerUpcards = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]
    /// Hard total rows (hard 5…20; hard 4 clamps to 5 at lookup).
    static let hardTotals = (5 ... 20).map(String.init)
    /// Soft rows keyed on the non-ace card's value (A,2 → "2" … A,9 → "9").
    static let softKeys = (2 ... 9).map(String.init)
    /// Pair rows.
    static let pairKeys = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]

    static let hardCells: Set<String> = ["H", "S", "D", "SUR_H", "SUR_S"]
    static let softCells: Set<String> = ["H", "S", "D", "Ds"]
    static let pairCells: Set<String> = ["Y", "N", "YN", "SUR_Y"]
}

/// A basic-strategy chart, decoded verbatim from `charts.json` (the same bytes
/// the web app uses, per D2). Cells are kept as their raw symbols; the engine
/// resolves them against `EngineOptions`. Tables are keyed by total/pair-rank
/// string → (dealer upcard → cell symbol).
struct StrategyChart: Decodable {
    let ruleSet: RuleSet
    let hard: [String: [String: String]]
    let soft: [String: [String: String]]
    let pair: [String: [String: String]]

    func hardCell(total: String, upcard: String) -> String? {
        hard[total]?[upcard]
    }

    func softCell(key: String, upcard: String) -> String? {
        soft[key]?[upcard]
    }

    func pairCell(key: String, upcard: String) -> String? {
        pair[key]?[upcard]
    }
}

/// Top-level shape of `charts.json`. (Deviation tables are also present and are
/// decoded in Slice 1.5.)
struct ChartsFile: Decodable {
    let basicStrategy: [String: StrategyChart]
}
