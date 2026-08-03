import Foundation

/// The player's bet spread: how many units to put out at each true count.
///
/// Deliberately NOT a computed optimum. What to bet follows from bankroll, risk
/// of ruin, the rules of the game, and how much spread the table will tolerate —
/// none of which this app knows — so the drill grades the bet against the ramp
/// the player configured. The default is the textbook 1-2-4-8-12 spread quoted
/// for a six-deck shoe. Mirrors the web `bet-ramp.model.ts`.
///
/// Five bands, because the ramp flattens once the count is high: everything at
/// or below +1 is the table minimum (no advantage yet), then one band per true
/// count to +4, then a top band for +5 and up.
enum BetRamp {
    static let bandLabels = ["TC ≤ +1", "TC +2", "TC +3", "TC +4", "TC +5 or more"]
    static let bands = bandLabels.count
    static let `default` = [1, 2, 4, 8, 12]
    static let minUnits = 1
    static let maxUnits = 100

    /// Bets are whole units, and the singular reads oddly as "1 units".
    static func unitsLabel(_ count: Int) -> String {
        count == 1 ? "1 unit" : "\(count) units"
    }

    /// Which band a true count falls in (true counts arrive already truncated).
    static func bandIndex(trueCount: Int) -> Int {
        min(bands - 1, max(0, trueCount - 1))
    }

    /// The units the ramp calls for at this true count.
    static func units(trueCount: Int, ramp: [Int]) -> Int {
        ramp[bandIndex(trueCount: trueCount)]
    }

    /// Bounds errors only — a ramp is a judgment call, and the only thing that
    /// makes one unusable is a unit count outside the supported range. Betting
    /// *less* at a higher count is almost certainly a mistake but it is the
    /// player's to make, so Settings notes it (see `shrinks`) rather than
    /// blocking the drill.
    static func validate(_ ramp: [Int]) -> [String] {
        if ramp.count != bands {
            return ["A bet spread needs one entry per band (\(bands))."]
        }
        let inRange = ramp.allSatisfy { $0 >= minUnits && $0 <= maxUnits }
        return inRange ? [] : ["Bet spread units must be whole numbers between "
            + "\(minUnits) and \(maxUnits)."]
    }

    /// Whether the ramp bets fewer units at some higher band than at a lower one.
    static func shrinks(_ ramp: [Int]) -> Bool {
        ramp.enumerated().contains { index, units in index > 0 && units < ramp[index - 1] }
    }

    /// Field-by-field coercion of an untrusted stored ramp: each band falls back
    /// to its default rather than the whole ramp being discarded.
    static func normalized(_ value: Any?) -> [Int] {
        guard let stored = value as? [Any] else { return `default` }
        return `default`.enumerated().map { index, fallback in
            guard index < stored.count,
                  let number = stored[index] as? NSNumber,
                  CFGetTypeID(number) != CFBooleanGetTypeID() else { return fallback }
            let units = number.doubleValue
            guard units.isFinite, units == units.rounded(),
                  Int(units) >= minUnits, Int(units) <= maxUnits else { return fallback }
            return Int(units)
        }
    }
}
