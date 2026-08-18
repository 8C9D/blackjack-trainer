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

        var externalChangeNotification: Notification.Name {
            Notification.Name("FakeCloudDidChangeExternally")
        }

        var notificationSource: AnyObject {
            self
        }

        /// Stand in for iCloud delivering a change, the way
        /// `NSUbiquitousKeyValueStore` posts one: on the store's own object,
        /// with the reason in `userInfo`.
        func deliverExternalChange(reason: Int) {
            NotificationCenter.default.post(
                name: externalChangeNotification,
                object: self,
                userInfo: [NSUbiquitousKeyValueStoreChangeReasonKey: reason]
            )
        }
    }

    private func suite() -> UserDefaults {
        let name = "cloud-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    /// A gate over `cloud` for an install that has not synced yet: the cold
    /// cache finding I1 is about.
    private func coldGate(_ cloud: FakeCloud) -> InitialSyncGatedCloudStore {
        InitialSyncGatedCloudStore(wrapping: cloud, defaults: suite())
    }

    /// A gate for an install whose initial iCloud download completed on an
    /// earlier launch, i.e. the steady state the coordinator has always had.
    private func syncedGate(_ cloud: FakeCloud) -> InitialSyncGatedCloudStore {
        let gate = coldGate(cloud)
        gate.markInitialSyncCompleted()
        return gate
    }

    /// `attempts` correct answers in a row, the shape `recordAttempt(correct:)`
    /// produces.
    private func stats(_ attempts: Int) -> SessionStats {
        SessionStats(
            attempts: attempts,
            correct: attempts,
            streak: attempts,
            longestStreak: attempts
        )
    }

    /// What key `k` currently holds in the cloud, decoded.
    private func published(from cloud: FakeCloud) throws -> SessionStats {
        try JSONDecoder().decode(SessionStats.self, from: #require(cloud.storage["k"]))
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
        _ = StatsCloudSync(cloud: syncedGate(cloud), stores: [fresh], queue: nil)
        #expect(fresh.stats.attempts == 1) // adopted from cloud on launch
    }

    @Test func coordinatorSeedsCloudWhenEmpty() {
        let cloud = FakeCloud()
        let gate = syncedGate(cloud)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: gate)
        // Pre-existing local data, empty cloud (e.g. before iCloud was enabled).
        local.recordAttempt(correct: true)
        cloud.storage.removeAll()
        _ = StatsCloudSync(cloud: gate, stores: [local], queue: nil)
        #expect(cloud.storage["k"] != nil) // seeded from local
    }

    /// Data arriving from another device is untrusted input, and `SessionStats`
    /// already refuses a payload it cannot decode. The same boundary must hold
    /// for every synced store: cloud bytes that do not decode leave valid local
    /// state alone rather than resetting it to defaults or empty. (Partial
    /// tolerance is unchanged — decodable payloads still merge field-by-field.)
    @Test func undecodableCloudPrefsDoNotReplaceValidLocalPrefs() {
        let cloud = FakeCloud()
        let store = FlowPrefsStore(key: "p", defaults: suite(), cloud: cloud)
        store.setDailyGoal(35)
        cloud.storage["p"] = Data("not json{".utf8)

        store.adoptFromCloud()

        #expect(store.prefs.dailyGoal == 35)
    }

    @Test func undecodableCloudMissTallyDoesNotWipeTheLocalTally() {
        let cloud = FakeCloud()
        let store = MissTallyStore(key: "m", defaults: suite(), cloud: cloud)
        store.record(
            .basicStrategy,
            ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
            correct: false
        )
        cloud.storage["m"] = Data("not json{".utf8)

        store.adoptFromCloud()

        #expect(store.weakSpotFor(.basicStrategy) != nil)
    }

    @Test func undecodableCloudDriftsDoNotWipeTheLocalHistory() {
        let cloud = FakeCloud()
        let store = CountDriftStore(key: "d", defaults: suite(), cloud: cloud)
        store.record(answer: 3, actual: 5)
        cloud.storage["d"] = Data("not json{".utf8)

        store.adoptFromCloud()

        #expect(store.drifts == [-2])
    }

    @Test func undecodableCloudHistoryDoesNotWipeLocalDays() {
        let cloud = FakeCloud()
        let store = PracticeHistoryStore(key: "h", defaults: suite(), cloud: cloud)
        store.recordHand(correct: true)
        cloud.storage["h"] = Data("not json{".utf8)

        store.adoptFromCloud()

        #expect(store.handsToday() == 1)
    }

    /// A device that still runs the full feature set leaves archived-feature
    /// keys (showdown, bet spread, …) in the shared cloud store. This build owns
    /// no store for them, so adoption walks its own stores and leaves the
    /// unknown keys untouched rather than erroring or wiping them.
    @Test func coordinatorIgnoresUnknownCloudKeys() {
        let cloud = FakeCloud()
        cloud.storage["blackjack-showdown-stats"] = Data("{\"hands\":3}".utf8)
        let gate = syncedGate(cloud)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: gate)
        local.recordAttempt(correct: true)
        _ = StatsCloudSync(cloud: gate, stores: [local], queue: nil)
        #expect(cloud.storage["blackjack-showdown-stats"] == Data("{\"hands\":3}".utf8))
        #expect(local.stats.attempts == 1)
    }

    // MARK: I1 - nothing is published until the initial download has landed

    /// The launch race itself. A device whose KVS cache has not populated reads
    /// `nil` for every key, which is indistinguishable from an empty cloud; the
    /// coordinator used to answer that silence by seeding, writing this device's
    /// empty state over the shared key. It must publish nothing, and when the
    /// download does land it adopts what arrived rather than having erased it.
    @Test func coldCacheLaunchPublishesNothingAndAdoptsWhatArrives() throws {
        let cloud = FakeCloud()
        let gate = coldGate(cloud)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: gate)
        let sync = StatsCloudSync(cloud: gate, stores: [local], queue: nil)

        #expect(cloud.storage["k"] == nil)

        // The download lands: the daemon fills the cache, then posts.
        let arrived = try JSONEncoder().encode(stats(2))
        cloud.storage["k"] = arrived
        cloud.deliverExternalChange(reason: NSUbiquitousKeyValueStoreInitialSyncChange)

        #expect(local.stats.attempts == 2)
        #expect(cloud.storage["k"] == arrived)
        withExtendedLifetime(sync) {}
    }

    /// Every rep pushes (`SessionStatsStore.persist`), so a gate that covered
    /// only the launch seed would move the race to the first hand played. Before
    /// the download lands nothing leaves the device; after it, mirroring is what
    /// it always was.
    @Test func perRepPushesWaitForTheInitialSyncAndFlowAfterIt() throws {
        let cloud = FakeCloud()
        let gate = coldGate(cloud)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: gate)
        let sync = StatsCloudSync(cloud: gate, stores: [local], queue: nil)

        local.recordAttempt(correct: true)
        #expect(cloud.storage["k"] == nil)

        // Nothing was waiting for this device, so the deferred launch pass seeds.
        cloud.deliverExternalChange(reason: NSUbiquitousKeyValueStoreInitialSyncChange)
        #expect(try published(from: cloud) == stats(1))

        local.recordAttempt(correct: true)
        #expect(try published(from: cloud) == stats(2))
        withExtendedLifetime(sync) {}
    }

    /// An empty record is a state a user can ask for - Reset practice data - so
    /// the gate is about *when* this device may publish, never about *what*. Once
    /// the download has landed, a reset propagates like any other change.
    @Test func resetPublishesAnEmptyRecordOnceTheInitialSyncHasLanded() throws {
        let cloud = FakeCloud()
        let gate = coldGate(cloud)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: gate)
        let sync = StatsCloudSync(cloud: gate, stores: [local], queue: nil)
        cloud.storage["k"] = try JSONEncoder().encode(stats(2))
        cloud.deliverExternalChange(reason: NSUbiquitousKeyValueStoreInitialSyncChange)
        #expect(local.stats.attempts == 2)

        local.reset()

        #expect(try published(from: cloud) == .empty)
        withExtendedLifetime(sync) {}
    }

    /// KVS posts the initial-sync change once per install, so a gate that lived
    /// only in memory would mirror on exactly one launch and go quiet forever
    /// after. The flag rides in the same container as the stats it guards: a
    /// device with no local data has no flag either, which is exactly the device
    /// that must not publish its emptiness.
    @Test func aSyncedInstallPublishesFromLaunchOnItsNextRun() {
        let cloud = FakeCloud()
        let container = suite()
        InitialSyncGatedCloudStore(wrapping: cloud, defaults: container)
            .markInitialSyncCompleted()

        let relaunched = InitialSyncGatedCloudStore(wrapping: cloud, defaults: container)
        #expect(relaunched.hasCompletedInitialSync)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: relaunched)
        local.recordAttempt(correct: true)
        #expect(cloud.storage["k"] != nil)
    }

    /// A quota violation says a write was refused; it says nothing about a
    /// download having completed, so it is not proof that this device has seen
    /// what iCloud holds.
    @Test func aQuotaViolationDoesNotOpenTheGate() {
        let cloud = FakeCloud()
        let gate = coldGate(cloud)
        let local = SessionStatsStore(key: "k", defaults: suite(), cloud: gate)
        let sync = StatsCloudSync(cloud: gate, stores: [local], queue: nil)

        cloud.deliverExternalChange(reason: NSUbiquitousKeyValueStoreQuotaViolationChange)
        local.recordAttempt(correct: true)

        #expect(cloud.storage["k"] == nil)
        withExtendedLifetime(sync) {}
    }

    /// The shipped state (and the simulator): no capability, so no change ever
    /// arrives. The app is local-only, nothing queues, and the cloud store stays
    /// untouched rather than accumulating a device's private view of the world.
    @Test func withoutTheCapabilityNothingIsMirroredAndLocalPersistenceStillWorks() {
        let cloud = FakeCloud()
        let gate = coldGate(cloud)
        let defaults = suite()
        let local = SessionStatsStore(key: "k", defaults: defaults, cloud: gate)
        let sync = StatsCloudSync(cloud: gate, stores: [local], queue: nil)

        local.recordAttempt(correct: true)
        local.recordAttempt(correct: false)

        #expect(cloud.storage.isEmpty)
        #expect(local.stats.attempts == 2)
        #expect(SessionStatsStore(key: "k", defaults: defaults).stats.attempts == 2)
        withExtendedLifetime(sync) {}
    }
}
