import SwiftUI
import UserNotifications

/// App entry point. Runs in a dark color scheme to mirror the web Flow redesign
/// and injects the shared `AppModel` (engines + stat stores). The app always
/// launches into the Open home — no tab bar.
@main
struct BlackjackTrainerApp: App {
    @State private var model = AppModel()
    /// Retained for the app's lifetime — `UNUserNotificationCenter.delegate` is
    /// weak, so the coordinator must be held here to keep presenting reminders.
    private let notificationCoordinator = NotificationCoordinator()

    init() {
        UNUserNotificationCenter.current().delegate = notificationCoordinator
    }

    var body: some Scene {
        WindowGroup {
            FlowRootView()
                .environment(model)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
        }
    }
}
