import Testing
@testable import BlackjackTrainer

/// Slice 1.1 — card & hand model. Unit checks plus a label cross-check against
/// the labels embedded in basic-strategy-vectors.json.
struct CardHandTests {
    @Test func cardValues() {
        #expect(card("A").highValue == 11)
        #expect(card("K").highValue == 10)
        #expect(card("10").highValue == 10)
        #expect(card("7").highValue == 7)
        #expect(card("J").isTenValue)
        #expect(!card("9").isTenValue)
        #expect(Card(rank: .seven, suit: .hearts).color == .red)
        #expect(Card(rank: .seven, suit: .spades).color == .black)
    }

    @Test func nCardTotalsAreSoftAware() {
        #expect(Hand.total([card("10"), card("6")]) == 16)
        #expect(Hand.total([card("A"), card("6")]) == 17) // soft 17
        #expect(Hand.total([card("A"), card("6"), card("10")]) == 17) // ace demoted
        #expect(Hand.total([card("A"), card("A"), card("9")]) == 21)
        #expect(Hand.total([]) == 0)
    }

    @Test func softBustBlackjack() {
        #expect(Hand.isSoft([card("A"), card("7")]))
        #expect(!Hand.isSoft([card("A"), card("7"), card("K")])) // hard 18
        #expect(Hand.isBust([card("10"), card("6"), card("10")]))
        #expect(!Hand.isBust([card("10"), card("6")]))
        #expect(Hand.isBlackjack([card("A"), card("K")]))
        #expect(!Hand.isBlackjack([card("A"), card("6"), card("4")])) // 3-card 21
    }

    @Test func twoCardHelpers() {
        #expect(softNonAceValue(TwoCardHand(card("A"), card("7"))) == 7)
        #expect(HandClassification.pairKey(TwoCardHand(card("8"), card("8"))) == "8")
        #expect(HandClassification.pairKey(TwoCardHand(card("K"), card("10"))) == "10")
        #expect(HandClassification.pairKey(TwoCardHand(card("9"), card("8"))) == nil)
        #expect(HandClassification.isSoftTwoCard(TwoCardHand(card("A"), card("9"))))
        #expect(!HandClassification.isSoftTwoCard(TwoCardHand(card("A"), card("A"))))
    }

    @Test func canonicalLabels() {
        #expect(HandClassification.canonicalLabel(TwoCardHand(card("10"), card("6"))) == "Hard 16")
        #expect(HandClassification
            .canonicalLabel(TwoCardHand(card("A"), card("7"))) == "Soft 18 (A, 7)")
        #expect(HandClassification
            .canonicalLabel(TwoCardHand(card("8"), card("8"))) == "Pair of 8s")
        #expect(HandClassification
            .canonicalLabel(TwoCardHand(card("A"), card("A"))) == "Pair of Aces")
        #expect(
            HandClassification.canonicalLabel(TwoCardHand(card("K"), card("10")))
                == "Pair of ten-value cards"
        )
        #expect(HandClassification
            .canonicalLabel(TwoCardHand(card("A"), card("10"))) == "Blackjack (A + 10)")
    }

    /// Cross-check: for every basic-strategy vector that resolves on its natural
    /// category, the model's canonical label matches the engine's label. Pair
    /// fall-throughs (source `hard` on a pair hand) are validated by the engine
    /// in Slice 1.3, not here.
    @Test func labelsMatchBasicStrategyFixture() throws {
        let file = try Fixtures.load(BasicStrategyVectorFile.self, "basic-strategy-vectors")
        #expect(file.vectors.count == file.count)

        var mismatches: [String] = []
        for v in file.vectors {
            let player = v.player
            let isPair = HandClassification.pairKey(player) != nil
            let shouldCheck: Bool = switch v.source {
            case "pair", "soft", "surrender": true
            case "hard": !isPair
            default: false
            }
            guard shouldCheck else { continue }
            let label = HandClassification.canonicalLabel(player)
            if label != v.label {
                mismatches.append("\(v.hand) [\(v.source)]: model=\(label) fixture=\(v.label)")
            }
        }
        #expect(mismatches.isEmpty, "label mismatches: \(mismatches.prefix(10))")
    }

    /// Every distinct label in the fixture is reproducible by the model.
    @Test func labelVocabularyIsComplete() throws {
        let file = try Fixtures.load(BasicStrategyVectorFile.self, "basic-strategy-vectors")
        let fixtureLabels = Set(file.vectors.map(\.label))

        var modelLabels: Set<String> = []
        let ranks: [String] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"]
        for (i, a) in ranks.enumerated() {
            for b in ranks[i...] {
                let hand = TwoCardHand(card(a), card(b))
                modelLabels.insert(HandClassification.canonicalLabel(hand))
                // A non-ace pair can fall through to its hard total (e.g. 2,2 →
                // "Hard 4", 10,10 → "Hard 20"); the engine labels those by total.
                if HandClassification.pairKey(hand) != nil, !hand.first.isAce {
                    modelLabels.insert("Hard \(hand.first.highValue + hand.second.highValue)")
                }
            }
        }
        let missing = fixtureLabels.subtracting(modelLabels)
        #expect(missing.isEmpty, "labels the model cannot produce: \(missing)")
    }
}
