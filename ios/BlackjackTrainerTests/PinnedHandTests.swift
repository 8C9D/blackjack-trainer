import Testing
@testable import BlackjackTrainer

/// The chart is the page a trainee reads to look a hand up, and until now it
/// could name the play and do nothing else. A pinned round is its entry into the
/// drills. Mirrors the web specs' "drilling one hand from the chart".
@MainActor
struct PinnedHandTests {
    private let sixteenVsTen = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
    private let pair8s = ScenarioRef(kind: "pair", hand: "8", dealer: "10")

    // MARK: Basic Strategy

    @Test func dealsThePinnedHandAndSaysTheRoundIsPinnedToIt() {
        let h = DrillFixture.makeHarness(pinned: pair8s)
        #expect(h.model.question == HandQuestion(prefix: "", value: "8,8", dealer: "10"))
        #expect(h.model.pinnedLabel == "8,8 vs 10")
    }

    @Test func dealsItAgainOnEveryHandOfTheRound() {
        let h = DrillFixture.makeHarness(playHandsOut: false, pinned: sixteenVsTen)
        for _ in 0 ..< 3 {
            #expect(h.model.question == HandQuestion(prefix: "Hard", value: "16", dealer: "10"))
            h.model.answer(.hit)
            h.scheduler.fire()
        }
    }

    /// The pin belongs to the round the chart started, exactly as review mode
    /// belongs to the round the Done screen started.
    @Test func goesBackToOrdinaryPracticeOnTheRoundAfter() {
        let h = DrillFixture.makeHarness(
            dailyGoal: 1,
            playHandsOut: false,
            pinned: sixteenVsTen
        )
        h.model.answer(.hit)
        h.scheduler.fire()
        #expect(h.model.phase == .done)

        h.model.oneMoreRound()
        #expect(h.model.pinnedLabel == nil)
    }

    @Test func anUnpinnedRoundSaysNothing() {
        let h = DrillFixture.makeHarness()
        #expect(h.model.pinnedLabel == nil)
    }

    // MARK: Deviations

    @Test func pinsTheDeviationsRoundToOneHandToo() {
        let h = DeviationsFixture.makeHarness(pinned: sixteenVsTen)
        #expect(h.model.pinnedLabel == "16 vs 10")
        for _ in 0 ..< 3 {
            #expect(h.model.question == HandQuestion(prefix: "Hard", value: "16", dealer: "10"))
            h.model.answer(.stand)
            h.scheduler.fire()
            if h.model.phase == .miss { h.model.continueFromMiss() }
        }
    }

    /// The hand is pinned; the count is not. Both sides of an index have to come
    /// up, or the round only ever asks the half the trainee already knows.
    @Test func leavesTheCountToTheSettings() {
        let h = DeviationsFixture.makeHarness(manualTrueCount: 4, pinned: sixteenVsTen)
        #expect(h.model.scenario.trueCount == 4)
        h.model.answer(.stand)
        h.scheduler.fire()
        if h.model.phase == .miss { h.model.continueFromMiss() }
        #expect(h.model.scenario.trueCount == 4)
    }

    // MARK: the chart's side of it

    /// Every cell carries the hand it is about, so starting a round from one is a
    /// lookup rather than a second encoding of the chart.
    @Test func everyGridCellNamesTheHandItWouldDrill() throws {
        let sections = StrategyChartGrid.sections(
            engine: TestEngines.shared.basicStrategy,
            ruleSet: .s17,
            options: .default,
            misses: [:]
        )
        let hard = try #require(sections.first { $0.id == "hard" })
        let row = try #require(hard.rows.first { $0.label == "16" })
        let cell = try #require(row.cells.first { $0.id == "10" })
        #expect(cell.ref == ScenarioRef(kind: "hard", hand: "16", dealer: "10"))
    }

    /// Insurance is filed against whatever hand was dealt rather than against the
    /// offer, so there is no one hand to pin a round to.
    @Test func theInsuranceRowHasNothingToDrill() {
        let sections = StrategyChartGrid.deviationSections(
            rules: TestEngines.shared.charts.deviations["S17"] ?? [],
            misses: [:]
        )
        let insurance = sections.first { $0.id == "insurance" }
        #expect(insurance?.rows.first?.ref == nil)

        let hard = sections.first { $0.id == "hard" }
        #expect(hard?.rows.first?.ref != nil)
    }
}
