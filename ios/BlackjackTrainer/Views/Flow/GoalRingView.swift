import SwiftUI

/// Daily-goal progress ring (Home + Done). The fill sweeps clockwise from the
/// top in the accent color; a met goal turns the whole ring green. Mirrors the
/// web `goal-ring` component.
struct GoalRingView: View {
    let value: Int
    let goal: Int
    var label: String = "hands today"

    // Scaled with the count's text style so the numbers still fit inside the
    // ring at the accessibility sizes.
    @ScaledMetric(relativeTo: .title2) private var ringWidth: CGFloat = 13
    @ScaledMetric(relativeTo: .title2) private var diameter: CGFloat = 128

    private var met: Bool {
        value >= goal
    }

    private var fraction: Double {
        guard goal > 0 else { return 1 }
        return min(1, Double(value) / Double(goal))
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.raised, lineWidth: ringWidth)
                .padding(ringWidth / 2)
            Circle()
                .trim(from: 0, to: met ? 1 : fraction)
                .stroke(
                    met ? Theme.good : Theme.accentInk,
                    style: StrokeStyle(lineWidth: ringWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .padding(ringWidth / 2)
            VStack(spacing: 2) {
                Text("\(value)/\(goal)")
                    .font(.title2.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.inkStrong)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, ringWidth * 1.5)
        }
        .frame(width: diameter, height: diameter)
        .accessibilityElement()
        .accessibilityLabel("\(value) of \(goal) \(label)")
    }
}

#Preview {
    HStack(spacing: 24) {
        GoalRingView(value: 8, goal: 20)
        GoalRingView(value: 20, goal: 20, label: "goal met")
    }
    .padding()
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Theme.ground)
    .preferredColorScheme(.dark)
}
