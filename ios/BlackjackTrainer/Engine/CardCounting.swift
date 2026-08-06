import Foundation

/// What the drill asks for: the running count, or the true count derived from
/// it over the decks remaining (balanced systems only).
enum DrillMode: String, CaseIterable {
    case runningCount = "running-count"
    case trueCount = "true-count"

    /// The shoe-driven configuration: true-count mode with the live-shoe
    /// source. The one predicate behind the settings fields, the prefs clamp,
    /// and the engine's shoe checks (mirrors the web `usesLiveShoe`).
    func usesLiveShoe(source: TrueCountSource) -> Bool {
        asksTrueCount && source == .liveShoe
    }

    /// The label every surface uses — Settings' picker, and the drill's idle
    /// screen, which names the mode it is about to run.
    var label: String {
        switch self {
        case .runningCount: "Running count"
        case .trueCount: "True count"
        }
    }

    /// Modes whose answer is a true count, sharing the decks-remaining
    /// configuration, the deck estimate, and the true-count stat store.
    var asksTrueCount: Bool {
        self == .trueCount
    }
}

/// In true-count mode, where the decks-remaining figure comes from: a live,
/// depleting shoe the player reads, or a fixed preset they pick. The live-shoe
/// source is wired up in Slice 3.4; Slice 3.3 uses the classic preset.
enum TrueCountSource: String {
    case liveShoe = "live-shoe"
    case classic
}

/// Drill configuration, mirroring the web `CountingDrillSettings`.
struct CountingDrillSettings: Equatable {
    var mode: DrillMode = .runningCount
    var numberOfCards: Int = 20
    var millisecondsBetweenCards: Int = 1000
    /// Decks remaining for classic (preset) true-count mode.
    var decksRemaining: Double = 1
    var trueCountSource: TrueCountSource = .liveShoe
    var numberOfDecks: Int = ShoeConstants.defaultNumberOfDecks
    var penetration: Double = ShoeConstants.defaultPenetration
}

/// Graded running-count round. Counts are `Double` to carry fractional systems
/// (Wong Halves). Mirrors `RunningCountDrillResult`.
struct RunningCountDrillResult: Equatable {
    let cards: [Card]
    let correctRunningCount: Double
    let userRunningCount: Double
    let isCorrect: Bool
}

/// Graded true-count round. `priorRunningCount` carries the running count from
/// earlier rounds of the same live shoe (0 in classic mode); the deck-estimate
/// fields are populated only by the live-shoe path (Slice 3.4). Mirrors
/// `TrueCountDrillResult`.
struct TrueCountDrillResult: Equatable {
    let cards: [Card]
    let correctRunningCount: Double
    let decksRemaining: Double
    let correctTrueCount: Int
    let userTrueCount: Int
    let isCorrect: Bool
    var priorRunningCount: Double = 0
    var deckEstimate: Double?
    var deckEstimateWithinBand: Bool?
}

extension CountingDrillResult {
    /// The running count this round asked for, as (answered, real), or nil for
    /// the modes whose answer is a true count — there the deck-estimate line
    /// accounts for the miss instead.
    var runningCountAnswer: (answer: Double, actual: Double)? {
        switch self {
        case let .running(result): (result.userRunningCount, result.correctRunningCount)
        case .trueCount: nil
        }
    }
}

/// How far an answered running count landed from the real one: "2 points high",
/// "1 point low". One helper for every surface that grades a count — the drill's
/// feedback, the countdown's, and the table's count check on the way out — since
/// the same miss described two ways reads as two different mistakes. Fractional
/// systems answer in halves, so the noun follows the value rather than the sign.
/// Mirrors the web `countDriftLabel`.
func countDriftLabel(_ drift: Double) -> String {
    "\(countOf(abs(drift), "point", display: CountFormat.count(abs(drift)))) "
        + (drift > 0 ? "high" : "low")
}

/// What the player's own decks estimate would have made of the count.
///
/// A live-shoe round grades the true count against the shoe's actual decks
/// remaining and scores the estimate separately as inside the ±0.5 band or not.
/// Neither figure answers the question the estimate exists for: at a table the
/// only divisor a counter has is the one they estimated, so an estimate that is
/// off is a true count that is off — by an amount that depends entirely on the
/// running count it divides. Being five decks out is nothing at a running count
/// of -2 and is the whole bet at +12. Mirrors the web `deckEstimateEffect`.
struct DeckEstimateEffect: Equatable {
    let estimate: Double
    /// Running count ÷ the estimate, truncated toward zero exactly as the drill
    /// truncates the real one.
    let impliedTrueCount: Int
    /// The estimate lands on the actual true count anyway.
    let matchesActual: Bool
    /// The player's answer is exactly what their estimate implies. Evidence, not
    /// proof: the drill only ever sees a true count, so it cannot tell a good
    /// running count divided by a bad estimate from two errors that cancel —
    /// which is why the panel says the two agree and stops there.
    let matchesAnswer: Bool

    /// Nil off a classic (preset-decks) round, which asks for no estimate, and
    /// off an estimate that cannot be divided by.
    init?(runningCount: Double, estimate: Double?, correctTrueCount: Int, userTrueCount: Int) {
        guard let estimate, estimate.isFinite, estimate > 0 else { return nil }
        let implied = Int((runningCount / estimate).rounded(.towardZero))
        self.estimate = estimate
        impliedTrueCount = implied
        matchesActual = implied == correctTrueCount
        matchesAnswer = implied == userTrueCount
    }
}

/// A graded round in any mode (the web's discriminated union).
enum CountingDrillResult: Equatable {
    case running(RunningCountDrillResult)
    case trueCount(TrueCountDrillResult)

    var cards: [Card] {
        switch self {
        case let .running(result): result.cards
        case let .trueCount(result): result.cards
        }
    }

    var isCorrect: Bool {
        switch self {
        case let .running(result): result.isCorrect
        case let .trueCount(result): result.isCorrect
        }
    }

    /// Running count carried into the round (the live-shoe prior; 0 otherwise)
    /// — the breakdown's starting offset.
    var priorRunningCount: Double {
        switch self {
        case .running: 0
        case let .trueCount(result): result.priorRunningCount
        }
    }
}

struct SettingsValidation: Equatable {
    let valid: Bool
    let errors: [String]
}

enum CountingConstants {
    /// Floor for inter-card timing (anything faster isn't useful practice).
    static let minMillisecondsBetweenCards = 100
    /// Upper bound on drill length.
    static let maxCardsPerDrill = 200
    /// Decks-remaining presets offered in classic true-count mode.
    static let decksRemainingPresets: [Double] = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6]
}

/// Count/deck number formatting shared by the Count screen, mirroring the web
/// component formatters.
enum CountFormat {
    /// Whole values render without a decimal; halves keep one place (`+1`, `0.5`).
    static func count(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }

    /// Signed delta label for the breakdown (`+1`, `-2`, `+0.5`).
    static func signedCount(_ value: Double) -> String {
        value > 0 ? "+\(count(value))" : count(value)
    }

    /// Decks: whole as "5"; fractional to ≤2 decimals, trailing zeros trimmed.
    static func decks(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        var text = String(format: "%.2f", value)
        while text.hasSuffix("0") {
            text.removeLast()
        }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }
}
