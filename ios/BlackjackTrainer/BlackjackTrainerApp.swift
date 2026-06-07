import SwiftUI

/// App entry point. Runs in a dark color scheme to mirror the web Blackjack
/// Trainer and injects the shared `AppModel` (engines + stat stores).
@main
struct BlackjackTrainerApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(model)
                .tint(Theme.accent)
                .preferredColorScheme(.dark)
        }
    }
}
