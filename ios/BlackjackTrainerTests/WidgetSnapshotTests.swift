import Foundation
import Testing
@testable import BlackjackTrainer

/// Slice 4.3 — the home-screen widget's shared snapshot, its App Group store, and
/// the publisher that refreshes it from the live stat stores.
struct WidgetSnapshotTests {
    private func suite() -> UserDefaults {
        let name = "widget-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    // MARK: accuracyDisplay parity with the in-app stats panel

    @Test func accuracyDisplayIsEmDashBeforeAttempts() {
        #expect(WidgetTrainerStat.empty.accuracyDisplay == "—")
    }

    @Test func accuracyDisplayMatchesTheStatsPanel() {
        let stat = WidgetTrainerStat(attempts: 40, correct: 35, currentStreak: 0)
        #expect(stat.accuracyDisplay == "88%") // 87.5 rounds up, like Math.round
        #expect(WidgetTrainerStat(attempts: 3, correct: 1, currentStreak: 0)
            .accuracyDisplay == "33%")
        // Anti-drift: the widget number must equal the app's own formatter.
        let panel = StatsPanelView.accuracyDisplay(
            SessionStats(attempts: 40, correct: 35, streak: 0, longestStreak: 0)
        )
        #expect(stat.accuracyDisplay == panel)
    }

    // MARK: snapshot lookup

    @Test func snapshotReturnsEmptyForMissingTrainer() {
        #expect(WidgetSnapshot.empty.stat(for: .deviations) == .empty)
    }

    // MARK: App Group store round-trip

    @Test func storeRoundTripsThroughDefaults() {
        let defaults = suite()
        let snapshot = WidgetSnapshot(trainers: [
            WidgetTrainer.basicStrategy.rawValue:
                WidgetTrainerStat(attempts: 5, correct: 4, currentStreak: 2)
        ])
        WidgetSnapshotStore.save(snapshot, to: defaults)
        #expect(WidgetSnapshotStore.load(from: defaults) == snapshot)
        #expect(WidgetSnapshotStore.load(from: defaults).stat(for: .basicStrategy).correct == 4)
    }

    @Test func storeLoadsEmptyWhenAbsent() {
        #expect(WidgetSnapshotStore.load(from: suite()) == .empty)
    }

    // MARK: publisher

    @Test func publisherSeedsSnapshotOnInit() {
        var writes: [WidgetSnapshot] = []
        let store = SessionStatsStore(key: "k", defaults: suite())
        _ = WidgetSnapshotPublisher(
            sources: [.init(trainer: .basicStrategy, store: store)],
            write: { writes.append($0) },
            reload: {}
        )
        #expect(writes.count == 1) // seeded at launch
        #expect(writes.first?.stat(for: .basicStrategy) == .empty)
    }

    // The store holds `onChange` weakly (no retain cycle), so the publisher must
    // outlive the recorded attempts — `AppModel` keeps it for the app's lifetime;
    // the tests use `withExtendedLifetime` to match.

    @Test func publisherWritesAndReloadsOnRecord() {
        var writes: [WidgetSnapshot] = []
        var reloads = 0
        let store = SessionStatsStore(key: "k", defaults: suite())
        let publisher = WidgetSnapshotPublisher(
            sources: [.init(trainer: .basicStrategy, store: store)],
            write: { writes.append($0) },
            reload: { reloads += 1 }
        )
        withExtendedLifetime(publisher) {
            store.recordAttempt(correct: true)
            store.recordAttempt(correct: false)
        }
        #expect(writes.count == 3) // 1 seed + 2 records
        #expect(reloads == 3)
        let latest = writes.last?.stat(for: .basicStrategy)
        #expect(latest?.attempts == 2)
        #expect(latest?.correct == 1)
        #expect(latest?.currentStreak == 0) // the miss reset the streak
    }

    @Test func publisherReactsToReset() {
        var writes: [WidgetSnapshot] = []
        let store = SessionStatsStore(key: "k", defaults: suite())
        let publisher = WidgetSnapshotPublisher(
            sources: [.init(trainer: .runningCount, store: store)],
            write: { writes.append($0) },
            reload: {}
        )
        withExtendedLifetime(publisher) {
            store.recordAttempt(correct: true)
            store.reset()
        }
        #expect(writes.count == 3) // seed + record + reset
        #expect(writes.last?.stat(for: .runningCount) == .empty)
    }

    @Test func multipleTrainersAreCapturedIndependently() {
        var writes: [WidgetSnapshot] = []
        let basic = SessionStatsStore(key: "basic", defaults: suite())
        let deviations = SessionStatsStore(key: "dev", defaults: suite())
        let publisher = WidgetSnapshotPublisher(
            sources: [
                .init(trainer: .basicStrategy, store: basic),
                .init(trainer: .deviations, store: deviations)
            ],
            write: { writes.append($0) },
            reload: {}
        )
        withExtendedLifetime(publisher) {
            basic.recordAttempt(correct: true)
        }
        let snapshot = writes.last
        #expect(snapshot?.stat(for: .basicStrategy).attempts == 1)
        #expect(snapshot?.stat(for: .deviations).attempts == 0)
    }

    @Test func onChangeFiresOnRecordAndReset() {
        var fired = 0
        let store = SessionStatsStore(key: "k", defaults: suite())
        store.onChange = { fired += 1 }
        store.recordAttempt(correct: true)
        store.reset()
        #expect(fired == 2)
    }
}
