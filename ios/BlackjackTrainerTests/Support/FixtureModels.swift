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
