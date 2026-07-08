import Foundation
import UserNotifications

/// Persisted settings for the optional daily practice reminder (4.4). Default:
/// off until the user enables it; one daily reminder at the chosen time, opening
/// the chosen trainer tab (the roadmap's resolved default cadence).
struct ReminderSettings: Codable, Equatable {
    var isEnabled: Bool
    var hour: Int
    var minute: Int
    var target: AppTab

    static let `default` = ReminderSettings(
        isEnabled: false,
        hour: 19, // 7:00 PM
        minute: 0,
        target: .strategy
    )
}

/// Builds the reminder's content/trigger and decodes a tapped notification back
/// to a tab. Kept free of any live notification-center state so it's unit-testable.
enum PracticeReminder {
    /// Single fixed identifier — scheduling replaces any existing reminder.
    static let identifier = "blackjack-practice-reminder"
    static let tabUserInfoKey = "tab"
    static let title = "Time to practice"
    static let body = "Keep your blackjack edge sharp with a quick drill."

    /// The tab a tapped reminder should open, or `nil` if the payload is missing
    /// or unrecognized.
    static func tab(from userInfo: [AnyHashable: Any]) -> AppTab? {
        guard let raw = userInfo[tabUserInfoKey] as? String else { return nil }
        return AppTab(rawValue: raw)
    }

    /// A daily-repeating request firing at `hour:minute`, deep-linking to `target`.
    static func request(hour: Int, minute: Int, target: AppTab) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = [tabUserInfoKey: target.rawValue]

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
