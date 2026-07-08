import Foundation
import Observation

/// Drives the practice-reminder settings screen (4.4): persists the user's
/// choices and reflects them into the notification scheduler. Enabling requests
/// authorization first; disabling cancels any pending reminder. Settings persist
/// in `UserDefaults`, so the schedule survives across launches independently of
/// this object's lifetime.
@MainActor
@Observable
final class RemindersModel {
    @ObservationIgnored private let scheduler: NotificationScheduling
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let key = "blackjack-practice-reminders"

    private(set) var settings: ReminderSettings
    /// True when the system authorization is denied, so the UI can point the user
    /// to iOS Settings instead of silently failing to schedule.
    var authorizationDenied = false

    init(
        scheduler: NotificationScheduling = SystemNotificationScheduler(),
        defaults: UserDefaults = .standard
    ) {
        self.scheduler = scheduler
        self.defaults = defaults
        if let data = defaults.data(forKey: key),
           let saved = try? JSONDecoder().decode(ReminderSettings.self, from: data) {
            settings = saved
        } else {
            settings = .default
        }
    }

    /// Refresh the denied flag (call when the settings screen appears).
    func refreshAuthorization() async {
        authorizationDenied = await scheduler.authorizationStatus() == .denied
    }

    /// Toggle reminders. Enabling requests authorization first; if it's refused,
    /// the toggle stays off and `authorizationDenied` is set.
    func setEnabled(_ enabled: Bool) async {
        guard enabled else {
            settings.isEnabled = false
            persist()
            scheduler.cancelAll()
            return
        }
        guard await scheduler.requestAuthorization() else {
            authorizationDenied = true
            settings.isEnabled = false
            persist()
            return
        }
        authorizationDenied = false
        settings.isEnabled = true
        persist()
        await reschedule()
    }

    func setTime(hour: Int, minute: Int) async {
        settings.hour = hour
        settings.minute = minute
        persist()
        if settings.isEnabled { await reschedule() }
    }

    func setTarget(_ target: AppTab) async {
        settings.target = target
        persist()
        if settings.isEnabled { await reschedule() }
    }

    private func reschedule() async {
        await scheduler.schedule(
            PracticeReminder.request(
                hour: settings.hour,
                minute: settings.minute,
                target: settings.target
            )
        )
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        defaults.set(data, forKey: key)
    }
}
