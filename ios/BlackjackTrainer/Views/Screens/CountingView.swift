import SwiftUI

/// The streamed card plus a progress readout, mirroring `card-stream`. Reused by
/// the Card Counting drill inside the Flow shell.
struct CountStreamView: View {
    let card: Card?
    let index: Int
    let total: Int

    var body: some View {
        VStack(spacing: 12) {
            if let card {
                CardImage(card, width: 120)
            } else {
                CardImage(faceDown: 120)
            }
            Text("Card \(min(index + 1, max(total, 1))) of \(total)")
                .foregroundStyle(Theme.secondaryText)
                .accessibilityLabel("Card \(min(index + 1, max(total, 1))) of \(total)")
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}
