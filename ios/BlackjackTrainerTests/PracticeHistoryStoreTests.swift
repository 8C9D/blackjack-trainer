import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `practice-history.service.spec.ts`: local date keys, per-day counts,
/// the 30-day prune, the 7-day dot strip, and streak math.
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
        s.recordHand()
        s.recordHand()
        s.recordHand()
        #expect(s.handsToday() == 3)
    }

    @Test func rollsOverToAFreshCountWhenTheDayChanges() {
        var current = Self.base()
        let s = store(freshDefaults(), now: { current })
        s.recordHand()
        #expect(s.handsToday() == 1)
        current = Self.makeDate(2026, 7, 11, 9, 0)
        #expect(s.handsToday() == 0)
        s.recordHand()
        #expect(s.handsToday() == 1)
        #expect(s.handsOn("2026-07-10") == 1)
    }

    @Test func persistsAcrossInstances() {
        let defaults = freshDefaults()
        let s = store(defaults, now: { Self.base() })
        s.recordHand()
        s.recordHand()
        let reloaded = store(defaults, now: { Self.base() })
        #expect(reloaded.handsToday() == 2)
    }

    @Test func prunesEntriesOlderThanTheRetentionWindowOnWrite() {
        let defaults = freshDefaults()
        seed(defaults, days: [
            ["date": "2026-01-01", "hands": 5],
            ["date": "2026-07-09", "hands": 2]
        ])
        let s = store(defaults, now: { Self.base() })
        s.recordHand()
        #expect(!s.days.contains { $0.date == "2026-01-01" })
        #expect(s.handsOn("2026-07-09") == 2)
    }

    @Test func toleratesAMalformedStoredPayload() {
        let defaults = freshDefaults()
        defaults.set(Data("not-json{".utf8), forKey: StatsKeys.practiceHistory)
        let s = store(defaults, now: { Self.base() })
        #expect(s.handsToday() == 0)
        s.recordHand()
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

    // MARK: last7

    @Test func returnsSevenDotsOldestFirstWithTodayFlaggedLast() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.recordHand()
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
}
