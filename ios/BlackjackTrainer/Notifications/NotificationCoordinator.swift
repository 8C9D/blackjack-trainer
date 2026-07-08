import UserNotifications

/// `UNUserNotificationCenter` delegate: shows reminders while the app is
/// foregrounded and routes a tapped reminder to its trainer tab via `AppRouter`
/// (4.4). Thin by design — the routing decision lives in `PracticeReminder` so
/// it can be unit-tested without the notification system.
final class NotificationCoordinator: NSObject, UNUserNotificationCenterDelegate {
    private let router: AppRouter

    init(router: AppRouter) {
        self.router = router
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        willPresent _: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(
        _: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        guard let tab = PracticeReminder.tab(from: userInfo) else { return }
        await MainActor.run { router.pendingTab = tab }
    }
}
