import Foundation
@testable import BlackjackTrainer

// Decodable shapes for the exported parity fixtures. Field names match the
// JSON emitted by `tools/export-parity-fixtures.ts`.

// MARK: basic-strategy-vectors.json

struct BasicStrategyVectorFile: Decodable {
    let count: Int
    let vectors: [BasicStrategyVector]
}

struct BasicStrategyVector: Decodable {
    let hand: [String] // two rank strings
    let dealer: String
    let ruleSet: String
    let das: Bool
    let ls: Bool
    let action: String
    let source: String
    let label: String
    let rationale: String

    var player: TwoCardHand {
        TwoCardHand(card(hand[0]), card(hand[1]))
    }
}

// MARK: counting-vectors.json

struct CountingVectorsFile: Decodable {
    let systems: [CountingVectorSystem]
    let deckEstimateCases: [DeckEstimateCase]
}

struct CountingVectorSystem: Decodable {
    let systemId: String
    let balanced: Bool
    let isFractional: Bool
    let sequences: [CountingSequenceCase]
}

struct CountingSequenceCase: Decodable {
    let label: String
    let decksRemaining: Double
    let cards: [Card]
    let runningCount: Double
    let trueCount: Int
}

struct DeckEstimateCase: Decodable {
    let estimate: Double
    let actual: Double
    let tolerance: Double?
    let withinBand: Bool
}

// MARK: deviation-vectors.json (columnar)

struct DeviationVectorsFile: Decodable {
    let columns: [String]
    let sources: [String]
    let count: Int
    let rows: [DeviationVectorRow]

    /// Resolves a row's interned `matchedRuleSourceIndex` to the source string
    /// (nil when the index is -1).
    func source(_ index: Int) -> String? {
        index >= 0 ? sources[index] : nil
    }
}

/// One columnar row, decoded positionally per `columns`.
struct DeviationVectorRow: Decodable {
    let handCard1: String
    let handCard2: String
    let dealer: String
    let trueCount: Int
    let ruleSet: String
    let das: Bool
    let lateSurrender: Bool
    let expectedAction: String
    let basicAction: String
    let deviationApplied: Bool
    let matchedRuleSourceIndex: Int
    let evalSource: String

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        handCard1 = try container.decode(String.self)
        handCard2 = try container.decode(String.self)
        dealer = try container.decode(String.self)
        trueCount = try container.decode(Int.self)
        ruleSet = try container.decode(String.self)
        das = try container.decode(Bool.self)
        lateSurrender = try container.decode(Bool.self)
        expectedAction = try container.decode(String.self)
        basicAction = try container.decode(String.self)
        deviationApplied = try container.decode(Bool.self)
        matchedRuleSourceIndex = try container.decode(Int.self)
        evalSource = try container.decode(String.self)
    }

    var player: TwoCardHand {
        TwoCardHand(card(handCard1), card(handCard2))
    }
}

// MARK: showdown-vectors.json

struct ShowdownVectorsFile: Decodable {
    let dealerShouldHitCases: [DealerShouldHitCase]
    let playCases: [PlayCase]
    let settleCases: [SettleCase]
}

struct DealerShouldHitCase: Decodable {
    let hand: [String]
    let kind: String
    let total: Int
    let ruleSet: String
    let shouldHit: Bool
}

struct PlayCase: Decodable {
    let label: String
    let initial: [String]
    let ruleSet: String
    let draws: [String]
    let finalHand: [String]
}

struct SettleCase: Decodable {
    let label: String
    let player: [String]
    let dealer: [String]
    let outcome: String
    let playerBlackjack: Bool
    let dealerBlackjack: Bool
}

/// Builds cards from fixture rank strings (suits are arbitrary for the
/// suit-independent showdown vectors).
func cards(_ ranks: [String]) -> [Card] {
    ranks.map { card($0) }
}
