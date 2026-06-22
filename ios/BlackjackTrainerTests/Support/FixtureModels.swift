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
