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
    }
}
