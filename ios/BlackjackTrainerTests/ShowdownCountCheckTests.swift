import Foundation
import Testing
@testable import BlackjackTrainer

/// Every count-dependent verdict at this table — the bet, the insurance call,
/// the index plays — was scored against a count the model kept, and the trainee
/// was never once asked for theirs. Mirrors the web `showdown.component.spec.ts`
/// "the count check on the way out" block.
@MainActor
struct ShowdownCountCheckTests {
    private struct Harness {
        let model: ShowdownModel
        let countStats: SessionStatsStore
    }

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// Player [10,9] = 19 vs dealer 10; the hole 6 makes 16, so the dealer draws
    /// the K and busts. Five cards, and the visible Hi-Lo count lands on −2.
    private var round: [Card] {
        [
            card(.ten), card(.ten, .hearts), card(.nine),
            card(.six, .clubs), card(.king, .diamonds)
        ]
    }

    private func table(countCheck: Bool = true, betting: Bool = false) throws -> Harness {
        let suite = "count-check-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        let app = TestEngines.shared
        let system = try #require(app.countingSystems.system(withId: DeviationIndexSystem.id))
        let countStats = SessionStatsStore(key: StatsKeys.cardCounting, defaults: defaults)
        let model = ShowdownModel(
            shoe: Shoe(cards: round, penetration: 0.9),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults),
            betting: betting,
            bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: defaults),
            system: system,
            countCheck: countCheck,
            countStats: countStats
        )
        return Harness(model: model, countStats: countStats)
    }

    /// A round played out and then left, exactly as the exit button does it.
    private func played(countCheck: Bool = true) throws -> Harness {
        let h = try table(countCheck: countCheck)
        h.model.onAction(.stand)
        _ = h.model.requestExit()
        return h
    }

    @Test func asksForTheCountInsteadOfLeavingAndCountsTheCardsItDealt() throws {
        let h = try played()
        #expect(h.model.phase == .countCheck)
        #expect(h.model.cardsSeen == 5)
    }

    @Test func confirmsTheCountCarriedOffTheTable() throws {
        let h = try played()
        h.model.answerCountCheck(-2)
        #expect(h.model.countVerdict?.correct == true)
        #expect(h.model.countVerdict?.headline == "The running count is -2.")
        #expect(h.model.countVerdict?.reason == "You carried it through 5 cards at the table.")
        #expect(h.countStats.stats.attempts == 1)
        #expect(h.countStats.stats.correct == 1)
    }

    @Test func namesTheCountAndHowFarTheAnswerDrifted() throws {
        let h = try played()
        h.model.answerCountCheck(0)
        #expect(h.model.countVerdict?.correct == false)
        #expect(h.model.countVerdict?.reason == "You said 0 — 2 points high over 5 cards.")
        #expect(h.countStats.stats.attempts == 1)
        #expect(h.countStats.stats.correct == 0)
    }

    /// One point off reads as a point, not "1 points".
    @Test func namesASinglePointDriftInTheSingular() throws {
        let h = try played()
        h.model.answerCountCheck(-3)
        #expect(h.model.countVerdict?.reason == "You said -3 — 1 point low over 5 cards.")
    }

    @Test func handsBackEveryDealtCardOnceTheCountIsAnswered() throws {
        let h = try played()
        h.model.answerCountCheck(-2)
        #expect(h.model.dealtCards.map(\.rank) == round.map(\.rank))
    }

    @Test func takesOneAnswerNotASecondGuessAtTheSameQuestion() throws {
        let h = try played()
        h.model.answerCountCheck(0)
        h.model.answerCountCheck(-2)
        #expect(h.model.countVerdict?.correct == false)
        #expect(h.countStats.stats.attempts == 1)
    }

    @Test func leavesStraightAwayWhenTheSettingIsOff() throws {
        let h = try table(countCheck: false)
        h.model.onAction(.stand)
        #expect(h.model.requestExit())
        #expect(h.model.phase == .resolved)
        #expect(h.countStats.stats.attempts == 0)
    }

    /// Mid-hand the dealer's hole card is dealt but face down, so there is no
    /// single count both sides could agree is right.
    @Test func doesNotAskInTheMiddleOfAHand() throws {
        let h = try table()
        #expect(h.model.phase == .playerTurn)
        #expect(h.model.requestExit())
        #expect(h.model.phase == .playerTurn)
    }

    @Test func doesNotAskWhenTheTableDealtNothing() throws {
        // Betting on: the first round opens on the bet, before any card.
        let h = try table(betting: true)
        #expect(h.model.requestExit())
        #expect(h.model.phase == .betting)
    }

    /// Wong Halves and friends run on half-points, so the answer box has to take
    /// them — the same rule the counting drill's own form follows.
    @Test func takesHalfPointsOnlyForAFractionalSystem() throws {
        let h = try played()
        #expect(!h.model.fractionalCount)
        let wongHalves = try #require(
            TestEngines.shared.countingSystems.first { $0.id == "wong-halves" }
        )
        let model = ShowdownModel(
            shoe: Shoe(cards: round, penetration: 0.9),
            ruleSet: .s17,
            stats: h.model.stats,
            system: wongHalves
        )
        #expect(model.fractionalCount)
    }
}
