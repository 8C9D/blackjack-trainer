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
        s.reset()
        #expect(s.attempts == 0)
        #expect(s.bestStreak == 0)
        #expect(s.accuracy == nil)
    }
}
