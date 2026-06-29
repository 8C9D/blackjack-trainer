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

    // MARK: - drill-result builders (Slice 3.3)

    /// Grade a running-count answer against the sequence. Carries the cards so
    /// the feedback breakdown needs no recompute. Mirrors `evaluate`.
    func evaluate(
        _ cards: [Card],
        userRunningCount: Double,
        system: CountingSystem
    ) -> RunningCountDrillResult {
        let correct = runningCount(cards, system: system)
        return RunningCountDrillResult(
            cards: cards,
            correctRunningCount: correct,
            userRunningCount: userRunningCount,
            isCorrect: userRunningCount == correct
        )
    }

    /// Grade a true-count answer against the truncated true count derived from
    /// the sequence (plus any running count carried from earlier rounds of the
    /// same shoe). Mirrors `evaluateTrueCount`.
    func evaluateTrueCount(
        _ cards: [Card],
        userTrueCount: Int,
        decksRemaining: Double,
        system: CountingSystem,
        priorRunningCount: Double = 0
    ) -> TrueCountDrillResult {
        let correctRunning = priorRunningCount + runningCount(cards, system: system)
        let correctTrue = trueCount(runningCount: correctRunning, decksRemaining: decksRemaining)
        return TrueCountDrillResult(
            cards: cards,
            correctRunningCount: correctRunning,
            decksRemaining: decksRemaining,
            correctTrueCount: correctTrue,
            userTrueCount: userTrueCount,
            isCorrect: userTrueCount == correctTrue,
            priorRunningCount: priorRunningCount
        )
    }

    /// Validate drill settings, returning every error at once. Mirrors
    /// `validateSettings`; `numberOfCards` is an `Int` here so the "whole number"
    /// guard the web needs for free-form inputs is unnecessary. The decks/shoe
    /// configuration is only checked in true-count mode.
    func validateSettings(_ settings: CountingDrillSettings) -> SettingsValidation {
        var errors: [String] = []

        if settings.numberOfCards < 1 {
            errors.append("Number of cards must be at least 1.")
        } else if settings.numberOfCards > CountingConstants.maxCardsPerDrill {
            errors.append("Number of cards must be at most \(CountingConstants.maxCardsPerDrill).")
        }

        if settings.millisecondsBetweenCards < CountingConstants.minMillisecondsBetweenCards {
            errors.append(
                "Time between cards must be at least "
                    + "\(CountingConstants.minMillisecondsBetweenCards)ms."
            )
        }

        if settings.mode == .trueCount {
            if settings.trueCountSource == .classic {
                if settings.decksRemaining <= 0 {
                    errors.append("Decks remaining must be greater than 0.")
                }
            } else {
                validateLiveShoe(settings, into: &errors)
            }
        }

        return SettingsValidation(valid: errors.isEmpty, errors: errors)
    }

    private func validateLiveShoe(_ settings: CountingDrillSettings, into errors: inout [String]) {
        if !ShoeConstants.deckOptions.contains(settings.numberOfDecks) {
            errors.append("Number of decks must be 1, 2, 6, or 8.")
            return
        }
        if settings.penetration < ShoeConstants.minPenetration
            || settings.penetration > ShoeConstants.maxPenetration {
            let low = Int((ShoeConstants.minPenetration * 100).rounded())
            let high = Int((ShoeConstants.maxPenetration * 100).rounded())
            errors.append("Penetration must be between \(low)% and \(high)%.")
        } else if settings.numberOfCards >= 1,
                  settings.numberOfCards > settings.numberOfDecks * ShoeConstants.cardsPerDeck {
            errors.append("Number of cards must not exceed the shoe size (52 × decks).")
        }
    }
}
