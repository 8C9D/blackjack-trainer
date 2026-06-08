import Foundation

/// What the drill asks for.
enum DrillMode: String, CaseIterable {
    case runningCount = "running-count"
    case trueCount = "true-count"
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

/// A graded round in either mode (the web's discriminated union).
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

    /// Running count carried into the round (live-shoe prior; 0 otherwise) — the
    /// breakdown's starting offset.
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
