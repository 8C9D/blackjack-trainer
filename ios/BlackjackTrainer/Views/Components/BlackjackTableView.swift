import SwiftUI

/// Dealer/player card layout, mirroring the web `app-blackjack-table`. In the
/// trainers the dealer shows one upcard plus a face-down hole card; the showdown
/// reveals the full dealer hand by passing `hideDealerHole: false`.
struct BlackjackTableView: View {
    let playerCards: [Card]
    let dealerCards: [Card]
    var hideDealerHole = true
    var cardWidth: CGFloat = 72

    init(
        playerCards: [Card],
        dealerCards: [Card],
        hideDealerHole: Bool = true,
        cardWidth: CGFloat = 72
    ) {
        self.playerCards = playerCards
        self.dealerCards = dealerCards
        self.hideDealerHole = hideDealerHole
        self.cardWidth = cardWidth
    }

    /// Convenience for the two-card trainers: the player's hand vs a single
    /// dealer upcard (with the hole card face-down).
    init(player: TwoCardHand, dealerUpcard: Card, cardWidth: CGFloat = 72) {
        self.init(
            playerCards: player.cards,
            dealerCards: [dealerUpcard],
            hideDealerHole: true,
            cardWidth: cardWidth
        )
    }

    var body: some View {
        VStack(spacing: 20) {
            handRow(label: "Dealer", cards: dealerCards, showsHole: hideDealerHole)
            handRow(label: "Player", cards: playerCards, showsHole: false)
        }
    }

    private func handRow(label: String, cards: [Card], showsHole: Bool) -> some View {
        VStack(spacing: 8) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.secondaryText)
            HStack(spacing: 8) {
                ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
                    CardImage(card, width: cardWidth)
                }
                if showsHole {
                    CardImage(faceDown: cardWidth)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    VStack(spacing: 32) {
        BlackjackTableView(
            player: TwoCardHand(Card(rank: .ace, suit: .spades), Card(rank: .seven, suit: .hearts)),
            dealerUpcard: Card(rank: .six, suit: .clubs)
        )
        BlackjackTableView(
            playerCards: [Card(rank: .king, suit: .diamonds), Card(rank: .nine, suit: .spades)],
            dealerCards: [Card(rank: .ten, suit: .hearts), Card(rank: .seven, suit: .clubs)],
            hideDealerHole: false
        )
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
