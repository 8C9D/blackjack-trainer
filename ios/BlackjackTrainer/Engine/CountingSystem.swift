import Foundation

/// Per-color tags for color-dependent systems (Red Seven, KISS). Values are
/// `Double` because a fractional system (Wong Halves) uses halves.
struct ColorValue: Decodable, Equatable {
    let red: Double
    let black: Double
}

/// A counting-system descriptor decoded verbatim from `counting-systems.json`.
/// Mirrors `counting-system.model.ts` (plus the exporter's derived
/// `isFractional` flag the counting UI keys off).
struct CountingSystem: Decodable, Equatable {
    let id: String
    let name: String
    let description: String
    let balanced: Bool
    let isFractional: Bool
    /// Per-rank value; `Double` accommodates fractional systems.
    let values: [String: Double]
    /// Optional per-color overrides; absent for rank-only systems.
    let colorValues: [String: ColorValue]?

    /// Per-card count contribution, honoring any color override (the Swift
    /// mirror of `cardCountValue`).
    func value(for card: Card) -> Double {
        if let override = colorValues?[card.rank.rawValue] {
            return card.color == .red ? override.red : override.black
        }
        return values[card.rank.rawValue] ?? 0
    }
}

/// Top-level shape of `counting-systems.json`.
struct CountingSystemsFile: Decodable {
    let count: Int
    let systems: [CountingSystem]
}
