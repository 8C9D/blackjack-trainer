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
    let keyCountCases: [KeyCountCaseSystem]
    let betRampCases: [BetRampCase]
}

struct BetRampCase: Decodable {
    let ramp: [Int]
    let calls: [BetRampCall]
}

struct BetRampCall: Decodable {
    let trueCount: Int
    let units: Int
}

struct KeyCountCaseSystem: Decodable {
    let systemId: String
    let pivot: Int
    let insuranceCount: Int
    let decks: [KeyCountDeckCase]
}

struct KeyCountDeckCase: Decodable {
    let numberOfDecks: Int
    let irc: Int
    let keyCount: Int
    let advantageCalls: [AdvantageCallCase]
}

struct AdvantageCallCase: Decodable {
    let runningCount: Double
    let hasAdvantage: Bool
    let takeInsurance: Bool
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
    let spotsCases: [SpotsCase]
    let payoutCases: [PayoutCase]
    let betClampCases: [BetClampCase]
    let insuranceCases: [InsuranceCase]
    let surrenderCases: [SurrenderCase]
}

struct SurrenderCase: Decodable {
    let bet: Double
    let forfeit: Double
}

struct InsuranceCase: Decodable {
    let bet: Double
    let dealerBlackjack: Bool
    let cost: Double
    let payout: Double
}

struct PayoutCase: Decodable {
    let label: String
    let outcome: String
    let playerBlackjack: Bool
    let bet: Double
    let doubled: Bool
    let stake: Double
    let payout: Double
}

struct BetClampCase: Decodable {
    let bet: Double
    let bankroll: Double
    let clamped: Double
    let largestAffordable: Double
}

struct SpotsCase: Decodable {
    let spots: Int
    let clamped: Int
    let minCards: Int
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

/// `play-deviation-vectors.json`: the table's count-aware answer. Only the
/// combinations where an index fires are listed; every other combination in
/// `domain` must fall through to `decidePlay`, so the two halves together pin
/// the whole delta (see the exporter's note).
struct PlayDeviationVectorsFile: Decodable {
    let count: Int
    let examined: Int
    let domain: PlayDeviationDomain
    let sources: [String]
    let deviations: [PlayDeviationRow]
}

/// One canonical hand in the domain, by label and rank list.
struct PlayDeviationHand: Decodable {
    let label: String
    let cards: [String]
}

/// The combinations the fixture speaks for. The Swift walker enumerates exactly
/// this, so a domain change on the web side surfaces as an `examined` mismatch
/// rather than as silently thinner coverage.
struct PlayDeviationDomain: Decodable {
    let hands: [PlayDeviationHand]
    let dealers: [String]
    let trueCounts: [Int]
    let ruleSets: [String]
    let lateSurrender: [Bool]
    let doubleAfterSplit: Bool
    /// `[canDouble, canSplit, canSurrender]` per entry.
    let restrictions: [[Bool]]
}

/// One columnar row, decoded positionally per the file's `columns`.
struct PlayDeviationRow: Decodable {
    let handIndex: Int
    let dealerIndex: Int
    let trueCount: Int
    let ruleSet: String
    let lateSurrender: Bool
    let restrictionIndex: Int
    let action: String
    let matchedRuleSourceIndex: Int

    /// The combination this row pins, as a key the walker can look up.
    var key: String {
        "\(handIndex)|\(dealerIndex)|\(trueCount)|\(ruleSet)|\(lateSurrender)|\(restrictionIndex)"
    }

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        handIndex = try container.decode(Int.self)
        dealerIndex = try container.decode(Int.self)
        trueCount = try container.decode(Int.self)
        ruleSet = try container.decode(String.self)
        lateSurrender = try container.decode(Bool.self)
        restrictionIndex = try container.decode(Int.self)
        action = try container.decode(String.self)
        matchedRuleSourceIndex = try container.decode(Int.self)
    }
}
