import Foundation

/// The oldest drill in card counting: shuffle a deck, burn one card face down,
/// count down the other 51 as fast as you can, and name the count. Because a
/// full deck sums to a known constant (0 balanced, +4 for KO), the count of the
/// 51 is that constant minus the burned card's tag — the drill grades itself,
/// and the burned card revealed at the end is the proof.
///
/// It is the one counting exercise the timed stream cannot cover: there the app
/// sets the pace, and the whole point here is to measure yours. Mirrors the web
/// `deck-speed.model.ts`.
enum DeckSpeed {
    static let cards = 51
    /// The benchmark quoted for a competent counter — a full deck counted down
    /// accurately in under this. A milestone shown after a correct round, never
    /// a pass/fail.
    static let benchmarkMilliseconds = 30000

    /// Elapsed time as seconds with one decimal ("24.5s"). A countdown that runs
    /// over a minute still reads fine as "72.4s".
    static func duration(milliseconds: Int) -> String {
        String(format: "%.1fs", Double(milliseconds) / 1000)
    }
}

/// The player's finished countdown: the count they read and what the clock said.
struct DeckSpeedAnswer: Equatable {
    let runningCount: Double
    let elapsedMilliseconds: Int
}

/// Graded deck-speed round. Mirrors `DeckSpeedDrillResult`.
struct DeckSpeedDrillResult: Equatable {
    /// The 51 cards counted (the breakdown reads these).
    let cards: [Card]
    /// The card held back, revealed as the answer's proof.
    let burnedCard: Card
    let correctRunningCount: Double
    let userRunningCount: Double
    /// What a full deck of this system sums to, so the feedback can show the
    /// arithmetic rather than assert it.
    let fullDeckCount: Double
    let isCorrect: Bool
    let elapsedMilliseconds: Int
    /// Best correct time before this round, or nil when there was none.
    let previousBestMilliseconds: Int?
    let isPersonalBest: Bool
}
