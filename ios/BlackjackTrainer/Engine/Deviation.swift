import Foundation

/// A Hi-Lo deviation rule, decoded verbatim from the `deviations` tables in
/// `charts.json`. Mirrors `deviation.model.ts`. `category`/`direction` are kept
/// as raw strings; the engine switches on them.
struct DeviationRule: Decodable, Equatable {
    let ruleSet: String
    let category: String // hard | soft | pair | surrender | insurance
    let playerHand: String
    let playerHandLabel: String
    let dealerUpcard: String
    let index: Int
    let direction: String // at-or-above | at-or-below | positive | negative
    let basicAction: String
    let deviationAction: String
    let source: String
}

/// The counting system every index in this app is written for. BJA publishes
/// the Illustrious 18 and Fab 4 as Hi-Lo true counts, and a different system
/// reads a different number off the same shoe — so the same index is a
/// different decision. An index shown without naming its system is a trap, and
/// a trainee counting something else has to be told the numbers are not theirs.
/// Mirrors the `DEVIATION_INDEX_SYSTEM_*` constants in `deviation.model.ts`.
enum DeviationIndexSystem {
    static let id = "hi-lo"
    static let name = "Hi-Lo"

    /// The advisory for a trainee whose counting system is not the one the
    /// indices are written for, or nil when it is. Unbalanced systems get the
    /// stronger wording because they have no true count at all to compare
    /// against. Mirrors `deviationIndexNote`.
    static func note(for system: CountingSystem) -> String? {
        guard system.id != id else { return nil }
        let lead = "These indices are \(name) true counts, and you count \(system.name)"
        return system.balanced
            ? lead + ", which reads a different true count off the same shoe. "
            + "Its own indices are not these numbers."
            : lead + ", which is unbalanced and has no true count. "
            + "These numbers do not carry over to it."
    }
}

/// Result of the playing-decision deviation resolution.
struct DeviationDecision {
    let basicAction: Action
    let finalAction: Action
    let deviationApplied: Bool
    let matchedRule: DeviationRule?
    let trueCount: Int
}

/// A table decision with the count on top of it. Shaped as a `StrategyDecision`
/// so a caller grades the same way whether or not an index was in play. Mirrors
/// `PlayDeviationDecision`.
struct PlayDeviationDecision {
    let decision: StrategyDecision
    let deviationApplied: Bool
    /// The rule that fired — or, when none did, the candidate encoded for this
    /// hand, so a caller can name the index the count fell short of.
    let matchedRule: DeviationRule?

    var action: Action {
        decision.action
    }

    var reason: String {
        decision.reason
    }

    var handDescription: String {
        decision.handDescription
    }
}

extension DeviationRule {
    /// The threshold as a clause inside a sentence ("stand at true count 0 or
    /// higher"). The chart screen renders the same field as symbols (`≥ +3`),
    /// which is right for a table column and wrong mid-sentence. Mirrors
    /// `describeDeviationThreshold`.
    var thresholdClause: String {
        let signed = CountFormat.signedCount(Double(index))
        switch direction {
        case "at-or-above": return "at true count \(signed) or higher"
        case "at-or-below": return "at true count \(signed) or lower"
        case "positive": return "at any positive true count"
        default: return "at any negative true count"
        }
    }
}

/// A Deviations-trainer scenario: the two-card hand, dealer upcard, and the
/// practice true count.
struct DeviationScenario: Equatable {
    let player: TwoCardHand
    let dealerUpcard: Card
    let trueCount: Int
}

/// Where a deviation evaluation resolved.
enum DeviationEvalSource: String {
    case playing
    case insurance
}

/// Result of evaluating a single Deviations-trainer hand.
struct DeviationTrainerResult: Equatable {
    let userAction: Action
    let expectedAction: Action
    let basicAction: Action
    let trueCount: Int
    let deviationApplied: Bool
    let matchedRule: DeviationRule?
    let source: DeviationEvalSource
    let correct: Bool
}
