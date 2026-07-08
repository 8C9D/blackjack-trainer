import Foundation
import WidgetKit

/// Builds the widget snapshot from the live session-stat stores and writes it to
/// the shared App Group container whenever a stat changes, then asks WidgetKit to
/// refresh. Owned by `AppModel` for the app's lifetime — the widget analogue of
/// `StatsCloudSync`. Inert beyond a local plist until the App Group is
/// provisioned (see the progress log's pending actions).
final class WidgetSnapshotPublisher {
    /// A trainer paired with the store holding its session stats.
    struct Source {
        let trainer: WidgetTrainer
        let store: SessionStatsStore
    }

    private let sources: [Source]
    private let write: (WidgetSnapshot) -> Void
    private let reload: () -> Void

    init(
        sources: [Source],
        write: @escaping (WidgetSnapshot) -> Void = { WidgetSnapshotStore.save($0) },
        reload: @escaping () -> Void = { WidgetCenter.shared.reloadAllTimelines() }
    ) {
        self.sources = sources
        self.write = write
        self.reload = reload
        for source in sources {
            source.store.onChange = { [weak self] in self?.publish() }
        }
        publish() // seed the snapshot at launch (after any cloud adoption)
    }

    /// The current snapshot assembled from the stores.
    func snapshot() -> WidgetSnapshot {
        var trainers: [String: WidgetTrainerStat] = [:]
        for source in sources {
            let stats = source.store.stats
            trainers[source.trainer.rawValue] = WidgetTrainerStat(
                attempts: stats.attempts,
                correct: stats.correct,
                currentStreak: stats.streak
            )
        }
        return WidgetSnapshot(trainers: trainers)
    }

    /// Write the snapshot and refresh the widget timelines.
    func publish() {
        write(snapshot())
        reload()
    }
}
