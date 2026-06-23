import Testing
@testable import BlackjackTrainer

/// Slice 1.2 — chart & counting-system data layer. Decodes the bundled JSON
/// (the exported source of truth) and runs the startup integrity check.
struct DataLayerTests {
    @Test func loadsAndValidatesBundledData() throws {
        let (charts, systems) = try GameData.loadValidated()
        #expect(charts.basicStrategy["H17"] != nil)
        #expect(charts.basicStrategy["S17"] != nil)
        #expect(systems.count == 58)
    }

    @Test func integrityCheckIsClean() throws {
        let charts = try GameData.loadCharts()
        let systems = try GameData.loadCountingSystems()
        let problems = GameData.integrityProblems(charts: charts, systems: systems)
        #expect(problems.isEmpty, "integrity problems: \(problems.prefix(10))")
    }

    @Test func chartsHaveCompleteRowsAndLegalCells() throws {
        let charts = try GameData.loadCharts()
        for ruleSet in RuleSet.allCases {
            let chart = try #require(charts.basicStrategy[ruleSet.rawValue])
            #expect(Set(chart.hard.keys) == Set(ChartKeys.hardTotals))
            #expect(Set(chart.soft.keys) == Set(ChartKeys.softKeys))
            #expect(Set(chart.pair.keys) == Set(ChartKeys.pairKeys))
            // Spot-check known cells: hard 16 vs 10 surrenders-or-hits; hard 20
            // always stands; hard 5 always hits.
            #expect(chart.hardCell(total: "16", upcard: "10") == "SUR_H")
            #expect(chart.hardCell(total: "20", upcard: "6") == "S")
            #expect(chart.hardCell(total: "5", upcard: "10") == "H")
        }
    }

    @Test func colorSystemsPreserveTags() throws {
        let systems = try GameData.loadCountingSystems()
        // Red Seven tags the 7 by color: red +1, black 0 (so values["7"] = 0.5).
        let redSeven = try #require(systems.first { $0.id == "red-seven" })
        let seven = try #require(redSeven.colorValues?["7"])
        #expect(seven.red == 1)
        #expect(seven.black == 0)
        #expect(redSeven.value(for: Card(rank: .seven, suit: .hearts)) == 1) // red
        #expect(redSeven.value(for: Card(rank: .seven, suit: .spades)) == 0) // black
    }

    @Test func fractionalSystemIsFlagged() throws {
        let systems = try GameData.loadCountingSystems()
        let wong = try #require(systems.first { $0.id == "wong-halves" })
        #expect(wong.isFractional)
        let hiLo = try #require(systems.first { $0.id == "hi-lo" })
        #expect(!hiLo.isFractional)
    }
}
