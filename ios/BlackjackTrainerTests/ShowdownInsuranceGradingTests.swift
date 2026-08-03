import Foundation
import Testing
@testable import BlackjackTrainer

/// Insurance is the one decision at the showdown table that is purely about the
/// count, and the showdown hangs off the drill that just practised it. Whether
/// the bet won is beside the point: insurance at +3 that loses was still right.
/// Mirrors the web `showdown.component.spec.ts` "graded against the count" block.
@MainActor
struct ShowdownInsuranceGradingTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// The true count divides by the decks actually left, so these rounds are
    /// dealt off a shoe padded to leave exactly one deck behind — which makes the
    /// true count equal the running count and keeps the arithmetic legible. The
    /// filler is 8s: zero in Hi-Lo and in KO, so it moves nothing.
    private func oneDeckLeft(_ cards: [Card]) -> Shoe {
        Shoe(
            cards: cards + Array(repeating: card(.eight, .clubs), count: 52),
            penetration: 0.9
        )
    }

    /// player [9,7]=16; the dealer shows an ace with a 6 in the hole — no natural.
    private var noNatural: [Card] {
        [card(.nine), card(.ace), card(.seven), card(.six)]
    }

    /// Same upcard, but a king in the hole: a dealer natural, so insurance pays.
    private var natural: [Card] {
        [card(.nine), card(.ace), card(.seven), card(.king)]
    }

    private struct Harness {
        let model: ShowdownModel
        let playStats: SessionStatsStore
    }

    /// A dealt round paused on the insurance decision, with the count the drill
    /// was carrying handed in.
    private func dealt(
        _ cards: [Card],
        systemId: String = DeviationIndexSystem.id,
        entryRunningCount: Double = 0
    ) throws -> Harness {
        let suite = "insurance-grading-\(UUID().uuidString)"
        let store = UserDefaults(suiteName: suite)!
        store.removePersistentDomain(forName: suite)
        let app = TestEngines.shared
        let system = try #require(app.countingSystems.system(withId: systemId))
        let playStats = SessionStatsStore(key: StatsKeys.showdownPlay, defaults: store)
        let model = ShowdownModel(
            shoe: oneDeckLeft(cards),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            betting: true,
            bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: store),
            strategy: app.basicStrategy,
            playStats: playStats,
            system: system,
            deviations: app.deviations,
            entryRunningCount: entryRunningCount
        )
        model.setBet(10)
        model.dealAfterBet()
        #expect(model.phase == .insurance)
        return Harness(model: model, playStats: playStats)
    }

    /// The opening deal of [A,?] against one box turns three cards face up; the
    /// hole card is held back until the next round. Hi-Lo reads 9→0, A→−1, 7→0.
    @Test func holdsTheHoleCardOutOfTheCountInsuranceIsDecidedOn() throws {
        let h = try dealt(noNatural)
        #expect(h.model.visibleRunningCount == -1)
        #expect(h.model.countBasis == .trueCount(-1))
    }

    @Test func marksTakingItAtALowCountAsAMisplayAndSaysTheCount() throws {
        let h = try dealt(noNatural)
        h.model.takeInsurance()
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "Declining was the play.")
        // The index is quoted from the chart, not restated by the coach.
        let index = try #require(TestEngines.shared.deviations.findRule(
            ruleSet: .s17, category: "insurance", playerHand: "insurance", dealerUpcard: "A"
        )).index
        let quotes = verdict.reason.contains("insurance index of +\(index)")
        #expect(quotes)
        // These rounds also over-bet the spread at a flat count, which is its own
        // misplay; the insurance call is the one under test here.
        let insuranceMisplays = h.model.roundMisplays.filter { $0.hasPrefix("Insurance") }
        #expect(insuranceMisplays.count == 1)
    }

    @Test func confirmsDecliningAtALowCount() throws {
        let h = try dealt(noNatural)
        h.model.declineInsurance()
        #expect(try #require(h.model.lastPlay).correct)
        let insuranceMisplays = h.model.roundMisplays.filter { $0.hasPrefix("Insurance") }
        #expect(insuranceMisplays.isEmpty)
    }

    /// A carried +4 less the visible ace is +3, and one deck left makes that a
    /// true count of +3 — the index exactly.
    @Test func confirmsTakingItOnceTheCountReachesTheIndex() throws {
        let h = try dealt(noNatural, entryRunningCount: 4)
        #expect(h.model.countBasis == .trueCount(3))
        h.model.takeInsurance()
        #expect(try #require(h.model.lastPlay).correct)
    }

    /// Insurance is a losing bet at a low count whether or not it happens to win —
    /// that is the whole lesson.
    @Test func callsItAMisplayEvenWhenTheInsuranceBetWins() throws {
        let h = try dealt(natural)
        h.model.takeInsurance()
        #expect(h.model.insuranceNet == 10)
        #expect(try #require(h.model.lastPlay).correct == false)
    }

    /// KO has no true count; its book publishes a running-count trigger, and that
    /// is what a KO counter is actually taught to use. It also reads the same
    /// three cards differently — the 7 is +1 in KO and 0 in Hi-Lo — so the carried
    /// +4 is unmoved here where Hi-Lo would have it at +3.
    @Test func gradesKOAgainstItsOwnPublishedInsuranceCount() throws {
        let h = try dealt(noNatural, systemId: "ko", entryRunningCount: 4)
        #expect(h.model.countBasis == .runningCount(count: 4, insuranceAt: 3))
        h.model.takeInsurance()
        let verdict = try #require(h.model.lastPlay)
        #expect(verdict.correct)
        let quotes = verdict.reason.contains("KO's insurance count of +3")
        #expect(quotes)
    }

    /// Wong Halves reads a different count off the same shoe and the app ships no
    /// indices for it, so the decision is settled without being scored. The bet is
    /// still graded — a ramp is the player's own, so any balanced system has a
    /// true count to index it by — which is why the verdict on screen is the
    /// bet's, and the insurance call leaves it alone rather than wiping it.
    @Test func saysNothingForASystemWhoseIndicesThisAppDoesNotHave() throws {
        let h = try dealt(noNatural, systemId: "wong-halves")
        #expect(h.model.countBasis == .ungraded)
        let beforeInsurance = h.model.lastPlay
        h.model.takeInsurance()
        #expect(h.model.lastPlay == beforeInsurance)
        let insuranceMisplays = h.model.roundMisplays.filter { $0.hasPrefix("Insurance") }
        #expect(insuranceMisplays.isEmpty)
        #expect(h.playStats.stats.attempts == 0)
        // The bet still settles; only the insurance verdict is withheld.
        #expect(h.model.insuranceNet == -5)
    }

    /// The decision counts toward the same playing accuracy the hand decisions do.
    @Test func recordsTheCallInThePlayingAccuracy() throws {
        let h = try dealt(noNatural)
        h.model.declineInsurance()
        #expect(h.playStats.stats.attempts == 1)
        #expect(h.playStats.stats.correct == 1)
    }
}
