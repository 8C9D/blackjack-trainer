import Foundation

/// Where the practice true count comes from.
enum DeviationTrueCountSource: String {
    case random
    case manual
}

/// `allHands` draws a uniformly-random hand + upcard; `deviationOnly` builds
/// hands that match an encoded deviation rule so the user drills relevant cells.
enum DeviationPracticeMode: String {
    case allHands
    case deviationOnly
}

enum DeviationTrainerConstants {
    /// Inclusive random-true-count range (wide enough for both sides of the chart).
    static let minRandomTrueCount = -5
    static let maxRandomTrueCount = 8
    /// Inclusive manual-true-count validation range.
    static let minManualTrueCount = -20
    static let maxManualTrueCount = 20
}

/// Parse a manual true-count entry: an integer in the manual range, else `nil`
/// (empty, non-integer, decimal, or out of range). Mirrors `parseManualTrueCount`.
func parseManualTrueCount(_ raw: String) -> Int? {
    let trimmed = raw.trimmingCharacters(in: .whitespaces)
    guard trimmed.wholeMatch(of: /-?\d+/) != nil, let value = Int(trimmed) else { return nil }
    guard value >= DeviationTrainerConstants.minManualTrueCount,
          value <= DeviationTrainerConstants.maxManualTrueCount else { return nil }
    return value
}

/// Presentation formatters for the Deviations feedback (the rationale strings
/// deferred from Slice 1.5), mirroring the web evaluator's `formatTrueCount` /
/// `explainPlaying` and the feedback panel's threshold formatter.
enum DeviationFeedback {
    /// `+3`, `0`, `-2`.
    static func formatTrueCount(_ trueCount: Int) -> String {
        trueCount > 0 ? "+\(trueCount)" : "\(trueCount)"
    }

    /// The hand label shown in feedback (matches the engine's `handDescription`).
    static func handDescription(_ scenario: DeviationScenario) -> String {
        HandClassification.canonicalLabel(scenario.player)
    }

    /// Human-readable threshold for a matched rule (`TC ≥ +3`, `TC > 0`, …).
    static func formatThreshold(_ rule: DeviationRule) -> String {
        switch rule.direction {
        case "at-or-above": "TC ≥ \(formatTrueCount(rule.index))"
        case "at-or-below": "TC ≤ \(formatTrueCount(rule.index))"
        case "positive": "TC > 0"
        case "negative": "TC < 0"
        default: ""
        }
    }

    /// The "Why" explanation for a graded hand. `dealerAce` comes from the
    /// scenario (the result doesn't carry the upcard).
    static func explanation(_ result: DeviationTrainerResult, dealerAce: Bool) -> String {
        let tcLabel = formatTrueCount(result.trueCount)

        if result.source == .insurance {
            let base = "Take insurance: dealer shows an Ace and the true count is "
                + "\(tcLabel) (≥ +3 makes insurance +EV)."
            return result.correct ? base : base + " You picked \(result.userAction.label)."
        }

        if result.userAction == .insurance {
            if !dealerAce {
                return "Insurance is only offered when the dealer shows an Ace. "
                    + "Play the hand: \(result.expectedAction.label)."
            }
            return "Decline insurance — true count \(tcLabel) is below the +3 threshold. "
                + "Play the hand: \(result.expectedAction.label)."
        }

        if result.deviationApplied, let rule = result.matchedRule {
            return "Hi-Lo deviation: \(rule.source). At TC \(tcLabel), play "
                + "\(result.expectedAction.label) instead of basic \(result.basicAction.label)."
        }

        if result.matchedRule != nil {
            return "No deviation at TC \(tcLabel); basic strategy plays "
                + "\(result.expectedAction.label). (A deviation for this hand exists but only "
                + "fires at a different count.)"
        }

        return "No deviation for this hand; basic strategy plays \(result.expectedAction.label)."
    }
}
