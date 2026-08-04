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

    @Test func showdownTallies() {
        let defaults = freshDefaults()
        let store = ShowdownStatsStore(defaults: defaults)
        store.record(outcome: .win, playerBlackjack: true)
        store.record(outcome: .lose)
        store.record(outcome: .push)
        store.record(outcome: .win)
        // A non-win carrying playerBlackjack must NOT count as a blackjack: only
        // a winning natural pays 3:2 (guards the `outcome == .win` condition).
        store.record(outcome: .push, playerBlackjack: true)
        #expect(store.stats == ShowdownStats(
            hands: 5,
            wins: 2,
            losses: 1,
            pushes: 2,
            blackjacks: 1
        ))
        #expect(store.key == "blackjack-showdown-stats")
    }

    @Test func impossibleShowdownTallyFallsBackToEmpty() throws {
        let defaults = freshDefaults()
        let impossible = ShowdownStats(
            hands: 2,
            wins: 2,
            losses: 1,
            pushes: 0,
            blackjacks: 0
        )
        try defaults.set(JSONEncoder().encode(impossible), forKey: StatsKeys.showdown)
        let store = ShowdownStatsStore(defaults: defaults)
        #expect(store.stats == .empty)
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

    /// The backup file moves the whole namespace between the phone and the
    /// browser, so the set of keys is itself a cross-platform contract: a store
    /// one app writes and the other has never heard of survives the export and
    /// is thrown away on import, with nothing anywhere saying so. Mirrors
    /// `backup.service.spec.ts` → "the namespace it carries".
    @Test func theNamespaceIsExactlyWhatTheWebAppAlsoStores() {
        #expect([
            StatsKeys.basicStrategy,
            StatsKeys.betSpread,
            StatsKeys.cardCounting,
            StatsKeys.countDrift,
            StatsKeys.deckEstimation,
            StatsKeys.deckSpeed,
            StatsKeys.deckSpeedBest,
            StatsKeys.deviation,
            StatsKeys.flowPrefs,
            StatsKeys.keyCount,
            StatsKeys.missTally,
            StatsKeys.practiceHistory,
            StatsKeys.showdown,
            StatsKeys.showdownBankroll,
            StatsKeys.showdownPlay,
            StatsKeys.trueCount
        ].sorted() == [
            "blackjack-basic-strategy-stats",
            "blackjack-bet-spread-stats",
            "blackjack-card-counting-stats",
            "blackjack-count-drift",
            "blackjack-deck-estimation-stats",
            "blackjack-deck-speed-best",
            "blackjack-deck-speed-stats",
            "blackjack-deviation-stats",
            "blackjack-flow-prefs",
            "blackjack-key-count-stats",
            "blackjack-miss-tally",
            "blackjack-practice-history",
            "blackjack-showdown-bankroll",
            "blackjack-showdown-play-stats",
            "blackjack-showdown-stats",
            "blackjack-true-count-stats"
        ])
    }

    /// Eight of those sixteen keys hold this one shape, so a field added on one
    /// side and not the other is dropped on the trip for every trainer at once.
    @Test func sessionStatsWritesExactlyTheFieldsTheWebStoreReads() throws {
        let defaults = freshDefaults()
        let store = SessionStatsStore(key: StatsKeys.basicStrategy, defaults: defaults)
        store.recordAttempt(correct: true)
        #expect(try Self.storedKeys(defaults, StatsKeys.basicStrategy)
            == ["attempts", "correct", "longestStreak", "streak"])
    }

    @Test func showdownStatsWritesExactlyTheFieldsTheWebStoreReads() throws {
        let defaults = freshDefaults()
        let store = ShowdownStatsStore(defaults: defaults)
        store.record(outcome: .win, playerBlackjack: true)
        #expect(try Self.storedKeys(defaults, StatsKeys.showdown)
            == ["blackjacks", "hands", "losses", "pushes", "wins"])
    }

    private static func storedKeys(_ defaults: UserDefaults, _ key: String) throws -> [String] {
        let data = try #require(defaults.data(forKey: key))
        let root = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return root.keys.sorted()
    }
}
