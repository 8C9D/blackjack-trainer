import Foundation

/// What the drill asks for. `keyCount` is the unbalanced-system counterpart of
/// the live-shoe true-count drill: the shoe's running count starts at the
/// system's published IRC and the player calls whether it has reached the key
/// count. Only offered for systems carrying a `KeyCountSchedule` (KO).
/// `betSpread` is the true-count drill plus the question the count is for: how
/// many units to bet. Balanced systems only, since it grades a true count first.
/// `deckSpeed` is the self-paced one: a shuffled deck with a card burned,
/// counted down against a stopwatch (see `DeckSpeed`).
enum DrillMode: String, CaseIterable {
    case runningCount = "running-count"
    case trueCount = "true-count"
    case keyCount = "key-count"
    case betSpread = "bet-spread"
    case deckSpeed = "deck-speed"

    /// The shoe-driven modes: key count always reads a live shoe; the two
    /// true-count modes only with the live-shoe source. The one predicate behind
    /// the settings fields, the prefs clamp, and the engine's shoe checks
    /// (mirrors the web `usesLiveShoe`).
    func usesLiveShoe(source: TrueCountSource) -> Bool {
        self == .keyCount || (asksTrueCount && source == .liveShoe)
    }

    /// The label every surface uses — Settings' picker, and the drill's idle
    /// screen, which names the mode it is about to run now that they differ
    /// this much.
    var label: String {
        switch self {
        case .runningCount: "Running count"
        case .trueCount: "True count"
        case .keyCount: "Key count"
        case .betSpread: "Bet spread"
        case .deckSpeed: "Deck speed"
        }
    }

    /// Modes whose answer is a true count: the true-count drill and the
    /// bet-spread drill built on top of it. They share the decks-remaining
    /// configuration, the deck estimate, and the true-count stat store.
    var asksTrueCount: Bool {
        self == .trueCount || self == .betSpread
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
    /// Units per true-count band, graded against in bet-spread mode.
    var betRamp: [Int] = BetRamp.default
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

/// The player's two-part key-count answer: the running count they read and
/// their advantage call.
struct KeyCountAnswer: Equatable {
    let runningCount: Double
    let saidAdvantage: Bool
}

/// Graded key-count round. The counts stay `Double` like the other results
/// (KO's are always whole); the schedule values are the resolved row for the
/// shoe's deck count so the feedback can cite them. Mirrors
/// `KeyCountDrillResult`.
struct KeyCountDrillResult: Equatable {
    let cards: [Card]
    let correctRunningCount: Double
    let userRunningCount: Double
    let countCorrect: Bool
    /// Running count carried into this round (the IRC itself on a fresh shoe).
    let priorRunningCount: Double
    let irc: Int
    let keyCount: Int
    let pivot: Int
    let insuranceCount: Int
    /// The advantage call: the player has the edge at or above the key count.
    let hasAdvantage: Bool
    let userSaidAdvantage: Bool
    let advantageCorrect: Bool
    /// The rep is correct only when both the count and the call are.
    let isCorrect: Bool
}

/// The player's two-part bet-spread answer: the true count they read and the
/// units they would put out.
struct BetSpreadAnswer: Equatable {
    let trueCount: Int
    let units: Int
}

/// Graded bet-spread round: a true-count round (same count, decks, and estimate
/// fields) plus the bet it was for. The units are graded against the ramp at the
/// *correct* true count, not the one the player claimed — a miscount that leads
/// to the wrong bet is exactly the failure the drill is there to catch, as with
/// the key-count advantage call. Mirrors `BetSpreadDrillResult`.
struct BetSpreadDrillResult: Equatable {
    let cards: [Card]
    let correctRunningCount: Double
    let decksRemaining: Double
    let correctTrueCount: Int
    let userTrueCount: Int
    let countCorrect: Bool
    var priorRunningCount: Double = 0
    var deckEstimate: Double?
    var deckEstimateWithinBand: Bool?
    /// The ramp the round was graded against, kept on the result so the feedback
    /// can show the whole spread without re-reading prefs.
    let ramp: [Int]
    let correctUnits: Int
    let userUnits: Int
    let betCorrect: Bool
    /// The rep is correct only when both the true count and the bet are.
    let isCorrect: Bool
}

extension CountingDrillResult {
    /// The running count this round asked for, as (answered, real), or nil for
    /// the modes whose answer is a true count — there the deck-estimate line
    /// accounts for the miss instead.
    var runningCountAnswer: (answer: Double, actual: Double)? {
        switch self {
        case let .running(result): (result.userRunningCount, result.correctRunningCount)
        case let .keyCount(result): (result.userRunningCount, result.correctRunningCount)
        case let .deckSpeed(result): (result.userRunningCount, result.correctRunningCount)
        case .trueCount, .betSpread: nil
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
    case keyCount(KeyCountDrillResult)
    case betSpread(BetSpreadDrillResult)
    case deckSpeed(DeckSpeedDrillResult)

    var cards: [Card] {
        switch self {
        case let .running(result): result.cards
        case let .trueCount(result): result.cards
        case let .keyCount(result): result.cards
        case let .betSpread(result): result.cards
        case let .deckSpeed(result): result.cards
        }
    }

    var isCorrect: Bool {
        switch self {
        case let .running(result): result.isCorrect
        case let .trueCount(result): result.isCorrect
        case let .keyCount(result): result.isCorrect
        case let .betSpread(result): result.isCorrect
        case let .deckSpeed(result): result.isCorrect
        }
    }

    /// Running count carried into the round (live-shoe prior, the IRC-seeded
    /// key-count prior; 0 otherwise) — the breakdown's starting offset.
    var priorRunningCount: Double {
        switch self {
        case .running, .deckSpeed: 0
        case let .trueCount(result): result.priorRunningCount
        case let .keyCount(result): result.priorRunningCount
        case let .betSpread(result): result.priorRunningCount
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
