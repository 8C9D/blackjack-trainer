import Testing
@testable import BlackjackTrainer

/// Slice 3.5 — the Deviations feedback formatters (the rationale strings deferred
/// from 1.5) and manual-true-count parsing.
struct DeviationFeedbackTests {
    private func rule(
        category: String = "hard",
        playerHand: String = "16",
        label: String = "Hard 16",
        upcard: String = "10",
        index: Int = 0,
        direction: String = "at-or-above",
        deviationAction: String = "S",
        source: String = "Illustrious 18: 16 vs 10"
    ) -> DeviationRule {
        DeviationRule(
            ruleSet: "S17", category: category, playerHand: playerHand, playerHandLabel: label,
            dealerUpcard: upcard, index: index, direction: direction, basicAction: "H",
            deviationAction: deviationAction, source: source
        )
    }

    private func result(
        user: Action = .hit, expected: Action = .stand, basic: Action = .hit,
        trueCount: Int = 3, deviationApplied: Bool = true, matchedRule: DeviationRule? = nil,
        source: DeviationEvalSource = .playing
    ) -> DeviationTrainerResult {
        DeviationTrainerResult(
            userAction: user, expectedAction: expected, basicAction: basic, trueCount: trueCount,
            deviationApplied: deviationApplied, matchedRule: matchedRule, source: source,
            correct: user == expected
        )
    }

    @Test func formatsTrueCountWithSign() {
        #expect(DeviationFeedback.formatTrueCount(3) == "+3")
        #expect(DeviationFeedback.formatTrueCount(0) == "0")
        #expect(DeviationFeedback.formatTrueCount(-2) == "-2")
    }

    @Test func formatsThresholdsPerDirection() {
        #expect(DeviationFeedback
            .formatThreshold(rule(index: 3, direction: "at-or-above")) == "TC ≥ +3")
        #expect(DeviationFeedback
            .formatThreshold(rule(index: -1, direction: "at-or-below")) == "TC ≤ -1")
        #expect(DeviationFeedback.formatThreshold(rule(direction: "positive")) == "TC > 0")
        #expect(DeviationFeedback.formatThreshold(rule(direction: "negative")) == "TC < 0")
    }

    @Test func explainsAppliedDeviation() {
        let matched = rule(source: "Illustrious 18: 16 vs 10")
        let text = DeviationFeedback.explanation(
            result(deviationApplied: true, matchedRule: matched), dealerAce: false
        )
        #expect(text ==
            "Hi-Lo deviation: Illustrious 18: 16 vs 10. At TC +3, play Stand instead of basic Hit.")
    }

    @Test func explainsNoDeviation() {
        let text = DeviationFeedback.explanation(
            result(user: .hit, expected: .hit, basic: .hit, deviationApplied: false),
            dealerAce: false
        )
        #expect(text == "No deviation for this hand; basic strategy plays Hit.")
    }

    @Test func explainsRulePresentButThresholdUnmet() {
        let text = DeviationFeedback.explanation(
            result(
                user: .hit,
                expected: .hit,
                trueCount: 1,
                deviationApplied: false,
                matchedRule: rule()
            ),
            dealerAce: false
        )
        #expect(text.contains("No deviation at TC +1"))
        #expect(text.contains("only fires at a different count."))
    }

    @Test func explainsInsuranceTaken() {
        let text = DeviationFeedback.explanation(
            result(user: .insurance, expected: .insurance, trueCount: 3, source: .insurance),
            dealerAce: true
        )
        #expect(text ==
            "Take insurance: dealer shows an Ace and the true count is +3 (≥ +3 makes insurance +EV).")
    }

    @Test func explainsInsuranceDeclinedBelowThreshold() {
        let text = DeviationFeedback.explanation(
            result(user: .insurance, expected: .stand, trueCount: 1, deviationApplied: false),
            dealerAce: true
        )
        #expect(text ==
            "Decline insurance — true count +1 is below the +3 threshold. Play the hand: Stand.")
    }

    @Test func explainsInsuranceOnNonAce() {
        let text = DeviationFeedback.explanation(
            result(user: .insurance, expected: .stand, deviationApplied: false), dealerAce: false
        )
        #expect(text ==
            "Insurance is only offered when the dealer shows an Ace. Play the hand: Stand.")
    }

    @Test func parsesManualTrueCount() {
        #expect(parseManualTrueCount("5") == 5)
        #expect(parseManualTrueCount("-3") == -3)
        #expect(parseManualTrueCount("0") == 0)
        #expect(parseManualTrueCount("21") == nil)
        #expect(parseManualTrueCount("-21") == nil)
        #expect(parseManualTrueCount("2.5") == nil)
        #expect(parseManualTrueCount("abc") == nil)
        #expect(parseManualTrueCount("") == nil)
    }
}
