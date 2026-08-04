import SwiftUI

/// "1 deck", "1.5 decks" — the divisor is formatted before it is counted, and
/// "÷ 1 decks" reads as a typo in exactly the line that has to look like
/// arithmetic.
private func decksLabel(_ decks: Double) -> String {
    countOf(decks, "deck", display: CountFormat.decks(decks))
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
        case let .keyCount(keyCount):
            keyCountDetails(keyCount)
        case let .betSpread(betSpread):
            betSpreadDetails(betSpread)
        case let .deckSpeed(deckSpeed):
            deckSpeedDetails(deckSpeed)
        }
    }

    @ViewBuilder
    private func deckSpeedDetails(_ result: DeckSpeedDrillResult) -> some View {
        detailRow("Your count", CountFormat.count(result.userRunningCount))
        detailRow("Correct count", CountFormat.count(result.correctRunningCount))
        detailRow("Time", DeckSpeed.duration(milliseconds: result.elapsedMilliseconds))
        detailRow(
            "Best",
            result.previousBestMilliseconds
                .map { DeckSpeed.duration(milliseconds: $0) } ?? "—"
        )
        Text(deckSpeedProof(result))
            .font(.footnote)
            .foregroundStyle(Theme.muted)
        if result.isPersonalBest {
            let time: String = DeckSpeed.duration(milliseconds: result.elapsedMilliseconds)
            let benchmark: String = result.elapsedMilliseconds < DeckSpeed.benchmarkMilliseconds
                ? " That is under the 30-second benchmark." : ""
            Text("New personal best — \(time).\(benchmark)")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Theme.accentInk)
        }
    }

    /// The burned card in words, so the proof line reads as a sentence.
    private func burnedLabel(_ card: Card) -> String {
        let rank = switch card.rank {
        case .jack: "jack"
        case .queen: "queen"
        case .king: "king"
        case .ace: "ace"
        default: card.rank.rawValue
        }
        return "\(rank) of \(card.suit.rawValue)"
    }

    @ViewBuilder
    private func betSpreadDetails(_ result: BetSpreadDrillResult) -> some View {
        detailRow("Your true count", "\(result.userTrueCount)")
        detailRow("Correct true count", "\(result.correctTrueCount)")
        detailRow("Running count", CountFormat.count(result.correctRunningCount))
        detailRow("Decks remaining", CountFormat.decks(result.decksRemaining))
        if let estimate = result.deckEstimate {
            detailRow("Your decks estimate", CountFormat.decks(estimate))
            detailRow(
                "Estimate within ±0.5",
                (result.deckEstimateWithinBand ?? false) ? "Yes" : "No"
            )
        }
        detailRow("Your bet", BetRamp.unitsLabel(result.userUnits))
        detailRow("Your spread says", BetRamp.unitsLabel(result.correctUnits))
        Text(
            "Running count \(CountFormat.count(result.correctRunningCount)) ÷ "
                + "\(decksLabel(result.decksRemaining)) = "
                + "true count \(result.correctTrueCount), which is the "
                + "\(BetRamp.bandLabels[BetRamp.bandIndex(trueCount: result.correctTrueCount)]) "
                + "band of your spread."
        )
        .font(.footnote)
        .foregroundStyle(Theme.muted)
        spread(result)
    }

    /// The whole spread with the band this round landed in filled, so a missed
    /// bet reads as "that count was this band".
    private func spread(_ result: BetSpreadDrillResult) -> some View {
        let active = BetRamp.bandIndex(trueCount: result.correctTrueCount)
        let columns = [GridItem(.adaptive(minimum: 100), spacing: 6)]
        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(Array(result.ramp.enumerated()), id: \.offset) { index, bandUnits in
                VStack(spacing: 2) {
                    Text(BetRamp.bandLabels[index])
                        .font(.caption2)
                    Text(BetRamp.unitsLabel(bandUnits))
                        .font(.caption2.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(index == active ? Theme.accent : Theme.raised)
                .foregroundStyle(index == active ? Theme.onAccent : Theme.ink)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    @ViewBuilder
    private func keyCountDetails(_ result: KeyCountDrillResult) -> some View {
        let advantage: String = (result.hasAdvantage ? "Yes" : "No")
            + " — you said " + (result.userSaidAdvantage ? "yes" : "no")
        let rationale: String = keyCountRationale(result)
        detailRow("Your count", CountFormat.count(result.userRunningCount))
        detailRow("Correct count", CountFormat.count(result.correctRunningCount))
        detailRow("Key count", CountFormat.signedCount(Double(result.keyCount)))
        detailRow("Advantage", advantage)
        Text(rationale)
            .font(.footnote)
            .foregroundStyle(Theme.muted)
        if result.correctRunningCount >= Double(result.insuranceCount) {
            Text(
                "Running count \(CountFormat.signedCount(result.correctRunningCount)) has "
                    + "reached \(CountFormat.signedCount(Double(result.insuranceCount))) — "
                    + "take insurance when it is offered."
            )
            .font(.footnote)
            .foregroundStyle(Theme.muted)
        }
    }

    /// The key-count feedback's sentence, built outside the view builder so the
    /// type-checker is not asked to solve a long concatenation inside one.
    private func keyCountRationale(_ result: KeyCountDrillResult) -> String {
        let count: String = CountFormat.signedCount(result.correctRunningCount)
        let key: String = CountFormat.signedCount(Double(result.keyCount))
        let side: String = result.hasAdvantage ? "at or above" : "below"
        let verdict: String = result.hasAdvantage ? "the edge is yours" : "no edge yet"
        let irc: String = CountFormat.signedCount(Double(result.irc))
        let pivot: String = CountFormat.signedCount(Double(result.pivot))
        return "Running count \(count) is \(side) the key count \(key) — \(verdict). "
            + "The shoe started at the IRC \(irc) and a full shoe ends at the pivot \(pivot)."
    }

    /// Likewise the deck-speed proof sentence.
    private func deckSpeedProof(_ result: DeckSpeedDrillResult) -> String {
        let burned: String = burnedLabel(result.burnedCard)
        let tag: String = CountFormat.signedCount(system.value(for: result.burnedCard))
        let deck: String = CountFormat.signedCount(result.fullDeckCount)
        let shown: String = CountFormat.signedCount(result.correctRunningCount)
        return "The burned card was the \(burned), worth \(tag). A full deck of this system "
            + "counts \(deck), so the \(result.cards.count) you saw had to come to \(shown)."
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
