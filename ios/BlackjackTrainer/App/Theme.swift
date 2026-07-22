import SwiftUI

/// The Flow redesign's dark palette, identical to the web design tokens. A
/// single amber accent marks active/primary/progress only; green/red are the
/// correct/wrong verdict colors.
enum Theme {
    static let ground = Color(hex: 0x15171C)
    static let surface = Color(hex: 0x1C1F25)
    static let raised = Color(hex: 0x23262D)
    static let hairline = Color(hex: 0x2C3038)
    static let ink = Color(hex: 0xE7E9EE)
    /// A slightly dimmer ink for secondary body text (the web `#c6cad3`).
    static let midInk = Color(hex: 0xC6CAD3)
    static let muted = Color(hex: 0x8B909C)
    static let accent = Color(hex: 0xF2B64C)
    static let good = Color(hex: 0x4CC38A)
    static let bad = Color(hex: 0xE5665F)
}

extension Color {
    /// Builds a color from a 0xRRGGBB literal.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

/// Applies the themed dark background, ignoring the safe area, behind a screen's
/// content. Reused by the trainer screens.
struct AppBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.ground.ignoresSafeArea())
    }
}

extension View {
    func appBackground() -> some View {
        modifier(AppBackground())
    }
}
