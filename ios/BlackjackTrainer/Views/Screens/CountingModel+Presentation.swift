import Foundation

/// The Card Counting model's read-only view of itself: mode predicates, the
/// validation gate, the labels the screen prints, and the stat snapshots it
/// shows. Split out of `CountingModel.swift` to keep that file inside the
/// SwiftLint length budget, the same shape as `ShowdownModel+Presentation`.
@MainActor
extension CountingModel {
    var trueCountAvailable: Bool {
        system.balanced
    }

    /// The system's schedule resolved for the configured shoe, or nil when the
    /// drill is not in key-count mode or the system/deck pairing has no
    /// published values (an invalid configuration; `validation` blocks it).
    var keyCountSchedule: ResolvedKeyCounts? {
        guard settings.mode == .keyCount else { return nil }
        return system.keyCounts?.resolved(decks: settings.numberOfDecks)
    }

    var keyCountDrill: Bool {
        keyCountSchedule != nil
    }

    /// The shoe-driven drills share the persistent live shoe (and the post-count
    /// showdown that deals from it).
    var usesLiveShoe: Bool {
        asksDeckEstimate || keyCountDrill
    }

    /// The bet-spread drill: a true-count round followed by the bet it is for.
    /// Balanced systems only, like the true count it grades first.
    var betSpreadDrill: Bool {
        settings.mode == .betSpread && system.balanced
    }

    var liveShoeBetSpread: Bool {
        betSpreadDrill && settings.trueCountSource == .liveShoe
    }

    /// The rounds that open with a decks-remaining estimate: every live-shoe
    /// round whose answer is a true count.
    var asksDeckEstimate: Bool {
        liveShoeTrueCount || liveShoeBetSpread
    }

    /// What the carried count resets to on a reshuffle: the IRC in key-count
    /// mode, 0 otherwise — surfaced in the reshuffle notice.
    var countResetLabel: String {
        guard let schedule = keyCountSchedule else { return "0" }
        return "\(CountFormat.signedCount(Double(schedule.irc))) (the IRC)"
    }

    /// Fractional running counts (Wong Halves) need decimal input; true counts
    /// are always whole, so this only applies in running-count mode.
    var fractionalAnswers: Bool {
        settings.mode == .runningCount && engine.isFractionalSystem(system)
    }

    /// A balanced-system true-count drill reading a live, depleting shoe (vs the
    /// classic preset). Gates the deck-estimate step, the shoe, and the showdown.
    var liveShoeTrueCount: Bool {
        settings.mode == .trueCount
            && settings.trueCountSource == .liveShoe
            && system.balanced
    }

    /// Engine validation plus the schedule gate the settings shape cannot
    /// express (it carries no system): key-count mode needs a schedule row for
    /// the configured shoe.
    var validation: SettingsValidation {
        let v = engine.validateSettings(settings)
        if settings.mode == .keyCount, keyCountSchedule == nil {
            return SettingsValidation(
                valid: false,
                errors: v.errors + ["This system has no key-count schedule for this shoe."]
            )
        }
        if settings.mode == .betSpread, !system.balanced {
            return SettingsValidation(
                valid: false,
                errors: v.errors + ["The bet spread drills a true count, so it needs a "
                    + "balanced system."]
            )
        }
        return v
    }

    var isDrillActive: Bool {
        state == .streaming || state == .estimating || state == .answering
            || state == .advantage || state == .betting
    }

    var settingsLocked: Bool {
        isDrillActive || state == .showdown
    }

    var currentCard: Card? {
        currentIndex >= 0 && currentIndex < cards.count ? cards[currentIndex] : nil
    }

    var liveDecksRemaining: Double {
        shoe?.decksRemaining ?? Double(settings.numberOfDecks)
    }

    /// The key-count drill's count answer is a running-count rep, so it shares
    /// the running store; only the advantage call has its own store.
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

    var keyCountStats: SessionStats {
        keyCountStore.stats
    }

    var betSpreadStats: SessionStats {
        betSpreadStore.stats
    }
}
