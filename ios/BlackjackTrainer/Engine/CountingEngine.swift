import Foundation

/// Port of the pure counting math from `counting-engine.service.ts`. Per-card
/// values (incl. color overrides) live on `CountingSystem.value(for:)`; this
/// engine sums them and derives the true count. Graded against
/// `counting-vectors.json`.
///
/// The drill-result builders and `validateSettings` (which need the drill /
/// shoe settings types) are ported alongside the Count screen in Slice 3.3; the
/// "KO is running-count-only" restriction is a Count-screen setting (KO is
/// `balanced == false`), not engine math — the engine is system-agnostic, as in
/// the web.
struct CountingEngine {
    /// Sum of per-card values for the system. Empty sequence → 0. `Double`
    /// accommodates fractional systems (Wong Halves).
    func runningCount(_ cards: [Card], system: CountingSystem) -> Double {
        cards.reduce(0) { $0 + system.value(for: $1) }
    }

    /// True count = running count / decks remaining, truncated toward zero
    /// (e.g. −5 over 2 decks → −2, not −3). Mirrors `Math.trunc`.
    func trueCount(runningCount: Double, decksRemaining: Double) -> Int {
        Int((runningCount / decksRemaining).rounded(.towardZero))
    }

    /// Whether a decks-remaining estimate is within the tolerance band of the
    /// actual; the epsilon absorbs floating-point error from `cards / 52`.
    func scoreDeckEstimate(estimate: Double, actual: Double, tolerance: Double = 0.5) -> Bool {
        abs(estimate - actual) <= tolerance + 1e-9
    }

    /// Whether a system assigns any fractional per-card value (judged on the tags
    /// actually counted: scalar values of non-overridden ranks plus the red/black
    /// pair of each color-overridden rank). Mirrors `isFractionalSystem`.
    func isFractionalSystem(_ system: CountingSystem) -> Bool {
        let overridden = Set((system.colorValues ?? [:]).keys)
        var effective: [Double] = []
        for rank in Card.allRanks where !overridden.contains(rank.rawValue) {
            if let value = system.values[rank.rawValue] { effective.append(value) }
        }
        for color in (system.colorValues ?? [:]).values {
            effective.append(color.red)
            effective.append(color.black)
        }
        return effective.contains { $0 != $0.rounded() }
    }

    /// Valid integer running-count answer (optional sign, digits only).
    /// `wholeMatch` anchors to the entire trimmed string.
    func isValidIntegerAnswer(_ raw: String) -> Bool {
        raw.trimmingCharacters(in: .whitespaces).wholeMatch(of: /-?\d+/) != nil
    }

    /// Valid fractional running-count answer (optional sign, integer part, and
    /// optional decimal part) — used by fractional systems like Wong Halves.
    func isValidDecimalAnswer(_ raw: String) -> Bool {
        raw.trimmingCharacters(in: .whitespaces).wholeMatch(of: /-?\d+(\.\d+)?/) != nil
    }
}
