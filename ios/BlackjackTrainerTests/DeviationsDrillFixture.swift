import Foundation
import Testing
@testable import BlackjackTrainer

/// The shared harness for the Deviations drill-model specs. Its own file so both
/// suites can build a model the same way and neither outgrows the lint limits.
@MainActor
enum DeviationsFixture {
    struct Harness {
        let model: DeviationsDrillModel
        let scheduler: ManualFlowAdvanceScheduler
        let prefs: FlowPrefsStore
        let missTally: MissTallyStore
    }

    nonisolated static func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    nonisolated static func scenario(_ a: Rank, _ b: Rank, vs upcard: Rank,
                                     tc: Int) -> DeviationScenario {
        DeviationScenario(
            player: TwoCardHand(card(a), card(b, .hearts)),
            dealerUpcard: card(upcard, .clubs),
            trueCount: tc
        )
    }

    nonisolated static func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    /// A generator pinned to one rank: `generateCard` reads rank and suit off one
    /// call each, so a value inside the rank's 1/13 slice picks it exactly.
    nonisolated static func generator(drawing rank: Rank?) -> CardGenerator {
        guard let rank, let index = Card.allRanks.firstIndex(of: rank) else {
            return CardGenerator()
        }
        let value = (Double(index) + 0.5) / Double(Card.allRanks.count)
        return CardGenerator(random: { value })
    }

    static func makeHarness(
        dailyGoal: Int = 20,
        systemId: String? = nil,
        manualTrueCount: Int? = nil,
        seedWeak: ScenarioRef? = nil,
        missedAt: Int? = nil,
        playHandsOut: Bool = true,
        draws: Rank? = nil,
        pinned: ScenarioRef? = nil,
        lateSurrender: Bool = false
    ) -> Harness {
        let defaults = freshDefaults()
        let prefs = FlowPrefsStore(defaults: defaults)
        prefs.setDailyGoal(Double(dailyGoal))
        if lateSurrender {
            prefs.setOptions(EngineOptions(doubleAfterSplit: false, lateSurrender: true))
        }
        if let systemId {
            prefs.updateCounting { $0.systemId = systemId }
        }
        if let manualTrueCount {
            prefs.updateDeviations {
                $0.trueCountSource = .manual
                $0.manualTrueCount = manualTrueCount
            }
        }
        let history = PracticeHistoryStore(defaults: defaults)
        let missTally = MissTallyStore(defaults: defaults)
        // Seeded before the model is built: the opening hand is chosen in init.
        if let seedWeak {
            missTally.record(.deviations, ref: seedWeak, correct: false, trueCount: missedAt)
        }
        let stats = SessionStatsStore(key: StatsKeys.deviation, defaults: defaults)
        prefs.setPlayHandsOut(playHandsOut)
        let scheduler = ManualFlowAdvanceScheduler()
        let model = DeviationsDrillModel(
            evaluator: TestEngines.shared.deviationEvaluator,
            charts: TestEngines.shared.charts,
            generator: generator(drawing: draws),
            stats: stats,
            prefs: prefs,
            history: history,
            missTally: missTally,
            systems: TestEngines.shared.countingSystems,
            scheduler: scheduler,
            advanceDelay: .zero,
            pinned: pinned
        )
        return Harness(model: model, scheduler: scheduler, prefs: prefs, missTally: missTally)
    }
}
