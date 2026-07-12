import Foundation

/// Identifiers shared between the app and its widget extension.
enum AppGroup {
    /// App Group container the app and the widget both read/write so they share
    /// one snapshot. Provisioning this group for the App IDs is a pending human
    /// action; until then `UserDefaults(suiteName:)` falls back to a per-process
    /// store, so the simulator build stays green and cross-process sharing simply
    /// waits for the entitlement (mirrors the 4.2 KVS pattern).
    static let identifier = "group.com.arthurzhang.blackjacktrainer"
}

/// The Flow home surface the widget mirrors: the daily-goal ring and the streak
/// (not raw per-trainer stats). Written by the app to the shared App Group
/// container whenever the practice history or the daily goal changes.
struct WidgetSnapshot: Codable, Hashable, Sendable {
    var handsToday: Int
    var dailyGoal: Int
    var streak: Int
    /// The last seven days' goal-met flags, oldest first; the last entry is today.
    var dots: [Bool]

    static let empty = WidgetSnapshot(handsToday: 0, dailyGoal: 20, streak: 0, dots: [])

    var goalMet: Bool {
        handsToday >= dailyGoal
    }

    /// Ring fill fraction, clamped to [0, 1].
    var fraction: Double {
        guard dailyGoal > 0 else { return 1 }
        return min(1, Double(handsToday) / Double(dailyGoal))
    }

    var streakLabel: String {
        streak == 0 ? "No streak yet" : "\(streak)-day streak"
    }
}

/// Reads/writes the widget snapshot in the shared App Group `UserDefaults`.
enum WidgetSnapshotStore {
    static let key = "blackjack-widget-snapshot"

    /// The shared defaults, falling back to `.standard` if the App Group isn't
    /// available (e.g. an unprovisioned simulator) so reads/writes never crash.
    static func defaults() -> UserDefaults {
        UserDefaults(suiteName: AppGroup.identifier) ?? .standard
    }

    static func load(
        from defaults: UserDefaults = WidgetSnapshotStore.defaults()
    ) -> WidgetSnapshot {
        guard let data = defaults.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else { return .empty }
        return snapshot
    }

    static func save(
        _ snapshot: WidgetSnapshot,
        to defaults: UserDefaults = WidgetSnapshotStore.defaults()
    ) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
    }
}
