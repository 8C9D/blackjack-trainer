import Foundation
import Observation

/// The three trainers, in canonical home-screen order. Raw values match the
/// web `TrainerId` union so the persisted `blackjack-flow-prefs` reconciles.
enum TrainerId: String, CaseIterable, Codable {
    case basicStrategy = "basic-strategy"
    case cardCounting = "card-counting"
    case deviations

    var label: String {
        switch self {
        case .basicStrategy: "Basic Strategy"
        case .cardCounting: "Card Counting"
        case .deviations: "Deviations"
        }
    }
}

/// The appearance the app renders in. `system` follows the device setting; the
/// other two pin a scheme regardless. Raw values match the web `ThemePref` so
/// the persisted `blackjack-flow-prefs` shape stays identical.
enum ThemePref: String, CaseIterable, Codable {
    case system
    case light
    case dark

    var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}

/// EngineOptions carries no synthesized Equatable in the engine layer (kept
/// byte-identical); FlowPrefs needs it for value equality.
extension EngineOptions: Equatable {
    static func == (lhs: EngineOptions, rhs: EngineOptions) -> Bool {
        lhs.doubleAfterSplit == rhs.doubleAfterSplit && lhs.lateSurrender == rhs.lateSurrender
    }
}

/// The Deviations trainer's pre-made decisions. Mirrors the web `DeviationPrefs`.
struct DeviationPrefs: Equatable {
    var practiceMode: DeviationPracticeMode
    var trueCountSource: DeviationTrueCountSource
    var manualTrueCount: Int
}

/// The Card Counting trainer's pre-made decisions. Mirrors the web
/// `CountingPrefs` (drill settings plus the selected system id).
struct CountingPrefs: Equatable {
    var systemId: String
    var mode: DrillMode
    var numberOfCards: Int
    var millisecondsBetweenCards: Int
    var decksRemaining: Double
    var trueCountSource: TrueCountSource
    var numberOfDecks: Int
    var penetration: Double

    /// The `CountingDrillSettings` the drill/engine consume (systemId stripped,
    /// mirroring the web's `const { systemId, ...settings } = counting`).
    var drillSettings: CountingDrillSettings {
        CountingDrillSettings(
            mode: mode,
            numberOfCards: numberOfCards,
            millisecondsBetweenCards: millisecondsBetweenCards,
            decksRemaining: decksRemaining,
            trueCountSource: trueCountSource,
            numberOfDecks: numberOfDecks,
            penetration: penetration
        )
    }
}

/// Every pre-made decision the Settings screen edits and the drills read, under
/// a single key. Mirrors the web `FlowPrefs`.
struct FlowPrefs: Equatable {
    var lastTrainer: TrainerId
    var dailyGoal: Int
    var theme: ThemePref
    var ruleSet: RuleSet
    var options: EngineOptions
    var deviations: DeviationPrefs
    var counting: CountingPrefs
}

enum FlowPrefsConstants {
    static let minDailyGoal = 1
    static let maxDailyGoal = 200
}

extension FlowPrefs {
    static let `default` = FlowPrefs(
        lastTrainer: .basicStrategy,
        dailyGoal: 20,
        theme: .system,
        ruleSet: .s17,
        options: .default,
        deviations: DeviationPrefs(
            practiceMode: .allHands,
            trueCountSource: .random,
            manualTrueCount: 0
        ),
        counting: CountingPrefs(
            systemId: "hi-lo",
            mode: .runningCount,
            numberOfCards: 20,
            millisecondsBetweenCards: 1000,
            decksRemaining: 1,
            trueCountSource: .liveShoe,
            numberOfDecks: ShoeConstants.defaultNumberOfDecks,
            penetration: ShoeConstants.defaultPenetration
        )
    )
}

/// Rounds and clamps a daily goal into [1, 200]; a non-finite value falls back
/// to the default. Mirrors the web `clampGoal`.
func clampGoal(_ goal: Double) -> Int {
    guard goal.isFinite else { return FlowPrefs.default.dailyGoal }
    let rounded = Int(goal.rounded())
    return min(FlowPrefsConstants.maxDailyGoal, max(FlowPrefsConstants.minDailyGoal, rounded))
}

/// The user's pre-made decisions under a single localStorage-parity key. Mirrors
/// `FlowPrefsService`: tolerant field-by-field load over defaults, write-through
/// to iCloud KVS following the stat-store pattern.
@Observable
final class FlowPrefsStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    @ObservationIgnored private let systems: [CountingSystem]
    private(set) var prefs: FlowPrefs

    init(
        key: String = StatsKeys.flowPrefs,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil,
        systems: [CountingSystem]? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        self.systems = systems ?? (try? GameData.loadCountingSystems()) ?? []
        prefs = Self.load(key: key, defaults: defaults, systems: self.systems)
    }

    func setLastTrainer(_ trainer: TrainerId) {
        prefs.lastTrainer = trainer
        persist()
    }

    func setDailyGoal(_ goal: Double) {
        prefs.dailyGoal = clampGoal(goal)
        persist()
    }

    func setTheme(_ theme: ThemePref) {
        prefs.theme = theme
        persist()
    }

    func setRuleSet(_ ruleSet: RuleSet) {
        prefs.ruleSet = ruleSet
        persist()
    }

    func setOptions(_ options: EngineOptions) {
        prefs.options = options
        persist()
    }

    func updateDeviations(_ mutate: (inout DeviationPrefs) -> Void) {
        mutate(&prefs.deviations)
        persist()
    }

    func updateCounting(_ mutate: (inout CountingPrefs) -> Void) {
        mutate(&prefs.counting)
        persist()
    }

    private func persist() {
        Self.save(prefs, key: key, defaults: defaults)
        pushToCloud()
    }

    private static func load(
        key: String,
        defaults: UserDefaults,
        systems: [CountingSystem]
    ) -> FlowPrefs {
        guard let data = defaults.data(forKey: key) else { return .default }
        return FlowPrefs.merged(
            from: try? JSONSerialization.jsonObject(with: data),
            systems: systems
        )
    }

    private static func save(_ prefs: FlowPrefs, key: String, defaults: UserDefaults) {
        guard let data = try? JSONSerialization.data(withJSONObject: prefs.jsonObject)
        else { return }
        defaults.set(data, forKey: key)
    }

    // MARK: CloudSyncable

    var cloudKey: String {
        key
    }

    func adoptFromCloud() {
        // Cloud bytes are another device's write and untrusted: a payload that
        // is not a prefs object leaves valid local state alone rather than
        // resetting it to defaults. A decodable object still merges
        // field-by-field with the same tolerance as a local load.
        guard let cloud, let data = cloud.data(forKey: key),
              let object = try? JSONSerialization.jsonObject(with: data),
              object is [String: Any]
        else { return }
        prefs = FlowPrefs.merged(from: object, systems: systems)
        Self.save(prefs, key: key, defaults: defaults)
    }

    func pushToCloud() {
        guard let cloud, let data = try? JSONSerialization.data(withJSONObject: prefs.jsonObject)
        else { return }
        cloud.set(data, forKey: key)
    }
}
