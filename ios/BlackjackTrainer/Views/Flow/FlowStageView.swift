import SwiftUI

/// The drill stage: a small labelled dealer upcard above the large, central
/// player hand, with a caller-supplied line (question or miss rule) beneath.
/// Mirrors the web `flow-stage` component. Purely presentational.
struct FlowStageView<Line: View>: View {
    /// One card or many: a hand played out grows past the opening two.
    let player: [Card]
    let dealer: Card
    @ViewBuilder let line: () -> Line

    init(player: [Card], dealer: Card, @ViewBuilder line: @escaping () -> Line) {
        self.player = player
        self.dealer = dealer
        self.line = line
    }

    init(player: TwoCardHand, dealer: Card, @ViewBuilder line: @escaping () -> Line) {
        self.init(player: player.cards, dealer: dealer, line: line)
    }

    /// A hand played out can reach five or six cards. Shrink them past two so a
    /// four-card hand still reads as one row on a phone.
    private var cardWidth: CGFloat {
        player.count > 2 ? 64 : 88
    }

    var body: some View {
        VStack(spacing: 6) {
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                Text("DEALER SHOWS")
                    .font(.system(size: 11))
                    .tracking(2)
                    .foregroundStyle(Theme.muted)
                CardImage(dealer, width: 44)
            }
            .padding(.bottom, 20)
            // Indexed rather than keyed by card: the trainers deal with
            // replacement, so the same card can appear twice in one hand.
            HStack(spacing: player.count > 2 ? 8 : 12) {
                ForEach(Array(player.enumerated()), id: \.offset) { _, card in
                    CardImage(card, width: cardWidth)
                }
            }
            line()
                .padding(.top, 20)
                .padding(.horizontal, 24)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(16)
    }
}

#Preview {
    FlowStageView(
        player: TwoCardHand(Card(rank: .king, suit: .spades), Card(rank: .six, suit: .hearts)),
        dealer: Card(rank: .ten, suit: .clubs)
    ) {
        Text("Hard 16 vs 10")
            .foregroundStyle(Theme.midInk)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
