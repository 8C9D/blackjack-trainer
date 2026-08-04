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

    // MARK: the deviation list

    private func deviations(_ ruleSet: RuleSet = .s17) throws -> [DeviationSection] {
        let charts = try GameData.loadCharts()
        return StrategyChartGrid.deviationSections(rules: charts.deviations[ruleSet.rawValue] ?? [])
    }

    private func deviationRow(_ sections: [DeviationSection], _ hand: String) -> DeviationRuleRow? {
        sections.flatMap(\.rows).first { $0.hand == hand }
    }

    @Test func groupsEveryDeviationInChartOrder() throws {
        let sections = try deviations()
        #expect(sections.map(\.title) == [
            "Insurance", "Hard totals", "Soft totals", "Pairs", "Surrender"
        ])
        // Every rule in the table reaches the list exactly once.
        let charts = try GameData.loadCharts()
        #expect(sections.flatMap(\.rows).count == charts.deviations["S17"]?.count)
    }

    @Test func printsEachRuleAsHandThresholdAndPlay() throws {
        let sections = try deviations()
        let sixteen = deviationRow(sections, "Hard 16 vs 10")
        #expect(sixteen?.threshold == "≥ 0")
        #expect(sixteen?.symbol == "S")
        #expect(sixteen?.label == "Stand")

        let thirteen = deviationRow(sections, "Hard 13 vs 2")
        #expect(thirteen?.threshold == "≤ -1")
        #expect(thirteen?.label == "Hit")

        // Insurance has no player hand of its own.
        let insurance = deviationRow(sections, "Dealer ace")
        #expect(insurance?.threshold == "≥ +3")
        #expect(insurance?.symbol == "I")
        #expect(insurance?.label == "Insurance")
    }

    @Test func followsTheRuleSet() throws {
        let s17 = try deviations(.s17).flatMap(\.rows).count
        let h17 = try deviations(.h17).flatMap(\.rows).count
        #expect(s17 > 0)
        #expect(h17 != s17)
    }

    @Test func thresholdReadsAsTheChartLegendComparison() {
        func rule(_ direction: String, _ index: Int) -> DeviationRule {
            DeviationRule(ruleSet: "S17", category: "hard", playerHand: "16",
                          playerHandLabel: "Hard 16", dealerUpcard: "10", index: index,
                          direction: direction, basicAction: "H", deviationAction: "S", source: "")
        }
        #expect(StrategyChartGrid.threshold(rule("at-or-above", 3)) == "≥ +3")
        #expect(StrategyChartGrid.threshold(rule("at-or-above", 0)) == "≥ 0")
        #expect(StrategyChartGrid.threshold(rule("at-or-below", -1)) == "≤ -1")
        #expect(StrategyChartGrid.threshold(rule("positive", 0)) == "> 0")
        #expect(StrategyChartGrid.threshold(rule("negative", 0)) == "< 0")
    }

    @Test func surrenderIsAbbreviatedToOneGlyph() {
        #expect(StrategyChartGrid.symbol(for: .surrender) == "R")
        #expect(Action.chartLegend.map(StrategyChartGrid.symbol) == ["H", "S", "D", "P", "R"])
        #expect(Action.chartLegend.map(\.label) == ["Hit", "Stand", "Double", "Split", "Surrender"])
    }

    // MARK: - the hands you keep missing

    /// The tally has always known which hands cost you; the page a trainee reads
    /// to look one up never said.
    private func spot(_ kind: String, _ hand: String, _ dealer: String,
                      misses: Int = 3, attempts: Int = 7) -> WeakSpot {
        let ref = ScenarioRef(kind: kind, hand: hand, dealer: dealer)
        return WeakSpot(ref: ref, label: scenarioLabel(ref), misses: misses, attempts: attempts)
    }

    private func marked(_ sections: [ChartSection]) -> [String] {
        sections.flatMap { section in
            section.rows.flatMap { row in
                row.cells.filter { $0.missed != nil }.map { "\(row.label) vs \($0.id)" }
            }
        }
    }

    @Test func ringsOnlyTheOutstandingHand() throws {
        let grid = try StrategyChartGrid.sections(
            engine: engine(), ruleSet: .s17, options: EngineOptions(
                doubleAfterSplit: false,
                lateSurrender: false
            ),
            misses: StrategyChartGrid.missesByKey([spot("hard", "16", "10")])
        )
        #expect(marked(grid) == ["16 vs 10"])
        #expect(cellMiss(grid, "hard", "16", vs: "10") == "missed 3 of 7 this week")
    }

    /// The tally keys a soft hand by its total; the chart rows it by the non-ace
    /// card, and a mismatch here would mark the wrong row.
    @Test func linesSoftRowsUpWithTheTotalTheDrillFilesThemUnder() throws {
        let grid = try StrategyChartGrid.sections(
            engine: engine(), ruleSet: .s17, options: EngineOptions(
                doubleAfterSplit: false,
                lateSurrender: false
            ),
            misses: StrategyChartGrid.missesByKey([spot("soft", "18", "9")])
        )
        #expect(marked(grid) == ["A,7 vs 9"])
    }

    @Test func ringsAPairByItsRank() throws {
        let grid = try StrategyChartGrid.sections(
            engine: engine(), ruleSet: .s17, options: EngineOptions(
                doubleAfterSplit: false,
                lateSurrender: false
            ),
            misses: StrategyChartGrid.missesByKey([spot("pair", "8", "A")])
        )
        #expect(marked(grid) == ["8,8 vs A"])
    }

    @Test func marksNothingWithoutATally() throws {
        #expect(try marked(sections()).isEmpty)
    }

    /// A surrender rule is written over a hard total, and the tally files it as
    /// that hard total — so the surrender row has to look itself up that way.
    @Test func marksADeviationRuleAndTheSurrenderWrittenOverIt() throws {
        let rules = try GameData.loadCharts().deviations["S17"] ?? []
        let sections = StrategyChartGrid.deviationSections(
            rules: rules,
            misses: StrategyChartGrid.missesByKey([spot(
                "hard",
                "15",
                "10",
                misses: 1,
                attempts: 3
            )])
        )
        let marked = sections.flatMap(\.rows).filter { $0.missed != nil }
        #expect(marked.allSatisfy { $0.hand == "Hard 15 vs 10" })
        #expect(marked.count == 2) // the hard-total rule and its surrender
        #expect(marked.first?.missed == "missed 1 of 3 this week")
    }

    @Test func leavesInsuranceAloneAsItIsFiledAgainstNoHand() throws {
        let rules = try GameData.loadCharts().deviations["S17"] ?? []
        #expect(try StrategyChartGrid
            .scenarioRef(for: #require(rules.first { $0.category == "insurance" })) == nil)
    }

    private func cellMiss(
        _ sections: [ChartSection],
        _ sectionId: String,
        _ label: String,
        vs upcard: String
    ) -> String? {
        sections.first { $0.id == sectionId }?
            .rows.first { $0.label == label }?
            .cells.first { $0.id == upcard }?
            .missed
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
