import SwiftUI

/// How many cleared scenarios are named before the line collapses to a count.
private let clearedShown = 3

/// Session-end screen (peak-end rule): the completed ring and the session's best
/// numbers, the queued weakness as something you can act on now, the week's
/// cleared scenarios, a primary "One more round", and an always-first-class
/// "Done for today". Never a confirmation dialog, never guilt copy. Mirrors the
/// web `flow-done` component.
struct FlowDoneView: View {
    let hands: Int
    let target: Int
    var goalMet: Bool = true
    let bestStreak: Int
    /// Session accuracy percentage (0–100), or nil when nothing was answered.
    let accuracy: Int?
    /// Seconds the round's middle decision took, or nil when none were timed.
    /// Reported, not judged: how fast is fast enough is a table's question, and
    /// the app has no published number to hold a trainee to.
    var medianSeconds: Double?
    var weakSpot: WeakSpot?
    /// Every outstanding weak spot, worst first — `weakSpot` is its head. Only the
    /// count is shown; the list is what a review round would draw from.
    var weakSpots: [WeakSpot] = []
    /// Scenarios missed this week and since cleared.
    var cleared: [WeakSpot] = []
    let onAgain: () -> Void
    var onReview: () -> Void = {}
    let onExit: () -> Void

    private let buttonBrown = Color(hex: 0x1A1408)

    private var peakText: Text {
        let base = Text("Best streak: ")
            + Text("\(bestStreak)").bold().foregroundStyle(Theme.good)
        // Built as strings and folded in, rather than reassigned: `Text` has no
        // `+=`, and a long chain of `+` is what makes this file slow to
        // type-check.
        return peakSuffixes.reduce(base) { $0 + Text($1) }
    }

    private var peakSuffixes: [String] {
        var parts: [String] = []
        if let accuracy {
            parts.append(" · \(accuracy)% today")
        }
        if let medianSeconds {
            parts.append(" · \(Self.secondsLabel(medianSeconds))s a hand")
        }
        return parts
    }

    /// One decimal, and no trailing `.0` — "3s a hand", not "3.0s a hand".
    static func secondsLabel(_ seconds: Double) -> String {
        seconds == seconds.rounded()
            ? String(Int(seconds.rounded()))
            : String(format: "%.1f", seconds)
    }

    private var othersLabel: String {
        let others = max(0, weakSpots.count - 1)
        return others == 0 ? "" : " · +\(others) more"
    }

    /// "16 vs 10 · A,7 vs 9 · +2 more", or nil when nothing was cleared.
    private var clearedLabel: String? {
        if cleared.isEmpty { return nil }
        let shown = cleared.prefix(clearedShown).map(\.label)
        let rest = cleared.count - shown.count
        let joined = shown.joined(separator: " · ")
        return rest > 0 ? "\(joined) · +\(rest) more" : joined
    }

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            GoalRingView(value: hands, goal: target, label: goalMet ? "goal met" : "hands today")

            peakText
                .font(.system(size: 15))
                .foregroundStyle(Theme.midInk)
                .multilineTextAlignment(.center)

            if let weakSpot {
                Button(action: onReview) { weakCard(weakSpot) }
                    .buttonStyle(.plain)
            }

            if let clearedLabel {
                (Text("Cleared: ") + Text(clearedLabel).bold().foregroundStyle(Theme.good))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
            }

            Button(action: onAgain) {
                Text("One more round")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(buttonBrown)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 52)
                    .background(Theme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .frame(maxWidth: 320)
            .padding(.top, 4)

            Button(action: onExit) {
                Text("Done for today")
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.muted)
                    .padding(.vertical, 6)
            }
            .buttonStyle(.plain)

            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Session complete")
    }

    /// The queued weakness is a control, not a caption: the round it promises can
    /// start from here. Styled as a quiet card so "One more round" stays the
    /// screen's one loud action.
    private func weakCard(_ weak: WeakSpot) -> some View {
        VStack(spacing: 3) {
            (Text("Drill my misses: ") + Text(weak.label).bold().foregroundStyle(Theme.accentInk))
                .font(.system(size: 14))
                .foregroundStyle(Theme.midInk)
            Text("missed \(weak.misses) of \(weak.attempts) this week\(othersLabel)")
                .font(.system(size: 11.5))
                .foregroundStyle(Theme.muted)
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minWidth: 260)
        .background(Theme.surface)
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.hairline, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    FlowDoneView(
        hands: 20,
        target: 20,
        goalMet: true,
        bestStreak: 7,
        accuracy: 86,
        weakSpot: WeakSpot(
            ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
            label: "16 vs 10",
            misses: 3,
            attempts: 7
        ),
        weakSpots: [
            WeakSpot(
                ref: ScenarioRef(kind: "hard", hand: "16", dealer: "10"),
                label: "16 vs 10",
                misses: 3,
                attempts: 7
            ),
            WeakSpot(
                ref: ScenarioRef(kind: "pair", hand: "8", dealer: "10"),
                label: "8,8 vs 10",
                misses: 1,
                attempts: 4
            )
        ],
        cleared: [
            WeakSpot(
                ref: ScenarioRef(kind: "soft", hand: "18", dealer: "9"),
                label: "A,7 vs 9",
                misses: 1,
                attempts: 6,
                streak: 3
            )
        ],
        onAgain: {},
        onReview: {},
        onExit: {}
    )
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
