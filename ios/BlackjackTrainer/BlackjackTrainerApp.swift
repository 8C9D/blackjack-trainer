import SwiftUI
import UserNotifications

/// App entry point. Runs in a dark color scheme to mirror the web Blackjack
/// Trainer and injects the shared `AppModel` (engines + stat stores) and the
/// `AppRouter` (so a tapped practice reminder can route to a tab, 4.4).
@main
struct BlackjackTrainerApp: App {
    @State private var model = AppModel()
    @State private var router: AppRouter
    /// Retained for the app's lifetime — `UNUserNotificationCenter.delegate` is
    /// weak, so the coordinator must be held here to keep receiving taps.
    private let notificationCoordinator: NotificationCoordinator

    init() {
        let router = AppRouter()
        _router = State(initialValue: router)
        let coordinator = NotificationCoordinator(router: router)
        notificationCoordinator = coordinator
        UNUserNotificationCenter.current().delegate = coordinator
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(model)
                .environment(router)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
        }
    }
}
