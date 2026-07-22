import Foundation
import Testing
@testable import BlackjackTrainer

/// The home-screen widget's Flow snapshot (goal ring + streak), its App Group
/// store, and the publisher that refreshes it from the practice history + goal.
struct WidgetSnapshotTests {
    private func suite() -> UserDefaults {
        let name = "widget-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name) ?? .standard
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    // MARK: snapshot fields

    @Test func snapshotComputesGoalRingAndStreakFields() {
        let met = WidgetSnapshot(handsToday: 20, dailyGoal: 20, streak: 6, dots: [])
        #expect(met.goalMet)
        #expect(met.fraction == 1)
        #expect(met.streakLabel == "6-day streak")

        let partial = WidgetSnapshot(handsToday: 8, dailyGoal: 20, streak: 0, dots: [])
        #expect(!partial.goalMet)
        #expect(abs(partial.fraction - 0.4) < 0.0001)
        #expect(partial.streakLabel == "No streak yet")
    }

    // MARK: day-boundary staleness

    @Test func forDayKeepsACurrentSnapshot() {
        let today = WidgetSnapshot.dayKey(for: .now)
        let snap = WidgetSnapshot(
            handsToday: 12, dailyGoal: 20, streak: 4, dots: [true, false, true], dayKey: today
        )
        #expect(snap.forDay(today) == snap)
    }

    @Test func forDayResetsAStaleSnapshotToAFreshDay() {
        // A snapshot stamped for an earlier day must not show yesterday's hands
        // (or "goal met") as today's.
        let stale = WidgetSnapshot(
            handsToday: 20, dailyGoal: 20, streak: 5,
            dots: [true, true, true, true, true, true, true], dayKey: "2000-01-01"
        )
        let fresh = stale.forDay("2000-01-02")
        #expect(fresh.handsToday == 0)
        #expect(fresh.goalMet == false)
        #expect(fresh.streak == 5) // an empty new day doesn't break the streak
        #expect(fresh.dots == [true, true, true, true, true, true, false]) // shifted, empty today
        #expect(fresh.dayKey == "2000-01-02")
    }

    // MARK: App Group store round-trip

    @Test func storeRoundTripsThroughDefaults() {
        let defaults = suite()
        let snapshot = WidgetSnapshot(
            handsToday: 5, dailyGoal: 20, streak: 2, dots: [true, false, true]
        )
        WidgetSnapshotStore.save(snapshot, to: defaults)
        #expect(WidgetSnapshotStore.load(from: defaults) == snapshot)
    }

    @Test func storeLoadsEmptyWhenAbsent() {
        #expect(WidgetSnapshotStore.load(from: suite()) == .empty)
    }

    // MARK: publisher

    @Test func publisherSeedsSnapshotOnInit() {
        var writes: [WidgetSnapshot] = []
        let defaults = suite()
        let history = PracticeHistoryStore(defaults: defaults)
        let prefs = FlowPrefsStore(defaults: defaults)
        _ = WidgetSnapshotPublisher(
            history: history,
            prefs: prefs,
            write: { writes.append($0) },
            reload: {}
        )
        #expect(writes.count == 1) // seeded at launch
        #expect(writes.first?.handsToday == 0)
        #expect(writes.first?.dailyGoal == 20)
    }

    // The stores hold `onChange` weakly (no retain cycle), so the publisher must
    // outlive the recorded hands — `AppModel` keeps it for the app's lifetime; the
    // tests use `withExtendedLifetime` to match.

    @Test func publisherWritesAndReloadsWhenAHandIsRecorded() {
        var writes: [WidgetSnapshot] = []
        var reloads = 0
        let defaults = suite()
        let history = PracticeHistoryStore(defaults: defaults)
        let prefs = FlowPrefsStore(defaults: defaults)
        let publisher = WidgetSnapshotPublisher(
            history: history,
            prefs: prefs,
            write: { writes.append($0) },
            reload: { reloads += 1 }
        )
        withExtendedLifetime(publisher) {
            history.recordHand()
            history.recordHand()
        }
        #expect(writes.count == 3) // 1 seed + 2 records
        #expect(reloads == 3)
        #expect(writes.last?.handsToday == 2)
    }

    @Test func publisherReactsToADailyGoalChange() {
        var writes: [WidgetSnapshot] = []
        let defaults = suite()
        let history = PracticeHistoryStore(defaults: defaults)
        let prefs = FlowPrefsStore(defaults: defaults)
        let publisher = WidgetSnapshotPublisher(
            history: history,
            prefs: prefs,
            write: { writes.append($0) },
            reload: {}
        )
        withExtendedLifetime(publisher) {
            prefs.setDailyGoal(10)
        }
        #expect(writes.last?.dailyGoal == 10)
    }
}
