import GameController
import Observation
import SwiftUI

/// Tracks whether a hardware keyboard is currently attached. Trainer screens use
/// it to show key-hint chips only when they help (mirroring the web hiding hint
/// chips on touch); the `.keyboardShortcut` bindings themselves are always wired.
@Observable
final class HardwareKeyboardMonitor {
    private(set) var isConnected: Bool = GCKeyboard.coalesced != nil

    init() {
        NotificationCenter.default.addObserver(
            forName: .GCKeyboardDidConnect, object: nil, queue: .main
        ) { [weak self] _ in
            self?.isConnected = true
        }
        NotificationCenter.default.addObserver(
            forName: .GCKeyboardDidDisconnect, object: nil, queue: .main
        ) { [weak self] _ in
            self?.isConnected = GCKeyboard.coalesced != nil
        }
    }
}

private struct HasHardwareKeyboardKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Whether a hardware keyboard is attached; defaults to `false` (touch).
    var hasHardwareKeyboard: Bool {
        get { self[HasHardwareKeyboardKey.self] }
        set { self[HasHardwareKeyboardKey.self] = newValue }
    }
}
