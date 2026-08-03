import Foundation
import Testing
@testable import BlackjackTrainer

/// The three published correlations are the only basis this app gives a trainee
/// for choosing among 58 systems, so every system has to carry them and they
/// have to survive the JSON round-trip. Mirrors the web
/// `counting-systems.spec.ts` "published system metrics" block.
@MainActor
struct CountingSystemMetricsTests {
    private var systems: [CountingSystem] {
        TestEngines.shared.countingSystems
    }

    @Test func everySystemCarriesThreeCorrelationsInRange() {
        for system in systems {
            let m = system.metrics
            for value in [m.bettingCorrelation, m.playingEfficiency, m.insuranceCorrelation] {
                #expect(value >= 0, "\(system.id)")
                #expect(value <= 1, "\(system.id)")
            }
        }
    }

    /// Spot-checks against the Blackjack Review comparison table the registry is
    /// transcribed from, pinning the four defaults and the table's extremes.
    @Test(arguments: [
        ("hi-lo", SystemMetrics(bettingCorrelation: 0.97, playingEfficiency: 0.51,
                                insuranceCorrelation: 0.76)),
        ("ko", SystemMetrics(bettingCorrelation: 0.98, playingEfficiency: 0.55,
                             insuranceCorrelation: 0.78)),
        ("omega-ii", SystemMetrics(bettingCorrelation: 0.92, playingEfficiency: 0.67,
                                   insuranceCorrelation: 0.85)),
        ("wong-halves", SystemMetrics(bettingCorrelation: 0.99, playingEfficiency: 0.57,
                                      insuranceCorrelation: 0.72)),
        // The floor of the table: a system that barely tracks anything.
        ("revere-five-count", SystemMetrics(bettingCorrelation: 0.43, playingEfficiency: 0.15,
                                            insuranceCorrelation: 0.19)),
        // A perfect betting correlation no human can keep — the reason these
        // figures are labelled as measuring the tags, not the counter.
        ("griffin-ultimate", SystemMetrics(bettingCorrelation: 1.0, playingEfficiency: 0.54,
                                           insuranceCorrelation: 0.72))
    ])
    func matchesThePublishedRow(row: (String, SystemMetrics)) throws {
        let system = try #require(systems.system(withId: row.0))
        #expect(system.metrics == row.1)
    }

    @Test func formatsACorrelationTheWayThePublishedTableWritesIt() {
        #expect(CountingSystem.correlation(0.97) == ".97")
        #expect(CountingSystem.correlation(0.4) == ".40")
        #expect(CountingSystem.correlation(0) == ".00")
        #expect(CountingSystem.correlation(1) == "1.00")
    }

    @Test func labelsAllThreeInTheOrderAHandMeetsThem() throws {
        let hiLo = try #require(systems.system(withId: DeviationIndexSystem.id))
        #expect(hiLo.metricLabels == [
            SystemMetricLabel(label: "Betting correlation", value: ".97"),
            SystemMetricLabel(label: "Playing efficiency", value: ".51"),
            SystemMetricLabel(label: "Insurance correlation", value: ".76")
        ])
    }

    /// Hi-Lo is the app's own worked example of the trade-off: it bets almost as
    /// well as anything on the table and plays worse than most, which is why its
    /// indices are the ones the Deviations trainer ships.
    @Test func showsHiLoTradingPlayingEfficiencyForBettingCorrelation() throws {
        let hiLo = try #require(systems.system(withId: "hi-lo")).metrics
        let omega = try #require(systems.system(withId: "omega-ii")).metrics
        #expect(hiLo.bettingCorrelation > omega.bettingCorrelation)
        #expect(hiLo.playingEfficiency < omega.playingEfficiency)
    }
}
