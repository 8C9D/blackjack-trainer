import Foundation

/// Loads the bundled chart and counting-system JSON (the exported source of
/// truth, per D2) and runs a startup integrity check mirroring the web app's
/// structural specs.
enum GameData {
    private final class BundleToken {}

    /// The app bundle that carries `charts.json` and `counting-systems.json`.
    static var bundle: Bundle {
        Bundle(for: BundleToken.self)
    }

    enum DataError: Error, CustomStringConvertible {
        case missingResource(String)
        case integrity([String])

        var description: String {
            switch self {
            case let .missingResource(name): "bundled resource \(name).json not found"
            case let .integrity(problems): "data integrity failed: \(problems.joined(separator: "; "))"
            }
        }
    }

    static func loadCharts() throws -> ChartsFile {
        try decode(ChartsFile.self, "charts")
    }

    static func loadCountingSystems() throws -> [CountingSystem] {
        try decode(CountingSystemsFile.self, "counting-systems").systems
    }

    /// Loads both data sets and throws if the integrity check finds any problem.
    @discardableResult
    static func loadValidated() throws -> (charts: ChartsFile, systems: [CountingSystem]) {
        let charts = try loadCharts()
        let systems = try loadCountingSystems()
        let problems = integrityProblems(charts: charts, systems: systems)
        guard problems.isEmpty else { throw DataError.integrity(problems) }
        return (charts, systems)
    }

    private static func decode<T: Decodable>(_: T.Type, _ name: String) throws -> T {
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw DataError.missingResource(name)
        }
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    /// Returns a list of structural problems; empty means the data is well-formed
    /// (all expected charts/rows/keys present, legal cell symbols, 58 systems
    /// with full rank coverage, and the color-tag averaging invariant).
    static func integrityProblems(charts: ChartsFile, systems: [CountingSystem]) -> [String] {
        var problems: [String] = []

        for ruleSet in RuleSet.allCases {
            guard let chart = charts.basicStrategy[ruleSet.rawValue] else {
                problems.append("missing basicStrategy[\(ruleSet.rawValue)]")
                continue
            }
            check(chart.hard, keys: ChartKeys.hardTotals, cells: ChartKeys.hardCells,
                  name: "\(ruleSet.rawValue).hard", into: &problems)
            check(chart.soft, keys: ChartKeys.softKeys, cells: ChartKeys.softCells,
                  name: "\(ruleSet.rawValue).soft", into: &problems)
            check(chart.pair, keys: ChartKeys.pairKeys, cells: ChartKeys.pairCells,
                  name: "\(ruleSet.rawValue).pair", into: &problems)
        }

        if systems.count != 58 {
            problems.append("expected 58 counting systems, got \(systems.count)")
        }
        let allRanks = Set(Card.allRanks.map(\.rawValue))
        for system in systems {
            let missing = allRanks.subtracting(system.values.keys)
            if !missing.isEmpty {
                problems.append("\(system.id) missing values for \(missing.sorted())")
            }
            for (rank, color) in system.colorValues ?? [:] {
                guard let scalar = system.values[rank] else { continue }
                if abs(scalar - (color.red + color.black) / 2) > 1e-9 {
                    problems.append("\(system.id) colorValues[\(rank)] avg != values[\(rank)]")
                }
            }
        }
        return problems
    }

    private static func check(
        _ table: [String: [String: String]],
        keys: [String],
        cells: Set<String>,
        name: String,
        into problems: inout [String]
    ) {
        if Set(table.keys) != Set(keys) {
            problems
                .append(
                    "\(name): row keys \(Set(table.keys).symmetricDifference(Set(keys)).sorted())"
                )
        }
        for (key, row) in table {
            if Set(row.keys) != Set(ChartKeys.dealerUpcards) {
                problems.append("\(name)[\(key)]: bad upcard columns")
            }
            for (upcard, cell) in row where !cells.contains(cell) {
                problems.append("\(name)[\(key)][\(upcard)]: illegal cell '\(cell)'")
            }
        }
    }
}
