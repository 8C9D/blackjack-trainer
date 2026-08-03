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

/// The three published correlations that say what a system is *for*. Choosing
/// between 58 systems is the most consequential setting this app has, and the
/// tags alone do not tell a trainee what they are trading away — these do, and
/// each one lines up with a drill the app already runs. Mirrors `SystemMetrics`.
///
/// All three are correlations in [0, 1], from the same Blackjack Review table
/// the registry came from. They rank a system's *tags*, never a trainee: the
/// perfect betting correlations belong to counts no human can keep.
struct SystemMetrics: Decodable, Equatable {
    /// How closely the count tracks the shifting edge — what the bet is sized
    /// on. The bet-spread drill and the showdown's bet are this in practice.
    let bettingCorrelation: Double
    /// How well the count indexes a playing decision, which is what a deviation
    /// is. The Deviations trainer is this in practice.
    let playingEfficiency: Double
    /// How well the count calls insurance, the one decision that is purely a
    /// count of tens.
    let insuranceCorrelation: Double
}

/// One figure as a label/value pair. Pairs rather than one string so a narrow
/// screen wraps between figures and never inside one. Mirrors
/// `SystemMetricLabel`.
struct SystemMetricLabel: Equatable, Identifiable {
    let label: String
    let value: String

    var id: String {
        label
    }
}

/// A counting-system descriptor decoded verbatim from `counting-systems.json`.
/// Mirrors `counting-system.model.ts` (plus the exporter's derived
/// `isFractional` flag the counting UI keys off).
struct CountingSystem: Decodable, Equatable {
    let id: String
    let name: String
    let description: String
    /// Published correlations — what this system is good at.
    let metrics: SystemMetrics
    let balanced: Bool
    let isFractional: Bool
    /// Per-rank value; `Double` accommodates fractional systems.
    let values: [String: Double]
    /// Optional per-color overrides; absent for rank-only systems.
    let colorValues: [String: ColorValue]?
    /// Optional published IRC/key-count schedule (KO only).
    let keyCounts: KeyCountSchedule?

    /// The three figures as label/value pairs, in the order a trainee meets
    /// them: you size a bet before you play a hand, and you only decide
    /// insurance when the dealer shows an ace. Mirrors `metricsParts`.
    var metricLabels: [SystemMetricLabel] {
        [
            SystemMetricLabel(label: "Betting correlation",
                              value: Self.correlation(metrics.bettingCorrelation)),
            SystemMetricLabel(label: "Playing efficiency",
                              value: Self.correlation(metrics.playingEfficiency)),
            SystemMetricLabel(label: "Insurance correlation",
                              value: Self.correlation(metrics.insuranceCorrelation))
        ]
    }

    /// A correlation as the published table writes it: two decimals, no leading
    /// zero. These are dimensionless figures, never quantities to be summed, so
    /// the leading zero would only suggest arithmetic nobody does on them.
    /// Mirrors `formatCorrelation`.
    static func correlation(_ value: Double) -> String {
        let text = String(format: "%.2f", value)
        return text.hasPrefix("0.") ? String(text.dropFirst()) : text
    }

    /// Per-card count contribution, honoring any color override (the Swift
    /// mirror of `cardCountValue`).
    func value(for card: Card) -> Double {
        if let override = colorValues?[card.rank.rawValue] {
            return card.color == .red ? override.red : override.black
        }
        return values[card.rank.rawValue] ?? 0
    }

    /// Whether this system can host the requested drill mode: true count — and
    /// the bet spread drilled on top of it — requires a balanced system, the
    /// key-count drill a published schedule; running count is always available.
    /// Mirrors the web `modeAllowedFor`.
    func allows(_ mode: DrillMode) -> Bool {
        switch mode {
        // Running count and deck speed: any system's tags can be summed.
        case .runningCount, .deckSpeed: true
        case .trueCount, .betSpread: balanced
        case .keyCount: keyCounts != nil
        }
    }
}

extension Collection<CountingSystem> {
    /// A stored system id resolved against the registry, falling back to Hi-Lo
    /// for an id this build no longer ships. Every screen that reads
    /// `counting.systemId` off the prefs goes through here, so they cannot
    /// disagree about what an unknown id means. Mirrors `countingSystemById`.
    func system(withId id: String) -> CountingSystem? {
        first { $0.id == id } ?? first { $0.id == DeviationIndexSystem.id }
    }
}

/// Top-level shape of `counting-systems.json`.
struct CountingSystemsFile: Decodable {
    let count: Int
    let systems: [CountingSystem]
}
