import SwiftUI

/// Renders a playing card from the bundled Vector Playing Card Library art.
///
/// The faces and back ship as asset-catalog images with vector data preserved,
/// so they stay crisp at any trainer size. The artwork is LGPL 3.0 — its
/// attribution lives in `AboutView`. Asset names mirror the source SVG file
/// names (`AS`, `10C`, `KH`, `BLUE_BACK`).
struct CardImage: View {
    enum Face: Equatable {
        case up(Card)
        case down
    }

    let face: Face
    let width: CGFloat

    init(_ card: Card, width: CGFloat = 72) {
        face = .up(card)
        self.width = width
    }

    init(faceDown width: CGFloat = 72) {
        face = .down
        self.width = width
    }

    var body: some View {
        Image(Self.assetName(for: face))
            .resizable()
            .scaledToFit()
            .frame(width: width)
            .accessibilityLabel(Self.accessibilityLabel(for: face))
    }

    /// Asset-catalog name for a face. Face-up names are `rank + suit letter`
    /// (e.g. `AS`, `10C`); face-down is the blue back.
    static func assetName(for face: Face) -> String {
        switch face {
        case let .up(card): "\(card.rank.rawValue)\(suitLetter(card.suit))"
        case .down: "BLUE_BACK"
        }
    }

    /// Single-letter suit code used by the source artwork's file names.
    static func suitLetter(_ suit: Suit) -> String {
        switch suit {
        case .spades: "S"
        case .hearts: "H"
        case .diamonds: "D"
        case .clubs: "C"
        }
    }

    static func accessibilityLabel(for face: Face) -> String {
        switch face {
        case let .up(card): "\(rankName(card.rank)) of \(card.suit.rawValue)"
        case .down: "Face-down card"
        }
    }

    private static func rankName(_ rank: Rank) -> String {
        switch rank {
        case .ace: "Ace"
        case .king: "King"
        case .queen: "Queen"
        case .jack: "Jack"
        default: rank.rawValue
        }
    }
}

#Preview {
    HStack(spacing: 8) {
        CardImage(Card(rank: .ace, suit: .spades))
        CardImage(Card(rank: .ten, suit: .hearts))
        CardImage(Card(rank: .king, suit: .diamonds))
        CardImage(faceDown: 72)
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
