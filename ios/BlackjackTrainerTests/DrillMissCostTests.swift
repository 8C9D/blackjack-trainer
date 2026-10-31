import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors the `.drill__cost` line and the verdict in
/// `basic-strategy-drill-page.component.spec.ts`. Its own suite because the drill's
/// loop tests fill theirs to swiftlint's type-body limit.
@MainActor
struct BasicStrategyMissCostTests {
    @Test func aMissSaysWhatItGaveUp() throws {
        let h = DrillFixture.makeHarness()
        h.model.deal(DrillFixture.hitScenario)
        h.model.answer(.stand)
        let cost = try #require(h.model.missCost)
        #expect(cost.hasPrefix("That play gives up "))
        #expect(cost.hasSuffix("% of your bet."))
    }

    @Test func aCorrectAnswerHasNothingToPrice() {
        let h = DrillFixture.makeHarness()
        h.model.deal(DrillFixture.hitScenario)
        #expect(h.model.missCost == nil)
        h.model.answer(.hit)
        #expect(h.model.missCost == nil)
    }

    @Test func theFigureLeavesWithTheHand() {
        let h = DrillFixture.makeHarness()
        h.model.deal(DrillFixture.hitScenario)
        h.model.answer(.stand)
        h.model.continueFromMiss()
        #expect(h.model.missCost == nil)
    }

    /// Insurance is a side bet, so it is priced on its own value rather than as a
    /// gap between two plays of the hand.
    @Test func pricesAnInsuranceMissAsTheSideBetItIs() {
        let h = DrillFixture.makeHarness()
        h.model.deal(Scenario(
            player: [DrillFixture.card(.three), DrillFixture.card(.four, .hearts)],
            dealerUpcard: DrillFixture.card(.ace, .clubs)
        ))
        h.model.answer(.insurance)
        let insurance = CostFixture.playCost.table.insurance
        #expect(h.model.missCost == costSentence(-insurance))
    }

    /// VoiceOver hears everything the screen shows a sighted trainee.
    @Test func speaksTheCostAfterTheRule() throws {
        let h = DrillFixture.makeHarness()
        h.model.deal(DrillFixture.hitScenario)
        h.model.answer(.stand)
        let result = try #require(h.model.result)
        let cost = try #require(h.model.missCost)
        #expect(h.model.verdict == "Incorrect. Correct: Hit. \(result.reason) \(cost)")
    }

    @Test func speaksOnlyTheActionForACorrectAnswer() {
        let h = DrillFixture.makeHarness()
        #expect(h.model.verdict == nil)
        h.model.deal(DrillFixture.hitScenario)
        h.model.answer(.hit)
        #expect(h.model.verdict == "Correct: Hit.")
    }

    /// The opening hand is the promise the Done screen makes, so it follows the
    /// ranking: one dear miss outranks two cheap ones.
    @Test func opensTheNextRoundOnTheDearestMiss() {
        let h = DrillFixture.makeHarness(dailyGoal: 1)
        let hard16 = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
        let tens = ScenarioRef(kind: "pair", hand: "10", dealer: "6")
        h.missTally.record(.basicStrategy, ref: hard16, correct: false)
        h.missTally.record(.basicStrategy, ref: hard16, correct: false)
        h.missTally.record(.basicStrategy, ref: tens, correct: false)
        h.model.deal(DrillFixture.standScenario)
        h.model.answer(.stand)
        h.scheduler.fire()
        #expect(h.model.phase == .done)

        h.model.oneMoreRound()
        let opening = h.model.scenario
        #expect(scenarioRefFor(opening.player, dealerUpcard: opening.dealerUpcard) == tens)
    }
}

/// Mirrors the same two in `deviations-drill-page.component.spec.ts`, where the
/// value is read at the count on screen.
@MainActor
struct DeviationsMissCostTests {
    private func miss(
        _ h: DeviationsFixture.Harness,
        tc: Int,
        playing action: Action = .hit
    ) {
        h.model.deal(DeviationsFixture.scenario(.king, .six, vs: .queen, tc: tc))
        h.model.answer(action)
    }

    @Test func aMissSaysWhatItGaveUp() throws {
        let h = DeviationsFixture.makeHarness()
        miss(h, tc: 1)
        let cost = try #require(h.model.missCost)
        #expect(cost.contains("gives up"))
    }

    @Test func aCorrectAnswerHasNothingToPrice() {
        let h = DeviationsFixture.makeHarness()
        miss(h, tc: 1, playing: .stand)
        #expect(h.model.result?.correct == true)
        #expect(h.model.missCost == nil)
    }

    /// An index a count past its threshold is a real mistake, and the same index
    /// right at it is a coin flip.
    @Test func readsTheMistakeAtTheCountOnScreen() {
        let h = DeviationsFixture.makeHarness(playCost: CostFixture.counted(["hard-16-v-10": [
            "hit": [-5000, -5000, -5000, -5000, -5000],
            "stand": [-5600, -5300, -5100, -4970, -3000]
        ]]))
        miss(h, tc: 2)
        #expect(h.model.missCost == "That play gives up 20% of your bet.")
        h.model.continueFromMiss()
        miss(h, tc: 1)
        #expect(h.model.missCost == "A close call: that play gives up 0.3% of your bet.")
    }

    @Test func pricesAnInsuranceMissAtTheCount() {
        let h = DeviationsFixture.makeHarness(playCost: CostFixture.counted())
        h.model.deal(DeviationsFixture.scenario(.three, .four, vs: .ace, tc: -1))
        h.model.answer(.insurance)
        #expect(h.model.missCost == "That play gives up 2.0% of your bet.")
    }

    @Test func speaksTheCostAfterTheExplanation() throws {
        let h = DeviationsFixture.makeHarness()
        miss(h, tc: 1)
        let cost = try #require(h.model.missCost)
        #expect(h.model.verdict == "Incorrect. Correct: Stand. \(h.model.explanation) \(cost)")
    }

    @Test func speaksOnlyTheActionForACorrectAnswer() {
        let h = DeviationsFixture.makeHarness()
        #expect(h.model.verdict == nil)
        miss(h, tc: 1, playing: .stand)
        #expect(h.model.verdict == "Correct: Stand.")
    }
}
