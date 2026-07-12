import SwiftUI

/// Session-end screen (peak-end rule): the completed ring and the session's best
/// numbers, one queued weakness for next time, a primary "One more round", and an
/// always-first-class "Done for today". Never a confirmation dialog, never guilt
/// copy. Mirrors the web `flow-done` component.
struct FlowDoneView: View {
    let hands: Int
    let target: Int
    var goalMet: Bool = true
    let bestStreak: Int
    /// Session accuracy percentage (0–100), or nil when nothing was answered.
    let accuracy: Int?
    var weakSpot: WeakSpot?
    let onAgain: () -> Void
    let onExit: () -> Void

    private let buttonBrown = Color(hex: 0x1A1408)

    private var peakText: Text {
        let base = Text("Best streak: ")
            + Text("\(bestStreak)").bold().foregroundStyle(Theme.good)
        guard let accuracy else { return base }
        return base + Text(" · \(accuracy)% today")
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
                weakCard(weakSpot)
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

    private func weakCard(_ weak: WeakSpot) -> some View {
        VStack(spacing: 3) {
            (Text("Drill next: ") + Text(weak.label).bold().foregroundStyle(Theme.accent))
                .font(.system(size: 14))
                .foregroundStyle(Theme.midInk)
            Text("missed \(weak.misses) of \(weak.attempts) this week")
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
        onAgain: {},
        onExit: {}
    )
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
