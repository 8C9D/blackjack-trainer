import Foundation
import Testing
@testable import BlackjackTrainer

/// Exercises the Card Counting trainer loop, including the timed card stream and
/// the KO-is-running-count-only coercion.
@MainActor
struct CountingModelTests {
    private func make(random: @escaping () -> Double = { 0 }) throws -> CountingModel {
        let loaded = try GameData.loadValidated()
        let suite = "count-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return CountingModel(
            systems: loaded.systems,
            engine: CountingEngine(),
            runningStore: SessionStatsStore(key: StatsKeys.cardCounting, defaults: defaults),
            trueCountStore: SessionStatsStore(key: StatsKeys.trueCount, defaults: defaults),
            generator: CardGenerator(random: random)
        )
    }

    private func waitForAnswering(_ model: CountingModel) async throws {
        let deadline = Date().addingTimeInterval(2)
        while model.state != .answering {
            if Date() > deadline {
                Issue.record("drill never reached the answering state")
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    @Test func defaultsToHiLoRunningCount() throws {
        let model = try make()
        #expect(model.system.id == "hi-lo")
        #expect(model.settings.mode == .runningCount)
        #expect(model.trueCountAvailable)
    }

    @Test func unbalancedSystemForcesRunningCount() throws {
        let model = try make()
        model.settings.mode = .trueCount
        let unbalanced = try #require(model.systems.first { !$0.balanced })
        model.changeSystem(unbalanced.id)
        #expect(model.settings.mode == .runningCount)
        #expect(!model.trueCountAvailable)
    }

    @Test func runningCountRoundStreamsGradesAndRecords() async throws {
        // random == 0 → every card is 2♠ (Hi-Lo +1), so 3 cards → running count 3.
        let model = try make(random: { 0 })
        model.settings.numberOfCards = 3
        model.settings.millisecondsBetweenCards = 100
        model.start()
        #expect(model.state == .streaming)
        try await waitForAnswering(model)
        model.answer(3)
        #expect(model.state == .feedback)
        #expect(model.result?.isCorrect == true)
        #expect(model.activeStats.attempts == 1)
        #expect(model.activeStats.correct == 1)
        model.cancel()
    }
}
