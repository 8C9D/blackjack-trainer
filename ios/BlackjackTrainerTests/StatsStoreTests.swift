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

    @Test func impossibleSessionStatsFallBackToEmpty() throws {
        let defaults = freshDefaults()
        let impossible = SessionStats(attempts: 2, correct: 3, streak: 0, longestStreak: 0)
        try defaults.set(JSONEncoder().encode(impossible), forKey: StatsKeys.deviation)
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

    @Test func legacyKeysAreWiped() {
        let defaults = freshDefaults()
        defaults.set(Data("{}".utf8), forKey: "blackjack-trainer:stats:v1")
        cleanupLegacyStatsKeys(defaults: defaults)
        #expect(defaults.data(forKey: "blackjack-trainer:stats:v1") == nil)
    }

    /// The keys this build still writes stay on the web app's names, so the
    /// stored data keeps its cross-platform meaning (and a device running the
    /// full feature set shares the same cloud namespace without collision).
    @Test func storageKeysMatchTheWebApp() {
        #expect([
            StatsKeys.basicStrategy,
            StatsKeys.cardCounting,
            StatsKeys.countDrift,
            StatsKeys.deckEstimation,
            StatsKeys.deviation,
            StatsKeys.flowPrefs,
            StatsKeys.missTally,
            StatsKeys.practiceHistory,
            StatsKeys.trueCount
        ].sorted() == [
            "blackjack-basic-strategy-stats",
            "blackjack-card-counting-stats",
            "blackjack-count-drift",
            "blackjack-deck-estimation-stats",
            "blackjack-deviation-stats",
            "blackjack-flow-prefs",
            "blackjack-miss-tally",
            "blackjack-practice-history",
            "blackjack-true-count-stats"
        ])
    }

    /// Most of those keys hold this one shape, so a field added on one side and
    /// not the other is dropped on the trip for every trainer at once.
    @Test func sessionStatsWritesExactlyTheFieldsTheWebStoreReads() throws {
        let defaults = freshDefaults()
        let store = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        store.recordAttempt(correct: true)
        #expect(try Self.storedKeys(defaults, StatsKeys.basicStrategy)
            == ["attempts", "correct", "longestStreak", "streak"])
    }

    private static func storedKeys(_ defaults: UserDefaults, _ key: String) throws -> [String] {
        let data = try #require(defaults.data(forKey: key))
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return root.keys.sorted()
    }
}
