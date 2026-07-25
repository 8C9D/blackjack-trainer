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
    /// Boxes the player occupies in the optional post-count showdown (1–3).
    var showdownSpots: Int

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
            penetration: ShoeConstants.defaultPenetration,
            showdownSpots: 1
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

// MARK: - Web-string mapping for the deviation practice mode

private enum PracticeModeCoding {
    static func string(_ mode: DeviationPracticeMode) -> String {
        mode == .deviationOnly ? "deviation-only" : "all-hands"
    }

    static func mode(_ raw: String?,
                     default fallback: DeviationPracticeMode) -> DeviationPracticeMode {
        switch raw {
        case "deviation-only": .deviationOnly
        case "all-hands": .allHands
        default: fallback
        }
    }
}

// MARK: - Tolerant field-by-field decode / encode (mirrors mergePrefs)

extension FlowPrefs {
    /// Field-by-field merge of an untrusted parsed payload over the defaults, so
    /// a stale or partly-corrupt stored shape degrades per field rather than
    /// discarding everything. Mirrors the web `mergePrefs`.
    static func merged(from parsed: Any?) -> FlowPrefs {
        let d = FlowPrefs.default
        guard let p = parsed as? [String: Any] else { return d }
        let dev = p["deviations"] as? [String: Any] ?? [:]
        let cnt = p["counting"] as? [String: Any] ?? [:]
        let opts = p["options"] as? [String: Any] ?? [:]
        return FlowPrefs(
            lastTrainer: oneOf(p["lastTrainer"], TrainerId.self, d.lastTrainer),
            dailyGoal: numberValue(p["dailyGoal"]).map { clampGoal($0) } ?? d.dailyGoal,
            theme: oneOf(p["theme"], ThemePref.self, d.theme),
            ruleSet: oneOf(p["ruleSet"], RuleSet.self, d.ruleSet),
            options: EngineOptions(
                doubleAfterSplit: boolValue(opts["doubleAfterSplit"]) ?? d.options.doubleAfterSplit,
                lateSurrender: boolValue(opts["lateSurrender"]) ?? d.options.lateSurrender
            ),
            deviations: DeviationPrefs(
                practiceMode: PracticeModeCoding.mode(
                    dev["practiceMode"] as? String,
                    default: d.deviations.practiceMode
                ),
                trueCountSource: oneOf(
                    dev["trueCountSource"],
                    DeviationTrueCountSource.self,
                    d.deviations.trueCountSource
                ),
                manualTrueCount: intValue(dev["manualTrueCount"]) ?? d.deviations.manualTrueCount
            ),
            counting: CountingPrefs(
                systemId: (cnt["systemId"] as? String) ?? d.counting.systemId,
                mode: oneOf(cnt["mode"], DrillMode.self, d.counting.mode),
                numberOfCards: intValue(cnt["numberOfCards"]) ?? d.counting.numberOfCards,
                millisecondsBetweenCards: intValue(cnt["millisecondsBetweenCards"])
                    ?? d.counting.millisecondsBetweenCards,
                decksRemaining: numberValue(cnt["decksRemaining"]) ?? d.counting.decksRemaining,
                trueCountSource: oneOf(
                    cnt["trueCountSource"],
                    TrueCountSource.self,
                    d.counting.trueCountSource
                ),
                numberOfDecks: intValue(cnt["numberOfDecks"]) ?? d.counting.numberOfDecks,
                penetration: numberValue(cnt["penetration"]) ?? d.counting.penetration,
                showdownSpots: Showdown.clampSpots(
                    intValue(cnt["showdownSpots"]) ?? d.counting.showdownSpots
                )
            )
        )
    }

    /// The stored JSON shape (matching the web's key/value forms).
    var jsonObject: [String: Any] {
        [
            "lastTrainer": lastTrainer.rawValue,
            "dailyGoal": dailyGoal,
            "theme": theme.rawValue,
            "ruleSet": ruleSet.rawValue,
            "options": [
                "doubleAfterSplit": options.doubleAfterSplit,
                "lateSurrender": options.lateSurrender
            ],
            "deviations": [
                "practiceMode": PracticeModeCoding.string(deviations.practiceMode),
                "trueCountSource": deviations.trueCountSource.rawValue,
                "manualTrueCount": deviations.manualTrueCount
            ],
            "counting": [
                "systemId": counting.systemId,
                "mode": counting.mode.rawValue,
                "numberOfCards": counting.numberOfCards,
                "millisecondsBetweenCards": counting.millisecondsBetweenCards,
                "decksRemaining": counting.decksRemaining,
                "trueCountSource": counting.trueCountSource.rawValue,
                "numberOfDecks": counting.numberOfDecks,
                "penetration": counting.penetration,
                "showdownSpots": counting.showdownSpots
            ]
        ]
    }
}

/// A JSON string in an enum's vocabulary, else the fallback. Mirrors `oneOf`.
private func oneOf<T: RawRepresentable>(
    _ value: Any?,
    _: T.Type,
    _ fallback: T
) -> T where T.RawValue == String {
    guard let raw = value as? String, let parsed = T(rawValue: raw) else { return fallback }
    return parsed
}

/// A JSON number as Double, rejecting JSON booleans (which bridge to NSNumber).
private func numberValue(_ value: Any?) -> Double? {
    guard let number = value as? NSNumber, !isBoolNumber(number) else { return nil }
    let d = number.doubleValue
    return d.isFinite ? d : nil
}

/// A JSON integer (rejects non-integers, mirroring the web `int()`).
private func intValue(_ value: Any?) -> Int? {
    guard let d = numberValue(value), d == d.rounded() else { return nil }
    return Int(d)
}

private func boolValue(_ value: Any?) -> Bool? {
    guard let number = value as? NSNumber, isBoolNumber(number) else { return nil }
    return number.boolValue
}

private func isBoolNumber(_ number: NSNumber) -> Bool {
    CFGetTypeID(number) == CFBooleanGetTypeID()
}

/// The user's pre-made decisions under a single localStorage-parity key. Mirrors
/// `FlowPrefsService`: tolerant field-by-field load over defaults, write-through
/// to iCloud KVS following the stat-store pattern.
@Observable
final class FlowPrefsStore: CloudSyncable {
    @ObservationIgnored let key: String
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let cloud: CloudKeyValueStore?
    /// Fired after a local change (so the widget snapshot can refresh).
    @ObservationIgnored var onChange: (() -> Void)?
    private(set) var prefs: FlowPrefs

    init(
        key: String = StatsKeys.flowPrefs,
        defaults: UserDefaults = .standard,
        cloud: CloudKeyValueStore? = nil
    ) {
        self.key = key
        self.defaults = defaults
        self.cloud = cloud
        prefs = Self.load(key: key, defaults: defaults)
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
        onChange?()
    }

    private static func load(key: String, defaults: UserDefaults) -> FlowPrefs {
        guard let data = defaults.data(forKey: key) else { return .default }
        return FlowPrefs.merged(from: try? JSONSerialization.jsonObject(with: data))
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
        guard let cloud, let data = cloud.data(forKey: key) else { return }
        prefs = FlowPrefs.merged(from: try? JSONSerialization.jsonObject(with: data))
        Self.save(prefs, key: key, defaults: defaults)
        // A cross-device sync changed the goal/settings; notify so the widget
        // snapshot republishes (the publisher listens on onChange).
        onChange?()
    }

    func pushToCloud() {
        guard let cloud, let data = try? JSONSerialization.data(withJSONObject: prefs.jsonObject)
        else { return }
        cloud.set(data, forKey: key)
    }
}
