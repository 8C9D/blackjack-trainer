import Testing
@testable import BlackjackTrainer

/// Slice 3.3 — the drill-result builders and settings validation added to the
/// counting engine (the per-card math itself is covered by the 1.4 parity sweep).
struct CountingDrillTests {
    private func system(_ id: String) throws -> CountingSystem {
        let systems = try GameData.loadCountingSystems()
        return try #require(systems.first { $0.id == id })
    }

    private let engine = CountingEngine()

    @Test func evaluateGradesRunningCountExactly() throws {
        let hiLo = try system("hi-lo")
        // 2,3,4,5,6 are all +1 in Hi-Lo → running count 5.
        let cards = [Rank.two, .three, .four, .five, .six].map { Card(rank: $0, suit: .spades) }
        #expect(engine.evaluate(cards, userRunningCount: 5, system: hiLo).isCorrect)
        #expect(!engine.evaluate(cards, userRunningCount: 4, system: hiLo).isCorrect)
        #expect(engine.evaluate(cards, userRunningCount: 5, system: hiLo).correctRunningCount == 5)
    }

    @Test func evaluateTrueCountTruncatesTowardZero() throws {
        let hiLo = try system("hi-lo")
        // Five ten-value cards = -5 running; over 2 decks → true count -2 (toward
        // zero), not -3.
        let cards = Array(repeating: Card(rank: .king, suit: .spades), count: 5)
        let result = engine.evaluateTrueCount(
            cards,
            userTrueCount: -2,
            decksRemaining: 2,
            system: hiLo
        )
        #expect(result.correctRunningCount == -5)
        #expect(result.correctTrueCount == -2)
        #expect(result.isCorrect)
    }

    @Test func evaluateTrueCountFoldsPriorRunningCount() throws {
        let hiLo = try system("hi-lo")
        let cards = [Card(rank: .two, suit: .spades), Card(rank: .three, suit: .hearts)] // +2
        let result = engine.evaluateTrueCount(
            cards, userTrueCount: 4, decksRemaining: 1, system: hiLo, priorRunningCount: 2
        )
        #expect(result.correctRunningCount == 4) // 2 prior + 2 this round
        #expect(result.correctTrueCount == 4)
        #expect(result.priorRunningCount == 2)
    }

    @Test func validateSettingsChecksCardCountAndTiming() {
        var settings = CountingDrillSettings()
        settings.numberOfCards = 0
        #expect(!engine.validateSettings(settings).valid)
        settings.numberOfCards = CountingConstants.maxCardsPerDrill + 1
        #expect(!engine.validateSettings(settings).valid)
        settings.numberOfCards = 20
        settings.millisecondsBetweenCards = 50
        #expect(!engine.validateSettings(settings).valid)
        settings.millisecondsBetweenCards = 1000
        #expect(engine.validateSettings(settings).valid)
    }

    @Test func validateSettingsClassicNeedsPositiveDecks() {
        var settings = CountingDrillSettings()
        settings.mode = .trueCount
        settings.trueCountSource = .classic
        settings.decksRemaining = 0
        #expect(!engine.validateSettings(settings).valid)
        settings.decksRemaining = 2
        #expect(engine.validateSettings(settings).valid)
    }

    @Test func validateSettingsLiveShoeChecksShoeConfig() {
        var settings = CountingDrillSettings()
        settings.mode = .trueCount
        settings.trueCountSource = .liveShoe
        settings.numberOfDecks = 3 // not 1/2/6/8
        #expect(!engine.validateSettings(settings).valid)
        settings.numberOfDecks = 1
        settings.penetration = 0.95 // above max
        #expect(!engine.validateSettings(settings).valid)
        settings.penetration = 0.75
        settings.numberOfCards = 20
        #expect(engine.validateSettings(settings).valid)
        settings.numberOfCards = 60 // exceeds a 1-deck (52-card) shoe
        #expect(!engine.validateSettings(settings).valid)
        // Exactly the whole shoe must be rejected too (web parity): it would
        // leave 0 decks remaining and the true-count division would trap.
        settings.numberOfCards = 52
        #expect(!engine.validateSettings(settings).valid)
        settings.numberOfCards = 51 // ≥ 1 card remains
        #expect(engine.validateSettings(settings).valid)
    }

    @Test func validateSettingsKeyCountSharesTheLiveShoeChecks() {
        var settings = CountingDrillSettings()
        settings.mode = .keyCount
        #expect(engine.validateSettings(settings).valid)
        settings.numberOfDecks = 3 // not 1/2/6/8
        #expect(!engine.validateSettings(settings).valid)
        settings.numberOfDecks = 1
        settings.numberOfCards = 60 // exceeds a 1-deck shoe
        #expect(!engine.validateSettings(settings).valid)
        // The classic decks-remaining preset has no bearing in key-count mode.
        settings.numberOfCards = 20
        settings.decksRemaining = 0
        #expect(engine.validateSettings(settings).valid)
    }

    @Test func evaluateKeyCountGradesCountAndCall() throws {
        let ko = try system("ko")
        // Six decks: IRC −20, key count −4. Prior −9 plus 2..6 (all +1 in KO)
        // → −4, exactly the key count: the advantage begins.
        let cards = [Rank.two, .three, .four, .five, .six].map { Card(rank: $0, suit: .spades) }
        let atKey = try #require(engine.evaluateKeyCount(
            cards, answer: KeyCountAnswer(runningCount: -4, saidAdvantage: true),
            system: ko, numberOfDecks: 6, priorRunningCount: -9
        ))
        #expect(atKey.correctRunningCount == -4)
        #expect(atKey.hasAdvantage)
        #expect(atKey.isCorrect)
        #expect(atKey.irc == -20)
        #expect(atKey.keyCount == -4)
        #expect(atKey.pivot == 4)
        #expect(atKey.insuranceCount == 3)
        // One below (prior −10 → −5): not yet.
        let below = try #require(engine.evaluateKeyCount(
            cards, answer: KeyCountAnswer(runningCount: -5, saidAdvantage: true),
            system: ko, numberOfDecks: 6, priorRunningCount: -10
        ))
        #expect(!below.hasAdvantage)
        #expect(!below.advantageCorrect)
        #expect(!below.isCorrect)
    }

    @Test func evaluateKeyCountRequiresBothPartsRight() throws {
        let ko = try system("ko")
        // Single deck: IRC 0, key count +2; 2 and 7 are both +1 → exactly +2.
        let cards = [Rank.two, .seven].map { Card(rank: $0, suit: .spades) }
        let wrongCount = try #require(engine.evaluateKeyCount(
            cards, answer: KeyCountAnswer(runningCount: 3, saidAdvantage: true),
            system: ko, numberOfDecks: 1, priorRunningCount: 0
        ))
        #expect(!wrongCount.countCorrect)
        #expect(wrongCount.advantageCorrect)
        #expect(!wrongCount.isCorrect)
        let wrongCall = try #require(engine.evaluateKeyCount(
            cards, answer: KeyCountAnswer(runningCount: 2, saidAdvantage: false),
            system: ko, numberOfDecks: 1, priorRunningCount: 0
        ))
        #expect(wrongCall.countCorrect)
        #expect(!wrongCall.advantageCorrect)
        #expect(!wrongCall.isCorrect)
    }

    @Test func evaluateKeyCountReturnsNilWithoutASchedule() throws {
        let hiLo = try system("hi-lo")
        let ko = try system("ko")
        #expect(engine.evaluateKeyCount(
            [], answer: KeyCountAnswer(runningCount: 0, saidAdvantage: true),
            system: hiLo, numberOfDecks: 6, priorRunningCount: 0
        ) == nil)
        // A deck count the schedule does not cover.
        #expect(engine.evaluateKeyCount(
            [], answer: KeyCountAnswer(runningCount: 0, saidAdvantage: true),
            system: ko, numberOfDecks: 4, priorRunningCount: 0
        ) == nil)
    }
}
