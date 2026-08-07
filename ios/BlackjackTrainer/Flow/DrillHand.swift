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

func handQuestion(_ player: [Card], dealerUpcard: Card) -> HandQuestion {
    let dealer = normalizeUpcardKey(dealerUpcard)
    // Past two cards there is no pair to name and the ace may have softened, so
    // the line is the N-card total the chart is about to be read at.
    guard let opening = TwoCardHand(player) else {
        return HandQuestion(
            prefix: Hand.isSoft(player) ? "Soft" : "Hard",
            value: String(Hand.total(player)),
            dealer: dealer
        )
    }
    if let pairKey = HandClassification.pairKey(opening) {
        return HandQuestion(prefix: "", value: "\(pairKey),\(pairKey)", dealer: dealer)
    }
    if HandClassification.isSoftTwoCard(opening) {
        return HandQuestion(
            prefix: "Soft",
            value: String(11 + softNonAceValue(opening)),
            dealer: dealer
        )
    }
    return HandQuestion(
        prefix: "Hard",
        value: String(opening.first.highValue + opening.second.highValue),
        dealer: dealer
    )
}

/// Which of the six actions are answerable for this hand. Hit/Stand/Double are
/// always live; Split needs a pair; Insurance needs a dealer Ace; Surrender needs
/// Late Surrender. Both trainers ask it the same way, because both are graded
/// against the same table: a deviation index cannot call for a surrender the
/// table does not deal. Mirrors `legalActionsFor`.
func legalActionsFor(
    _ player: [Card],
    dealerUpcard: Card,
    options: EngineOptions
) -> [Action] {
    // Past two cards, hit and stand are the whole of it: double, split and
    // surrender are first-two-card actions, and insurance was decided on the
    // deal. The pinned hard 20 is the one deal that starts here (F4).
    guard let opening = TwoCardHand(player) else { return [.hit, .stand] }
    var legal: [Action] = [.hit, .stand, .double]
    if HandClassification.pairKey(opening) != nil { legal.append(.split) }
    if options.lateSurrender { legal.append(.surrender) }
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

/// Share of an ordinary round's hands drawn from the user's weak spots. High
/// enough that a weakness gets real repetition inside one session, low enough
/// that the round still feels like practice rather than a loop of three hands.
/// Mirrors the web `WEAK_SPOT_SHARE`.
let weakSpotShare = 0.4

/// Choose the next hand's source: a weak spot, or nil meaning "deal a fresh
/// random hand". Weak spots compete in proportion to their miss counts, so the
/// scenario a user misses most comes back most. `share` is the probability of
/// drawing from the weak list at all — review rounds pass 1. Mirrors
/// `pickWeakSpot`.
func pickWeakSpot(
    _ weakSpots: [WeakSpot],
    random: () -> Double,
    share: Double = weakSpotShare
) -> WeakSpot? {
    if weakSpots.isEmpty { return nil }
    if random() >= share { return nil }
    let total = weakSpots.reduce(0) { $0 + $1.misses }
    if total <= 0 { return nil }
    var ticket = random() * Double(total)
    for spot in weakSpots {
        ticket -= Double(spot.misses)
        if ticket < 0 { return spot }
    }
    // Only reachable if `random()` returns exactly 1 (or floating-point error
    // eats the last slice); the final spot is the right answer either way.
    return weakSpots.last
}

/// Build a concrete deal matching a recorded weak-spot ref, so a session can open
/// with the scenario the user keeps missing. Mirrors `scenarioFromRef`.
func scenarioFromRef(_ ref: ScenarioRef, random: () -> Double) -> Scenario {
    Scenario(
        player: playerCardsFromRef(ref, random),
        dealerUpcard: dealerCardFor(ref.dealer, random)
    )
}

private func playerCardsFromRef(_ ref: ScenarioRef, _ random: () -> Double) -> [Card] {
    switch ref.kind {
    case "pair":
        if ref.hand == "10" {
            return [tenValueCard(random), tenValueCard(random)]
        }
        let rank = Rank(rawValue: ref.hand) ?? .ace
        return [
            Card(rank: rank, suit: randomSuit(random)),
            Card(rank: rank, suit: randomSuit(random))
        ]
    case "soft":
        let ace = Card(rank: .ace, suit: randomSuit(random))
        let other = cardOfValue((Int(ref.hand) ?? 11) - 11, random)
        return random() < 0.5 ? [ace, other] : [other, ace]
    default: // hard
        return hardTotalCards(Int(ref.hand) ?? 0, random)
    }
}

/// Two distinct-value non-ace cards summing to the total, so the hand classifies
/// as hard (recorded hard refs below 20 always have such a decomposition).
/// Hard 20 is the one total whose only two-card form is the 10,10 pair — a
/// different chart row asking a different question — so it takes a third card
/// instead (F4). Hard 4 (2,2) keeps the same-value fallback; no recorded ref
/// reaches it.
private func hardTotalCards(_ total: Int, _ random: () -> Double) -> [Card] {
    var options: [(Int, Int)] = []
    for a in 2 ... 10 where a + 1 <= 10 {
        for b in (a + 1) ... 10 where a + b == total {
            options.append((a, b))
        }
    }
    if options.isEmpty {
        if total == 20 {
            // 2..8: the remainder 12..18 always splits into distinct values.
            let third = 2 + clampIndex(random(), 7)
            return hardTotalCards(total - third, random) + [cardOfValue(third, random)]
        }
        return [cardOfValue(total / 2, random), cardOfValue(total / 2, random)]
    }
    let pick = options[clampIndex(random(), options.count)]
    let (v1, v2) = random() < 0.5 ? pick : (pick.1, pick.0)
    return [cardOfValue(v1, random), cardOfValue(v2, random)]
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
