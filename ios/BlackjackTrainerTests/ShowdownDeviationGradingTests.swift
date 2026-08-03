import Foundation
import Testing
@testable import BlackjackTrainer

/// The showdown is the one place in the app where a live count meets an actual
/// hand, so the play is scored against the deviation chart laid over basic
/// strategy. A table that marked the Illustrious 18 wrong would be teaching two
/// different games. Mirrors the web `showdown.component.spec.ts` "against the
/// count" block and the `resolvePlayDecision` engine suite.
@MainActor
struct ShowdownDeviationGradingTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// Padded to leave exactly one deck behind, so the true count equals the
    /// running count; the filler is 8s, worth zero in both Hi-Lo and KO.
    private func oneDeckLeft(_ cards: [Card]) -> Shoe {
        Shoe(cards: cards + Array(repeating: card(.eight, .clubs), count: 52), penetration: 0.9)
    }

    /// Player [9,7]=16 vs dealer 10 (hole 6, held out of the visible count), so
    /// the visible running count is the entry count less the dealer's ten.
    private var sixteenVsTen: [Card] {
        [card(.nine), card(.ten), card(.seven), card(.six)]
    }

    private struct Harness {
        let model: ShowdownModel
        let missTally: MissTallyStore
    }

    /// Late surrender off by default: with it on, 16 vs 10 is a basic-strategy
    /// surrender and the index is not allowed to downgrade it — its own case
    /// below.
    private func dealt(
        entryRunningCount: Double,
        systemId: String = DeviationIndexSystem.id,
        lateSurrender: Bool = false
    ) throws -> Harness {
        let suite = "showdown-deviation-\(UUID().uuidString)"
        let store = UserDefaults(suiteName: suite)!
        store.removePersistentDomain(forName: suite)
        let app = TestEngines.shared
        let system = try #require(app.countingSystems.system(withId: systemId))
        let missTally = MissTallyStore(key: StatsKeys.missTally, defaults: store)
        let model = ShowdownModel(
            shoe: oneDeckLeft(sixteenVsTen),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            options: EngineOptions(doubleAfterSplit: true, lateSurrender: lateSurrender),
            strategy: app.basicStrategy,
            playStats: SessionStatsStore(key: StatsKeys.showdownPlay, defaults: store),
            system: system,
            deviations: app.deviations,
            entryRunningCount: entryRunningCount,
            missTally: missTally
        )
        return Harness(model: model, missTally: missTally)
    }

    @Test func standsSixteenVsTenAtTheIndexAndNamesIt() throws {
        let h = try dealt(entryRunningCount: 1) // visible RC 0 over one deck → TC 0
        h.model.onAction(.stand)
        let verdict = try #require(h.model.lastPlay)
        #expect(verdict.correct)
        #expect(verdict.headline == "Stand was the play.")
        #expect(verdict.reason.contains("0 or higher"))
        #expect(verdict.reason.contains("Basic strategy alone would hit"))
    }

    @Test func hitsTheSameHandOneCountLower() throws {
        let h = try dealt(entryRunningCount: 0) // visible RC -1 → TC -1
        h.model.onAction(.stand)
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "Hit was the play.")
    }

    @Test func namesAnIndexMissAsSuchInTheRoundsMisplays() throws {
        let h = try dealt(entryRunningCount: 1)
        h.model.onAction(.hit)
        #expect(h.model.roundMisplays.count == 1)
        let misplay = try #require(h.model.roundMisplays.first)
        #expect(misplay.contains("Stand, not Hit"))
        #expect(misplay.contains("(index play)"))
    }

    /// An index play is a Deviations question. Filing it under Basic Strategy
    /// would seed that drill a hand whose chart answer the trainee got right.
    @Test func filesAnIndexMissAsADeviationsWeakSpot() throws {
        let h = try dealt(entryRunningCount: 1)
        h.model.onAction(.hit)
        let spot = try #require(h.missTally.weakSpots(.deviations).first)
        #expect(spot.label == "16 vs 10")
        #expect(spot.misses == 1)
        #expect(h.missTally.weakSpots(.basicStrategy).isEmpty)
    }

    @Test func stillFilesAnOrdinaryMissUnderBasicStrategy() throws {
        let h = try dealt(entryRunningCount: 0)
        h.model.onAction(.stand)
        let spot = try #require(h.missTally.weakSpots(.basicStrategy).first)
        #expect(spot.label == "16 vs 10")
        #expect(h.missTally.weakSpots(.deviations).isEmpty)
    }

    /// A playing index is a Hi-Lo true count. KO's book publishes an insurance
    /// trigger and no playing schedule, so its running count grades that one
    /// decision and leaves the hand to basic strategy.
    @Test func gradesAnotherSystemsHandOnBasicStrategyAlone() throws {
        let h = try dealt(entryRunningCount: 1, systemId: "ko")
        h.model.onAction(.stand)
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "Hit was the play.")
    }

    /// Three other screens already tell a trainee counting something else that
    /// the indices are not theirs. This is the fourth place indices matter, and
    /// the only one that applies them to a hand they actually played.
    @Test func saysNothingToAHiLoCounterWhoseNumbersTheseAre() throws {
        #expect(try dealt(entryRunningCount: 1).model.indexNote == nil)
    }

    @Test func tellsABalancedCounterTheirTrueCountIsADifferentNumber() throws {
        let note = try #require(dealt(entryRunningCount: 1, systemId: "omega-ii").model.indexNote)
        #expect(note.contains("Omega II"))
        #expect(note.contains("different true count"))
        #expect(note.contains("graded on basic strategy alone"))
        #expect(note.contains("insurance call is left ungraded"))
    }

    /// KO is the one other system this table can grade at all, and only for
    /// insurance — so its note has to promise less than the others, not more.
    @Test func creditsKOWithTheOneDecisionItsBookPublishes() throws {
        let note = try #require(dealt(entryRunningCount: 1, systemId: "ko").model.indexNote)
        #expect(note.contains("unbalanced and has no true count"))
        #expect(note.contains("KO's own running-count trigger"))
        #expect(!note.contains("left ungraded"))
    }

    /// The index for 16 vs 10 assumes surrender was unavailable; the BJA late-
    /// surrender overlay says give the hand up at any count.
    @Test func doesNotLetTheIndexDowngradeASurrenderTheChartWants() throws {
        let h = try dealt(entryRunningCount: 1, lateSurrender: true)
        h.model.onAction(.stand)
        let verdict = try #require(h.model.lastPlay)
        #expect(!verdict.correct)
        #expect(verdict.headline == "Surrender was the play.")
    }
}

/// The engine underneath, exercised directly: the restriction gating and the
/// N-card classification are the two places the table's answer can differ from
/// the trainer's. Mirrors the web `deviation-engine.service.spec.ts`
/// "resolvePlayDecision" block.
@MainActor
struct PlayDeviationEngineTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private var engine: DeviationEngine {
        TestEngines.shared.deviations
    }

    /// Every action on offer unless a test takes one away, which is the state an
    /// opening showdown hand is actually dealt into.
    private func play(_ cards: [Card], _ up: Rank, lateSurrender: Bool = false,
                      canDouble: Bool = true, canSplit: Bool = true,
                      canSurrender: Bool = true) -> PlayInput {
        PlayInput(
            player: cards,
            dealerUpcard: card(up),
            ruleSet: .s17,
            options: EngineOptions(doubleAfterSplit: false, lateSurrender: lateSurrender),
            canDouble: canDouble,
            canSplit: canSplit,
            canSurrender: canSurrender
        )
    }

    @Test func appliesTheSixteenVsTenIndexAndNotBelowIt() {
        let hand = [card(.ten), card(.six)]
        #expect(engine.resolvePlayDecision(play(hand, .ten), trueCount: -1).action == .hit)
        let at0 = engine.resolvePlayDecision(play(hand, .ten), trueCount: 0)
        #expect(at0.action == .stand)
        #expect(at0.deviationApplied)
        #expect(at0.reason.contains("0 or higher"))
    }

    @Test func appliesAHardIndexToAHandMoreThanTwoCardsDeep() {
        // 5,4,7 is the same 16 vs 10 the chart indexes.
        let hand = [card(.five), card(.four), card(.seven)]
        #expect(engine.resolvePlayDecision(play(hand, .ten), trueCount: 0).action == .stand)
        #expect(engine.resolvePlayDecision(play(hand, .ten), trueCount: -1).action == .hit)
    }

    @Test func leavesADeviationTheFeltIsNotOfferingAlone() {
        // Hard 10 vs 10 doubles at +4 — but only where doubling is on the table.
        let hand = [card(.six), card(.four)]
        #expect(engine.resolvePlayDecision(play(hand, .ten), trueCount: 4).action == .double)
        let noDouble = engine.resolvePlayDecision(
            play(hand, .ten, canDouble: false), trueCount: 4
        )
        #expect(noDouble.action == .hit)
        #expect(!noDouble.deviationApplied)
        // A three-card 10 cannot double whatever the caller passes.
        let threeCard = [card(.four), card(.three), card(.three)]
        #expect(engine.resolvePlayDecision(play(threeCard, .ten), trueCount: 4).action == .hit)
    }

    @Test func splitsTensAtTheIndexOnlyWhileTheSplitIsOnOffer() {
        let hand = [card(.king), card(.queen)]
        #expect(engine.resolvePlayDecision(play(hand, .six), trueCount: 4).action == .split)
        #expect(engine.resolvePlayDecision(play(hand, .six), trueCount: 3).action == .stand)
        let capped = engine.resolvePlayDecision(play(hand, .six, canSplit: false), trueCount: 4)
        #expect(capped.action == .stand)
        #expect(!capped.deviationApplied)
    }

    @Test func doublesSoftNineteenAtOneAndStandsWhenDoublingHasLapsed() {
        let hand = [card(.ace), card(.eight)]
        #expect(engine.resolvePlayDecision(play(hand, .five), trueCount: 1).action == .double)
        #expect(engine.resolvePlayDecision(play(hand, .five), trueCount: 0).action == .stand)
        let drawn = [card(.ace), card(.four), card(.four)]
        #expect(engine.resolvePlayDecision(play(drawn, .five), trueCount: 1).action == .stand)
    }

    @Test func firesTheSurrenderOverlayOnlyWhenTheTableStillOffersIt() {
        // 16 vs 8 surrenders at +4; basic strategy hits it at any count.
        let hand = [card(.ten), card(.six)]
        let withLs = play(hand, .eight, lateSurrender: true)
        #expect(engine.resolvePlayDecision(withLs, trueCount: 4).action == .surrender)
        #expect(engine.resolvePlayDecision(withLs, trueCount: 3).action == .hit)
        // Split hands never surrender, so the overlay is off the table with them.
        let split = play(hand, .eight, lateSurrender: true, canSurrender: false)
        #expect(engine.resolvePlayDecision(split, trueCount: 4).action == .hit)
        // Nor does it fire where the house does not offer surrender at all.
        #expect(engine.resolvePlayDecision(play(hand, .eight), trueCount: 4).action == .hit)
    }

    @Test func doesNotLetAHardIndexDowngradeAChartedSurrender() {
        let hand = [card(.ten), card(.six)]
        let withLs = play(hand, .ten, lateSurrender: true)
        let at2 = engine.resolvePlayDecision(withLs, trueCount: 2)
        #expect(at2.action == .surrender)
        #expect(!at2.deviationApplied)
        // Once the felt withholds surrender the hand is back to hit-or-stand.
        let noSurrender = play(hand, .ten, lateSurrender: true, canSurrender: false)
        #expect(engine.resolvePlayDecision(noSurrender, trueCount: 2).action == .stand)
    }

    @Test func neverReturnsInsuranceAsAPlayingAction() {
        for trueCount in [-5, 0, 3, 8] {
            let hard = engine.resolvePlayDecision(play([card(.ten), card(.six)], .ace),
                                                  trueCount: trueCount)
            let soft = engine.resolvePlayDecision(play([card(.ace), card(.eight)], .ace),
                                                  trueCount: trueCount)
            #expect(hard.action != .insurance)
            #expect(soft.action != .insurance)
        }
    }

    @Test func matchesDecidePlayOnAHandTheChartDoesNotIndex() {
        let basic = TestEngines.shared.basicStrategy
        for trueCount in [-8, -1, 0, 3, 10] {
            let input = play([card(.three), card(.four)], .six)
            let resolved = engine.resolvePlayDecision(input, trueCount: trueCount)
            #expect(resolved.decision == basic.decidePlay(input))
            #expect(!resolved.deviationApplied)
            #expect(resolved.matchedRule == nil)
        }
    }

    @Test func classifiesAPairOnlyWhileTheSplitIsOnOffer() throws {
        let pair = [card(.king), card(.queen)]
        let asPair = try #require(
            DeviationEngine.classifyPlayForDeviation(pair, splitOnOffer: true)
        )
        #expect(asPair.category == "pair")
        #expect(asPair.playerHand == "10")
        // Split gone (box at its cap, bankroll short): the hand is its total, the
        // same fall-through decidePlay makes.
        let asTotal = try #require(
            DeviationEngine.classifyPlayForDeviation(pair, splitOnOffer: false)
        )
        #expect(asTotal.category == "hard")
        #expect(asTotal.playerHand == "20")
    }

    @Test func hasNoCellForASingleCardOrABustedHand() {
        #expect(DeviationEngine.classifyPlayForDeviation([card(.five)], splitOnOffer: true) == nil)
        let busted = [card(.ten), card(.six), card(.nine)]
        #expect(DeviationEngine.classifyPlayForDeviation(busted, splitOnOffer: false) == nil)
    }
}
