import Foundation
import Testing
@testable import BlackjackTrainer

/// The bet-spread drill loop: the count question, the bet that follows it, and
/// where each half is recorded. A second suite rather than more of
/// `CountingModelTests` so both stay inside the type-body length budget.
@MainActor
struct BetSpreadDrillTests {
    private func make(source: TrueCountSource = .liveShoe) throws -> CountingModel {
        let loaded = try GameData.loadValidated()
        let suite = "bet-spread-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let model = CountingModel(
            systems: loaded.systems,
            engine: CountingEngine(),
            runningStore: SessionStatsStore(key: StatsKeys.cardCounting, defaults: defaults),
            trueCountStore: SessionStatsStore(key: StatsKeys.trueCount, defaults: defaults),
            deckEstimationStore: SessionStatsStore(
                key: StatsKeys.deckEstimation,
                defaults: defaults
            ),
            keyCountStore: SessionStatsStore(key: StatsKeys.keyCount, defaults: defaults),
            betSpreadStore: SessionStatsStore(key: StatsKeys.betSpread, defaults: defaults),
            deckSpeedStore: SessionStatsStore(key: StatsKeys.deckSpeed, defaults: defaults),
            deckSpeedBestStore: DeckSpeedBestStore(
                key: StatsKeys.deckSpeedBest,
                defaults: defaults
            ),
            showdownStatsStore: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults),
            generator: CardGenerator(random: { 0 }),
            shoeFactory: ShoeFactory(random: { 0 })
        )
        model.settings.mode = .betSpread
        model.settings.trueCountSource = source
        model.settings.numberOfCards = 3
        model.settings.millisecondsBetweenCards = 100
        model.settings.decksRemaining = 2
        return model
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

    @Test func isALiveShoeDrillThatAsksForTheDeckEstimateFirst() throws {
        let model = try make()
        #expect(model.betSpreadDrill)
        #expect(model.liveShoeBetSpread)
        #expect(model.usesLiveShoe)
        #expect(model.asksDeckEstimate)
        #expect(model.validation.valid)
    }

    @Test func isInvalidForAnUnbalancedSystemAndRefusesToStart() throws {
        let model = try make()
        let unbalanced = try #require(model.systems.first { !$0.balanced })
        model.system = unbalanced
        #expect(!model.betSpreadDrill)
        #expect(!model.validation.valid)
        model.start()
        #expect(model.state == .idle)
    }

    @Test func runsThroughTheEstimateCountAndBetInTurn() async throws {
        let model = try make()
        model.start()
        try await waitForState(model, .estimating)
        model.onEstimate(model.liveDecksRemaining)
        #expect(model.state == .answering)
        model.answer(0)
        #expect(model.state == .betting)
        #expect(model.isDrillActive)
        model.answerBet(1)
        #expect(model.state == .feedback)
        model.cancel()
    }

    @Test func gradesTheBetAgainstTheRampAndRoutesEachHalfToItsStore() async throws {
        let model = try make(source: .classic)
        model.settings.decksRemaining = 1
        model.start()
        try await waitForState(model, .answering)
        let engine = CountingEngine()
        let correct = Int(engine.runningCount(model.cards, system: model.system))
        model.answer(Double(correct))
        #expect(model.state == .betting)
        // Right count, deliberately wrong bet (99 is in range but never a band).
        model.answerBet(99)
        if case let .betSpread(result) = model.result {
            #expect(result.correctTrueCount == correct)
            #expect(result.correctUnits == BetRamp.units(trueCount: correct,
                                                         ramp: model.settings.betRamp))
            #expect(result.countCorrect)
            #expect(!result.betCorrect)
            #expect(!result.isCorrect)
            // The classic preset asks for no estimate.
            #expect(result.deckEstimate == nil)
        } else {
            Issue.record("expected a bet-spread result")
        }
        #expect(model.trueCountStats.attempts == 1)
        #expect(model.trueCountStats.correct == 1)
        #expect(model.betSpreadStats.attempts == 1)
        #expect(model.betSpreadStats.correct == 0)
        #expect(model.activeStats.attempts == 0)
        model.cancel()
    }

    @Test func scoresTheEstimateAndCarriesTheCountAcrossLiveShoeRounds() async throws {
        let model = try make()
        model.start()
        try await waitForState(model, .estimating)
        model.onEstimate(model.liveDecksRemaining)
        model.answer(0)
        model.answerBet(1)
        #expect(model.deckEstimationStats.attempts == 1)
        #expect(model.deckEstimationStats.correct == 1)
        guard case let .betSpread(first) = model.result else {
            Issue.record("expected a bet-spread result")
            return
        }
        #expect(first.deckEstimateWithinBand == true)
        #expect(first.priorRunningCount == 0)
        #expect(model.shoeRunningCount == first.correctRunningCount)

        model.start()
        try await waitForState(model, .estimating)
        model.onEstimate(model.liveDecksRemaining)
        model.answer(0)
        model.answerBet(1)
        if case let .betSpread(second) = model.result {
            #expect(second.priorRunningCount == first.correctRunningCount)
        }
        // The shoe survives for the post-count showdown, as in true-count mode.
        #expect(model.showdownAvailable)
        model.cancel()
    }

    @Test func ignoresABetOutsideTheBettingState() throws {
        let model = try make()
        model.start()
        model.answerBet(4)
        #expect(model.state == .streaming)
        #expect(model.result == nil)
        model.cancel()
    }
}
