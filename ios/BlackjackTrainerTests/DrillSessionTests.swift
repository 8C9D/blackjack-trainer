import Testing
@testable import BlackjackTrainer

/// Mirrors `drill-session.spec.ts`: per-round counters, streaks, and accuracy.
struct DrillSessionTests {
    @Test func startsEmptyWithNilAccuracy() {
        let s = DrillSession()
        #expect(s.attempts == 0)
        #expect(s.streak == 0)
        #expect(s.bestStreak == 0)
        #expect(s.accuracy == nil)
    }

    @Test func tracksAttemptsStreaksAndBestStreak() {
        let s = DrillSession()
        s.record(true)
        s.record(true)
        s.record(true)
        s.record(false)
        s.record(true)
        #expect(s.attempts == 5)
        #expect(s.correct == 4)
        #expect(s.streak == 1)
        #expect(s.bestStreak == 3)
        #expect(s.accuracy == 80)
    }

    @Test func resetsForANewRound() {
        let s = DrillSession()
        s.record(true)
        s.record(false)
        s.record(true) // correct = 2, streak = 1 before reset
        s.reset()
        #expect(s.attempts == 0)
        #expect(s.correct == 0)
        #expect(s.streak == 0)
        #expect(s.bestStreak == 0)
        #expect(s.accuracy == nil)
        // A reset that failed to zero `correct` would show here as accuracy > 100.
        s.record(true)
        #expect(s.accuracy == 100)
    }

    // The round's own figure is the median: one interrupted hand inside twenty
    // would otherwise decide it.

    @Test func medianIsNilUntilADecisionIsTimed() {
        let s = DrillSession()
        s.record(true)
        #expect(s.medianSeconds == nil)
    }

    @Test func medianTakesTheMiddleDecisionOfAnOddRound() {
        let s = DrillSession()
        for ms in [1000, 9000, 2000] {
            s.record(true, elapsedMs: ms)
        }
        #expect(s.medianSeconds == 2)
    }

    @Test func medianAveragesTheMiddlePairOfAnEvenRound() {
        let s = DrillSession()
        for ms in [1000, 2000, 3000, 8000] {
            s.record(true, elapsedMs: ms)
        }
        #expect(s.medianSeconds == 2.5)
    }

    @Test func medianIsNotMovedByOneSlowHandTheWayAMeanWouldBe() {
        let s = DrillSession()
        for ms in [2000, 2000, 2000, 2000, 50000] {
            s.record(true, elapsedMs: ms)
        }
        #expect(s.medianSeconds == 2)
    }

    @Test func resetClearsTheTimings() {
        let s = DrillSession()
        s.record(true, elapsedMs: 3000)
        s.reset()
        #expect(s.medianSeconds == nil)
    }
}
