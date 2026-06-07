import Foundation

/// Trainer action hotkeys, the Swift mirror of the web's `core/keyboard.ts`
/// single source of truth. Every action has a bound lowercase key; the buttons
/// render the uppercased hint and wire the shortcut for hardware keyboards.
extension Action {
    /// Bound hotkey character (lowercased), mirroring `ACTION_KEY_BINDINGS`
    /// (`h→H, s→S, d→D, p→P, r→SUR, i→INS`).
    var hotkey: Character {
        switch self {
        case .hit: "h"
        case .stand: "s"
        case .double: "d"
        case .split: "p"
        case .surrender: "r"
        case .insurance: "i"
        }
    }

    /// The uppercased key hint shown beside a button label (`[H]`, `[R]`, …).
    var keyHint: String {
        String(hotkey).uppercased()
    }

    /// The full ordered action set, matching the web default
    /// (`['H','S','D','P','SUR','INS']`). Screens pass subsets (e.g. the
    /// showdown's hit/stand-only set).
    static let fullTrainerSet: [Action] = [.hit, .stand, .double, .split, .surrender, .insurance]
}

/// Resolve a raw key string (case-insensitively) to its bound action, or `nil`
/// when nothing is bound — mirrors `actionForKey`.
func actionForKey(_ key: String) -> Action? {
    Action.fullTrainerSet.first { String($0.hotkey) == key.lowercased() }
}
