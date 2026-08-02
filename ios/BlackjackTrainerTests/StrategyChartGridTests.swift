import Testing
@testable import BlackjackTrainer

/// The strategy-chart reference screen's pure half, mirroring the web
/// `chart-page.component.spec`. The grid is only trustworthy if every row is
/// drawn as a hand that actually lands on it, so those guards come first.
struct StrategyChartGridTests {
    private func engine() throws -> BasicStrategyEngine {
        try BasicStrategyEngine(charts: GameData.loadCharts())
    }

    private func sections(
        ruleSet: RuleSet = .s17,
        das: Bool = false,
        ls: Bool = false
    ) throws -> [ChartSection] {
        try StrategyChartGrid.sections(
            engine: engine(),
            ruleSet: ruleSet,
            options: EngineOptions(doubleAfterSplit: das, lateSurrender: ls)
        )
    }

    private func cells(_ sections: [ChartSection], _ sectionId: String,
                       _ label: String) -> [String] {
        guard let section = sections.first(where: { $0.id == sectionId }),
              let row = section.rows.first(where: { $0.label == label })
        else { return [] }
        return row.cells.map(\.symbol)
    }

    /// The cell against one dealer upcard.
    private func cell(
        _ sections: [ChartSection],
        _ sectionId: String,
        _ label: String,
        vs upcard: String
    ) -> String? {
        guard let index = ChartKeys.dealerUpcards.firstIndex(of: upcard) else { return nil }
        return cells(sections, sectionId, label)[safe: index]
    }

    // MARK: representative hands

    @Test func everyHardTotalLandsOnItsOwnRowAndNeverOnAPairRow() {
        for total in 5 ... 20 {
            let hand = StrategyChartGrid.hardHand(total: total)
            #expect(hand.first.highValue + hand.second.highValue == total)
            #expect(!HandClassification.isSoftTwoCard(hand))
            // Hard 20 is only dealable as 10,10; every other row avoids the pair
            // lookup entirely.
            #expect(HandClassification.pairKey(hand) == (total == 20 ? "10" : nil))
        }
    }

    @Test func everySoftTotalLandsOnTheMatchingRow() {
        for key in ChartKeys.softKeys {
            let hand = StrategyChartGrid.softHand(nonAce: key)
            #expect(HandClassification.isSoftTwoCard(hand))
            #expect(softNonAceValue(hand) == Int(key))
        }
    }

    @Test func everyPairLandsOnItsOwnRow() {
        for key in ChartKeys.pairKeys {
            #expect(HandClassification.pairKey(StrategyChartGrid.pairHand(key: key)) == key)
        }
    }

    // MARK: the grid

    @Test func rendersARowPerChartKeyAndAColumnPerUpcard() throws {
        let sections = try sections()
        #expect(sections.map(\.id) == ["hard", "soft", "pair"])
        #expect(sections[0].rows.count == 16)
        #expect(sections[1].rows.count == 8)
        #expect(sections[2].rows.count == 10)
        for section in sections {
            for row in section.rows {
                #expect(row.cells.count == ChartKeys.dealerUpcards.count)
                #expect(row.cells.map(\.id) == ChartKeys.dealerUpcards)
            }
        }
    }

    @Test func hardTwentyStandsAgainstEveryUpcard() throws {
        #expect(try cells(sections(), "hard", "20") == Array(repeating: "S", count: 10))
    }

    @Test func pairCellsTheChartDeclinesToSplitShowTheFallBackPlay() throws {
        let sections = try sections()
        // 10,10 is never split, so the row shows what hard 20 plays.
        #expect(cells(sections, "pair", "10,10") == Array(repeating: "S", count: 10))
        // 8,8 is always split.
        #expect(cells(sections, "pair", "8,8") == Array(repeating: "P", count: 10))
    }

    // MARK: the active rules

    @Test func softEighteenVsTwoFollowsTheRuleSet() throws {
        #expect(try cell(sections(ruleSet: .s17), "soft", "A,7", vs: "2") == "S")
        #expect(try cell(sections(ruleSet: .h17), "soft", "A,7", vs: "2") == "D")
    }

    @Test func sixteenVsTenSurrendersOnlyWithLateSurrender() throws {
        #expect(try cell(sections(), "hard", "16", vs: "10") == "H")
        #expect(try cell(sections(ls: true), "hard", "16", vs: "10") == "R")
    }

    @Test func fourFourVsFiveSplitsOnlyWithDoubleAfterSplit() throws {
        // Without DAS the hand falls through to hard 8 — hit.
        #expect(try cell(sections(), "pair", "4,4", vs: "5") == "H")
        #expect(try cell(sections(das: true), "pair", "4,4", vs: "5") == "P")
    }

    @Test func surrenderIsAbbreviatedToOneGlyph() {
        #expect(StrategyChartGrid.symbol(for: .surrender) == "R")
        #expect(Action.chartLegend.map(StrategyChartGrid.symbol) == ["H", "S", "D", "P", "R"])
        #expect(Action.chartLegend.map(\.label) == ["Hit", "Stand", "Double", "Split", "Surrender"])
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
