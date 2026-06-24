import Foundation

/// Player actions. Raw values match the fixtures. The engine never *recommends*
/// `.insurance`; it is only passed through `evaluate`.
enum Action: String {
    case hit = "H"
    case stand = "S"
    case double = "D"
    case split = "P"
    case surrender = "SUR"
    case insurance = "INS"

    /// Mirrors `ACTION_LABELS`.
    var label: String {
        switch self {
        case .hit: "Hit"
        case .stand: "Stand"
        case .double: "Double"
        case .split: "Split"
        case .surrender: "Surrender"
        case .insurance: "Insurance"
        }
    }
}

/// Table rule toggles honored by the engine.
struct EngineOptions {
    let doubleAfterSplit: Bool
    let lateSurrender: Bool

    static let `default` = EngineOptions(doubleAfterSplit: false, lateSurrender: false)
}

/// Which chart branch produced a decision. Raw values match the fixtures.
enum DecisionSource: String {
    case insurance
    case surrender
    case pair
    case soft
    case hard
}

struct StrategyDecision: Equatable {
    let action: Action
    let source: DecisionSource
    let handDescription: String
    let reason: String
}

struct EvaluationResult: Equatable {
    let action: Action
    let source: DecisionSource
    let handDescription: String
    let reason: String
    let userAction: Action
    let correct: Bool
}

/// A single basic-strategy decision request: the player's two cards, the dealer
/// upcard, the rule set, and the table options.
struct EngineInput {
    let player: TwoCardHand
    let dealerUpcard: Card
    let ruleSet: RuleSet
    let options: EngineOptions
}

/// Dealer upcard lookup key: Ace → "A", any ten-value → "10", else the rank.
func normalizeUpcardKey(_ card: Card) -> String {
    if card.isAce { return "A" }
    if card.isTenValue { return "10" }
    return card.rank.rawValue
}
