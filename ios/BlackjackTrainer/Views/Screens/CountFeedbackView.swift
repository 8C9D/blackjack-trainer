import SwiftUI

/// Counting-drill feedback, mirroring the web `count-feedback-panel`: verdict,
/// the count/true-count details (with the running ÷ decks formula), an optional
/// card-by-card breakdown, and "Run again".
struct CountFeedbackView: View {
    let result: CountingDrillResult
    let system: CountingSystem
    let onNext: () -> Void

    @State private var showBreakdown = false
    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    private struct BreakdownEntry: Identifiable {
        let id: Int
        let card: Card
        let delta: String
        let runningTotal: String
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(result.isCorrect ? "Correct!" : "Incorrect")
                .font(.title3.weight(.bold))
                .foregroundStyle(result.isCorrect ? Theme.correct : Theme.incorrect)

            details

            Button { showBreakdown.toggle() } label: {
                Text((showBreakdown ? "Hide" : "Show") + " card-by-card breakdown")
            }
            .buttonStyle(.bordered)
            .tint(Theme.accent)

            if showBreakdown {
                breakdown
            }

            Button(action: onNext) {
                Text(hasHardwareKeyboard ? "Run again  [Enter]" : "Run again")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .keyboardShortcut(.return, modifiers: [])
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((result.isCorrect ? Theme.correct : Theme.incorrect).opacity(0.14))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(result.isCorrect ? Theme.correct : Theme.incorrect, lineWidth: 1)
        )
    }

    @ViewBuilder
    private var details: some View {
        switch result {
        case let .running(running):
            detailRow("Your count", CountFormat.count(running.userRunningCount))
            detailRow("Correct count", CountFormat.count(running.correctRunningCount))
        case let .trueCount(trueCount):
            detailRow("Your true count", "\(trueCount.userTrueCount)")
            detailRow("Correct true count", "\(trueCount.correctTrueCount)")
            detailRow("Running count", CountFormat.count(trueCount.correctRunningCount))
            detailRow("Decks remaining", CountFormat.decks(trueCount.decksRemaining))
            if let estimate = trueCount.deckEstimate {
                detailRow("Your decks estimate", CountFormat.decks(estimate))
                detailRow(
                    "Estimate within ±0.5",
                    (trueCount.deckEstimateWithinBand ?? false) ? "Yes" : "No"
                )
            }
            Text(
                "Running count \(CountFormat.count(trueCount.correctRunningCount)) ÷ "
                    + "\(CountFormat.decks(trueCount.decksRemaining)) decks = "
                    + "true count \(trueCount.correctTrueCount)"
            )
            .font(.footnote)
            .foregroundStyle(Theme.secondaryText)
        }
    }

    private var breakdown: some View {
        let columns = [GridItem(.adaptive(minimum: 60), spacing: 8)]
        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(breakdownEntries()) { entry in
                VStack(spacing: 2) {
                    CardImage(entry.card, width: 44)
                    Text(entry.delta)
                        .font(.caption2)
                        .foregroundStyle(Theme.secondaryText)
                    Text("→ \(entry.runningTotal)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.primaryText)
                }
            }
        }
    }

    private func breakdownEntries() -> [BreakdownEntry] {
        var running = result.priorRunningCount
        return result.cards.enumerated().map { index, card in
            let delta = system.value(for: card)
            running += delta
            return BreakdownEntry(
                id: index,
                card: card,
                delta: CountFormat.signedCount(delta),
                runningTotal: CountFormat.count(running)
            )
        }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(Theme.secondaryText)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.primaryText)
        }
    }
}
