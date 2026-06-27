import SwiftUI

/// Dark color tokens mirroring the web app's casino-green palette
/// (`#0a3a22` background, `#0f4a2c` felt, `#f4f4f4` text).
enum Theme {
    static let background = Color(hex: 0x0A3A22)
    static let felt = Color(hex: 0x0F4A2C)
    static let surface = Color(hex: 0x0D4327)
    static let surfaceRaised = Color(hex: 0x115A36)
    static let primaryText = Color(hex: 0xF4F4F4)
    static let secondaryText = Color(hex: 0xF4F4F4).opacity(0.7)
    static let accent = Color(hex: 0x4F8CFF) // brightened web blue for legibility on green
    static let correct = Color(hex: 0x66BB6A)
    static let incorrect = Color(hex: 0xEF6E6E)
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
            .background(Theme.background.ignoresSafeArea())
    }
}

extension View {
    func appBackground() -> some View {
        modifier(AppBackground())
    }
}
