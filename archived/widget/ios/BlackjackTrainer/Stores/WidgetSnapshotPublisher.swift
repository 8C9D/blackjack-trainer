import Foundation
import WidgetKit

/// Builds the widget snapshot from the practice history and the daily goal, writes
/// it to the shared App Group container whenever either changes, then asks
/// WidgetKit to refresh. Owned by `AppModel` for the app's lifetime — the widget
/// analogue of `StatsCloudSync`. Inert beyond a local plist until the App Group is
/// provisioned (see the progress log's pending actions).
final class WidgetSnapshotPublisher {
    private let history: PracticeHistoryStore
    private let prefs: FlowPrefsStore
    private let write: (WidgetSnapshot) -> Void
    private let reload: () -> Void

    init(
        history: PracticeHistoryStore,
        prefs: FlowPrefsStore,
        write: @escaping (WidgetSnapshot) -> Void = { WidgetSnapshotStore.save($0) },
        reload: @escaping () -> Void = { WidgetCenter.shared.reloadAllTimelines() }
    ) {
        self.history = history
        self.prefs = prefs
        self.write = write
        self.reload = reload
        history.onChange = { [weak self] in self?.publish() }
        prefs.onChange = { [weak self] in self?.publish() }
        publish() // seed the snapshot at launch (after any cloud adoption)
    }

    /// The current Flow-home snapshot assembled from the history and daily goal.
    func snapshot() -> WidgetSnapshot {
        let goal = prefs.prefs.dailyGoal
        return WidgetSnapshot(
            handsToday: history.handsToday(),
            dailyGoal: goal,
            streak: history.streak(goal: goal),
            dots: history.last7(goal: goal).map(\.met),
            dayKey: WidgetSnapshot.dayKey(for: .now)
        )
    }

    /// Write the snapshot and refresh the widget timelines.
    func publish() {
        write(snapshot())
        reload()
    }
}
