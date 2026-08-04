import Foundation
import Observation

/// The app's composition root: loads the bundled game data once, builds the
/// engines, and owns the per-trainer stat stores. Injected into the SwiftUI
/// environment so every screen shares one instance. Stats persist here (they
/// outlive a screen's in-memory drill state).
@Observable
final class AppModel {
    let charts: ChartsFile
    let countingSystems: [CountingSystem]

    let basicStrategy: BasicStrategyEngine
    let counting = CountingEngine()
    /// The Deviations drill grades through the evaluator; the showdown's
    /// insurance call needs the engine underneath it, so both are held.
    let deviations: DeviationEngine
    let deviationEvaluator: DeviationEvaluator

    let basicStrategyStats: SessionStatsStore
    let runningCountStats: SessionStatsStore
    let trueCountStats: SessionStatsStore
    let deviationStats: SessionStatsStore
    let deckEstimationStats: SessionStatsStore
    let keyCountStats: SessionStatsStore
    let betSpreadStats: SessionStatsStore
    let deckSpeedStats: SessionStatsStore
    let deckSpeedBest: DeckSpeedBestStore
    let showdownStats: ShowdownStatsStore
    /// Accuracy of the playing decisions made at the showdown table, apart from
    /// the win/lose/push tally: one measures how the cards fell, the other
    /// whether the hand was played right. Only the second is a skill.
    let showdownPlayStats: SessionStatsStore
    let showdownBankroll: BankrollStore

    /// Flow redesign stores: the pre-made decisions, the daily-goal/streak
    /// history, and the per-scenario weak-spot tallies.
    let flowPrefs: FlowPrefsStore
    let practiceHistory: PracticeHistoryStore
    let missTally: MissTallyStore
    /// Which side a wrong running count lands on — the half of a miscount the
    /// accuracy stores never carried.
    let countDrift: CountDriftStore

    /// Reads and replaces the whole stored namespace as one file — iCloud carries
    /// a trainee between their own devices, this carries them off the platform.
    let backup = BackupStore()

    /// Retained for the app's lifetime; mirrors the stat stores to iCloud KVS and
    /// adopts external changes (4.2). A no-op beyond local storage until the
    /// iCloud capability is provisioned.
    @ObservationIgnored private let cloudSync: StatsCloudSync

    /// Retained for the app's lifetime; writes the home-screen widget's stats
    /// snapshot on each change and refreshes its timelines (4.3). Inert beyond a
    /// local plist until the App Group is provisioned.
    @ObservationIgnored private let widgetPublisher: WidgetSnapshotPublisher

    init() {
        cleanupLegacyStatsKeys()
        let loaded = Self.loadEngines()
        charts = loaded.charts
        countingSystems = loaded.systems
        basicStrategy = loaded.basicStrategy
        deviations = loaded.deviations
        deviationEvaluator = loaded.evaluator

        let cloud = UbiquitousKeyValueStore()
        let basicStrategyStats = SessionStatsStore(key: StatsKeys.basicStrategy, cloud: cloud)
        let runningCountStats = SessionStatsStore(key: StatsKeys.cardCounting, cloud: cloud)
        let trueCountStats = SessionStatsStore(key: StatsKeys.trueCount, cloud: cloud)
        let deviationStats = SessionStatsStore(key: StatsKeys.deviation, cloud: cloud)
        let deckEstimationStats = SessionStatsStore(key: StatsKeys.deckEstimation, cloud: cloud)
        let keyCountStats = SessionStatsStore(key: StatsKeys.keyCount, cloud: cloud)
        let betSpreadStats = SessionStatsStore(key: StatsKeys.betSpread, cloud: cloud)
        let deckSpeedStats = SessionStatsStore(key: StatsKeys.deckSpeed, cloud: cloud)
        let deckSpeedBest = DeckSpeedBestStore(cloud: cloud)
        let showdownStats = ShowdownStatsStore(key: StatsKeys.showdown, cloud: cloud)
        let showdownPlayStats = SessionStatsStore(key: StatsKeys.showdownPlay, cloud: cloud)
        let showdownBankroll = BankrollStore(key: StatsKeys.showdownBankroll, cloud: cloud)
        self.basicStrategyStats = basicStrategyStats
        self.runningCountStats = runningCountStats
        self.trueCountStats = trueCountStats
        self.deviationStats = deviationStats
        self.deckEstimationStats = deckEstimationStats
        self.keyCountStats = keyCountStats
        self.betSpreadStats = betSpreadStats
        self.deckSpeedStats = deckSpeedStats
        self.deckSpeedBest = deckSpeedBest
        self.showdownStats = showdownStats
        self.showdownPlayStats = showdownPlayStats
        self.showdownBankroll = showdownBankroll

        let flowPrefs = FlowPrefsStore(cloud: cloud, systems: loaded.systems)
        // A day is judged by the goal it was practised under, so the history has
        // to know what that was on every rep it records — wired at construction
        // rather than threaded through each drill.
        let practiceHistory = PracticeHistoryStore(cloud: cloud, goalSource: { [weak flowPrefs] in
            flowPrefs?.prefs.dailyGoal ?? 0
        })
        let missTally = MissTallyStore(cloud: cloud)
        let countDrift = CountDriftStore(cloud: cloud)
        self.flowPrefs = flowPrefs
        self.practiceHistory = practiceHistory
        (self.missTally, self.countDrift) = (missTally, countDrift)

        cloudSync = StatsCloudSync(cloud: cloud, stores: [
            basicStrategyStats, runningCountStats, trueCountStats,
            deviationStats, deckEstimationStats, keyCountStats, betSpreadStats,
            deckSpeedStats, deckSpeedBest, showdownStats, showdownPlayStats, showdownBankroll,
            flowPrefs, practiceHistory, missTally, countDrift
        ])
        // Built after cloud adoption so the seeded snapshot reflects any value
        // pulled from iCloud at launch. The widget mirrors the Flow home surface —
        // the daily-goal ring and the streak — from the practice history + goal.
        widgetPublisher = WidgetSnapshotPublisher(history: practiceHistory, prefs: flowPrefs)
    }

    /// The bundled charts and the engines built on them. Its own step so the
    /// initializer stays inside the lint limit.
    private struct LoadedEngines {
        let charts: ChartsFile
        let systems: [CountingSystem]
        let basicStrategy: BasicStrategyEngine
        let deviations: DeviationEngine
        let evaluator: DeviationEvaluator
    }

    /// The data is bundled and its integrity is verified by tests + CI; a failure
    /// here means a broken build, so fail loudly.
    private static func loadEngines() -> LoadedEngines {
        guard let loaded = try? GameData.loadValidated() else {
            preconditionFailure("bundled game data failed to load or validate")
        }
        let basicStrategy = BasicStrategyEngine(charts: loaded.charts)
        let deviations = DeviationEngine(basic: basicStrategy, charts: loaded.charts)
        return LoadedEngines(
            charts: loaded.charts,
            systems: loaded.systems,
            basicStrategy: basicStrategy,
            deviations: deviations,
            evaluator: DeviationEvaluator(engine: deviations)
        )
    }

    /// Every store that holds state loaded from `UserDefaults`, so a restore can
    /// put the live objects back in step with the bytes underneath them. Same
    /// reason `resetPracticeData` lists them: a store added later must not be
    /// silently left out.
    private var reloadableStores: [any ReloadableStore] {
        [
            basicStrategyStats, deviationStats, runningCountStats, trueCountStats,
            deckEstimationStats, keyCountStats, betSpreadStats, deckSpeedStats,
            showdownPlayStats, deckSpeedBest, showdownStats, showdownBankroll,
            practiceHistory, missTally, countDrift, flowPrefs
        ]
    }

    /// Replace everything from a backup file. Unlike the web, which reloads the
    /// page, the live stores are re-read in place — there is no reload to hide
    /// behind on iOS, and asking for a relaunch would be a worse answer than
    /// doing the work.
    func restoreBackup(_ text: String) -> BackupStore.RestoreResult {
        let result = backup.restore(text)
        guard result == .ok else { return result }
        for store in reloadableStores {
            store.reloadFromDefaults()
        }
        // The cloud still holds the profile the file just replaced. Without this
        // the next external change would adopt it straight back over the restore.
        cloudSync.pushAll()
        return .ok
    }

    /// Everything practice writes, cleared in one call, so no store can be
    /// forgotten when a new one is added. `flowPrefs` is deliberately NOT
    /// touched: a trainee clearing their numbers has not changed their mind
    /// about the table they are practising for. Mirrors the web
    /// `PracticeDataService`.
    func resetPracticeData() {
        for store in [
            basicStrategyStats, deviationStats, runningCountStats,
            trueCountStats, deckEstimationStats, keyCountStats, betSpreadStats,
            deckSpeedStats, showdownPlayStats
        ] {
            store.reset()
        }
        deckSpeedBest.reset()
        showdownStats.reset()
        showdownBankroll.reset()
        practiceHistory.reset()
        missTally.reset()
        countDrift.reset()
    }
}
