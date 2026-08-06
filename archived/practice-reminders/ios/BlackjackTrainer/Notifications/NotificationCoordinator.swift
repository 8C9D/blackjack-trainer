import UserNotifications

/// `UNUserNotificationCenter` delegate: shows reminders while the app is
/// foregrounded. A tapped reminder just brings the app forward — the Flow app
/// always launches into the Open home, so there is no tab to route to.
final class NotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
