import SwiftUI

/// The drill stage: a small labelled dealer upcard above the large, central
/// player hand, with a caller-supplied line (question or miss rule) beneath.
/// Mirrors the web `flow-stage` component. Purely presentational.
struct FlowStageView<Line: View>: View {
    let player: TwoCardHand
    let dealer: Card
    @ViewBuilder let line: () -> Line

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
            HStack(spacing: 12) {
                ForEach(Array(player.cards.enumerated()), id: \.offset) { _, card in
                    CardImage(card, width: 88)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Your hand")
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
