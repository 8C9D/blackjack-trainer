import Foundation

/// Identifiers shared between the app and its widget extension.
enum AppGroup {
    /// App Group container the app and the widget both read/write so they share
    /// one stats snapshot. Provisioning this group for the App IDs is a pending
    /// human action; until then `UserDefaults(suiteName:)` falls back to a
    /// per-process store, so the simulator build stays green and cross-process
    /// sharing simply waits for the entitlement (mirrors the 4.2 KVS pattern).
    static let identifier = "group.com.arthurzhang.blackjacktrainer"
}

/// The trainers whose headline stats the widget can surface — the five
/// session-stat trainers (the showdown tally has no accuracy/streak shape).
enum WidgetTrainer: String, Codable, CaseIterable, Identifiable {
    case basicStrategy
    case runningCount
    case trueCount
    case deviations
    case deckEstimation

    var id: String {
        rawValue
    }

    /// Full title for the medium widget and the configuration picker.
    var title: String {
        switch self {
        case .basicStrategy: "Basic Strategy"
        case .runningCount: "Running Count"
        case .trueCount: "True Count"
        case .deviations: "Deviations"
        case .deckEstimation: "Deck Estimation"
        }
    }

    /// Short label for the compact small widget.
    var shortTitle: String {
        switch self {
        case .basicStrategy: "Strategy"
        case .runningCount: "Running"
        case .trueCount: "True Count"
        case .deviations: "Deviations"
        case .deckEstimation: "Deck Est."
        }
    }
}

/// One trainer's headline stats. The widget shows accuracy + current streak.
struct WidgetTrainerStat: Codable, Hashable {
    var attempts: Int
    var correct: Int
    var currentStreak: Int

    static let empty = WidgetTrainerStat(attempts: 0, correct: 0, currentStreak: 0)

    /// Rounded accuracy percentage, or an em dash before any attempts. Mirrors
    /// the app's `StatsPanelView.accuracyDisplay` so the widget and in-app number
    /// always agree.
    var accuracyDisplay: String {
        guard attempts > 0 else { return "—" }
        let percent = (Double(correct) / Double(attempts) * 100).rounded()
        return "\(Int(percent))%"
    }
}

/// Snapshot of every trainer's headline stats, written by the app to the shared
/// App Group container on each stat change and read by the widget's timeline.
struct WidgetSnapshot: Codable, Hashable {
    /// Keyed by `WidgetTrainer.rawValue` (Codable-friendly String keys).
    var trainers: [String: WidgetTrainerStat]

    static let empty = WidgetSnapshot(trainers: [:])

    func stat(for trainer: WidgetTrainer) -> WidgetTrainerStat {
        trainers[trainer.rawValue] ?? .empty
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
