import Foundation
import Testing
@testable import BlackjackTrainer

/// The chart's own pair deviations say to split — T,T v 6 at +4 is one of them —
/// and the drill used to grade that answer and then deal something else, so the
/// hands the deviation makes were never played. Mirrors the web spec's
/// "playing a split out".
@MainActor
struct DeviationsSplitTests {
    typealias Harness = DeviationsFixture.Harness

    /// Split correctly; the harness has the drawn card pinned.
    private func splitOnce(_ h: Harness) {
        h.model.answer(.split)
        h.scheduler.fire()
    }

    @Test func playsOutTheSplitAPairDeviationCalledFor() {
        let h = makeHarness(draws: .six)
        // T,T v 6: stand by basic strategy, split at TC +4 or higher.
        h.model.deal(scenario(.ten, .ten, vs: .six, tc: 4))
        h.model.answer(.split)
        #expect(h.model.result?.correct == true)
        #expect(h.model.result?.deviationApplied == true)

        h.scheduler.fire()
        #expect(h.model.handLabel == "Hand 1 of 2")
        #expect(h.model.phase == .question)
    }

    /// An index is written against a total, so it reads a hand a split made
    /// exactly as it reads one a hit made.
    @Test func appliesAnIndexToTheHandTheSplitMade() {
        let h = makeHarness(draws: .seven)
        // 8,8 splits at every count; a 7 makes the hard 15 v 10 the chart stands
        // at +4 and hits below.
        h.model.deal(scenario(.eight, .eight, vs: .queen, tc: 4))
        splitOnce(h)

        h.model.answer(.stand)
        #expect(h.model.result?.correct == true)
        #expect(h.model.result?.deviationApplied == true)
        #expect(h.model.result?.basicAction == .hit)
    }

    @Test func gradesThatSame15TheOtherWayBelowTheIndex() {
        let h = makeHarness(draws: .seven)
        h.model.deal(scenario(.eight, .eight, vs: .queen, tc: 0))
        splitOnce(h)

        h.model.answer(.stand)
        #expect(h.model.result?.correct == false)
        #expect(h.model.result?.expectedAction == .hit)
    }

    /// This drill offers Surrender whatever the table rule says, because the
    /// surrender overlay can expect it either way — but not on a hand out of a
    /// split, where the rules have taken it away.
    @Test func takesTheSurrenderOverlayOffAHandOutOfASplit() {
        let h = makeHarness(draws: .seven)
        h.model.deal(scenario(.eight, .eight, vs: .queen, tc: 4))
        #expect(h.model.legalActions.contains(.surrender))

        splitOnce(h)
        #expect(h.model.legalActions == [.hit, .stand])
    }

    /// A `ScenarioRef` names the two cards that were dealt, and it carries the
    /// count they were missed at. The 15 a split made is neither.
    @Test func filesNoWeakSpotForADecisionOnAHandOutOfASplit() {
        let h = makeHarness(draws: .seven)
        h.model.deal(scenario(.eight, .eight, vs: .queen, tc: 4))
        splitOnce(h)
        h.model.answer(.hit) // wrong: the index stands this 15
        #expect(h.model.phase == .miss)
        #expect(h.missTally.weakSpotFor(.deviations) == nil)
    }

    @Test func dealsAFreshHandInsteadOfSplittingWhenTheSettingIsOff() {
        let h = makeHarness(playHandsOut: false, draws: .seven)
        h.model.deal(scenario(.eight, .eight, vs: .queen, tc: 4))
        splitOnce(h)
        #expect(h.model.hands.count == 1)
        #expect(h.model.hand == h.model.scenario.player.cards)
    }
}

private func scenario(_ a: Rank, _ b: Rank, vs upcard: Rank, tc: Int) -> DeviationScenario {
    DeviationsFixture.scenario(a, b, vs: upcard, tc: tc)
}

@MainActor
private func makeHarness(playHandsOut: Bool = true, draws: Rank? = nil) -> DeviationsFixture
    .Harness {
    DeviationsFixture.makeHarness(playHandsOut: playHandsOut, draws: draws)
}
