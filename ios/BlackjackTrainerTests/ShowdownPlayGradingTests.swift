import Foundation
import Testing
@testable import BlackjackTrainer

/// The showdown now says whether the hand was played right. It still settles the
/// play either way — this is a table, not a quiz. Mirrors the web
/// `showdown.component.spec.ts` "grading the play" block.
@MainActor
struct ShowdownPlayGradingTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private func stacked(_ cards: [Card]) -> Shoe {
        Shoe(
            cards: cards + Array(repeating: Card(rank: .five, suit: .clubs), count: 10),
            penetration: 0.9
        )
    }

    private func freshDefaults() -> UserDefaults {
        let suite = "showdown-play-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private struct Harness {
        let model: ShowdownModel
        let playStats: SessionStatsStore
    }

    /// Cards are dealt player, dealer, player, dealer, then in draw order.
    private func makeModel(_ cards: [Card], ruleSet: RuleSet = .s17) -> Harness {
        let defaults = freshDefaults()
        let playStats = SessionStatsStore(key: StatsKeys.showdownPlay, defaults: defaults)
        let model = ShowdownModel(
            shoe: stacked(cards),
            ruleSet: ruleSet,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults),
            strategy: TestEngines.shared.basicStrategy,
            playStats: playStats
        )
        return Harness(model: model, playStats: playStats)
    }

    @Test func confirmsACorrectDecisionWithoutChangingWhatHappens() throws {
        // Player [10,9]=19 vs dealer 10: stand. Dealer [10,6] hits K → bust.
        let h = makeModel([card(.ten), card(.ten, .hearts), card(.nine), card(.six), card(.king)])
        h.model.onAction(.stand)
        let verdict = try #require(h.model.lastPlay)
        #expect(verdict.correct)
        #expect(verdict.headline == "Stand was the play.")
        // The round resolved exactly as it did before grading existed.
        #expect(h.model.settlement?.outcome == .win)
        #expect(h.model.roundMisplays.isEmpty)
    }

    @Test func namesThePlayThatWasCorrectAndLetsTheMisplayStand() throws {
        // Standing on 19 vs 10 is correct, so hitting is not.
        let h = makeModel([
            card(.ten), card(.ten, .hearts), card(.nine), card(.six), card(.two), card(.king)
        ])
        h.model.onAction(.hit)
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "Stand was the play.")
        // The card was still dealt: 19 + 2 = 21.
        #expect(h.model.playerCards.count == 3)
    }

    @Test func recordsEveryDecisionToThePlayAccuracyStore() {
        // [5,4]=9 vs 6 doubles, so hitting is wrong; then 9+2=11 vs 6, where a
        // three-card hand can only hit — and hitting is now correct.
        let h = makeModel([
            card(.five), card(.six, .hearts), card(.four), card(.ten), card(.two), card(.nine)
        ])
        h.model.onAction(.hit)
        #expect(h.playStats.stats.attempts == 1)
        #expect(h.playStats.stats.correct == 0)
        h.model.onAction(.hit)
        #expect(h.playStats.stats.attempts == 2)
        #expect(h.playStats.stats.correct == 1)
    }

    /// Doubling is a first-two-card action; the engine must not ask for it on a
    /// hand that has already drawn.
    @Test func neverAsksAThreeCardHandToDouble() throws {
        let h = makeModel([
            card(.five), card(.six, .hearts), card(.four), card(.ten), card(.two), card(.nine)
        ])
        h.model.onAction(.hit)
        h.model.onAction(.hit)
        #expect(try #require(h.model.lastPlay).headline == "Hit was the play.")
    }

    @Test func collectsTheRoundsMisplaysForTheResultPanel() throws {
        let h = makeModel([
            card(.ten), card(.ten, .hearts), card(.nine), card(.six), card(.two), card(.king)
        ])
        h.model.onAction(.hit) // wrong
        h.model.onAction(.stand) // right
        #expect(h.model.roundMisplays.count == 1)
        let line = try #require(h.model.roundMisplays.first)
        #expect(line.contains("Hard 19 vs 10"))
        #expect(line.contains("Stand"))
    }

    @Test func clearsTheVerdictWhenTheNextHandIsDealt() {
        let h = makeModel([
            card(.ten), card(.ten, .hearts), card(.nine), card(.six), card(.two), card(.king),
            card(.ten), card(.ten, .hearts), card(.nine), card(.six), card(.king)
        ])
        h.model.onAction(.hit)
        #expect(h.model.roundMisplays.count == 1)
        h.model.dealAnother()
        #expect(h.model.lastPlay == nil)
        #expect(h.model.roundMisplays.isEmpty)
    }

    @Test func gradesASplitOfferTheChartWantsTaken() throws {
        // [8,8] vs dealer 10 splits under every rule set.
        let h = makeModel([
            card(.eight), card(.ten, .hearts), card(.eight, .diamonds), card(.six),
            card(.three), card(.three, .hearts), card(.king)
        ])
        h.model.onAction(.split)
        let verdict = try #require(h.model.lastPlay)
        #expect(verdict.correct)
        #expect(verdict.headline == "Split was the play.")
    }

    /// A model built without the charts (the previews do this) simply does not
    /// grade, rather than crashing or recording a bogus attempt.
    @Test func skipsGradingWhenNoEngineWasSupplied() {
        let defaults = freshDefaults()
        let model = ShowdownModel(
            shoe: stacked([card(.ten), card(.ten, .hearts), card(.nine), card(.six), card(.king)]),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults)
        )
        model.onAction(.stand)
        #expect(model.lastPlay == nil)
        #expect(model.settlement != nil)
    }
}
