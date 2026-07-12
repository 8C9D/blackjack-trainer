import SwiftUI
import WidgetKit

// MARK: - Timeline

struct FlowEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

/// Reads the shared snapshot on demand. The app refreshes timelines whenever the
/// practice history or daily goal changes (`WidgetCenter.reloadAllTimelines`), so
/// the timeline never needs a scheduled reload — hence `.never`.
struct FlowProvider: TimelineProvider {
    func placeholder(in _: Context) -> FlowEntry {
        FlowEntry(date: .now, snapshot: .empty)
    }

    func getSnapshot(in _: Context, completion: @escaping (FlowEntry) -> Void) {
        completion(FlowEntry(date: .now, snapshot: WidgetSnapshotStore.load()))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<FlowEntry>) -> Void) {
        let entry = FlowEntry(date: .now, snapshot: WidgetSnapshotStore.load())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

// MARK: - Widget

struct BlackjackStatsWidget: Widget {
    let kind = "BlackjackStatsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FlowProvider()) { entry in
            GoalWidgetView(snapshot: entry.snapshot)
                .containerBackground(WidgetTheme.ground, for: .widget)
        }
        .configurationDisplayName("Daily goal")
        .description("Your daily-goal ring and practice streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Theme

private enum WidgetTheme {
    static let ground = Color(rgb: 0x15171C)
    static let raised = Color(rgb: 0x23262D)
    static let ink = Color(rgb: 0xE7E9EE)
    static let muted = Color(rgb: 0x8B909C)
    static let accent = Color(rgb: 0xF2B64C)
    static let good = Color(rgb: 0x4CC38A)
}

private extension Color {
    /// Builds a color from a 0xRRGGBB literal (file-scoped; the app's identical
    /// `Color(hex:)` lives in `Theme.swift`, which the widget target doesn't ship).
    init(rgb: UInt32) {
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: 1
        )
    }
}

// MARK: - Views

struct GoalWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let snapshot: WidgetSnapshot

    var body: some View {
        switch family {
        case .systemSmall:
            SmallGoalView(snapshot: snapshot)
        default:
            MediumGoalView(snapshot: snapshot)
        }
    }
}

private struct SmallGoalView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(spacing: 8) {
            WidgetGoalRing(snapshot: snapshot, size: 82, lineWidth: 9)
            Text(snapshot.streakLabel)
                .font(.caption2)
                .foregroundStyle(WidgetTheme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct MediumGoalView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        HStack(spacing: 20) {
            WidgetGoalRing(snapshot: snapshot, size: 92, lineWidth: 10)
            VStack(alignment: .leading, spacing: 10) {
                Text("Daily goal")
                    .font(.headline)
                    .foregroundStyle(WidgetTheme.ink)
                StreakDotsRow(dots: snapshot.dots)
                Text(snapshot.streakLabel)
                    .font(.subheadline)
                    .foregroundStyle(WidgetTheme.muted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct WidgetGoalRing: View {
    let snapshot: WidgetSnapshot
    let size: CGFloat
    let lineWidth: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(WidgetTheme.raised, lineWidth: lineWidth)
                .padding(lineWidth / 2)
            Circle()
                .trim(from: 0, to: snapshot.goalMet ? 1 : snapshot.fraction)
                .stroke(
                    snapshot.goalMet ? WidgetTheme.good : WidgetTheme.accent,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .padding(lineWidth / 2)
            VStack(spacing: 1) {
                Text("\(snapshot.handsToday)/\(snapshot.dailyGoal)")
                    .font(.system(size: size * 0.2, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(snapshot.goalMet ? "goal met" : "today")
                    .font(.system(size: size * 0.11))
                    .foregroundStyle(WidgetTheme.muted)
            }
            .padding(4)
        }
        .frame(width: size, height: size)
    }
}

private struct StreakDotsRow: View {
    let dots: [Bool]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(dots.enumerated()), id: \.offset) { index, met in
                let isToday = index == dots.count - 1
                Circle()
                    .fill(dotColor(met: met, isToday: isToday))
                    .frame(width: 10, height: 10)
                    .overlay {
                        if isToday {
                            Circle().strokeBorder(WidgetTheme.accent, lineWidth: 2)
                        }
                    }
            }
        }
    }

    private func dotColor(met: Bool, isToday: Bool) -> Color {
        if met { return WidgetTheme.good }
        return isToday ? .clear : WidgetTheme.raised
    }
}

#Preview(as: .systemSmall) {
    BlackjackStatsWidget()
} timeline: {
    FlowEntry(
        date: .now,
        snapshot: WidgetSnapshot(
            handsToday: 8,
            dailyGoal: 20,
            streak: 5,
            dots: [true, true, false, true, true, true, false]
        )
    )
}

#Preview(as: .systemMedium) {
    BlackjackStatsWidget()
} timeline: {
    FlowEntry(
        date: .now,
        snapshot: WidgetSnapshot(
            handsToday: 20,
            dailyGoal: 20,
            streak: 6,
            dots: [true, true, true, true, true, true, true]
        )
    )
}
