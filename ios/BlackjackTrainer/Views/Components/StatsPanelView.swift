import SwiftUI

/// Session statistics panel with a reset button, mirroring the web
/// `app-stats-panel`. Accuracy is shown as a rounded percentage, or an em dash
/// before any attempts; reset is disabled until there is something to clear.
struct StatsPanelView: View {
    let stats: SessionStats
    var title: String?
    let onReset: () -> Void

    private let columns = [GridItem(.adaptive(minimum: 88), alignment: .leading)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Theme.primaryText)
            }
            LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
                cell("Attempts", "\(stats.attempts)")
                cell("Correct", "\(stats.correct)")
                cell("Accuracy", Self.accuracyDisplay(stats))
                cell("Streak", "\(stats.streak)")
                cell("Longest", "\(stats.longestStreak)")
            }
            Button("Reset stats", role: .destructive, action: onReset)
                .buttonStyle(.bordered)
                .tint(Theme.incorrect)
                .disabled(stats.attempts == 0)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func cell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.secondaryText)
            Text(value)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Theme.primaryText)
        }
        .accessibilityElement(children: .combine)
    }

    /// Rounded accuracy percentage, or an em dash before any attempts. Mirrors
    /// the web `accuracyDisplay` (`Math.round((correct / attempts) * 100)`).
    static func accuracyDisplay(_ stats: SessionStats) -> String {
        guard stats.attempts > 0 else { return "—" }
        let percent = (Double(stats.correct) / Double(stats.attempts) * 100).rounded()
        return "\(Int(percent))%"
    }
}

#Preview {
    VStack(spacing: 20) {
        StatsPanelView(stats: .empty, title: "Basic Strategy", onReset: {})
        StatsPanelView(
            stats: SessionStats(attempts: 8, correct: 6, streak: 2, longestStreak: 4),
            onReset: {}
        )
    }
    .padding()
    .appBackground()
    .preferredColorScheme(.dark)
}
