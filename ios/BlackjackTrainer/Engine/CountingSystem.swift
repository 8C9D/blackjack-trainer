import Foundation

/// Per-color tags for color-dependent systems (Red Seven, KISS). Values are
/// `Double` because a fractional system (Wong Halves) uses halves.
struct ColorValue: Decodable, Equatable {
    let red: Double
    let black: Double
}

/// Published IRC/key-count schedule for an unbalanced system drilled by
/// running count alone (KO). Deck counts arrive as JSON object keys, i.e.
/// strings; the resolvers below take integers. Mirrors `KeyCountSchedule`.
struct KeyCountSchedule: Decodable, Equatable {
    /// Initial running count for a fresh shoe, keyed by number of decks.
    let irc: [String: Int]
    /// Running count at or above which the player has the advantage.
    let keyCount: [String: Int]
    /// The count every shoe converges to once fully dealt.
    let pivot: Int
    /// Take insurance at or above this running count, regardless of decks.
    let insuranceCount: Int

    /// The schedule row for a shoe size, or nil when the source publishes no
    /// values for it.
    func resolved(decks: Int) -> ResolvedKeyCounts? {
        guard let irc = irc[String(decks)], let key = keyCount[String(decks)] else { return nil }
        return ResolvedKeyCounts(
            irc: irc,
            keyCount: key,
            pivot: pivot,
            insuranceCount: insuranceCount
        )
    }
}

/// A `KeyCountSchedule` resolved for one shoe size — the row the drill and its
/// feedback actually consume.
struct ResolvedKeyCounts: Equatable {
    let irc: Int
    let keyCount: Int
    let pivot: Int
    let insuranceCount: Int
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
    /// Optional published IRC/key-count schedule (KO only).
    let keyCounts: KeyCountSchedule?

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
