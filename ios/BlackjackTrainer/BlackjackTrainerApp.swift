import SwiftUI

/// App entry point. The whole app runs in a dark color scheme to mirror the
/// web Blackjack Trainer.
@main
struct BlackjackTrainerApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
                .preferredColorScheme(.dark)
        }
    }
}
