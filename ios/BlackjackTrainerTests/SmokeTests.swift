import SwiftUI
import Testing
@testable import BlackjackTrainer

/// Phase 0 smoke test: proves the app module is testable-importable and the
/// root view instantiates. The real engine parity tests (graded by the exported
/// fixtures) arrive in Phase 1.
@MainActor
struct SmokeTests {
    @Test func rootViewInstantiates() {
        _ = RootTabView()
        #expect(Bool(true))
    }
}
