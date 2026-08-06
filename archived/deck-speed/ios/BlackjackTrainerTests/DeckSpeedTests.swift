import Foundation
import Testing
@testable import BlackjackTrainer

/// The deck-speed drill: the graded countdown, the record store, and the
/// self-paced loop. Mirrors the web `deck-speed` specs.
@MainActor
struct DeckSpeedTests {
    private let engine = CountingEngine()

    private func hiLo() throws -> CountingSystem {
        try #require(GameData.loadCountingSystems().first { $0.id == "hi-lo" })
    }

    private func ko() throws -> CountingSystem {
        try #require(GameData.loadCountingSystems().first { $0.id == "ko" })
    }

    private func suite() -> UserDefaults {
        let name = "deck-speed-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func model(defaults: UserDefaults,
                       clock: @escaping () -> Date) throws -> CountingModel {
        let loaded = try GameData.loadValidated()
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
            shoeFactory: ShoeFactory(random: { 0 }),
            now: clock
        )
        model.settings.mode = .deckSpeed
        return model
    }

    @Test func fullDeckCountComesFromTheSystemsOwnTags() throws {
        #expect(try engine.fullDeckCount(hiLo()) == 0)
        // KO is unbalanced: a full deck sums to +4, which is why its
        // burned-card arithmetic differs.
        #expect(try engine.fullDeckCount(ko()) == 4)
    }

    @Test func gradesTheCountAndReportsTheTime() throws {
        let cards = [Rank.two, .three, .ten].map { Card(rank: $0, suit: .spades) }
        let burned = Card(rank: .five, suit: .hearts)
        let result = try engine.evaluateDeckSpeed(
            cards,
            burnedCard: burned,
            answer: DeckSpeedAnswer(runningCount: 1, elapsedMilliseconds: 24000),
            system: hiLo(),
            previousBestMilliseconds: nil
        )
        #expect(result.correctRunningCount == 1)
        #expect(result.isCorrect)
        #expect(result.burnedCard == burned)
        #expect(result.elapsedMilliseconds == 24000)
        #expect(result.previousBestMilliseconds == nil)
        #expect(result.isPersonalBest)
    }

    @Test func onlyACorrectFasterRoundSetsARecord() throws {
        let cards = [Rank.two, .three, .ten].map { Card(rank: $0, suit: .spades) }
        let burned = Card(rank: .five, suit: .hearts)
        func graded(count: Double, elapsed: Int, best: Int?) throws -> DeckSpeedDrillResult {
            try engine.evaluateDeckSpeed(
                cards,
                burnedCard: burned,
                answer: DeckSpeedAnswer(runningCount: count, elapsedMilliseconds: elapsed),
                system: hiLo(),
                previousBestMilliseconds: best
            )
        }
        #expect(try !graded(count: 1, elapsed: 30000, best: 25000).isPersonalBest)
        #expect(try graded(count: 1, elapsed: 20000, best: 25000).isPersonalBest)
        let wrongButFast = try graded(count: 5, elapsed: 10000, best: 25000)
        #expect(!wrongButFast.isCorrect)
        #expect(!wrongButFast.isPersonalBest)
    }

    @Test func theRecordStoreKeepsTheFastestCorrectCountdown() {
        let defaults = suite()
        let store = DeckSpeedBestStore(key: StatsKeys.deckSpeedBest, defaults: defaults)
        #expect(store.bestMilliseconds == nil)
        #expect(store.record(correct: true, elapsedMilliseconds: 32000) == nil)
        #expect(store.bestMilliseconds == 32000)
        #expect(store.record(correct: true, elapsedMilliseconds: 28500) == 32000)
        #expect(store.bestMilliseconds == 28500)
        // Slower, and fast-but-wrong, both leave it alone.
        store.record(correct: true, elapsedMilliseconds: 40000)
        store.record(correct: false, elapsedMilliseconds: 5000)
        #expect(store.bestMilliseconds == 28500)
        // It survives a reload and clears on reset.
        let reloaded = DeckSpeedBestStore(key: StatsKeys.deckSpeedBest, defaults: defaults)
        #expect(reloaded.bestMilliseconds == 28500)
        reloaded.reset()
        #expect(DeckSpeedBestStore(key: StatsKeys.deckSpeedBest, defaults: defaults)
            .bestMilliseconds == nil)
    }

    @Test func dealsFiftyOneCardsOfARealDeckAndWaitsOnThePlayer() throws {
        let model = try model(defaults: suite(), clock: { Date() })
        #expect(model.deckSpeedDrill)
        model.start()
        #expect(model.state == .flipping)
        #expect(model.cards.count == DeckSpeed.cards)
        let dealt = Set(model.cards.map { "\($0.rank.rawValue)\($0.suit.rawValue)" })
        #expect(dealt.count == DeckSpeed.cards)
        #expect(model.currentIndex == 0)
        model.cancel()
    }

    @Test func flippingAdvancesOnlyOnDemandAndEndsTheCountdown() throws {
        var ticks = 0
        let start = Date(timeIntervalSince1970: 0)
        // Each flip advances the injected clock by a second.
        let model = try model(defaults: suite(), clock: {
            defer { ticks += 1 }
            return start.addingTimeInterval(Double(ticks))
        })
        model.start()
        for _ in 0 ..< DeckSpeed.cards {
            model.flipNext()
        }
        #expect(model.state == .answering)
        // A stray flip after the deck is done changes nothing.
        model.flipNext()
        #expect(model.state == .answering)
        model.answer(0)
        guard case let .deckSpeed(result) = model.result else {
            Issue.record("expected a deck-speed result")
            return
        }
        #expect(result.elapsedMilliseconds > 0)
        #expect(result.cards.count == DeckSpeed.cards)
    }

    @Test func gradesAgainstTheBurnedCardAndRecordsToItsOwnStores() throws {
        let model = try model(defaults: suite(), clock: { Date() })
        model.start()
        for _ in 0 ..< DeckSpeed.cards {
            model.flipNext()
        }
        let correct = engine.runningCount(model.cards, system: model.system)
        model.answer(correct)
        guard case let .deckSpeed(result) = model.result else {
            Issue.record("expected a deck-speed result")
            return
        }
        #expect(result.isCorrect)
        // Hi-Lo: the 51 shown plus the burned card's tag come back to the
        // full-deck constant.
        let burnedTag = model.system.value(for: result.burnedCard)
        #expect(result.correctRunningCount + burnedTag == result.fullDeckCount)
        #expect(model.deckSpeedStats.attempts == 1)
        #expect(model.deckSpeedStats.correct == 1)
        #expect(model.deckSpeedBest == result.elapsedMilliseconds)
        // No other store hears about it, and the drill has no live shoe.
        #expect(model.activeStats.attempts == 0)
        #expect(model.trueCountStats.attempts == 0)
        #expect(!model.usesLiveShoe)
        #expect(!model.showdownAvailable)
    }

    @Test func aWrongCountLeavesTheRecordAlone() throws {
        let model = try model(defaults: suite(), clock: { Date() })
        model.start()
        for _ in 0 ..< DeckSpeed.cards {
            model.flipNext()
        }
        model.answer(999)
        #expect(model.deckSpeedStats.attempts == 1)
        #expect(model.deckSpeedStats.correct == 0)
        #expect(model.deckSpeedBest == nil)
    }

    @Test func everySystemCanBeCountedDown() throws {
        let systems = try GameData.loadCountingSystems()
        #expect(systems.allSatisfy { $0.allows(.deckSpeed) })
        // And a stored deck-speed mode survives the prefs merge for any system.
        #expect(
            FlowPrefs.merged(from: ["counting": ["systemId": "ko", "mode": "deck-speed"]])
                .counting.mode == .deckSpeed
        )
    }

    @Test func durationReadsAsSecondsWithOneDecimal() {
        #expect(DeckSpeed.duration(milliseconds: 24500) == "24.5s")
        #expect(DeckSpeed.duration(milliseconds: 72400) == "72.4s")
        #expect(DeckSpeed.duration(milliseconds: 0) == "0.0s")
    }
}
