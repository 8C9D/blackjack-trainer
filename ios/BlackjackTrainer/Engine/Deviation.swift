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

/// Result of the playing-decision deviation resolution.
struct DeviationDecision {
    let basicAction: Action
    let finalAction: Action
    let deviationApplied: Bool
    let matchedRule: DeviationRule?
    let trueCount: Int
}

/// A Deviations-trainer scenario: the two-card hand, dealer upcard, and the
/// practice true count.
struct DeviationScenario {
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
