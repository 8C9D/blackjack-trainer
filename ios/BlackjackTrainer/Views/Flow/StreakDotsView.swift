import SwiftUI

/// Seven-day streak strip: one dot per day (oldest first), filled when that day's
/// goal was met; today is outlined in the accent color and fills only once its
/// goal lands. Mirrors the web `streak-dots` component.
struct StreakDotsView: View {
    let dots: [StreakDot]
    let streak: Int

    private var streakLabel: String {
        streak == 0 ? "No streak yet" : "\(streak)-day streak"
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 7) {
                ForEach(dots, id: \.date) { dot in
                    DotView(dot: dot)
                }
            }
            Text(streakLabel)
                .font(.caption)
                .foregroundStyle(Theme.muted)
        }
        .accessibilityElement()
        .accessibilityLabel(streakLabel)
    }
}

private struct DotView: View {
    let dot: StreakDot

    var body: some View {
        if dot.isToday {
            Circle()
                .fill(dot.met ? Theme.good : Color.clear)
                .frame(width: 8, height: 8)
                .overlay(Circle().strokeBorder(Theme.accentInk, lineWidth: 2))
        } else {
            Circle()
                .fill(dot.met ? Theme.good : Theme.raised)
                .frame(width: 10, height: 10)
        }
    }
}

#Preview {
    let dots = (0 ..< 7).map { i in
        StreakDot(date: "2026-07-0\(i + 1)", hands: 20, met: i < 5, isToday: i == 6)
    }
    return StreakDotsView(dots: dots, streak: 5)
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ground)
        .preferredColorScheme(.dark)
}
