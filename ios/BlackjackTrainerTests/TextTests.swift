import Testing
@testable import BlackjackTrainer

struct TextTests {
    @Test func readsSingularAtExactlyOne() {
        #expect(countOf(1, "hand") == "1 hand")
    }

    @Test func readsPluralAtEveryOtherWholeCountZeroIncluded() {
        #expect(countOf(0, "hand") == "0 hands")
        #expect(countOf(2, "hand") == "2 hands")
        #expect(countOf(42, "blackjack") == "42 blackjacks")
    }

    /// The true-count formula divides by a deck count that is usually fractional.
    @Test func readsPluralForAFractionalCountEitherSideOfOne() {
        #expect(countOf(0.5, "deck", display: "0.5") == "0.5 decks")
        #expect(countOf(1.5, "deck", display: "1.5") == "1.5 decks")
    }

    @Test func takesTheCallersFormattingWhileTheNounFollowsTheValue() {
        #expect(countOf(1.0, "deck", display: "1") == "1 deck")
        #expect(countOf(2.25, "deck", display: "2.3") == "2.3 decks")
    }
}
