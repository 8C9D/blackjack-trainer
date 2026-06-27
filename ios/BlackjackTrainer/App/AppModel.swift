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

    let basicStrategyStats = SessionStatsStore(key: StatsKeys.basicStrategy)
    let runningCountStats = SessionStatsStore(key: StatsKeys.cardCounting)
    let trueCountStats = SessionStatsStore(key: StatsKeys.trueCount)
    let deviationStats = SessionStatsStore(key: StatsKeys.deviation)
    let deckEstimationStats = SessionStatsStore(key: StatsKeys.deckEstimation)
    let showdownStats = ShowdownStatsStore()

    init() {
        cleanupLegacyStatsKeys()
        // The data is bundled and its integrity is verified by tests + CI; a
        // failure here means a broken build, so fail loudly.
        guard let loaded = try? GameData.loadValidated() else {
            preconditionFailure("bundled game data failed to load or validate")
        }
        charts = loaded.charts
        countingSystems = loaded.systems
        let basicStrategy = BasicStrategyEngine(charts: loaded.charts)
        self.basicStrategy = basicStrategy
        deviationEvaluator = DeviationEvaluator(
            engine: DeviationEngine(basic: basicStrategy, charts: loaded.charts)
        )
    }
}
