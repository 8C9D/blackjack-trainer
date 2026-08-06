import Foundation

/// Abstraction over a syncing key/value store, so the stat stores can mirror to
/// iCloud (D5) and be unit-tested with a fake. Mirrors the subset of
/// `NSUbiquitousKeyValueStore` the app uses.
protocol CloudKeyValueStore: AnyObject {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
    @discardableResult func synchronize() -> Bool
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
}

/// Coordinates iCloud KVS mirroring for the stat stores: pulls/seeds at launch
/// and adopts external changes (another device) as they arrive. Last-writer-wins
/// per the roadmap's D5; offline edits reconcile when KVS next delivers a change.
/// A no-op beyond local persistence until the iCloud capability is provisioned.
final class StatsCloudSync {
    private let cloud: CloudKeyValueStore
    private let stores: [CloudSyncable]
    private var observer: NSObjectProtocol?

    init(cloud: CloudKeyValueStore, stores: [CloudSyncable]) {
        self.cloud = cloud
        self.stores = stores
        observer = NotificationCenter.default.addObserver(
            forName: UbiquitousKeyValueStore.didChangeExternally,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.stores.forEach { $0.adoptFromCloud() }
        }
        cloud.synchronize()
        // At launch, adopt an existing cloud value; otherwise seed the cloud with
        // whatever was stored locally (e.g. before iCloud was enabled).
        for store in stores {
            if cloud.data(forKey: store.cloudKey) != nil {
                store.adoptFromCloud()
            } else {
                store.pushToCloud()
            }
        }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }
}
