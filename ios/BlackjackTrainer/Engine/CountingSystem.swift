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
    /// on.
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

/// One column of the printed tag table: the ranks it covers, and that column's
/// tag for each of the table's rows. Mirrors `SystemTagColumn`.
struct SystemTagColumn: Equatable, Identifiable {
    /// `2–6`, `7`, `10–A` — the ranks that share this column's tags.
    let label: String
    /// One formatted tag per row of the table, in `rowLabels` order.
    let values: [String]

    var id: String {
        label
    }
}

/// Mirrors `SystemTagTable`.
struct SystemTagTable: Equatable {
    /// `Count` for a rank-only system; `Red` and `Black` for a color-dependent
    /// one.
    let rowLabels: [String]
    let columns: [SystemTagColumn]
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

    /// The system's tags as a reference table reads them.
    ///
    /// Every figure comes back through `value(for:)`, the same accessor the
    /// engine counts a shoe with, so the table a trainee memorises cannot drift
    /// from what a miss is graded on — the principle the strategy chart is
    /// already built on.
    ///
    /// Adjacent ranks whose tags all agree share a column, which is how every
    /// published system table prints ("2–6 +1, 7–9 0, 10–A −1") and the only way
    /// thirteen ranks fit a phone. The merge is derived, never assumed — a
    /// system that tagged J apart from 10 would simply print J its own column.
    /// A color-dependent system gets two rows, and a rank only joins a column
    /// when it agrees on both. Mirrors `tagTableFor`.
    var tagTable: SystemTagTable {
        let suits: [Suit] = colorValues == nil ? [.spades] : [.hearts, .spades]
        let rowLabels = colorValues == nil ? ["Count"] : ["Red", "Black"]
        var columns: [SystemTagColumn] = []
        var run: [Rank] = []
        var runValues: [String] = []

        func flush() {
            guard let first = run.first, let last = run.last else { return }
            let label = run.count == 1 ? first.rawValue : "\(first.rawValue)–\(last.rawValue)"
            columns.append(SystemTagColumn(label: label, values: runValues))
        }

        for rank in Card.allRanks {
            let values = suits.map {
                CountFormat.signedCount(value(for: Card(rank: rank, suit: $0)))
            }
            if !run.isEmpty, values == runValues {
                run.append(rank)
                continue
            }
            flush()
            run = [rank]
            runValues = values
        }
        flush()

        return SystemTagTable(rowLabels: rowLabels, columns: columns)
    }

    /// Whether this system can host the requested drill mode: true count
    /// requires a balanced system; running count is always available. Mirrors
    /// the web `modeAllowedFor`.
    func allows(_ mode: DrillMode) -> Bool {
        switch mode {
        // Running count: any system's tags can be summed.
        case .runningCount: true
        case .trueCount: balanced
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
