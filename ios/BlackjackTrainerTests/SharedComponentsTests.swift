import Testing
@testable import BlackjackTrainer

/// The shared components are mostly chrome (verified by previews), so the tests
/// pin the pure behavior the web spec defines: the action hotkey mapping and the
/// accuracy formatting.
struct SharedComponentsTests {
    @Test func actionHotkeysMatchWebBindings() {
        #expect(Action.hit.hotkey == "h")
        #expect(Action.stand.hotkey == "s")
        #expect(Action.double.hotkey == "d")
        #expect(Action.split.hotkey == "p")
        #expect(Action.surrender.hotkey == "r")
        #expect(Action.insurance.hotkey == "i")
    }

    @Test func keyHintsAreUppercased() {
        #expect(Action.hit.keyHint == "H")
        #expect(Action.surrender.keyHint == "R")
        #expect(Action.insurance.keyHint == "I")
    }

    @Test func actionForKeyResolvesCaseInsensitively() {
        #expect(actionForKey("h") == .hit)
        #expect(actionForKey("R") == .surrender)
        #expect(actionForKey("I") == .insurance)
        #expect(actionForKey("z") == nil)
        #expect(actionForKey("") == nil)
    }

    @Test func fullTrainerSetMatchesWebDefault() {
        #expect(Action.fullTrainerSet == [.hit, .stand, .double, .split, .surrender, .insurance])
    }

    // The Done screen's miss line, mirroring `flow-done.component.spec`.

    private let weak = WeakSpot(
        ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
        label: "16 vs 10", misses: 3, attempts: 7
    )

    @MainActor
    private func done(weakSpots: [WeakSpot] = []) -> FlowDoneView {
        FlowDoneView(
            hands: 20, target: 20, bestStreak: 7, accuracy: 86,
            weakSpots: weakSpots, onAgain: {}, onExit: {}
        )
    }

    @MainActor
    @Test func saysWhatAMissOfTheQueuedWeaknessGivesUp() {
        var spot = weak
        spot.costPerMiss = 210
        #expect(done().missLine(spot) == "missed 3 of 7 this week · at least 2.1% a miss")
    }

    @MainActor
    @Test func keepsTheCostBetweenTheCountsAndTheRemainder() {
        var spot = weak
        spot.costPerMiss = 210
        spot.missedCounts = [2, -1]
        #expect(done(weakSpots: [spot, weak, weak]).missLine(spot)
            == "missed 3 of 7 this week at TC -1, +2 · at least 2.1% a miss · +2 more")
    }

    @MainActor
    @Test func leavesACoinFlipUnpriced() {
        var spot = weak
        spot.costPerMiss = 9
        #expect(done().missLine(spot) == "missed 3 of 7 this week")
        #expect(done().missLine(weak) == "missed 3 of 7 this week")
    }
}
