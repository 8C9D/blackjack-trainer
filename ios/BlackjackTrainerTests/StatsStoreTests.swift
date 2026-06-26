import Foundation
import Testing
@testable import BlackjackTrainer

/// Slice 2.1 — local stats stores (Codable → UserDefaults, localStorage-parity
/// keys). Each store persists/restores independently; malformed data falls back
/// to empty; reset clears only its own key.
struct StatsStoreTests {
    private func freshDefaults() -> UserDefaults {
        let suite = "test-\(UUID().uuidString)"
        return UserDefaults(suiteName: suite)!
    }

    @Test func recordAttemptTracksStreaks() {
        let defaults = freshDefaults()
        let store = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        store.recordAttempt(correct: true)
        store.recordAttempt(correct: true)
        store.recordAttempt(correct: false) // streak resets
        store.recordAttempt(correct: true)
        #expect(store.stats == SessionStats(attempts: 4, correct: 3, streak: 1, longestStreak: 2))
    }

    @Test func persistsAndRestores() {
        let defaults = freshDefaults()
        let store = SessionStatsStore(key: StatsKeys.trueCount, defaults: defaults)
        store.recordAttempt(correct: true)
        store.recordAttempt(correct: true)
        // A new store on the same key + defaults restores the persisted value.
        let restored = SessionStatsStore(key: StatsKeys.trueCount, defaults: defaults)
        #expect(restored.stats == SessionStats(
            attempts: 2,
            correct: 2,
            streak: 2,
            longestStreak: 2
        ))
    }

    @Test func malformedDataFallsBackToEmpty() {
        let defaults = freshDefaults()
        defaults.set(Data("not json".utf8), forKey: StatsKeys.deviation)
        let store = SessionStatsStore(key: StatsKeys.deviation, defaults: defaults)
        #expect(store.stats == .empty)
    }

    @Test func resetClearsOnlyOwnKey() {
        let defaults = freshDefaults()
        let basic = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        let counting = SessionStatsStore(key: StatsKeys.cardCounting, defaults: defaults)
        basic.recordAttempt(correct: true)
        counting.recordAttempt(correct: true)
        basic.reset()
        #expect(basic.stats == .empty)
        // The other store's persisted value survives.
        let reloaded = SessionStatsStore(key: StatsKeys.cardCounting, defaults: defaults)
        #expect(reloaded.stats.attempts == 1)
    }

    @Test func showdownTallies() {
        let defaults = freshDefaults()
        let store = ShowdownStatsStore(defaults: defaults)
        store.record(outcome: .win, playerBlackjack: true)
        store.record(outcome: .lose)
        store.record(outcome: .push)
        store.record(outcome: .win)
        #expect(store.stats == ShowdownStats(
            hands: 4,
            wins: 2,
            losses: 1,
            pushes: 1,
            blackjacks: 1
        ))
        #expect(store.key == "blackjack-showdown-stats")
    }

    @Test func legacyKeysAreWiped() {
        let defaults = freshDefaults()
        defaults.set(Data("{}".utf8), forKey: "blackjack-trainer:stats:v1")
        cleanupLegacyStatsKeys(defaults: defaults)
        #expect(defaults.data(forKey: "blackjack-trainer:stats:v1") == nil)
    }

    @Test func storageKeysMatchTheWebApp() {
        #expect(StatsKeys.basicStrategy == "blackjack-basic-strategy-stats")
        #expect(StatsKeys.cardCounting == "blackjack-card-counting-stats")
        #expect(StatsKeys.trueCount == "blackjack-true-count-stats")
        #expect(StatsKeys.deviation == "blackjack-deviation-stats")
        #expect(StatsKeys.deckEstimation == "blackjack-deck-estimation-stats")
        #expect(StatsKeys.showdown == "blackjack-showdown-stats")
    }
}
