import SwiftUI
import UIKit

/// The Flow redesign's palette, identical to the web design tokens — one
/// semantic token set resolved per color scheme, so every screen follows the
/// user's Appearance choice without knowing about it.
///
/// The split that matters, mirroring `styles.scss`: `accent` is the only accent
/// token that stays amber in both schemes, because it is only ever a large
/// *fill* sitting under `onAccent` text. Everywhere the accent is a foreground
/// (text, a tint, a ring stroke) it uses `accentInk`, which darkens on light
/// backgrounds so it keeps its contrast. `good` / `bad` are foregrounds and are
/// tuned the same way.
enum Theme {
    static let ground = Color(dark: 0x15171C, light: 0xF4F5F8)
    static let surface = Color(dark: 0x1C1F25, light: 0xFFFFFF)
    static let raised = Color(dark: 0x23262D, light: 0xE8EAEF)
    static let hairline = Color(dark: 0x2C3038, light: 0xD3D7DF)
    static let ink = Color(dark: 0xE7E9EE, light: 0x1A1D23)
    /// The highest-contrast ink, for the few figures that need to pop (the goal
    /// ring's count, a highlighted hand value). The web `--ink-strong`.
    static let inkStrong = Color(dark: 0xFFFFFF, light: 0x0B0D11)
    /// A slightly dimmer ink for secondary body text (the web `--ink-2`).
    static let midInk = Color(dark: 0xC6CAD3, light: 0x414753)
    static let muted = Color(dark: 0x8B909C, light: 0x666D7A)
    /// Large accent *fills* only; pair with `onAccent` for text on top.
    static let accent = Color(hex: 0xF2B64C)
    /// The accent as a *foreground* (text, tint, stroke).
    static let accentInk = Color(dark: 0xF2B64C, light: 0x8A5A06)
    /// Text/glyph color on an `accent` fill — dark in both schemes.
    static let onAccent = Color(hex: 0x1A1408)
    static let good = Color(dark: 0x4CC38A, light: 0x0F7247)
    static let bad = Color(dark: 0xE5665F, light: 0xB32B23)

    // Strategy-chart cell fills — one hue per action, always under `ink`.
    // Tints only: the letter carries the meaning, the fill only groups.
    static let chartHit = Color(dark: 0xE5665F, light: 0xB32B23, opacity: 0.16)
    static let chartStand = Color(dark: 0x4CC38A, light: 0x0F7247, opacity: 0.16)
    static let chartDouble = Color(hex: 0xF2B64C, opacity: 0.24)
    static let chartSplit = Color(dark: 0x6096EB, light: 0x2563EB, opacity: 0.2)
    static let chartSurrender = Color(dark: 0x8B909C, light: 0x666D7A, opacity: 0.2)

    /// The fill for a chart cell's action.
    static func chartCell(_ action: Action) -> Color {
        switch action {
        case .hit: chartHit
        case .stand: chartStand
        case .double: chartDouble
        case .split: chartSplit
        case .surrender, .insurance: chartSurrender
        }
    }
}

extension ThemePref {
    /// The scheme to pin the app to; `nil` follows the device setting.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
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

    /// A color that resolves per color scheme, so a single token serves both
    /// themes the way a CSS custom property does on the web.
    init(dark: UInt32, light: UInt32, opacity: Double = 1) {
        self.init(UIColor { traits in
            let hex = traits.userInterfaceStyle == .light ? light : dark
            return UIColor(Color(hex: hex, opacity: opacity))
        })
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

/// The filled amber call-to-action: an accent *fill* carrying `onAccent` text, the
/// one rule the accent token has. `.borderedProminent` alone leaves the label
/// white, which reads at roughly 1.9:1 on amber in either theme, so the label
/// colour is set here rather than left to SwiftUI's default. Mirrors the web
/// `background: var(--accent); color: var(--on-accent)`.
struct AccentFilledButton: ViewModifier {
    func body(content: Content) -> some View {
        content
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .foregroundStyle(Theme.onAccent)
    }
}

extension View {
    func appBackground() -> some View {
        modifier(AppBackground())
    }

    func accentFilledButton() -> some View {
        modifier(AccentFilledButton())
    }
}
