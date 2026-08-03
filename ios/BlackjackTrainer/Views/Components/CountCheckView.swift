import SwiftUI

/// The showdown's way out. It is the one thing that table has never asked: it
/// has been keeping the count for the player all along — every verdict there
/// rests on it — and holding the count through played-out hands is the skill the
/// screen is for. The answer box gives way to the verdict, which owns the exit.
///
/// Its own view (and file) so `ShowdownView` stays inside the type-body budget,
/// following `PlayCoachView`. Mirrors the web `.showdown__count-check` block.
struct CountCheckView: View {
    let cardsSeen: Int
    /// Leaving before the peek: the hole card was dealt but never turned over,
    /// so it is out of this tally and out of the count that leaves with you.
    var holeCardUnseen = false
    let allowFractions: Bool
    let verdict: PlayVerdict?
    let onAnswer: (Double) -> Void
    let onLeave: () -> Void

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(cardsSeen) cards came out at this table. Take the count with you.")
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
            if holeCardUnseen {
                Text("The dealer's hole card was never turned over, so it is in neither.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            if let verdict {
                PlayCoachView(verdict: verdict)
                Button(action: onLeave) {
                    Text(hasHardwareKeyboard ? "Back to counting  [Enter]" : "Back to counting")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
                .keyboardShortcut(.return, modifiers: [])
            } else {
                CountAnswerView(
                    mode: .runningCount,
                    allowFractions: allowFractions,
                    onAnswer: onAnswer
                )
            }
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        CountCheckView(
            cardsSeen: 3, holeCardUnseen: true, allowFractions: false, verdict: nil
        ) { _ in } onLeave: {}
        CountCheckView(cardsSeen: 14, allowFractions: false, verdict: nil) { _ in } onLeave: {}
        CountCheckView(
            cardsSeen: 14,
            allowFractions: false,
            verdict: PlayVerdict(
                correct: false,
                headline: "The running count is +3.",
                reason: "You said +1 — 2 points low over 14 cards."
            )
        ) { _ in } onLeave: {}
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
