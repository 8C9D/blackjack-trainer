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
            keyCountStore: SessionStatsStore(key: StatsKeys.keyCount, defaults: defaults),
            betSpreadStore: SessionStatsStore(key: StatsKeys.betSpread, defaults: defaults),
            deckSpeedStore: SessionStatsStore(key: StatsKeys.deckSpeed, defaults: defaults),
            deckSpeedBestStore: DeckSpeedBestStore(
                key: StatsKeys.deckSpeedBest,
                defaults: defaults
            ),
            showdownStatsStore: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults),
            generator: CardGenerator(random: random),
            shoeFactory: ShoeFactory(random: random)
        )
    }

    private func waitForState(
        _ model: CountingModel,
        _ target: CountingModel.DrillState,
        timeout: TimeInterval = 2
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
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

    /// The showdown's cards really leave the shoe, so their running-count value
    /// has to join the carried count. Otherwise the next round's numerator (the
    /// carried count, missing them) and denominator (decks remaining, already
    /// reduced by them) disagree, and a trainee who counted the visible showdown
    /// cards is graded wrong. Mirrors the web `exitShowdown`.
    @Test func exitingAShowdownFoldsItsDealtCardsIntoTheCarriedCount() async throws {
        let model = try make(random: { 0 })
        model.settings.mode = .trueCount
        model.settings.trueCountSource = .liveShoe
        model.settings.numberOfCards = 3
        model.settings.numberOfDecks = 1
        model.settings.millisecondsBetweenCards = 100

        model.start()
        try await waitForState(model, .estimating)
        model.onEstimate(1.0)
        model.answer(0)
        let carried = model.shoeRunningCount

        model.enterShowdown()
        // Hi-Lo: 5 → +1, 6 → +1, K → −1, so the carried count gains exactly 1.
        let dealt = [
            Card(rank: .five, suit: .spades),
            Card(rank: .six, suit: .hearts),
            Card(rank: .king, suit: .clubs)
        ]
        model.exitShowdown(dealt)
        #expect(model.state == .feedback)
        #expect(model.shoeRunningCount == carried + 1)
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
        model.exitShowdown([])
        #expect(model.state == .feedback)
        model.cancel()
    }

    /// A hand dealt after the cut card is a hand no table deals, and it would be
    /// graded on a true count divided by a sliver of a shoe. When the round just
    /// counted crossed the cut, the offer is withdrawn and the reason given.
    @Test func offersNoShowdownOnceTheCutCardIsOut() async throws {
        let model = try make(random: { 0 })
        model.settings.mode = .trueCount
        model.settings.trueCountSource = .liveShoe
        model.settings.numberOfDecks = 1
        model.settings.penetration = 0.5 // 1 deck: the cut card sits at 26 cards
        model.settings.numberOfCards = 26
        model.settings.millisecondsBetweenCards = 100

        model.start()
        try await waitForState(model, .estimating, timeout: 6)
        model.onEstimate(0.5)
        model.answer(0)
        #expect(model.state == .feedback)

        let shoe = try #require(model.shoe)
        #expect(shoe.needsReshuffle)
        // The shoe is not short of cards — it is past its cut card.
        #expect(shoe.cardsRemaining > Showdown.minCards(forSpots: 1))
        #expect(!model.showdownAvailable)
        #expect(model.shoeSpent)
        model.cancel()
    }

    private func makeKeyCount(decks: Int = 6) throws -> CountingModel {
        let model = try make(random: { 0 })
        model.changeSystem("ko")
        model.settings.mode = .keyCount
        model.settings.numberOfCards = 3
        model.settings.numberOfDecks = decks
        model.settings.millisecondsBetweenCards = 100
        return model
    }

    @Test func keyCountModeIsRecognizedAndValidOnlyForKO() throws {
        let model = try makeKeyCount()
        #expect(model.system.allows(.keyCount))
        #expect(model.keyCountDrill)
        #expect(model.usesLiveShoe)
        #expect(!model.liveShoeTrueCount)
        #expect(model.validation.valid)
        // Hi-Lo has no schedule: the same mode must refuse to start.
        model.changeSystem("hi-lo")
        model.settings.mode = .keyCount
        #expect(!model.keyCountDrill)
        #expect(!model.validation.valid)
        model.start()
        #expect(model.state == .idle)
    }

    @Test func keyCountRoundSeedsTheIRCAndGradesBothParts() async throws {
        let model = try makeKeyCount(decks: 6)
        model.start()
        // Six decks: the fresh shoe opens at the IRC, −20.
        #expect(model.shoeRunningCount == -20)
        try await waitForState(model, .answering)
        // random == 0 keeps the shoe unshuffled; compute the true answer.
        let engine = CountingEngine()
        let correct = -20 + engine.runningCount(model.cards, system: model.system)
        model.answer(correct)
        #expect(model.state == .advantage)
        model.answerAdvantage(correct >= -4)
        #expect(model.state == .feedback)
        if case let .keyCount(result) = model.result {
            #expect(result.priorRunningCount == -20)
            #expect(result.correctRunningCount == correct)
            #expect(result.irc == -20)
            #expect(result.keyCount == -4)
            #expect(result.isCorrect)
        } else {
            Issue.record("expected a key-count result")
        }
        // The count answer feeds the running store, the call its own store, and
        // the graded count carries into the next round.
        #expect(model.activeStats.attempts == 1)
        #expect(model.keyCountStats.attempts == 1)
        #expect(model.trueCountStats.attempts == 0)
        #expect(model.shoeRunningCount == correct)
        // The shoe survives for the post-count showdown.
        #expect(model.showdownAvailable)
        model.enterShowdown()
        #expect(model.state == .showdown)
        model.cancel()
    }

    @Test func keyCountResetLabelCitesTheIRC() throws {
        let model = try makeKeyCount(decks: 2)
        #expect(model.countResetLabel == "-4 (the IRC)")
        model.settings.mode = .runningCount
        #expect(model.countResetLabel == "0")
    }

    @Test func leavingKOCoercesKeyCountModeBack() throws {
        let model = try makeKeyCount()
        model.changeSystem("hi-lo")
        #expect(model.settings.mode == .runningCount)
    }
}
