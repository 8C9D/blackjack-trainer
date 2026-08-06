import Foundation
import Testing
@testable import BlackjackTrainer

/// Slice 4.2 — the iCloud KVS mirror, exercised with a fake cloud store standing
/// in for two devices sharing one key/value store.
struct CloudSyncTests {
    private final class FakeCloud: CloudKeyValueStore {
        var storage: [String: Data] = [:]
        func data(forKey key: String) -> Data? {
            storage[key]
        }

        func set(_ data: Data?, forKey key: String) {
            storage[key] = data
        }

        func synchronize() -> Bool {
            true
        }
    }

    private func suite() -> UserDefaults {
        let name = "cloud-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func writeThroughMirrorsToCloud() {
        let cloud = FakeCloud()
        let store = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        store.recordAttempt(correct: true)
        #expect(cloud.storage["k"] != nil)
    }

    @Test func adoptFromCloudReplacesLocal() {
        let cloud = FakeCloud()
        let deviceA = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        deviceA.recordAttempt(correct: true)
        deviceA.recordAttempt(correct: true) // attempts 2, correct 2

        // Device B shares the same cloud but has independent local storage.
        let deviceB = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        #expect(deviceB.stats == .empty)
        deviceB.adoptFromCloud()
        #expect(deviceB.stats.attempts == 2)
        #expect(deviceB.stats.correct == 2)
    }

    @Test func corruptCloudStatsDoNotReplaceValidLocalState() throws {
        let cloud = FakeCloud()
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        local.recordAttempt(correct: true)
        cloud.storage["k"] = try JSONEncoder().encode(
            SessionStats(attempts: 1, correct: 2, streak: 0, longestStreak: 0)
        )

        local.adoptFromCloud()

        #expect(local.stats == SessionStats(attempts: 1, correct: 1, streak: 1, longestStreak: 1))
    }

    @Test func localOnlyWithoutCloudStillWorks() {
        let store = SessionStatsStore(key: "k", defaults: suite()) // cloud nil
        store.recordAttempt(correct: false)
        #expect(store.stats.attempts == 1)
    }

    @Test func coordinatorAdoptsExistingCloudValueAtLaunch() {
        let cloud = FakeCloud()
        let seeded = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        seeded.recordAttempt(correct: true) // pushes to cloud

        let fresh = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        _ = StatsCloudSync(cloud: cloud, stores: [fresh])
        #expect(fresh.stats.attempts == 1) // adopted from cloud on launch
    }

    @Test func coordinatorSeedsCloudWhenEmpty() {
        let cloud = FakeCloud()
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        // Pre-existing local data, empty cloud (e.g. before iCloud was enabled).
        local.recordAttempt(correct: true)
        cloud.storage.removeAll()
        _ = StatsCloudSync(cloud: cloud, stores: [local])
        #expect(cloud.storage["k"] != nil) // seeded from local
    }

    /// A device that still runs the full feature set leaves archived-feature
    /// keys (showdown, bet spread, …) in the shared cloud store. This build owns
    /// no store for them, so adoption walks its own stores and leaves the
    /// unknown keys untouched rather than erroring or wiping them.
    @Test func coordinatorIgnoresUnknownCloudKeys() {
        let cloud = FakeCloud()
        cloud.storage["blackjack-showdown-stats"] = Data("{\"hands\":3}".utf8)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: cloud)
        local.recordAttempt(correct: true)
        _ = StatsCloudSync(cloud: cloud, stores: [local])
        #expect(cloud.storage["blackjack-showdown-stats"] == Data("{\"hands\":3}".utf8))
        #expect(local.stats.attempts == 1)
    }
}
