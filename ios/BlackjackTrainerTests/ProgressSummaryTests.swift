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

    @Test func signedChipTotalsCarryTheirSign() {
        #expect(ProgressSummary.signed(45) == "+45")
        #expect(ProgressSummary.signed(-20) == "-20")
        #expect(ProgressSummary.signed(0) == "0")
    }
}
