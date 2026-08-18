import Foundation

/// Abstraction over a syncing key/value store, so the stat stores can mirror to
/// iCloud (D5) and be unit-tested with a fake. Mirrors the subset of
/// `NSUbiquitousKeyValueStore` the app uses, including the notification it posts
/// when its contents changed underneath the app: the coordinator has to know
/// when the store has finished talking to iCloud (I1), and a fake has to be able
/// to say so in a test.
protocol CloudKeyValueStore: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
    @discardableResult func synchronize() -> Bool
    /// The notification this store posts when its contents changed externally,
    /// and the object it posts it on. Observing the store's own object rather
    /// than `nil` keeps one fake's arrivals out of another's coordinator when
    /// tests run in parallel.
    var externalChangeNotification: Notification.Name { get }
    var notificationSource: AnyObject { get }
}

/// A stat store that can mirror to / from the cloud. The cloud-sync coordinator
/// drives these on external change and at launch.
protocol CloudSyncable: AnyObject {
    var cloudKey: String { get }
    /// Replace local state with the cloud value (last-writer-wins) if present.
    func adoptFromCloud()
    /// Seed the cloud with the current local value.
    func pushToCloud()
}

/// Real iCloud Key-Value Store backing. Sync is best-effort: without the iCloud
/// capability/account (e.g. the simulator, or before the human provisions it) it
/// behaves as a local cache, so the app degrades to local-only with no code
/// change. The entitlement (`com.apple.developer.ubiquity-kvstore-identifier`)
/// is provisioned by the human — see the progress log's pending actions.
final class UbiquitousKeyValueStore: CloudKeyValueStore {
    static let didChangeExternally = NSUbiquitousKeyValueStore.didChangeExternallyNotification
    private let store = NSUbiquitousKeyValueStore.default

    func data(forKey key: String) -> Data? {
        store.data(forKey: key)
    }

    func set(_ data: Data?, forKey key: String) {
        store.set(data, forKey: key)
    }

    @discardableResult func synchronize() -> Bool {
        store.synchronize()
    }

    var externalChangeNotification: Notification.Name {
        Self.didChangeExternally
    }

    var notificationSource: AnyObject {
        store
    }
}

/// Every write to iCloud passes through here, and none of them happens until
/// this install is known to have completed its initial iCloud download.
///
/// This is the fix for finding I1. `synchronize()` does not wait for a download,
/// so on a device whose KVS cache has not populated yet every `data(forKey:)`
/// reads `nil` — indistinguishable from an empty cloud. Publishing this device's
/// (empty) state into that silence writes over the shared key, and adoption is
/// last-writer-wins (D5), so the wipe propagates to every other device. Gating
/// the writes rather than second-guessing the reads keeps D5 intact and keeps
/// an empty record a legitimate state a user asked to propagate (Reset practice
/// data), because the gate is about *when* we may publish, never about *what*.
///
/// The flag is remembered, in the same container as the stats it guards, for two
/// reasons. The initial-sync notification arrives once per install, so a process
/// that did not see it would otherwise have to stay silent forever and sync
/// would work on exactly one launch. And a container with no local data has no
/// flag either — which is precisely the device that must not publish its
/// emptiness.
///
/// With the capability unprovisioned (today, and on the simulator) no external
/// change ever arrives, so the gate never opens and cloud mirroring simply never
/// engages: local persistence is untouched, and nothing blocks or queues.
final class InitialSyncGatedCloudStore: CloudKeyValueStore {
    /// Not in `StatsKeys`: this is the sync machinery's own bookkeeping, not a
    /// key whose contents are mirrored anywhere.
    static let initialSyncKey = "blackjack-icloud-initial-sync-completed"

    private let cloud: CloudKeyValueStore
    private let defaults: UserDefaults
    private(set) var hasCompletedInitialSync: Bool

    init(wrapping cloud: CloudKeyValueStore, defaults: UserDefaults = .standard) {
        self.cloud = cloud
        self.defaults = defaults
        hasCompletedInitialSync = defaults.bool(forKey: Self.initialSyncKey)
    }

    /// Reads are not gated. A value that is there is real; whether to adopt it
    /// is the coordinator's decision, and it makes that one only past the gate.
    func data(forKey key: String) -> Data? {
        cloud.data(forKey: key)
    }

    func set(_ data: Data?, forKey key: String) {
        guard hasCompletedInitialSync else { return }
        cloud.set(data, forKey: key)
    }

    @discardableResult func synchronize() -> Bool {
        cloud.synchronize()
    }

    var externalChangeNotification: Notification.Name {
        cloud.externalChangeNotification
    }

    var notificationSource: AnyObject {
        cloud.notificationSource
    }

    /// Opened by the coordinator, once, when iCloud has proved it is talking to
    /// this device.
    func markInitialSyncCompleted() {
        guard !hasCompletedInitialSync else { return }
        hasCompletedInitialSync = true
        defaults.set(true, forKey: Self.initialSyncKey)
    }
}

/// Coordinates iCloud KVS mirroring for the stat stores: reconciles at launch
/// and adopts external changes (another device) as they arrive. Last-writer-wins
/// per the roadmap's D5; offline edits reconcile when KVS next delivers a change.
/// A no-op beyond local persistence until the iCloud capability is provisioned.
final class StatsCloudSync {
    private let cloud: InitialSyncGatedCloudStore
    private let stores: [CloudSyncable]
    private var observer: NSObjectProtocol?

    /// `queue` is the notification-delivery queue: `.main` in the app, because
    /// KVS posts from a background thread and these stores drive SwiftUI. Tests
    /// pass `nil` for synchronous delivery on the posting thread.
    init(
        cloud: InitialSyncGatedCloudStore,
        stores: [CloudSyncable],
        queue: OperationQueue? = .main
    ) {
        self.cloud = cloud
        self.stores = stores
        observer = NotificationCenter.default.addObserver(
            forName: cloud.externalChangeNotification,
            object: cloud.notificationSource,
            queue: queue
        ) { [weak self] note in
            self?.handleExternalChange(note)
        }
        cloud.synchronize()
        // An install that has synced before is past the race and reconciles at
        // launch exactly as this coordinator always has. One that has not does
        // nothing yet: an empty read is indistinguishable from an undownloaded
        // one, so there is no honest move to make until iCloud says something.
        if cloud.hasCompletedInitialSync { reconcile() }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    private func handleExternalChange(_ note: Notification) {
        let firstArrival = !cloud.hasCompletedInitialSync
        if Self.provesInitialSync(note) { cloud.markInitialSyncCompleted() }
        guard cloud.hasCompletedInitialSync else { return }
        // The first arrival is the deferred launch pass: adopt what iCloud has,
        // seed what it has not. Later ones are another device's edit, adopted
        // last-writer-wins as before.
        if firstArrival {
            reconcile()
        } else {
            stores.forEach { $0.adoptFromCloud() }
        }
    }

    /// Adopt an existing cloud value; otherwise seed the cloud with whatever was
    /// stored locally (e.g. before iCloud was enabled).
    private func reconcile() {
        for store in stores {
            if cloud.data(forKey: store.cloudKey) != nil {
                store.adoptFromCloud()
            } else {
                store.pushToCloud()
            }
        }
    }

    /// Whether this change proves the store has finished a round trip with the
    /// server, so its contents can be trusted and ours can be published. A quota
    /// violation says a write was refused, which proves nothing about a
    /// download, and a change with no stated reason is not proof either — the
    /// gate stays shut until something says otherwise.
    private static func provesInitialSync(_ note: Notification) -> Bool {
        guard let reason = note.userInfo?[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int
        else { return false }
        return reason == NSUbiquitousKeyValueStoreInitialSyncChange
            || reason == NSUbiquitousKeyValueStoreServerChange
            || reason == NSUbiquitousKeyValueStoreAccountChange
    }
}
