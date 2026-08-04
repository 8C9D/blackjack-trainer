import Foundation
import Testing
@testable import BlackjackTrainer

/// Shared fixture for the Basic Strategy drill suites: a model wired to fresh
/// stores and a manual scheduler, plus the two scenarios the loops drill.
@MainActor
enum DrillFixture {
    struct Harness {
        let model: BasicStrategyDrillModel
        let scheduler: ManualFlowAdvanceScheduler
        let prefs: FlowPrefsStore
        let history: PracticeHistoryStore
        let missTally: MissTallyStore
        let stats: SessionStatsStore
        /// Moved by hand so the decision timer is deterministic.
        let clock: TestClock
    }

    /// A wall clock a test can drive. The drill reads it when a question goes up
    /// and again when the answer lands.
    final class TestClock: @unchecked Sendable {
        var date = Date(timeIntervalSince1970: 1_800_000_000)

        func advance(_ seconds: Double) {
            date = date.addingTimeInterval(seconds)
        }
    }

    /// Hard 7 (3+4) vs 6 always hits under S17 — "hit" is correct, "stand" wrong.
    static var hitScenario: Scenario {
        Scenario(
            player: TwoCardHand(card(.three), card(.four, .hearts)),
            dealerUpcard: card(.six, .clubs)
        )
    }

    /// Hard 19 (10+9) vs 6 always stands, which ends the hand in one decision.
    static var standScenario: Scenario {
        Scenario(
            player: TwoCardHand(card(.ten), card(.nine, .hearts)),
            dealerUpcard: card(.six, .clubs)
        )
    }

    static func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// A generator pinned to one rank: `generateCard` reads rank and suit off one
    /// call each, so a value inside the rank's 1/13 slice picks it exactly.
    static func generator(drawing rank: Rank?) -> CardGenerator {
        guard let rank, let index = Card.allRanks.firstIndex(of: rank) else {
            return CardGenerator()
        }
        let value = (Double(index) + 0.5) / Double(Card.allRanks.count)
        return CardGenerator(random: { value })
    }

    static func makeHarness(
        dailyGoal: Int = 20,
        options: EngineOptions = .default,
        seedWeak: ScenarioRef? = nil,
        playHandsOut: Bool = true,
        draws: Rank? = nil,
        clock: TestClock? = nil,
        review: Bool = false
    ) -> Harness {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
        let prefs = FlowPrefsStore(defaults: defaults)
        prefs.setDailyGoal(Double(dailyGoal))
        prefs.setOptions(options)
        prefs.setPlayHandsOut(playHandsOut)
        let history = PracticeHistoryStore(defaults: defaults)
        let missTally = MissTallyStore(defaults: defaults)
        if let ref = seedWeak { missTally.record(.basicStrategy, ref: ref, correct: false) }
        let stats = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        let scheduler = ManualFlowAdvanceScheduler()
        let testClock = clock ?? TestClock()
        let model = BasicStrategyDrillModel(
            engine: TestEngines.shared.basicStrategy,
            generator: generator(drawing: draws),
            stats: stats,
            prefs: prefs,
            history: history,
            missTally: missTally,
            scheduler: scheduler,
            advanceDelay: .zero,
            now: { testClock.date },
            review: review
        )
        return Harness(
            model: model, scheduler: scheduler, prefs: prefs,
            history: history, missTally: missTally, stats: stats, clock: testClock
        )
    }
}
