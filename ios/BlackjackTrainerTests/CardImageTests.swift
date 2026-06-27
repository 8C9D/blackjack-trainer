import Testing
@testable import BlackjackTrainer

/// The card-art mapping is the seam between the domain `Card` and the bundled
/// asset names; the build itself (actool) verifies every referenced SVG exists
/// and compiles, so here we lock down the name mapping for all 52 cards + back.
struct CardImageTests {
    @Test func faceDownUsesBlueBack() {
        #expect(CardImage.assetName(for: .down) == "BLUE_BACK")
    }

    @Test func suitLettersMatchSourceArtwork() {
        #expect(CardImage.suitLetter(.spades) == "S")
        #expect(CardImage.suitLetter(.hearts) == "H")
        #expect(CardImage.suitLetter(.diamonds) == "D")
        #expect(CardImage.suitLetter(.clubs) == "C")
    }

    @Test func everyCardMapsToRankPlusSuitLetter() {
        let suitCode: [Suit: String] = [
            .spades: "S", .hearts: "H", .diamonds: "D", .clubs: "C"
        ]
        for rank in Rank.allCases {
            for suit in Suit.allCases {
                let name = CardImage.assetName(for: .up(Card(rank: rank, suit: suit)))
                #expect(name == "\(rank.rawValue)\(suitCode[suit]!)")
            }
        }
    }

    @Test func spotCheckKnownAssetNames() {
        #expect(CardImage.assetName(for: .up(Card(rank: .ace, suit: .spades))) == "AS")
        #expect(CardImage.assetName(for: .up(Card(rank: .ten, suit: .clubs))) == "10C")
        #expect(CardImage.assetName(for: .up(Card(rank: .king, suit: .hearts))) == "KH")
        #expect(CardImage.assetName(for: .up(Card(rank: .two, suit: .diamonds))) == "2D")
    }
}
