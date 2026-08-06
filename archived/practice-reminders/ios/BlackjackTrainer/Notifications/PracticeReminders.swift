import Foundation
import UserNotifications

/// Persisted settings for the optional daily practice reminder. Default: off
/// until the user enables it; one daily reminder at the chosen time. A tapped
/// reminder simply opens the app — which always lands on the Open home, so there
/// is no trainer to deep-link (the Flow redesign replaced the tab bar).
struct ReminderSettings: Codable, Equatable {
    var isEnabled: Bool
    var hour: Int
    var minute: Int

    static let `default` = ReminderSettings(
        isEnabled: false,
        hour: 19, // 7:00 PM
        minute: 0
    )
}

/// Builds the reminder's content/trigger. Kept free of any live notification-
/// center state so it's unit-testable. The no-guilt copy is unchanged.
enum PracticeReminder {
    /// Single fixed identifier — scheduling replaces any existing reminder.
    static let identifier = "blackjack-practice-reminder"
    static let title = "Time to practice"
    static let body = "Keep your blackjack edge sharp with a quick drill."

    /// A daily-repeating request firing at `hour:minute`.
    static func request(hour: Int, minute: Int) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        return UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
    }
}

/// Abstraction over `UNUserNotificationCenter` so the reminders model is testable
/// with a fake (mirrors the `CloudKeyValueStore` seam in 4.2).
protocol NotificationScheduling: AnyObject {
    func requestAuthorization() async -> Bool
    func authorizationStatus() async -> UNAuthorizationStatus
    /// Replaces any existing reminder with this one.
    func schedule(_ request: UNNotificationRequest) async
    func cancelAll()
}

/// Real `UNUserNotificationCenter` backing.
final class SystemNotificationScheduler: NotificationScheduling {
    private let center = UNUserNotificationCenter.current()

    func requestAuthorization() async -> Bool {
        await (try? center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await center.notificationSettings().authorizationStatus
    }

    func schedule(_ request: UNNotificationRequest) async {
        center.removeAllPendingNotificationRequests()
        try? await center.add(request)
    }

    func cancelAll() {
        center.removeAllPendingNotificationRequests()
    }
}
