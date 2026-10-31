import Foundation
import Testing
@testable import BlackjackTrainer

/// The Progress screen's pure half, mirroring the web
/// `progress-page.component.spec`.
struct ProgressSummaryTests {
    private func dot(_ date: String, _ hands: Int, goal: Int, today: Bool = false) -> StreakDot {
        StreakDot(date: date, hands: hands, met: hands >= goal, isToday: today)
    }

    @Test func rowReportsAccuracyOnlyOnceADrillHasBeenAnswered() {
        let answered = ProgressSummary.row(
            "Basic Strategy",
            SessionStats(attempts: 10, correct: 9, streak: 4, longestStreak: 9)
        )
        #expect(answered.attempts == 10)
        #expect(answered.accuracy == 90)
        #expect(answered.best == 9)

        #expect(ProgressSummary.row("Deviations", .empty).accuracy == nil)
    }

    @Test func barsScaleAgainstTheGoalNotJustTheWeeksPeak() {
        let dots = [
            dot("2026-07-27", 0, goal: 20),
            dot("2026-07-28", 5, goal: 20),
            dot("2026-08-02", 20, goal: 20, today: true)
        ]
        let bars = ProgressSummary.bars(dots: dots, goal: 20)
        #expect(bars[0].height == 0)
        // A quarter of the goal, not a full bar just because it led the week.
        #expect(bars[1].height == 0.25)
        #expect(bars[2].height == 1)
        #expect(bars[2].met)
        #expect(bars[2].isToday)
    }

    @Test func barsScaleAgainstAWeekThatBeatTheGoal() {
        let dots = [dot("2026-08-01", 40, goal: 20), dot("2026-08-02", 20, goal: 20)]
        let bars = ProgressSummary.bars(dots: dots, goal: 20)
        #expect(bars[0].height == 1)
        #expect(bars[1].height == 0.5)
    }

    @Test func aDayWithOneHandStillDrawsAVisibleBar() {
        let bars = ProgressSummary.bars(dots: [dot("2026-08-02", 1, goal: 200)], goal: 200)
        #expect(bars[0].height == 0.06)
    }

    @Test func barsCarryTheDaysAccuracyIntoItsLabel() {
        var day = dot("2026-08-02", 12, goal: 20)
        day.accuracy = 75
        let bars = ProgressSummary.bars(dots: [day, dot("2026-08-03", 0, goal: 20)], goal: 20)
        #expect(ProgressSummary.dayLabel(bars[0]) == "S: 12 hands, 75% correct")
        #expect(ProgressSummary.dayLabel(bars[1]) == "M: 0 hands")
    }

    /// One week is a reading; two are a direction.
    @Test func trendNamesTheDirectionAgainstTheWeekBefore() {
        #expect(ProgressSummary.trend(thisWeek: 88, weekBefore: nil) == nil)
        #expect(ProgressSummary.trend(thisWeek: nil, weekBefore: 80) == nil)
        #expect(ProgressSummary.trend(thisWeek: 88, weekBefore: 80)?.label
            == "up from 80% the week before")
        #expect(ProgressSummary.trend(thisWeek: 88, weekBefore: 80)?.direction == .up)
        #expect(ProgressSummary.trend(thisWeek: 71, weekBefore: 80)?.direction == .down)
        #expect(ProgressSummary.trend(thisWeek: 80, weekBefore: 80)?.label
            == "level with the week before")
    }

    @Test func weekdayInitialReadsTheDateKeyAsALocalDay() {
        // 2026-08-02 is a Sunday; a UTC parse would slip to Saturday west of GMT.
        #expect(ProgressSummary.weekdayInitial("2026-08-02") == "S")
        #expect(ProgressSummary.weekdayInitial("2026-08-03") == "M")
        #expect(ProgressSummary.weekdayInitial("nonsense") == "")
    }

    @Test func clearedLabelNamesThreeThenCounts() {
        func spot(_ label: String) -> WeakSpot {
            WeakSpot(
                ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
                label: label, misses: 1, attempts: 4, streak: 3
            )
        }
        #expect(ProgressSummary.clearedLabel([]) == "")
        #expect(ProgressSummary.clearedLabel([spot("16 vs 10")]) == "16 vs 10")
        #expect(
            ProgressSummary.clearedLabel(["a", "b", "c", "d", "e"].map(spot))
                == "a · b · c · +2 more"
        )
    }

    @Test func missedCountsLabelReadsLowToHighAndCollapsesRepeats() {
        func spot(_ counts: [Int]) -> WeakSpot {
            WeakSpot(
                ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
                label: "16 vs 10", misses: 1, attempts: 1, streak: 0, missedCounts: counts
            )
        }
        // Basic Strategy files no counts, so its spots say nothing about one.
        #expect(ProgressSummary.missedCountsLabel(spot([])) == nil)
        #expect(ProgressSummary.missedCountsLabel(spot([2, -1, 0])) == "TC -1, 0, +2")
        // Three misses at the same count is one lesson, not three.
        #expect(ProgressSummary.missedCountsLabel(spot([2, 2, 2])) == "TC +2")
        // Both sides of an index are opposite mistakes and both must survive.
        #expect(ProgressSummary.missedCountsLabel(spot([-1, 2])) == "TC -1, +2")
    }

    @Test func spotDetailNamesTheCountsOnlyWhenTheScenarioKeptThem() {
        func spot(_ counts: [Int]) -> WeakSpot {
            WeakSpot(
                ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
                label: "16 vs 10", misses: 3, attempts: 7, streak: 0, missedCounts: counts
            )
        }
        #expect(ProgressSummary.spotDetail(spot([])) == "missed 3 of 7")
        #expect(ProgressSummary.spotDetail(spot([2, -1])) == "missed 3 of 7 at TC -1, +2")
    }

    @Test func spotDetailEndsOnWhatAMissGivesUp() {
        func spot(_ counts: [Int]) -> WeakSpot {
            WeakSpot(
                ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
                label: "16 vs 10", misses: 3, attempts: 7, streak: 0, missedCounts: counts,
                costPerMiss: 210
            )
        }
        #expect(ProgressSummary.spotDetail(spot([])) == "missed 3 of 7 · at least 2.1% a miss")
        #expect(ProgressSummary.spotDetail(spot([2, -1]))
            == "missed 3 of 7 at TC -1, +2 · at least 2.1% a miss")
    }

    @Test func missCostLabelNamesTheFloorOfWhatAMissGivesUp() {
        #expect(ProgressSummary.missCostLabel(costed(210)) == "at least 2.1% a miss")
        #expect(ProgressSummary.missCostLabel(costed(10)) == "at least 0.1% a miss")
    }

    /// Naming a figure that small would only make a coin flip sound like a problem.
    @Test func missCostLabelSaysNothingOfACoinFlipOrOfASpotWithNoPrice() {
        #expect(ProgressSummary.missCostLabel(costed(9)) == nil)
        #expect(ProgressSummary.missCostLabel(costed(nil)) == nil)
        #expect(ProgressSummary.spotDetail(costed(9)) == "missed 1 of 1")
    }

    private func costed(_ cost: Double?) -> WeakSpot {
        WeakSpot(
            ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
            label: "16 vs 10", misses: 1, attempts: 1, costPerMiss: cost
        )
    }

    /// A bad week can outstand thirty scenarios; listing them all buries the ones
    /// actually costing hands.
    @Test func aWeakGroupNamesTheWorstFewAndCountsTheRest() {
        func spot(_ label: String) -> WeakSpot {
            WeakSpot(
                ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
                label: label, misses: 1, attempts: 4
            )
        }
        func group(_ count: Int) -> ProgressWeakGroup {
            ProgressWeakGroup(
                trainer: "Basic Strategy",
                drill: .basicStrategy,
                outstanding: (0 ..< count).map { spot("hand \($0)") },
                cleared: []
            )
        }
        #expect(group(3).shown.count == 3)
        #expect(group(3).hidden == 0)
        #expect(group(7).shown.map(\.label) == (0 ..< 5).map { "hand \($0)" })
        #expect(group(7).hidden == 2)
        // The cut is presentational: the review round still has the whole list.
        #expect(group(7).outstanding.count == 7)
    }

    /// Faster is the good direction here, which the accuracy trend's colours
    /// would get backwards.
    @Test func paceTrendCallsAQuickerWeekFaster() {
        let trend = ProgressSummary.paceTrend(thisWeek: 3, weekBefore: 6)
        #expect(trend?.direction == .up)
        #expect(trend?.label == "faster than 6s the week before")
    }

    @Test func paceTrendCallsASlowerWeekSlower() {
        let trend = ProgressSummary.paceTrend(thisWeek: 4.5, weekBefore: 3.2)
        #expect(trend?.direction == .down)
        #expect(trend?.label == "slower than 3.2s the week before")
    }

    @Test func paceTrendStaysSilentWithOnlyOneMeasuredWeek() {
        #expect(ProgressSummary.paceTrend(thisWeek: 3, weekBefore: nil) == nil)
        #expect(ProgressSummary.paceTrend(thisWeek: nil, weekBefore: 3) == nil)
    }

    @Test func paceTrendCallsAnUnchangedWeekLevel() {
        #expect(ProgressSummary.paceTrend(thisWeek: 3, weekBefore: 3)?.direction == .level)
    }
}

/// The one figure accuracy cannot give: what the misses are worth at a table, read
/// beside what the table takes from a player who makes none. Mirrors the web
/// Progress screen's leak paragraph.
struct ProgressLeakTests {
    private func tally() -> MissTallyStore {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
        return CostFixture.tally(defaults: defaults, prefs: FlowPrefsStore(defaults: defaults))
    }

    private func leak(_ tally: MissTallyStore) -> ProgressLeak? {
        ProgressSummary.leak(
            tally,
            rules: FlowPrefs.default.playContext,
            playCost: CostFixture.playCost
        )
    }

    @Test func pricesTheOutstandingMissesAgainstTheHouseEdge() {
        let s = tally()
        s.record(
            .basicStrategy,
            ref: ScenarioRef(kind: "pair", hand: "10", dealer: "6"),
            correct: false
        )
        #expect(leak(s) == ProgressLeak(leak: "under 0.1%", edge: "0.5%"))
    }

    @Test func callsARealLeakAFloor() throws {
        let s = tally()
        for dealer in ["2", "3", "4", "5", "6"] {
            for _ in 0 ..< 4 {
                s.record(
                    .basicStrategy,
                    ref: ScenarioRef(kind: "pair", hand: "10", dealer: dealer),
                    correct: false
                )
            }
        }
        let figure = try #require(leak(s)?.leak)
        #expect(figure.hasPrefix("at least "))
    }

    @Test func pricesNoFigureWhileNothingIsOutstanding() {
        #expect(leak(tally()) == nil)
    }

    /// An indexed hand's frequency depends on how often its count comes up, which
    /// is a different figure from how often it is dealt.
    @Test func pricesBasicStrategyAloneWhoseHandsComeUpAsATableDealsThem() {
        let s = tally()
        s.record(
            .deviations,
            ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
            correct: false,
            trueCount: 2
        )
        #expect(leak(s) == nil)
    }
}
