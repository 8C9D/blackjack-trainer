import SwiftUI

/// "1 deck", "1.5 decks" — the divisor is formatted before it is counted, and
/// "÷ 1 decks" reads as a typo in exactly the line that has to look like
/// arithmetic.
private func decksLabel(_ decks: Double) -> String {
    countOf(decks, "deck", display: CountFormat.decks(decks))
}

/// How far a wrong count landed from the real one. Two numbers side by side
/// leave the subtraction to the trainee. Nil on a correct count.
private func driftLine(answer: Double, actual: Double, cards: Int?) -> String? {
    let drift = answer - actual
    guard drift != 0 else { return nil }
    let over = cards.map { " over \(countOf($0, "card"))" } ?? ""
    return "Your count came in \(countDriftLabel(drift))\(over)."
}

/// The same division the running ÷ decks line does, with the divisor the player
/// actually had. When it lands on the same true count the estimate cost nothing
/// this round, which is worth saying too: how far out an estimate is only
/// matters against the running count it divides.
private func estimateLine(_ runningCount: Double, _ effect: DeckEstimateEffect) -> String {
    let divided = "Your estimate: \(CountFormat.count(runningCount)) ÷ "
        + "\(decksLabel(effect.estimate)) = true count \(effect.impliedTrueCount)"
    if effect.matchesActual {
        return "\(divided) — the same true count, so the estimate cost nothing here."
    }
    // "The count you would have played on" is only true where the answer agrees
    // with the estimate. Say it of an answer that lands somewhere else — the
    // shoe's own count, most of all, which is marked correct — and the panel
    // contradicts the verdict two lines above it.
    return effect.matchesAnswer
        ? "\(divided) — the count you would have played on, and the answer you gave."
        : "\(divided)."
}

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
            if let line = driftLine(
                answer: running.userRunningCount,
                actual: running.correctRunningCount,
                cards: running.cards.count
            ) {
                Text(line)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
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
                    + "\(decksLabel(trueCount.decksRemaining)) = "
                    + "true count \(trueCount.correctTrueCount)"
            )
            .font(.footnote)
            .foregroundStyle(Theme.muted)
            if let effect = DeckEstimateEffect(
                runningCount: trueCount.correctRunningCount,
                estimate: trueCount.deckEstimate,
                correctTrueCount: trueCount.correctTrueCount,
                userTrueCount: trueCount.userTrueCount
            ) {
                Text(estimateLine(trueCount.correctRunningCount, effect))
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
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
