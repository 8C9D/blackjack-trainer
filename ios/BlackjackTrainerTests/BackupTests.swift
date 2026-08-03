import Foundation
import Testing
@testable import BlackjackTrainer

/// The file backup, and the fact that it is the *web's* file. iCloud carries a
/// trainee between their own devices; this carries them off the platform, which
/// only works if both apps write and read the same bytes. Mirrors the web
/// `backup.model.spec.ts` and `backup.service.spec.ts`.
struct BackupParseTests {
    private func file(
        app: String = Backup.appID,
        schema: Int = Backup.schemaVersion,
        data: [String: String] = ["blackjack-flow-prefs": "{\"dailyGoal\":20}"]
    ) -> String {
        let root: [String: Any] = [
            "app": app, "schema": schema, "exportedAt": "2026-08-03T12:00:00Z", "data": data
        ]
        let bytes = (try? JSONSerialization.data(withJSONObject: root)) ?? Data()
        return String(bytes: bytes, encoding: .utf8) ?? ""
    }

    @Test func acceptsABackupThisAppWrote() {
        guard case let .ok(parsed) = Backup.parse(file()) else {
            Issue.record("expected a parse")
            return
        }
        #expect(parsed.data["blackjack-flow-prefs"] == "{\"dailyGoal\":20}")
        #expect(parsed.exportedAt == "2026-08-03T12:00:00Z")
    }

    @Test func rejectsSomethingThatIsNotJSON() {
        #expect(Backup.parse("not-json{") == .failed("That file is not JSON."))
    }

    @Test func rejectsJSONThatIsNotABackup() {
        #expect(Backup.parse("[1,2,3]") == .failed("That file is not a backup."))
    }

    @Test func rejectsAnotherAppsFile() {
        #expect(Backup.parse(file(app: "something-else"))
            == .failed("That backup was not written by this app."))
    }

    @Test func rejectsASchemaThisBuildCannotRead() {
        let result = Backup.parse(file(schema: 99))
        #expect(result == .failed("That backup is version 99; this build reads version 1."))
    }

    /// The file is user-supplied, so it does not get to name the keys it writes.
    @Test func rejectsKeysOutsideThisAppsNamespace() {
        let result = Backup.parse(file(data: ["someone-elses-key": "{}"]))
        #expect(result == .failed("That backup contains entries this app did not write."))
    }

    /// An untouched profile is a real thing to back up.
    @Test func acceptsABackupWithNothingInItYet() {
        guard case let .ok(parsed) = Backup.parse(file(data: [:])) else {
            Issue.record("expected a parse")
            return
        }
        #expect(parsed.data.isEmpty)
    }

    @Test func namesTheFileByTheDayItWasExported() {
        #expect(Backup.fileName(exportedAt: "2026-08-03T12:00:00Z")
            == "blackjack-trainer-backup-2026-08-03.json")
    }
}

/// Round-tripping the real namespace through `UserDefaults`.
struct BackupStoreTests {
    private func freshDefaults() -> UserDefaults {
        let suite = "backup-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    /// Every store writes JSON `Data`; the backup carries it as the same text the
    /// web keeps in `localStorage`, which is what makes the file portable.
    @Test func readsTheNamespaceAsTheTextTheWebStores() {
        let defaults = freshDefaults()
        defaults.set(Data(#"{"attempts":3}"#.utf8), forKey: StatsKeys.basicStrategy)
        defaults.set(Data(#"{"days":[]}"#.utf8), forKey: StatsKeys.practiceHistory)
        // Not ours: a backup is defined by the prefix, not by a list of stores.
        defaults.set(Data("{}".utf8), forKey: "someone-elses-key")

        let built = BackupStore(defaults: defaults).build()

        #expect(built.data[StatsKeys.basicStrategy] == #"{"attempts":3}"#)
        #expect(built.data[StatsKeys.practiceHistory] == #"{"days":[]}"#)
        #expect(built.data["someone-elses-key"] == nil)
        #expect(built.app == Backup.appID)
        #expect(built.schema == Backup.schemaVersion)
    }

    @Test func restoreReplacesTheWholeNamespace() {
        let defaults = freshDefaults()
        defaults.set(Data(#"{"attempts":3}"#.utf8), forKey: StatsKeys.basicStrategy)
        defaults.set(Data(#"{"attempts":9}"#.utf8), forKey: StatsKeys.deviation)
        let store = BackupStore(defaults: defaults)

        let incoming = Backup.PracticeBackup(
            app: Backup.appID, schema: Backup.schemaVersion, exportedAt: "2026-08-03T00:00:00Z",
            data: [StatsKeys.trueCount: #"{"attempts":7}"#]
        )
        let text = String(bytes: store.encoded(incoming) ?? Data(), encoding: .utf8) ?? ""
        #expect(store.restore(text) == .ok)

        // Replaced, not merged: a key the backup does not carry is gone.
        #expect(defaults.data(forKey: StatsKeys.basicStrategy) == nil)
        #expect(defaults.data(forKey: StatsKeys.deviation) == nil)
        #expect(store.build().data[StatsKeys.trueCount] == #"{"attempts":7}"#)
    }

    @Test func restoreLeavesTheProfileAloneWhenTheFileIsNotABackup() {
        let defaults = freshDefaults()
        defaults.set(Data(#"{"attempts":3}"#.utf8), forKey: StatsKeys.basicStrategy)
        let store = BackupStore(defaults: defaults)

        #expect(store.restore("not-json{") == .failed("That file is not JSON."))
        #expect(store.build().data[StatsKeys.basicStrategy] == #"{"attempts":3}"#)
    }

    /// What the whole thing is for: a file written by one app restores in the
    /// other, so the keys and the value text have to match exactly.
    @Test func roundTripsItsOwnFile() {
        let defaults = freshDefaults()
        let payload = [
            StatsKeys.basicStrategy: #"{"attempts":3,"correct":2,"streak":1,"longestStreak":1}"#,
            StatsKeys.flowPrefs: #"{"dailyGoal":30}"#
        ]
        for (key, value) in payload {
            defaults.set(Data(value.utf8), forKey: key)
        }
        let store = BackupStore(defaults: defaults)

        let text = String(bytes: store.encoded(store.build()) ?? Data(), encoding: .utf8) ?? ""
        for key in payload.keys {
            defaults.removeObject(forKey: key)
        }
        #expect(store.build().data.isEmpty)

        #expect(store.restore(text) == .ok)
        #expect(store.build().data == payload)
    }
}

/// A restore has to win against iCloud. The cloud still holds the profile the
/// file replaced, and the next external change would otherwise adopt it straight
/// back over the restored values.
struct BackupCloudTests {
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

    @Test func pushingAllMakesTheLocalValuesAuthoritative() throws {
        let suite = "backup-cloud-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let cloud = FakeCloud()

        let stats = SessionStatsStore(
            key: StatsKeys.basicStrategy,
            defaults: defaults,
            cloud: cloud
        )
        stats.recordAttempt(correct: true)
        let sync = StatsCloudSync(cloud: cloud, stores: [stats])

        // The cloud is now carrying a profile a restore is about to replace.
        cloud
            .storage[StatsKeys.basicStrategy] = Data(#"{"attempts":99,"correct":99,"streak":0,"longestStreak":0}"#
                .utf8)

        sync.pushAll()

        #expect(cloud.data(forKey: StatsKeys.basicStrategy) != nil)
        stats.adoptFromCloud()
        // Adoption after the push finds the local value, not the stale one.
        #expect(stats.stats.attempts == 1)
    }
}

/// The live stores have to end up in step with the bytes a restore wrote — the
/// web reloads the page, iOS has to re-read them.
@MainActor
struct BackupReloadTests {
    @Test func restorePutsTheLiveStoresBackInStep() throws {
        let suite = "backup-reload-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)

        let stats = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        stats.recordAttempt(correct: true)
        #expect(stats.stats.attempts == 1)

        // A backup taken before the change, restored after it.
        let store = BackupStore(defaults: defaults)
        let empty = Backup.PracticeBackup(
            app: Backup.appID, schema: Backup.schemaVersion, exportedAt: "", data: [:]
        )
        let text = String(bytes: store.encoded(empty) ?? Data(), encoding: .utf8) ?? ""
        #expect(store.restore(text) == .ok)

        // The bytes are gone, but the live store still holds the old value until
        // it is told to re-read — which is the whole point of `ReloadableStore`.
        #expect(stats.stats.attempts == 1)
        stats.reloadFromDefaults()
        #expect(stats.stats.attempts == 0)
    }
}
