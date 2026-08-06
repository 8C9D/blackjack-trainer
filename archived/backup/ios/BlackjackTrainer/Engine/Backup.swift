import Foundation

/// A portable copy of everything this app has stored about a trainee.
///
/// iCloud carries a trainee between their own devices, and does it silently. It
/// does not carry them off the platform: onto the web app, onto a friend's
/// phone, or into a file kept before deleting the app. That is what this is for,
/// and it is why the format is the web's byte for byte — every store on both
/// sides writes JSON under the same `blackjack-` key, so one file restores on
/// either. Mirrors `backup.model.ts`.
///
/// Every key this app writes is prefixed, so the backup is defined by the prefix
/// rather than by a list of stores. A list would silently omit whatever store is
/// added next; the prefix cannot.
enum Backup {
    static let keyPrefix = "blackjack-"
    static let appID = "blackjack-trainer"

    /// Bumped only when a payload written by an older build can no longer be
    /// restored as-is. Individual stores already coerce their own values on
    /// load, so a value whose shape changed degrades to that store's fallback
    /// rather than needing a schema bump.
    static let schemaVersion = 1

    struct PracticeBackup: Equatable {
        let app: String
        let schema: Int
        /// ISO instant, for the file name and the restore confirmation.
        let exportedAt: String
        /// Raw stored strings, keyed exactly as the store holds them. Kept as
        /// strings rather than re-parsed JSON so a backup round-trips
        /// byte-for-byte and this layer never has to know any store's shape.
        let data: [String: String]

        var jsonObject: [String: Any] {
            ["app": app, "schema": schema, "exportedAt": exportedAt, "data": data]
        }
    }

    enum ParseResult: Equatable {
        case ok(PracticeBackup)
        case failed(String)
    }

    static func fileName(exportedAt: String) -> String {
        // The date alone: a second backup on the same day is the same day's
        // backup, and the exporter will suffix a duplicate name anyway.
        let day = String(exportedAt.prefix(10))
        return "\(appID)-backup-\(day).json"
    }

    /// Parse an untrusted file. Anything that is not recognisably one of this
    /// app's backups is rejected with a sentence Settings can show, rather than
    /// half-applied — a restore replaces the whole namespace, so a partial one
    /// would leave the trainee worse off than not restoring at all.
    static func parse(_ text: String) -> ParseResult {
        guard let bytes = text.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: bytes)
        else { return .failed("That file is not JSON.") }
        guard let root = raw as? [String: Any] else { return .failed("That file is not a backup.") }
        guard root["app"] as? String == appID else {
            return .failed("That backup was not written by this app.")
        }
        let schema = root["schema"] as? Int
        guard schema == schemaVersion else {
            let found = schema.map(String.init) ?? "unknown"
            return .failed(
                "That backup is version \(found); this build reads version \(schemaVersion)."
            )
        }
        guard let payload = root["data"] as? [String: Any] else {
            return .failed("That backup has no data in it.")
        }
        // The file is user-supplied, so it does not get to name the keys it
        // writes: anything outside this app's namespace, or any non-string
        // value, is a malformed or hostile file rather than a backup to merge.
        var entries: [String: String] = [:]
        for (key, value) in payload {
            guard key.hasPrefix(keyPrefix), let text = value as? String else {
                return .failed("That backup contains entries this app did not write.")
            }
            entries[key] = text
        }
        return .ok(PracticeBackup(
            app: appID,
            schema: schemaVersion,
            exportedAt: root["exportedAt"] as? String ?? "",
            data: entries
        ))
    }
}
