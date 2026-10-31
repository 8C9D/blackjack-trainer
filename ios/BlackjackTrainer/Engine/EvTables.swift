import Foundation

// The shape of `ev-tables.json`: the two generated value tables, which come out of
// `tools/ev/` by way of the web's data files and import nothing from the charts.
// Mirrors `ev.model.ts`.
//
// Every value is in hundredths of a percent of the bet (-5404 is -54.04%), given
// the dealer has no natural, which is the moment a player decides.

/// One column of rows per play. Rows are keyed `hard-16`, `soft-18`, `pair-A`, and
/// each row has one value per entry of `upcards`.
typealias EvColumn = [String: [Double]]

/// One indexed hand at each true count from `minCount` to `maxCount`, read at the
/// decision. Columns are keyed `stand`, `hit`, `double`, and `split` on a pair.
typealias EvCountCell = [String: [Double]]

/// Something held once per rule set. Named keys rather than a dictionary, so a
/// table missing a rule set fails at decode and no read has to invent an answer.
struct EvByRuleSet<Value: Decodable>: Decodable {
    let h17: Value
    let s17: Value

    private enum CodingKeys: String, CodingKey {
        case h17 = "H17"
        case s17 = "S17"
    }

    subscript(ruleSet: RuleSet) -> Value {
        switch ruleSet {
        case .h17: h17
        case .s17: s17
        }
    }
}

struct EvRuleTable: Decodable {
    let stand: EvColumn
    let hit: EvColumn
    let double: EvColumn
    let split: EvColumn
    let splitNoDas: EvColumn
}

struct EvEdges: Decodable {
    let surrender: Double
    let noSurrender: Double
}

struct EvHouseEdge: Decodable {
    let das: EvEdges
    let noDas: EvEdges
}

/// A full shoe: what every chart cell is worth at a neutral count.
struct EvTable: Decodable {
    let decks: Int
    let upcards: [String]
    /// Half a bet at 2:1 on the hole card, with an ace up.
    let insurance: Double
    let houseEdge: EvByRuleSet<EvHouseEdge>
    /// How often each row is dealt against each upcard, per million hands.
    let frequency: EvColumn
    let rules: EvByRuleSet<EvRuleTable>
}

/// Sampled depleted shoes: what the hands with a published index are worth at the
/// counts that decide them.
struct EvByCount: Decodable {
    let decks: Int
    let minCount: Int
    let maxCount: Int
    let insurance: [Double]
    /// Keyed `hard-16-v-10`, the same spelling as `scenarioKey`.
    let cells: EvByRuleSet<[String: EvCountCell]>
}

/// The bundled file. Both platforms read these values rather than each carrying a
/// copy of them.
struct EvTablesFile: Decodable {
    let table: EvTable
    let byCount: EvByCount
}
