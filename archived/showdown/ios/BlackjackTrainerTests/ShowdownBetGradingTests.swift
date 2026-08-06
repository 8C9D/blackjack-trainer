import Foundation
import Testing
@testable import BlackjackTrainer

/// The bet-spread drill asks for a number in the abstract; the showdown is the
/// table where the chips actually go out, and until now a trainee could flat-bet
/// the minimum through a rich shoe and hear nothing. Mirrors the web
/// `showdown.component.spec.ts` "grading the bet against the spread" block.
@MainActor
struct ShowdownBetGradingTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// The bet is placed before a card is dealt, so the shoe is padded to exactly
    /// one deck *including* the round to come — that makes the true count equal
    /// the carried running count at the moment the bet is graded. 8s are zero in
    /// Hi-Lo, so the filler moves nothing.
    private func oneDeckLeft(_ cards: [Card]) -> Shoe {
        Shoe(
            cards: cards + Array(repeating: card(.eight, .clubs), count: 52 - cards.count),
            penetration: 0.9
        )
    }

    private var hand: [Card] {
        [card(.nine), card(.ten), card(.seven), card(.six)]
    }

    private struct Harness {
        let model: ShowdownModel
        let betSpreadStats: SessionStatsStore
    }

    private func placing(
        _ units: Double,
        entryRunningCount: Double,
        systemId: String = DeviationIndexSystem.id,
        bankroll: Double? = nil
    ) throws -> Harness {
        let suite = "bet-grading-\(UUID().uuidString)"
        let store = UserDefaults(suiteName: suite)!
        store.removePersistentDomain(forName: suite)
        let app = TestEngines.shared
        let system = try #require(app.countingSystems.system(withId: systemId))
        let betSpreadStats = SessionStatsStore(key: StatsKeys.betSpread, defaults: store)
        let bankrollStore = BankrollStore(key: StatsKeys.showdownBankroll, defaults: store)
        if let bankroll {
            bankrollStore.record(stake: 0, payout: bankroll - bankrollStore.bankroll)
        }
        let model = ShowdownModel(
            shoe: oneDeckLeft(hand),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            betting: true,
            bankroll: bankrollStore,
            strategy: app.basicStrategy,
            system: system,
            entryRunningCount: entryRunningCount,
            betSpreadStats: betSpreadStats
        )
        model.setBet(units)
        model.dealAfterBet()
        return Harness(model: model, betSpreadStats: betSpreadStats)
    }

    @Test func offersTheSpreadAsTheBetLadderNotAGenericChipTray() throws {
        let h = try placing(1, entryRunningCount: 0)
        #expect(h.model.betOptions == BetRamp.default.map(Double.init))
    }

    /// No cards are dealt when the bet is placed, so the count is the carried one:
    /// 0 → the TC ≤ +1 band, where the default spread calls for 1 unit.
    @Test func confirmsABetThatMatchesTheSpreadAtThisCount() throws {
        let h = try placing(1, entryRunningCount: 0)
        #expect(try #require(h.model.lastPlay).correct)
        #expect(h.model.roundMisplays.isEmpty)
    }

    /// A carried +3 with one deck left is TC +3, where the spread calls for 4.
    ///
    /// Both numbers, because a headline is only ever shown on a miss and the
    /// correct bet on its own read as a statement about the chips actually out —
    /// on a screen that says "wagered 8" once the hand settles. The bet-spread
    /// drill has always named both, and this is the same decision.
    @Test func namesTheBetPlacedAsWellAsTheOneTheSpreadCalledFor() throws {
        let h = try placing(1, entryRunningCount: 3)
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "4 units was the bet, not 1.")
        let saysBand = verdict.reason.contains("TC +3")
        #expect(saysBand)
        #expect(h.model.roundMisplays.first == "Bet: 4 at TC +3, not 1")
    }

    /// "1 units" is the reason the counted-noun helper exists.
    @Test func agreesTheUnitNounWithTheBetTheSpreadCalledFor() throws {
        let h = try placing(4, entryRunningCount: 0)
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "1 unit was the bet, not 4.")
    }

    @Test func recordsTheCallInTheBetSpreadAccuracy() throws {
        let h = try placing(1, entryRunningCount: 3)
        #expect(h.betSpreadStats.stats.attempts == 1)
        #expect(h.betSpreadStats.stats.correct == 0)
    }

    /// The ramp is the player's own, indexed by whatever true count they keep, so
    /// it applies to any balanced system — unlike the insurance index, which is a
    /// Hi-Lo number and is only ever applied to Hi-Lo. Omega II is level 2: the
    /// same shoe reads a different count, and the ramp is graded on that one.
    @Test func gradesAnyBalancedSystemAgainstItsOwnTrueCount() throws {
        let h = try placing(4, entryRunningCount: 3, systemId: "omega-ii")
        #expect(try #require(h.model.lastPlay).correct)
    }

    /// A system with no true count at all is not scored against a ramp indexed by
    /// one — the same honesty the insurance call gets.
    @Test func saysNothingAboutTheBetForASystemWithNoTrueCount() throws {
        let h = try placing(1, entryRunningCount: 3, systemId: "ko")
        #expect(h.model.lastPlay == nil)
        #expect(h.betSpreadStats.stats.attempts == 0)
    }

    /// Pressing Deal into a shoe that cannot serve the round leaves the table on
    /// `.exhausted` with nothing dealt. There was no round to bet into.
    @Test func saysNothingWhenTheShoeWasTooLowToDealTheRound() throws {
        let suite = "bet-exhausted-\(UUID().uuidString)"
        let store = try #require(UserDefaults(suiteName: suite))
        store.removePersistentDomain(forName: suite)
        let app = TestEngines.shared
        let betSpreadStats = SessionStatsStore(key: StatsKeys.betSpread, defaults: store)
        let model = try ShowdownModel(
            shoe: Shoe(cards: [card(.nine), card(.ten), card(.seven)], penetration: 0.9),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            betting: true,
            bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: store),
            system: #require(app.countingSystems.system(withId: DeviationIndexSystem.id)),
            betSpreadStats: betSpreadStats
        )
        model.setBet(1)
        model.dealAfterBet()
        #expect(model.phase == .exhausted)
        #expect(model.lastPlay == nil)
        #expect(betSpreadStats.stats.attempts == 0)
    }

    /// A losing run clamps the carried bet down to whatever the stack can still
    /// back, which need not land on a rung. Scoring that would mark a figure the
    /// player never chose — the ladder is the only way to place a bet.
    @Test func skipsABetTheBankrollClampedOffTheLadder() throws {
        // 7 chips left: the carried 8 clamps to 7, which is on no rung.
        let h = try placing(8, entryRunningCount: 0, bankroll: 7)
        #expect(h.model.bet == 7)
        #expect(h.model.lastPlay == nil)
        #expect(h.betSpreadStats.stats.attempts == 0)
    }

    /// The rung is offered disabled once the stack cannot back it, so scoring it
    /// would mark a bet the table never let the player place.
    @Test func skipsACalledBetTheBankrollCouldNotHaveCovered() throws {
        // Three chips left, but TC +3 calls for four.
        let h = try placing(1, entryRunningCount: 3, bankroll: 3)
        #expect(h.model.lastPlay == nil)
        #expect(h.betSpreadStats.stats.attempts == 0)
    }

    /// The hole card is face up on the felt the moment the round pays, so a
    /// counter has it in their count before the next bet goes out. Grading that
    /// bet against a count still missing it marks a correctly-sized bet wrong.
    @Test func countsTheRevealedHoleCardBeforeGradingTheNextBet() throws {
        let suite = "bet-hole-card-\(UUID().uuidString)"
        let store = try #require(UserDefaults(suiteName: suite))
        store.removePersistentDomain(forName: suite)
        let app = TestEngines.shared
        // Player [10,6], dealer 10 up / 5 in the hole, then a 10 to bust on. The
        // 57 cards leave exactly one deck once the round is over, so the running
        // count at the second bet *is* the true count.
        let opening = [card(.ten), card(.ten), card(.six), card(.five), card(.ten)]
        let model = try ShowdownModel(
            shoe: Shoe(
                cards: opening + Array(repeating: card(.eight, .clubs), count: 52),
                penetration: 0.9
            ),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            betting: true,
            bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: store),
            strategy: app.basicStrategy,
            system: #require(app.countingSystems.system(withId: DeviationIndexSystem.id)),
            entryRunningCount: 3,
            betSpreadStats: SessionStatsStore(key: StatsKeys.betSpread, defaults: store)
        )
        model.setBet(2)
        model.dealAfterBet()
        // Bust the hand: the dealer never draws, but the hole card is turned over.
        model.onAction(.hit)
        #expect(model.phase == .resolved)
        #expect(model.dealerCards.map(\.rank) == [.ten, .five])

        // Seen: 10, 10, 6, 5, 10 → a carried +3 becomes +2 over one deck, which
        // is the band the spread bets 2 units in.
        model.dealAnother()
        model.setBet(2)
        model.dealAfterBet()
        let verdict = try #require(model.lastPlay)
        #expect(verdict.correct)
        let saysBand = verdict.reason.contains("TC +2")
        #expect(saysBand)
        #expect(model.roundMisplays.isEmpty)
    }
}
