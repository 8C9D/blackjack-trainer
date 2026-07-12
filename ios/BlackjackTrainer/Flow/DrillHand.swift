import Foundation

// Pure helpers shared by the Flow drill screens (Basic Strategy, Deviations):
// question-line labels, per-hand action legality (poka-yoke), weak-spot scenario
// construction, and session-target math. Mirrors the web `drill-hand.ts`.

/// Ten-value ranks, in the web `TEN_VALUE_RANKS` order.
private let tenValueRanks: [Rank] = [.ten, .jack, .queen, .king]

/// Parts of the computed question line, e.g. "Hard 10 vs 6" (recognition over
/// recall). Pairs have an empty prefix: "8,8 vs 10". Mirrors `HandQuestion`.
struct HandQuestion: Equatable {
    /// "Hard", "Soft", or "" (pairs).
    let prefix: String
    let value: String
    let dealer: String
}

func handQuestion(_ player: TwoCardHand, dealerUpcard: Card) -> HandQuestion {
    let dealer = normalizeUpcardKey(dealerUpcard)
    if let pairKey = HandClassification.pairKey(player) {
        return HandQuestion(prefix: "", value: "\(pairKey),\(pairKey)", dealer: dealer)
    }
    if HandClassification.isSoftTwoCard(player) {
        return HandQuestion(
            prefix: "Soft",
            value: String(11 + softNonAceValue(player)),
            dealer: dealer
        )
    }
    return HandQuestion(
        prefix: "Hard",
        value: String(player.first.highValue + player.second.highValue),
        dealer: dealer
    )
}

/// Which of the six actions are answerable for this hand. Hit/Stand/Double are
/// always live; Split needs a pair; Insurance needs a dealer Ace; Surrender needs
/// Late Surrender — except where the caller's engine can expect SUR regardless
/// (the deviations surrender overlay), via `surrenderAlways`. Mirrors
/// `legalActionsFor`.
func legalActionsFor(
    _ player: TwoCardHand,
    dealerUpcard: Card,
    options: EngineOptions,
    surrenderAlways: Bool = false
) -> [Action] {
    var legal: [Action] = [.hit, .stand, .double]
    if HandClassification.pairKey(player) != nil { legal.append(.split) }
    if surrenderAlways || options.lateSurrender { legal.append(.surrender) }
    if dealerUpcard.isAce { legal.append(.insurance) }
    return legal
}

/// Session target: the next multiple of the daily goal beyond the hands already
/// practiced today. Resuming at 14/20 targets 20; "one more round" after 20/20
/// targets 40. Mirrors `nextSessionTarget`.
func nextSessionTarget(handsToday: Int, goal: Int) -> Int {
    let safeGoal = max(1, goal)
    return (max(0, handsToday) / safeGoal + 1) * safeGoal
}

/// Build a concrete deal matching a recorded weak-spot ref, so a session can open
/// with the scenario the user keeps missing. Mirrors `scenarioFromRef`.
func scenarioFromRef(_ ref: ScenarioRef, random: () -> Double) -> Scenario {
    Scenario(
        player: playerCardsFromRef(ref, random),
        dealerUpcard: dealerCardFor(ref.dealer, random)
    )
}

private func playerCardsFromRef(_ ref: ScenarioRef, _ random: () -> Double) -> TwoCardHand {
    switch ref.kind {
    case "pair":
        if ref.hand == "10" {
            return TwoCardHand(tenValueCard(random), tenValueCard(random))
        }
        let rank = Rank(rawValue: ref.hand) ?? .ace
        return TwoCardHand(
            Card(rank: rank, suit: randomSuit(random)),
            Card(rank: rank, suit: randomSuit(random))
        )
    case "soft":
        let ace = Card(rank: .ace, suit: randomSuit(random))
        let other = cardOfValue((Int(ref.hand) ?? 11) - 11, random)
        return random() < 0.5 ? TwoCardHand(ace, other) : TwoCardHand(other, ace)
    default: // hard
        return hardTotalCards(Int(ref.hand) ?? 0, random)
    }
}

/// Two distinct-value non-ace cards summing to the total, so the hand classifies
/// as hard (a same-value pair is the defensive fallback).
private func hardTotalCards(_ total: Int, _ random: () -> Double) -> TwoCardHand {
    var options: [(Int, Int)] = []
    for a in 2 ... 10 where a + 1 <= 10 {
        for b in (a + 1) ... 10 where a + b == total {
            options.append((a, b))
        }
    }
    if options.isEmpty {
        return TwoCardHand(cardOfValue(total / 2, random), cardOfValue(total / 2, random))
    }
    let pick = options[clampIndex(random(), options.count)]
    let (v1, v2) = random() < 0.5 ? pick : (pick.1, pick.0)
    return TwoCardHand(cardOfValue(v1, random), cardOfValue(v2, random))
}

private func dealerCardFor(_ upcard: String, _ random: () -> Double) -> Card {
    if upcard == "A" { return Card(rank: .ace, suit: randomSuit(random)) }
    if upcard == "10" { return tenValueCard(random) }
    return Card(rank: Rank(rawValue: upcard) ?? .ten, suit: randomSuit(random))
}

/// value 2..9 → that rank; 10 → a random ten-value face.
private func cardOfValue(_ value: Int, _ random: () -> Double) -> Card {
    if value >= 10 { return tenValueCard(random) }
    return Card(rank: Rank(rawValue: String(value)) ?? .ten, suit: randomSuit(random))
}

private func tenValueCard(_ random: () -> Double) -> Card {
    Card(rank: tenValueRanks[clampIndex(random(), tenValueRanks.count)], suit: randomSuit(random))
}

private func randomSuit(_ random: () -> Double) -> Suit {
    Card.allSuits[clampIndex(random(), Card.allSuits.count)]
}

/// `Math.floor(random * length)` with a clamp so an out-of-range source can never
/// index past the end (mirrors `CardGenerator.pick`).
private func clampIndex(_ random: Double, _ count: Int) -> Int {
    min(Int(random * Double(count)), count - 1)
}
