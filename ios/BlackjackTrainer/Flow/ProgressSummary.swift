import Foundation

/// One row of the Progress screen's trainer table: a stat store's lifetime
/// numbers. `accuracy` is nil until the store has an attempt.
struct ProgressStatRow: Identifiable {
    var id: String {
        label
    }

    let label: String
    let attempts: Int
    let accuracy: Int?
    let best: Int
}

/// One bar of the week strip.
struct ProgressDayBar: Identifiable {
    var id: String {
        date
    }

    let date: String
    let weekday: String
    let hands: Int
    let met: Bool
    let isToday: Bool
    /// Height as a fraction (0…1) of the goal or the week's peak, whichever is
    /// larger.
    let height: Double
}

/// Weak spots are per trainer, and naming the trainer is what makes the list
/// actionable ("16 vs 10" means different work in each drill).
struct ProgressWeakGroup: Identifiable {
    var id: String {
        trainer
    }

    let trainer: String
    let outstanding: [WeakSpot]
    let cleared: [WeakSpot]
}

/// The pure half of the Progress screen, mirroring the web
/// `progress-page.component`'s helpers.
enum ProgressSummary {
    /// Cleared scenarios named before the line collapses to a count.
    static let clearedShown = 3

    static func row(_ label: String, _ stats: SessionStats) -> ProgressStatRow {
        ProgressStatRow(
            label: label,
            attempts: stats.attempts,
            accuracy: stats.attempts == 0
                ? nil
                : Int((Double(stats.correct) / Double(stats.attempts) * 100).rounded()),
            best: stats.longestStreak
        )
    }

    /// Scaled against the goal as well as the week's peak, so a week spent under
    /// the goal doesn't render as a full-height bar.
    static func bars(dots: [StreakDot], goal: Int) -> [ProgressDayBar] {
        let peak = max(goal, dots.map(\.hands).max() ?? 0, 1)
        return dots.map { dot in
            ProgressDayBar(
                date: dot.date,
                weekday: weekdayInitial(dot.date),
                hands: dot.hands,
                met: dot.met,
                isToday: dot.isToday,
                height: dot.hands == 0 ? 0 : max(0.06, Double(dot.hands) / Double(peak))
            )
        }
    }

    /// "2026-08-02" → "S". Parsed as a local date so the letter matches the day
    /// the hands were recorded on.
    static func weekdayInitial(_ dateKey: String) -> String {
        let parts = dateKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return "" }
        var components = DateComponents()
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        guard let date = Calendar.current.date(from: components) else { return "" }
        return String(date.formatted(.dateTime.weekday(.narrow)).prefix(1))
    }

    /// "16 vs 10 · A,7 vs 9 · +2 more", or "" when nothing was cleared.
    static func clearedLabel(_ cleared: [WeakSpot]) -> String {
        guard !cleared.isEmpty else { return "" }
        let shown = cleared.prefix(clearedShown).map(\.label)
        let rest = cleared.count - shown.count
        return rest > 0 ? "\(shown.joined(separator: " · ")) · +\(rest) more" : shown
            .joined(separator: " · ")
    }

    /// A signed chip total: "+45", "-20", "0".
    static func signed(_ net: Double) -> String {
        CountFormat.signedCount(net)
    }
}
