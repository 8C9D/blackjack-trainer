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
    let deviationEvaluator: DeviationEvaluator

    let basicStrategyStats: SessionStatsStore
    let runningCountStats: SessionStatsStore
    let trueCountStats: SessionStatsStore
    let deviationStats: SessionStatsStore
    let deckEstimationStats: SessionStatsStore
    let showdownStats: ShowdownStatsStore

    /// Retained for the app's lifetime; mirrors the stat stores to iCloud KVS and
    /// adopts external changes (4.2). A no-op beyond local storage until the
    /// iCloud capability is provisioned.
    @ObservationIgnored private let cloudSync: StatsCloudSync

    init() {
        cleanupLegacyStatsKeys()
        // The data is bundled and its integrity is verified by tests + CI; a
        // failure here means a broken build, so fail loudly.
        guard let loaded = try? GameData.loadValidated() else {
            preconditionFailure("bundled game data failed to load or validate")
        }
        charts = loaded.charts
        countingSystems = loaded.systems
        let basicStrategyEngine = BasicStrategyEngine(charts: loaded.charts)
        basicStrategy = basicStrategyEngine
        deviationEvaluator = DeviationEvaluator(
            engine: DeviationEngine(basic: basicStrategyEngine, charts: loaded.charts)
        )

        let cloud = UbiquitousKeyValueStore()
        let basicStrategyStats = SessionStatsStore(key: StatsKeys.basicStrategy, cloud: cloud)
        let runningCountStats = SessionStatsStore(key: StatsKeys.cardCounting, cloud: cloud)
        let trueCountStats = SessionStatsStore(key: StatsKeys.trueCount, cloud: cloud)
        let deviationStats = SessionStatsStore(key: StatsKeys.deviation, cloud: cloud)
        let deckEstimationStats = SessionStatsStore(key: StatsKeys.deckEstimation, cloud: cloud)
        let showdownStats = ShowdownStatsStore(key: StatsKeys.showdown, cloud: cloud)
        self.basicStrategyStats = basicStrategyStats
        self.runningCountStats = runningCountStats
        self.trueCountStats = trueCountStats
        self.deviationStats = deviationStats
        self.deckEstimationStats = deckEstimationStats
        self.showdownStats = showdownStats
        cloudSync = StatsCloudSync(cloud: cloud, stores: [
            basicStrategyStats, runningCountStats, trueCountStats,
            deviationStats, deckEstimationStats, showdownStats
        ])
    }
}
