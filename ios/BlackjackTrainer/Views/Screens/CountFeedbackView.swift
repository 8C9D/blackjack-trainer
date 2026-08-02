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
                .foregroundStyle(result.isCorrect ? Theme.good : Theme.bad)

            details

            Button { showBreakdown.toggle() } label: {
                Text((showBreakdown ? "Hide" : "Show") + " card-by-card breakdown")
            }
            .buttonStyle(.bordered)
            .tint(Theme.accentInk)

            if showBreakdown {
                breakdown
            }

            Button(action: onNext) {
                Text(hasHardwareKeyboard ? "Run again  [Enter]" : "Run again")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .accentFilledButton()
            .keyboardShortcut(.return, modifiers: [])
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((result.isCorrect ? Theme.good : Theme.bad).opacity(0.14))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(result.isCorrect ? Theme.good : Theme.bad, lineWidth: 1)
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
            .foregroundStyle(Theme.muted)
        case let .keyCount(keyCount):
            keyCountDetails(keyCount)
        }
    }

    @ViewBuilder
    private func keyCountDetails(_ result: KeyCountDrillResult) -> some View {
        detailRow("Your count", CountFormat.count(result.userRunningCount))
        detailRow("Correct count", CountFormat.count(result.correctRunningCount))
        detailRow("Key count", CountFormat.signedCount(Double(result.keyCount)))
        detailRow("Advantage", Self.advantageAnswer(result))
        Text(Self.keyCountRationale(result))
            .font(.footnote)
            .foregroundStyle(Theme.muted)
        if result.correctRunningCount >= Double(result.insuranceCount) {
            Text(Self.insuranceRationale(result))
                .font(.footnote)
                .foregroundStyle(Theme.muted)
        }
    }

    // The rationale strings are built outside the view body: as `+` chains of
    // interpolations inline they pushed `keyCountDetails` past the Swift type
    // checker's budget, which fails a clean build ("unable to type-check this
    // expression in reasonable time") while an incremental one reuses the
    // cached object and looks fine.

    static func advantageAnswer(_ result: KeyCountDrillResult) -> String {
        let correct = result.hasAdvantage ? "Yes" : "No"
        let said = result.userSaidAdvantage ? "yes" : "no"
        return "\(correct) — you said \(said)"
    }

    static func keyCountRationale(_ result: KeyCountDrillResult) -> String {
        let running = CountFormat.signedCount(result.correctRunningCount)
        let key = CountFormat.signedCount(Double(result.keyCount))
        let irc = CountFormat.signedCount(Double(result.irc))
        let pivot = CountFormat.signedCount(Double(result.pivot))
        let comparison = result.hasAdvantage ? "at or above" : "below"
        let edge = result.hasAdvantage ? "the edge is yours" : "no edge yet"
        return "Running count \(running) is \(comparison) the key count \(key) — \(edge). "
            + "The shoe started at the IRC \(irc) and a full shoe ends at the pivot \(pivot)."
    }

    static func insuranceRationale(_ result: KeyCountDrillResult) -> String {
        let running = CountFormat.signedCount(result.correctRunningCount)
        let insurance = CountFormat.signedCount(Double(result.insuranceCount))
        return "Running count \(running) has reached \(insurance) — "
            + "take insurance when it is offered."
    }

    private var breakdown: some View {
        let columns = [GridItem(.adaptive(minimum: 60), spacing: 8)]
        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(breakdownEntries()) { entry in
                VStack(spacing: 2) {
                    CardImage(entry.card, width: 44)
                    Text(entry.delta)
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                    Text("→ \(entry.runningTotal)")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Theme.ink)
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
                .foregroundStyle(Theme.muted)
            Spacer()
            Text(value)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.ink)
        }
    }
}
