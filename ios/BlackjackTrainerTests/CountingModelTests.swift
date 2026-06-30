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
            deckEstimationStore: SessionStatsStore(
                key: StatsKeys.deckEstimation,
                defaults: defaults
            ),
            showdownStatsStore: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults),
            generator: CardGenerator(random: random),
            shoeFactory: ShoeFactory(random: random)
        )
    }

    private func waitForState(
        _ model: CountingModel,
        _ target: CountingModel.DrillState
    ) async throws {
        let deadline = Date().addingTimeInterval(2)
        while model.state != target {
            if Date() > deadline {
                Issue.record("drill never reached the \(target) state")
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
        try await waitForState(model, .answering)
        model.answer(3)
        #expect(model.state == .feedback)
        #expect(model.result?.isCorrect == true)
        #expect(model.activeStats.attempts == 1)
        #expect(model.activeStats.correct == 1)
        model.cancel()
    }

    @Test func liveShoeRoundEstimatesAnswersAndOffersShowdown() async throws {
        let model = try make(random: { 0 })
        model.settings.mode = .trueCount
        model.settings.trueCountSource = .liveShoe
        model.settings.numberOfCards = 3
        model.settings.numberOfDecks = 1
        model.settings.millisecondsBetweenCards = 100
        #expect(model.liveShoeTrueCount)

        model.start()
        try await waitForState(model, .estimating)
        model.onEstimate(1.0)
        #expect(model.state == .answering)
        model.answer(0) // value need not be correct — this checks the wiring

        #expect(model.state == .feedback)
        if case let .trueCount(result) = model.result {
            #expect(result.deckEstimate == 1.0)
            #expect(result.deckEstimateWithinBand != nil)
        } else {
            Issue.record("expected a true-count result")
        }
        #expect(model.trueCountStats.attempts == 1)
        #expect(model.deckEstimationStats.attempts == 1)

        // A 1-deck shoe minus 3 cards = 49 remaining ≥ 4 → showdown available.
        #expect(model.showdownAvailable)
        model.enterShowdown()
        #expect(model.state == .showdown)
        model.exitShowdown()
        #expect(model.state == .feedback)
        model.cancel()
    }
}
