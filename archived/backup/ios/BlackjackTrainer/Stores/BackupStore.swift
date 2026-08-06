import Foundation

/// A store that can re-read its own state from `UserDefaults`.
///
/// A restore replaces the stored bytes underneath every store at once, and the
/// live objects were loaded at init. `reset()` already exists on all of them for
/// the same reason; this is its counterpart, and keeping it a protocol means a
/// store added later cannot be silently left holding stale state.
protocol ReloadableStore: AnyObject {
    func reloadFromDefaults()
}

/// Reads and replaces the app's whole `blackjack-` namespace as one file.
///
/// Every store persists JSON `Data` under its key, and the web persists the same
/// JSON as a `localStorage` string — the same bytes — so the file this writes
/// restores on either platform. See `Backup`.
struct BackupStore {
    private let defaults: UserDefaults
    private let now: () -> Date

    init(defaults: UserDefaults = .standard, now: @escaping () -> Date = { Date() }) {
        self.defaults = defaults
        self.now = now
    }

    enum RestoreResult: Equatable {
        case ok
        case failed(String)
    }

    /// Every key in the namespace, as the strings a backup file holds. A value
    /// that is not JSON `Data` was not written by this app's stores and is left
    /// out rather than guessed at.
    func build() -> Backup.PracticeBackup {
        var data: [String: String] = [:]
        for (key, value) in defaults.dictionaryRepresentation()
            where key.hasPrefix(Backup.keyPrefix) {
            guard let bytes = value as? Data,
                  let text = String(data: bytes, encoding: .utf8) else { continue }
            data[key] = text
        }
        return Backup.PracticeBackup(
            app: Backup.appID,
            schema: Backup.schemaVersion,
            exportedAt: ISO8601DateFormatter().string(from: now()),
            data: data
        )
    }

    func encoded(_ backup: Backup.PracticeBackup) -> Data? {
        try? JSONSerialization.data(
            withJSONObject: backup.jsonObject,
            options: [.prettyPrinted, .sortedKeys]
        )
    }

    /// Replaces the namespace with the file's contents. `UserDefaults` has no
    /// transaction, so the current namespace is snapshotted first and rolled
    /// back on failure — a half-applied restore would leave a valid profile
    /// worse off than not restoring at all.
    func restore(_ text: String) -> RestoreResult {
        let backup: Backup.PracticeBackup
        switch Backup.parse(text) {
        case let .failed(error): return .failed(error)
        case let .ok(parsed): backup = parsed
        }
        let previous = build().data
        replaceNamespace(with: backup.data)
        // A write that did not land leaves the namespace mixed; put the snapshot
        // back rather than leaving a profile half of each.
        guard build().data == backup.data else {
            replaceNamespace(with: previous)
            return .failed("Your device refused the backup; your existing data was kept.")
        }
        return .ok
    }

    private func replaceNamespace(with data: [String: String]) {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(Backup.keyPrefix) {
            defaults.removeObject(forKey: key)
        }
        for (key, value) in data {
            defaults.set(Data(value.utf8), forKey: key)
        }
    }
}
