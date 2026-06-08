import Foundation

/// Scenario generators for the "Deviation-only" practice mode, the Swift port of
/// `scenario-generators.ts`. Pure functions over an injectable random source so
/// they're deterministic in tests; they build hands the deviation engine will
/// route to a chosen rule, and pick a true count biased around its threshold.
struct DeviationScenarioGenerator {
    var random: () -> Double = { Double.random(in: 0 ..< 1) }
    let rulesByRuleSet: [String: [DeviationRule]]

    private static let tenValueRanks: [Rank] = [.ten, .jack, .queen, .king]
    /// Cap on how far a biased true count strays from the rule's index.
    private static let spread = 3

    func rules(for ruleSet: RuleSet) -> [DeviationRule] {
        rulesByRuleSet[ruleSet.rawValue] ?? []
    }

    func pickRule(for ruleSet: RuleSet) -> DeviationRule? {
        let rules = rules(for: ruleSet)
        guard !rules.isEmpty else { return nil }
        return rules[index(rules.count)]
    }

    /// A two-card hand that routes to the rule (hard/surrender avoid same-rank
    /// pairs, which would route through the pair lookup instead).
    func makePlayerCards(for rule: DeviationRule) -> TwoCardHand {
        switch rule.category {
        case "hard", "surrender":
            makeHardTotalCards(Int(rule.playerHand) ?? 0)
        case "soft":
            makeSoftTotalCards(Int(rule.playerHand) ?? 0)
        case "pair":
            makePairCards(rule.playerHand)
        default: // insurance
            TwoCardHand(randomAnyCard(), randomAnyCard())
        }
    }

    /// A dealer card matching the rule's chart-key upcard (`10` expands to any
    /// ten-value rank; `A` is an Ace).
    func makeDealerUpcard(_ upcard: String) -> Card {
        switch upcard {
        case "A": Card(rank: .ace, suit: randomSuit())
        case "10": tenValueCard()
        default: Card(rank: Rank(rawValue: upcard) ?? .ace, suit: randomSuit())
        }
    }

    func scenario(for rule: DeviationRule, trueCount: Int) -> DeviationScenario {
        DeviationScenario(
            player: makePlayerCards(for: rule),
            dealerUpcard: makeDealerUpcard(rule.dealerUpcard),
            trueCount: trueCount
        )
    }

    /// A true count that exercises the rule's threshold: 50% on the "met" side,
    /// 50% "not met", clamped to [minTc, maxTc]. Mirrors
    /// `pickTrueCountForDeviationRule`.
    func pickTrueCount(for rule: DeviationRule, minTc: Int, maxTc: Int) -> Int {
        let wantMet = random() < 0.5
        let (low, high) = range(for: rule, wantMet: wantMet, minTc: minTc, maxTc: maxTc)
        if low <= high { return pickInt(low, high) }
        let (fallbackLow, fallbackHigh) = range(
            for: rule,
            wantMet: !wantMet,
            minTc: minTc,
            maxTc: maxTc
        )
        if fallbackLow <= fallbackHigh { return pickInt(fallbackLow, fallbackHigh) }
        return min(maxTc, max(minTc, rule.index))
    }

    // MARK: - internals

    private func makeHardTotalCards(_ total: Int) -> TwoCardHand {
        var options: [(Int, Int)] = []
        for first in 2 ... 10 where first < 10 {
            for second in (first + 1) ... 10 where first + second == total {
                options.append((first, second))
            }
        }
        if options.isEmpty {
            for value in 2 ... 10 where 2 * value == total {
                options.append((value, value))
            }
        }
        let pick = options[index(options.count)]
        let ordered = random() < 0.5 ? pick : (pick.1, pick.0)
        return TwoCardHand(cardOfValue(ordered.0), cardOfValue(ordered.1))
    }

    private func makeSoftTotalCards(_ total: Int) -> TwoCardHand {
        let nonAceValue = total - 11
        let ace = Card(rank: .ace, suit: randomSuit())
        let other = cardOfValue(nonAceValue)
        return random() < 0.5 ? TwoCardHand(ace, other) : TwoCardHand(other, ace)
    }

    private func makePairCards(_ playerHand: String) -> TwoCardHand {
        if playerHand == "10" {
            return TwoCardHand(tenValueCard(), tenValueCard())
        }
        let rank = Rank(rawValue: playerHand) ?? .ace
        return TwoCardHand(
            Card(rank: rank, suit: randomSuit()),
            Card(rank: rank, suit: randomSuit())
        )
    }

    private func randomAnyCard() -> Card {
        Card(rank: Card.allRanks[index(Card.allRanks.count)], suit: randomSuit())
    }

    /// 2…9 → that rank; 10 → a random ten-value rank.
    private func cardOfValue(_ value: Int) -> Card {
        value == 10 ? tenValueCard() : Card(
            rank: Rank(rawValue: String(value)) ?? .ten,
            suit: randomSuit()
        )
    }

    private func tenValueCard() -> Card {
        Card(rank: Self.tenValueRanks[index(Self.tenValueRanks.count)], suit: randomSuit())
    }

    private func randomSuit() -> Suit {
        Card.allSuits[index(Card.allSuits.count)]
    }

    private func pickInt(_ low: Int, _ high: Int) -> Int {
        low + index(high - low + 1)
    }

    /// `Math.floor(random * count)`, clamped so it never indexes past the end.
    private func index(_ count: Int) -> Int {
        guard count > 0 else { return 0 }
        return min(max(Int(random() * Double(count)), 0), count - 1)
    }

    private func range(for rule: DeviationRule, wantMet: Bool, minTc: Int,
                       maxTc: Int) -> (Int, Int) {
        let spread = Self.spread
        switch rule.direction {
        case "at-or-above":
            let index = rule.index
            return wantMet
                ? (max(index, minTc), min(index + spread, maxTc))
                : (max(index - spread, minTc), min(index - 1, maxTc))
        case "at-or-below":
            let index = rule.index
            return wantMet
                ? (max(index - spread, minTc), min(index, maxTc))
                : (max(index + 1, minTc), min(index + spread, maxTc))
        case "positive":
            return wantMet ? (max(1, minTc), maxTc) : (minTc, min(0, maxTc))
        case "negative":
            return wantMet ? (minTc, min(-1, maxTc)) : (max(0, minTc), maxTc)
        default:
            return (minTc, maxTc)
        }
    }
}
