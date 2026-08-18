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
    /// The Deviations drill grades through the evaluator; the engine underneath
    /// it is held for the chart's deviation grid.
    let deviations: DeviationEngine
    let deviationEvaluator: DeviationEvaluator

    let basicStrategyStats: SessionStatsStore
    let runningCountStats: SessionStatsStore
    let trueCountStats: SessionStatsStore
    let deviationStats: SessionStatsStore
    let deckEstimationStats: SessionStatsStore

    /// Flow redesign stores: the pre-made decisions, the daily-goal/streak
    /// history, and the per-scenario weak-spot tallies.
    let flowPrefs: FlowPrefsStore
    let practiceHistory: PracticeHistoryStore
    let missTally: MissTallyStore
    /// Which side a wrong running count lands on — the half of a miscount the
    /// accuracy stores never carried.
    let countDrift: CountDriftStore

    /// Retained for the app's lifetime; mirrors the stat stores to iCloud KVS and
    /// adopts external changes (4.2). A no-op beyond local storage until the
    /// iCloud capability is provisioned.
    @ObservationIgnored private let cloudSync: StatsCloudSync

    init() {
        cleanupLegacyStatsKeys()
        let loaded = Self.loadEngines()
        charts = loaded.charts
        countingSystems = loaded.systems
        basicStrategy = loaded.basicStrategy
        deviations = loaded.deviations
        deviationEvaluator = loaded.evaluator

        // Gated: nothing reaches iCloud until this install has been told its
        // initial download finished, so a cold KVS cache cannot publish its
        // emptiness over another device's stats (I1).
        let cloud = InitialSyncGatedCloudStore(wrapping: UbiquitousKeyValueStore())
        let basicStrategyStats = SessionStatsStore(key: StatsKeys.basicStrategy, cloud: cloud)
        let runningCountStats = SessionStatsStore(key: StatsKeys.cardCounting, cloud: cloud)
        let trueCountStats = SessionStatsStore(key: StatsKeys.trueCount, cloud: cloud)
        let deviationStats = SessionStatsStore(key: StatsKeys.deviation, cloud: cloud)
        let deckEstimationStats = SessionStatsStore(key: StatsKeys.deckEstimation, cloud: cloud)
        self.basicStrategyStats = basicStrategyStats
        self.runningCountStats = runningCountStats
        self.trueCountStats = trueCountStats
        self.deviationStats = deviationStats
        self.deckEstimationStats = deckEstimationStats

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
            deviationStats, deckEstimationStats,
            flowPrefs, practiceHistory, missTally, countDrift
        ])
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

    /// Everything practice writes, cleared in one call, so no store can be
    /// forgotten when a new one is added. `flowPrefs` is deliberately NOT
    /// touched: a trainee clearing their numbers has not changed their mind
    /// about the table they are practising for. Mirrors the web
    /// `PracticeDataService`.
    func resetPracticeData() {
        for store in [
            basicStrategyStats, deviationStats, runningCountStats,
            trueCountStats, deckEstimationStats
        ] {
            store.reset()
        }
        practiceHistory.reset()
        missTally.reset()
        countDrift.reset()
    }
}
