import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration

/// Lets the user pick which trainer the widget shows. The cases/order come from
/// the shared `WidgetTrainer`; only the display strings live here.
extension WidgetTrainer: AppEnum {
    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        "Trainer"
    }

    static var caseDisplayRepresentations: [WidgetTrainer: DisplayRepresentation] {
        [
            .basicStrategy: "Basic Strategy",
            .runningCount: "Running Count",
            .trueCount: "True Count",
            .deviations: "Deviations",
            .deckEstimation: "Deck Estimation"
        ]
    }
}

/// The widget's configuration intent — the trainer whose stats to display.
struct SelectTrainerIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource {
        "Select Trainer"
    }

    static var description: IntentDescription {
        IntentDescription("Choose which trainer's stats to display.")
    }

    @Parameter(title: "Trainer", default: .basicStrategy)
    var trainer: WidgetTrainer
}

// MARK: - Timeline

struct StatsEntry: TimelineEntry {
    let date: Date
    let trainer: WidgetTrainer
    let stat: WidgetTrainerStat
}

/// Reads the shared snapshot on demand. The app refreshes timelines on every
/// stat change (`WidgetCenter.reloadAllTimelines`), so the timeline never needs a
/// scheduled reload — hence `.never`.
struct StatsProvider: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> StatsEntry {
        StatsEntry(date: .now, trainer: .basicStrategy, stat: .empty)
    }

    func snapshot(for configuration: SelectTrainerIntent, in _: Context) async -> StatsEntry {
        entry(for: configuration.trainer)
    }

    func timeline(
        for configuration: SelectTrainerIntent,
        in _: Context
    ) async -> Timeline<StatsEntry> {
        Timeline(entries: [entry(for: configuration.trainer)], policy: .never)
    }

    private func entry(for trainer: WidgetTrainer) -> StatsEntry {
        let snapshot = WidgetSnapshotStore.load()
        return StatsEntry(date: .now, trainer: trainer, stat: snapshot.stat(for: trainer))
    }
}

// MARK: - Widget

struct BlackjackStatsWidget: Widget {
    let kind = "BlackjackStatsWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: SelectTrainerIntent.self,
            provider: StatsProvider()
        ) { entry in
            StatsWidgetView(entry: entry)
                .containerBackground(WidgetTheme.background, for: .widget)
        }
        .configurationDisplayName("Trainer Stats")
        .description("Your accuracy and current streak for a chosen trainer.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Views

private enum WidgetTheme {
    static let background = Color(rgb: 0x0A3A22) // mirrors the app's Theme palette
    static let primaryText = Color(rgb: 0xF4F4F4)
    static let secondaryText = Color(rgb: 0xF4F4F4).opacity(0.7)
    static let accent = Color(rgb: 0x4F8CFF)
    static let positive = Color(rgb: 0x66BB6A)
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

struct StatsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StatsEntry

    var body: some View {
        switch family {
        case .systemSmall: SmallStatsView(entry: entry)
        default: MediumStatsView(entry: entry)
        }
    }
}

/// Compact layout: trainer name, big accuracy, streak.
private struct SmallStatsView: View {
    let entry: StatsEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(entry.trainer.shortTitle)
                .font(.caption.weight(.semibold))
                .foregroundStyle(WidgetTheme.secondaryText)
            Spacer(minLength: 0)
            Text(entry.stat.accuracyDisplay)
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .foregroundStyle(WidgetTheme.primaryText)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text("Accuracy")
                .font(.caption2)
                .foregroundStyle(WidgetTheme.secondaryText)
            Spacer(minLength: 0)
            streakLabel
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var streakLabel: some View {
        Label("\(entry.stat.currentStreak) streak", systemImage: "flame.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(WidgetTheme.positive)
            .labelStyle(.titleAndIcon)
    }
}

/// Wider layout: trainer title plus accuracy / streak / hands cells.
private struct MediumStatsView: View {
    let entry: StatsEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(entry.trainer.title)
                .font(.headline)
                .foregroundStyle(WidgetTheme.primaryText)
            HStack(alignment: .top, spacing: 16) {
                cell("Accuracy", entry.stat.accuracyDisplay, tint: WidgetTheme.accent)
                cell("Streak", "\(entry.stat.currentStreak)", tint: WidgetTheme.positive)
                cell("Hands", "\(entry.stat.attempts)", tint: WidgetTheme.primaryText)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func cell(_ label: String, _ value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(tint)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(label)
                .font(.caption)
                .foregroundStyle(WidgetTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview(as: .systemSmall) {
    BlackjackStatsWidget()
} timeline: {
    StatsEntry(
        date: .now,
        trainer: .basicStrategy,
        stat: WidgetTrainerStat(attempts: 40, correct: 35, currentStreak: 6)
    )
}

#Preview(as: .systemMedium) {
    BlackjackStatsWidget()
} timeline: {
    StatsEntry(
        date: .now,
        trainer: .trueCount,
        stat: WidgetTrainerStat(attempts: 0, correct: 0, currentStreak: 0)
    )
}
