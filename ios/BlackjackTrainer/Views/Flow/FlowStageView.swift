import SwiftUI

/// The drill stage: a small labelled dealer upcard above the large, central
/// player hand, with a caller-supplied line (question or miss rule) beneath.
/// Mirrors the web `flow-stage` component. Purely presentational.
struct FlowStageView<Line: View>: View {
    /// One card or many: a hand played out grows past the opening two.
    let player: [Card]
    let dealer: Card
    /// "Hand 2 of 3" while a split is being played out; empty for a single hand,
    /// where naming it would only add noise.
    let handLabel: String
    @ViewBuilder let line: () -> Line

    init(
        player: [Card],
        dealer: Card,
        handLabel: String = "",
        @ViewBuilder line: @escaping () -> Line
    ) {
        self.player = player
        self.dealer = dealer
        self.handLabel = handLabel
        self.line = line
    }

    init(
        player: TwoCardHand,
        dealer: Card,
        handLabel: String = "",
        @ViewBuilder line: @escaping () -> Line
    ) {
        self.init(player: player.cards, dealer: dealer, handLabel: handLabel, line: line)
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
            // A split puts more than one hand in front of you and the stage shows
            // one at a time, so without this the second is a fresh deal.
            if !handLabel.isEmpty {
                Text(handLabel.uppercased())
                    .font(.system(size: 11))
                    .tracking(2)
                    .foregroundStyle(Theme.muted)
                    .accessibilityHidden(true)
            }
            // Indexed rather than keyed by card: the trainers deal with
            // replacement, so the same card can appear twice in one hand.
            HStack(spacing: player.count > 2 ? 8 : 12) {
                ForEach(Array(player.enumerated()), id: \.offset) { _, card in
                    CardImage(card, width: cardWidth)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(handLabel.isEmpty ? "Your hand" : handLabel)
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
