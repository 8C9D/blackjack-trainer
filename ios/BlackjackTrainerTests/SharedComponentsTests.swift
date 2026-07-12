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
}
