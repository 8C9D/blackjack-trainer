import Foundation

/// The Card Counting model's read-only view of itself — mode predicates, the
/// validation gate, the labels the screen prints, the stat snapshots it shows —
/// plus the stat resets that sit beside them. Split out of `CountingModel.swift`
/// to keep that file inside the SwiftLint length budget.
@MainActor
extension CountingModel {
    var trueCountAvailable: Bool {
        system.balanced
    }

    /// The shoe-driven configuration shares the persistent live shoe.
    var usesLiveShoe: Bool {
        asksDeckEstimate
    }

    /// The rounds that open with a decks-remaining estimate: every live-shoe
    /// round whose answer is a true count.
    var asksDeckEstimate: Bool {
        liveShoeTrueCount
    }

    /// Fractional running counts (Wong Halves) need decimal input; true counts
    /// are always whole, so this only applies in running-count mode.
    var fractionalAnswers: Bool {
        settings.mode == .runningCount && engine.isFractionalSystem(system)
    }

    /// A balanced-system true-count drill reading a live, depleting shoe (vs the
    /// classic preset). Gates the deck-estimate step and the shoe.
    var liveShoeTrueCount: Bool {
        settings.mode == .trueCount
            && settings.trueCountSource == .liveShoe
            && system.balanced
    }

    var validation: SettingsValidation {
        engine.validateSettings(settings)
    }

    var isDrillActive: Bool {
        state == .streaming || state == .estimating || state == .answering
    }

    var settingsLocked: Bool {
        isDrillActive
    }

    var currentCard: Card? {
        currentIndex >= 0 && currentIndex < cards.count ? cards[currentIndex] : nil
    }

    var liveDecksRemaining: Double {
        shoe?.decksRemaining ?? Double(settings.numberOfDecks)
    }

    var activeStore: SessionStatsStore {
        settings.mode == .trueCount ? trueCountStore : runningStore
    }

    var activeStats: SessionStats {
        activeStore.stats
    }

    var trueCountStats: SessionStats {
        trueCountStore.stats
    }

    var deckEstimationStats: SessionStats {
        deckEstimationStore.stats
    }

    func resetActiveStats() {
        activeStore.reset()
    }

    func resetTrueCountStats() {
        trueCountStore.reset()
    }

    func resetDeckEstimationStats() {
        deckEstimationStore.reset()
    }
}
