import SwiftUI
import UserNotifications

/// App entry point. Renders in the appearance the user picked in Settings
/// (system / light / dark, mirroring the web theme preference) and injects the
/// shared `AppModel` (engines + stat stores). The app always launches into the
/// Open home — no tab bar.
@main
struct BlackjackTrainerApp: App {
    @State private var model = AppModel()
    /// Tracks whether a hardware keyboard is attached so trainer screens can
    /// surface their key-hint chips. Held here (and read in `body`) so its
    /// `@Observable` connect/disconnect updates flow into the environment.
    @State private var keyboard = HardwareKeyboardMonitor()
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
                .environment(\.hasHardwareKeyboard, keyboard.isConnected)
                .tint(Theme.accentInk)
                .preferredColorScheme(model.flowPrefs.prefs.theme.colorScheme)
        }
    }
}
