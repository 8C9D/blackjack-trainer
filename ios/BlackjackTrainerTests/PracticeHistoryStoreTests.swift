import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `practice-history.service.spec.ts`: local date keys, per-day counts,
/// the 400-day prune, the 7-day dot strip, and streak math.
struct PracticeHistoryStoreTests {
    /// Fixed local reference date; tests move a mutable `current` around it.
    private static func base() -> Date {
        makeDate(2026, 7, 10, 18, 30)
    }

    private static func makeDate(
        _ year: Int, _ month: Int, _ day: Int, _ hour: Int = 12, _ minute: Int = 0
    ) -> Date {
        Calendar.current.date(
            from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)
        ) ?? .distantPast
    }

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private func store(
        _ defaults: UserDefaults, now: @escaping () -> Date
    ) -> PracticeHistoryStore {
        let store = PracticeHistoryStore(defaults: defaults)
        store.setNowSource(now)
        return store
    }

    private func seed(_ defaults: UserDefaults, days: [[String: Any]]) {
        let data = (try? JSONSerialization.data(withJSONObject: ["days": days])) ?? Data()
        defaults.set(data, forKey: StatsKeys.practiceHistory)
    }

    private func dateKey(daysBefore back: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: -back, to: Self.base())
        return localDateKey(date ?? Self.base())
    }

    @Test func localDateKeyFormatsAZeroPaddedLocalDate() {
        #expect(localDateKey(Self.makeDate(2026, 1, 5)) == "2026-01-05")
        #expect(localDateKey(Self.makeDate(2026, 12, 31, 23, 59)) == "2026-12-31")
    }

    @Test func startsAtZeroAndCountsHandsRecordedToday() {
        let s = store(freshDefaults(), now: { Self.base() })
        #expect(s.handsToday() == 0)
        s.recordHand(correct: true)
        s.recordHand(correct: true)
        s.recordHand(correct: true)
        #expect(s.handsToday() == 3)
    }

    @Test func rollsOverToAFreshCountWhenTheDayChanges() {
        var current = Self.base()
        let s = store(freshDefaults(), now: { current })
        s.recordHand(correct: true)
        #expect(s.handsToday() == 1)
        current = Self.makeDate(2026, 7, 11, 9, 0)
        #expect(s.handsToday() == 0)
        s.recordHand(correct: true)
        #expect(s.handsToday() == 1)
        #expect(s.handsOn("2026-07-10") == 1)
    }

    @Test func persistsAcrossInstances() {
        let defaults = freshDefaults()
        let s = store(defaults, now: { Self.base() })
        s.recordHand(correct: true)
        s.recordHand(correct: true)
        let reloaded = store(defaults, now: { Self.base() })
        #expect(reloaded.handsToday() == 2)
    }

    @Test func prunesEntriesOlderThanTheRetentionWindowOnWrite() {
        let defaults = freshDefaults()
        seed(defaults, days: [
            ["date": "2024-01-01", "hands": 5],
            ["date": "2026-07-09", "hands": 2]
        ])
        let s = store(defaults, now: { Self.base() })
        s.recordHand(correct: true)
        #expect(!s.days.contains { $0.date == "2024-01-01" })
        #expect(s.handsOn("2026-07-09") == 2)
    }

    @Test func toleratesAMalformedStoredPayload() {
        let defaults = freshDefaults()
        defaults.set(Data("not-json{".utf8), forKey: StatsKeys.practiceHistory)
        let s = store(defaults, now: { Self.base() })
        #expect(s.handsToday() == 0)
        s.recordHand(correct: true)
        #expect(s.handsToday() == 1)
    }

    // MARK: streak

    private func seededStreakStore(_ daysAgoToHands: [Int: Int]) -> PracticeHistoryStore {
        let defaults = freshDefaults()
        let days = daysAgoToHands.map { back, hands -> [String: Any] in
            ["date": dateKey(daysBefore: back), "hands": hands]
        }
        seed(defaults, days: days)
        return store(defaults, now: { Self.base() })
    }

    @Test func countsConsecutiveGoalMetDaysEndingYesterdayWhenTodayIsUnmet() {
        let s = seededStreakStore([0: 14, 1: 20, 2: 25, 3: 20, 4: 20, 5: 21, 6: 20])
        #expect(s.streak(goal: 20) == 6)
    }

    @Test func includesTodayOnceItsGoalIsMet() {
        let s = seededStreakStore([0: 20, 1: 20, 2: 20])
        #expect(s.streak(goal: 20) == 3)
    }

    @Test func reportsAStreakLongerThanTheOldThirtyDayRetentionCap() {
        var longRun: [Int: Int] = [:]
        for back in 0 ..< 40 {
            longRun[back] = 20
        }
        let s = seededStreakStore(longRun)
        s.recordHand(correct: true) // Prune on write while keeping every day in the run.
        #expect(s.streak(goal: 20) == 40)
    }

    @Test func breaksOnADayBelowTheGoal() {
        let s = seededStreakStore([1: 20, 2: 3, 3: 20])
        #expect(s.streak(goal: 20) == 1)
    }

    @Test func isZeroWithNoHistory() {
        let s = store(freshDefaults(), now: { Self.base() })
        #expect(s.streak(goal: 20) == 0)
    }

    @Test func anUnfinishedTodayDoesNotBreakARunEndingYesterday() {
        let s = seededStreakStore([0: 1, 1: 20, 2: 20])
        #expect(s.streak(goal: 20) == 2)
    }

    /// The walk back has no data to stop it when every day clears the goal, and a
    /// goal of zero is cleared by every day there has ever been — including the
    /// ones with no entry, which read as 0 hands. Prefs clamp the goal to at
    /// least 1, so this is the backstop, not a live path: without it the loop
    /// never returns and the screen reading the streak hangs.
    @Test func terminatesOnAGoalNoDayCanFail() {
        let s = seededStreakStore([0: 20, 1: 20])
        #expect(s.streak(goal: 0) == 400)
        #expect(s.streak(goal: -1) == 400)
    }

    // MARK: last7

    @Test func returnsSevenDotsOldestFirstWithTodayFlaggedLast() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand(correct: true)
        let dots = s.last7(goal: 1)
        #expect(dots.count == 7)
        #expect(dots[6].isToday)
        #expect(dots[6].met)
        #expect(!dots[0].isToday)
        #expect(dots[0].date == "2026-07-04")
    }

    @Test func marksMetAgainstTheGivenGoal() {
        let defaults = freshDefaults()
        seed(defaults, days: [["date": "2026-07-09", "hands": 19]])
        let s = store(defaults, now: { Self.base() })
        let yesterday = s.last7(goal: 20)[5]
        #expect(yesterday.date == "2026-07-09")
        #expect(yesterday.hands == 19)
        #expect(!yesterday.met)
        #expect(s.last7(goal: 19)[5].met)
    }

    // Volume was all the history ever kept, so the app could say how much was
    // practised and never how well.

    @Test func accuracyIsNilBeforeAnythingIsGraded() {
        let s = store(freshDefaults(), now: { Self.base() })
        #expect(s.accuracyLast7() == nil)
    }

    @Test func accuracyIsTheCorrectShareOfTheWeekJustPractised() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand(correct: true)
        s.recordHand(correct: true)
        s.recordHand(correct: false)
        #expect(s.accuracyLast7() == 67)
    }

    @Test func accuracyReadsTheWeekBeforeItSeparately() {
        var current = Self.base()
        let s = store(freshDefaults(), now: { current })
        s.recordHand(correct: true)
        // Eight days on: the earlier rep has fallen out of this week into the last.
        current = Self.makeDate(2026, 7, 18, 18, 30)
        s.recordHand(correct: false)
        #expect(s.accuracyLast7() == 0)
        #expect(s.accuracyLast7(weeksBack: 1) == 100)
    }

    /// A day recorded by a build that only counted volume has no verdicts at
    /// all. Reading its hands as ungraded reports it as unmeasured; dividing by
    /// them would report a week of real practice as 0% correct.
    @Test func leavesADayWrittenBeforeGradingUnmeasured() {
        let defaults = freshDefaults()
        seed(defaults, days: [["date": "2026-07-09", "hands": 20]])
        let s = store(defaults, now: { Self.base() })
        #expect(s.accuracyLast7() == nil)
        #expect(s.last7(goal: 20)[5].accuracy == nil)
        // A rep recorded today is measured on its own, not against those 20.
        s.recordHand(correct: true)
        #expect(s.accuracyLast7() == 100)
    }

    @Test func carriesEachDayOfTheStripItsOwnAccuracy() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand(correct: true)
        s.recordHand(correct: false)
        #expect(s.last7(goal: 1)[6].accuracy == 50)
        #expect(s.last7(goal: 1)[0].accuracy == nil)
    }

    /// A synced payload is not this device's to trust, and an accuracy over
    /// 100% would be nonsense on the screen.
    @Test func clampsAStoredDayToCorrectAtMostGradedAtMostHands() {
        let defaults = freshDefaults()
        seed(defaults, days: [["date": "2026-07-10", "hands": 4, "graded": 9, "correct": 9]])
        let s = store(defaults, now: { Self.base() })
        #expect(s.days.first == PracticeDay(date: "2026-07-10", hands: 4, graded: 4, correct: 4))
        #expect(s.accuracyLast7() == 100)
    }

    /// The verdict counts have to survive the round trip, or a relaunch would
    /// read every practised day back as unmeasured.
    @Test func persistsTheVerdictCountsAcrossStoreInstances() {
        let defaults = freshDefaults()
        let s = store(defaults, now: { Self.base() })
        s.recordHand(correct: true)
        s.recordHand(correct: false)
        let reloaded = store(defaults, now: { Self.base() })
        #expect(reloaded.accuracyLast7() == 50)
    }
}

/// The pace half of the same store, split out to keep each suite inside the
/// type-body limit.
@MainActor
struct PracticeHistoryPaceTests {
    private static func base() -> Date {
        makeDate(2026, 7, 10, 18, 30)
    }

    private static func makeDate(
        _ year: Int, _ month: Int, _ day: Int, _ hour: Int = 12, _ minute: Int = 0
    ) -> Date {
        Calendar.current.date(
            from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)
        ) ?? .distantPast
    }

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private func store(
        _ defaults: UserDefaults, now: @escaping () -> Date
    ) -> PracticeHistoryStore {
        let store = PracticeHistoryStore(defaults: defaults)
        store.setNowSource(now)
        return store
    }

    private func seed(_ defaults: UserDefaults, days: [[String: Any]]) {
        let data = (try? JSONSerialization.data(withJSONObject: ["days": days])) ?? Data()
        defaults.set(data, forKey: StatsKeys.practiceHistory)
    }

    private func dateKey(daysBefore back: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: -back, to: Self.base())
        return localDateKey(date ?? Self.base())
    }

    // Accuracy says whether the practice is working; the pace says whether it
    // would survive a table, where the dealer is waiting.

    @Test func paceIsNilBeforeAnythingIsTimed() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand(correct: true)
        #expect(s.paceLast7() == nil)
    }

    @Test func paceAveragesTheTimedDecisions() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand(correct: true, elapsedMs: 2000)
        s.recordHand(correct: false, elapsedMs: 3000)
        s.recordHand(correct: true, elapsedMs: 4000)
        #expect(s.paceLast7() == 3)
    }

    /// A hand you walked away from is not a hand you were slow on.
    @Test func paceIgnoresAReadingPastTheCapOrABackwardsClock() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand(correct: true, elapsedMs: 2000)
        s.recordHand(correct: true, elapsedMs: maxTimedDecisionMs + 1)
        s.recordHand(correct: true, elapsedMs: -5)
        s.recordHand(correct: true, elapsedMs: 0)
        #expect(s.paceLast7() == 2)
        #expect(s.days.first?.timed == 1)
        #expect(s.days.first?.graded == 4)
    }

    @Test func paceReadsTheWeekBeforeItSeparately() {
        var current = Self.base()
        let s = store(freshDefaults(), now: { current })
        s.recordHand(correct: true, elapsedMs: 5000)
        current = Self.makeDate(2026, 7, 18, 18, 30)
        s.recordHand(correct: true, elapsedMs: 2500)
        #expect(s.paceLast7() == 2.5)
        #expect(s.paceLast7(weeksBack: 1) == 5)
    }

    @Test func leavesADayWrittenBeforeTimingUntimedRatherThanInstant() {
        let defaults = freshDefaults()
        seed(defaults, days: [["date": "2026-07-10", "hands": 9, "graded": 9, "correct": 9]])
        let s = store(defaults, now: { Self.base() })
        #expect(s.paceLast7() == nil)
    }

    /// A synced payload is not this device's to trust, and no run of decisions
    /// can average past the cap.
    @Test func clampsAStoredDayToAPaceTheCapAllows() {
        let defaults = freshDefaults()
        seed(defaults, days: [[
            "date": "2026-07-10", "hands": 2, "graded": 2, "correct": 2,
            "timed": 9, "millis": 999_999_999
        ]])
        let s = store(defaults, now: { Self.base() })
        #expect(s.days.first?.timed == 2)
        #expect(s.days.first?.millis == 2 * maxTimedDecisionMs)
        #expect(s.paceLast7() == Double(maxTimedDecisionMs) / 1000)
    }

    @Test func persistsTheTimingsAcrossStoreInstances() {
        let defaults = freshDefaults()
        let s = store(defaults, now: { Self.base() })
        s.recordHand(correct: true, elapsedMs: 3000)
        #expect(store(defaults, now: { Self.base() }).paceLast7() == 3)
    }

    /// The backup file moves this payload between the phone and the browser, so
    /// the stored shape is a cross-platform contract rather than this store's
    /// private business. A field added on one side and not the other is dropped
    /// silently on the trip.
    @Test func writesExactlyTheFieldsTheWebStoreReads() throws {
        let defaults = freshDefaults()
        let s = store(defaults, now: { Self.base() })
        s.recordHand(correct: true, elapsedMs: 2500)
        let data = try #require(defaults.data(forKey: StatsKeys.practiceHistory))
        let root = try #require(
            try JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        #expect(Array(root.keys) == ["days"])
        let day = try #require((root["days"] as? [[String: Any]])?.first)
        #expect(day.keys.sorted() == ["correct", "date", "graded", "hands", "millis", "timed"])
    }
}
