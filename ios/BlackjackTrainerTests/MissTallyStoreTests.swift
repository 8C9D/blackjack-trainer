import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `miss-tally.service.spec.ts`: scenario classification/labels and the
/// weak-spot selection over a rolling 7-day window.
struct MissTallyStoreTests {
    private static func base() -> Date {
        makeDate(year: 2026, month: 7, day: 10, hour: 18, minute: 0)
    }

    private static func makeDate(
        year: Int, month: Int, day: Int, hour: Int = 12, minute: Int = 0
    ) -> Date {
        Calendar.current.date(
            from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute)
        ) ?? .distantPast
    }

    private let hard16v10 = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
    private let soft18v9 = ScenarioRef(kind: "soft", hand: "18", dealer: "9")

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private func store(_ defaults: UserDefaults, now: @escaping () -> Date) -> MissTallyStore {
        let store = MissTallyStore(defaults: defaults)
        store.setNowSource(now)
        return store
    }

    // MARK: scenarioRefFor

    @Test func classifiesHardTotalsWithANormalizedDealerKey() {
        #expect(scenarioRefFor([card(.king), card(.six)], dealerUpcard: card(.queen))
            == hard16v10)
    }

    @Test func classifiesSoftHandsByTotal() {
        #expect(scenarioRefFor([card(.ace), card(.seven)], dealerUpcard: card(.nine))
            == soft18v9)
    }

    @Test func classifiesPairsByRankKeyIncludingTenValuesAndAces() {
        #expect(scenarioRefFor(
            [card(.eight), card(.eight, .hearts)], dealerUpcard: card(.ten)
        ) == ScenarioRef(kind: "pair", hand: "8", dealer: "10"))
        #expect(scenarioRefFor(
            [card(.king), card(.ten, .hearts)], dealerUpcard: card(.ace)
        ) == ScenarioRef(kind: "pair", hand: "10", dealer: "A"))
        #expect(scenarioRefFor(
            [card(.ace), card(.ace, .hearts)], dealerUpcard: card(.six)
        ) == ScenarioRef(kind: "pair", hand: "A", dealer: "6"))
    }

    // MARK: scenarioKey / scenarioLabel

    @Test func buildsStableKeys() {
        #expect(scenarioKey(hard16v10) == "hard-16-v-10")
        #expect(scenarioKey(ScenarioRef(kind: "pair", hand: "A", dealer: "A")) == "pair-A-v-A")
    }

    @Test func formatsChartStyleLabels() {
        #expect(scenarioLabel(hard16v10) == "16 vs 10")
        #expect(scenarioLabel(soft18v9) == "A,7 vs 9")
        #expect(scenarioLabel(ScenarioRef(kind: "pair", hand: "8", dealer: "10")) == "8,8 vs 10")
    }

    // MARK: record / weakSpotFor

    @Test func returnsNilWhenNothingHasBeenMissed() {
        let s = store(freshDefaults(), now: { Self.base() })
        #expect(s.weakSpotFor(.basicStrategy) == nil)
        s.record(.basicStrategy, ref: hard16v10, correct: true)
        #expect(s.weakSpotFor(.basicStrategy) == nil)
    }

    @Test func accumulatesAttemptsAndMissesForAScenario() {
        let s = store(freshDefaults(), now: { Self.base() })
        // Ends on a single correct answer, short of the clear streak that would
        // retire this scenario from the weak list.
        for correct in [false, true, false, true, true, false, true] {
            s.record(.basicStrategy, ref: hard16v10, correct: correct)
        }
        #expect(s.weakSpotFor(.basicStrategy)
            == WeakSpot(ref: hard16v10, label: "16 vs 10", misses: 3, attempts: 7, streak: 1))
    }

    // In the Deviations trainer the count is half the question, so the miss
    // remembers it: the scenario has to come back as the question that beat the
    // trainee, not as the same hand at a count they already had right.

    @Test func remembersAMissedCountNewestFirstAndIgnoresCorrectAnswers() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 2)
        s.record(.deviations, ref: hard16v10, correct: true, trueCount: -4)
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: -1)
        #expect(s.weakSpotFor(.deviations)?.missedCounts == [-1, 2])
    }

    @Test func promotesARepeatedCountRatherThanStoringItTwice() {
        let s = store(freshDefaults(), now: { Self.base() })
        for count in [2, 5, 2] {
            s.record(.deviations, ref: hard16v10, correct: false, trueCount: count)
        }
        #expect(s.weakSpotFor(.deviations)?.missedCounts == [2, 5])
    }

    @Test func keepsOnlyTheMostRecentFewMissedCounts() {
        let s = store(freshDefaults(), now: { Self.base() })
        for count in 1 ... (missedCountMemory + 3) {
            s.record(.deviations, ref: hard16v10, correct: false, trueCount: count)
        }
        let counts = s.weakSpotFor(.deviations)?.missedCounts ?? []
        #expect(counts.count == missedCountMemory)
        #expect(counts.first == missedCountMemory + 3)
    }

    @Test func ignoresACountThatIsNotAPlausibleTrueCount() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 5000)
        #expect(s.weakSpotFor(.deviations)?.missedCounts == [])
    }

    @Test func recordsNoCountForABasicStrategyMiss() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        #expect(s.weakSpotFor(.basicStrategy)?.missedCounts == [])
    }

    @Test func dropsGarbageAndDuplicatesOutOfARestoredListOfCounts() throws {
        let defaults = freshDefaults()
        let stored: [String: Any] = [
            "deviations": [
                scenarioKey(hard16v10): [
                    "ref": ["kind": "hard", "hand": "16", "dealer": "10"],
                    "days": [["date": localDateKey(Self.base()), "attempts": 1, "misses": 1]],
                    "streak": 0,
                    "missedCounts": [3, 3, 900, -2]
                ]
            ]
        ]
        try defaults.set(
            JSONSerialization.data(withJSONObject: stored),
            forKey: StatsKeys.missTally
        )
        let s = store(defaults, now: { Self.base() })
        #expect(s.weakSpotFor(.deviations)?.missedCounts == [3, -2])
    }

    @Test func survivesAPayloadWrittenBeforeCountsWereKept() throws {
        let defaults = freshDefaults()
        let legacy: [String: Any] = [
            "deviations": [
                scenarioKey(hard16v10): [
                    "ref": ["kind": "hard", "hand": "16", "dealer": "10"],
                    "days": [["date": localDateKey(Self.base()), "attempts": 1, "misses": 1]]
                ]
            ]
        ]
        try defaults.set(
            JSONSerialization.data(withJSONObject: legacy),
            forKey: StatsKeys.missTally
        )
        let s = store(defaults, now: { Self.base() })
        #expect(s.weakSpotFor(.deviations)?.missedCounts == [])
    }

    @Test func picksTheScenarioWithTheMostMissesTiebreakingOnMissRate() {
        let s = store(freshDefaults(), now: { Self.base() })
        // 16v10: 2 misses of 4; A,7v9: 2 misses of 2 (higher rate).
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: hard16v10, correct: true)
        s.record(.basicStrategy, ref: hard16v10, correct: true)
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        #expect(s.weakSpotFor(.basicStrategy)?.ref == soft18v9)

        s.record(.basicStrategy, ref: hard16v10, correct: false)
        #expect(s.weakSpotFor(.basicStrategy)?.ref == hard16v10)
    }

    @Test func keepsTrainerTalliesIndependent() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.record(.deviations, ref: hard16v10, correct: false)
        #expect(s.weakSpotFor(.basicStrategy) == nil)
        #expect(s.weakSpotFor(.deviations)?.label == "16 vs 10")
    }

    @Test func onlyCountsMissesInsideTheWindowAndPrunesOlderDays() {
        let defaults = freshDefaults()
        var current = Self.base()
        let s = store(defaults, now: { current })
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        // 8 days later the old miss has aged out of the window.
        current = Self.makeDate(year: 2026, month: 7, day: 18, hour: 9)
        #expect(s.weakSpotFor(.basicStrategy) == nil)
        // A write prunes the stale scenario from storage entirely.
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        let stored = defaults.data(forKey: StatsKeys.missTally) ?? Data()
        let root = (try? JSONSerialization.jsonObject(with: stored)) as? [String: Any]
        let keys = (root?["basic-strategy"] as? [String: Any]).map { Array($0.keys) } ?? []
        #expect(keys == [scenarioKey(soft18v9)])
    }

    @Test func persistsAcrossInstances() {
        let defaults = freshDefaults()
        let s = store(defaults, now: { Self.base() })
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        let reloaded = store(defaults, now: { Self.base() })
        #expect(reloaded.weakSpotFor(.basicStrategy)?.label == "16 vs 10")
    }

    @Test func toleratesAMalformedStoredPayload() {
        let defaults = freshDefaults()
        defaults.set(Data("[broken".utf8), forKey: StatsKeys.missTally)
        let s = store(defaults, now: { Self.base() })
        #expect(s.weakSpotFor(.basicStrategy) == nil)
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        #expect(s.weakSpotFor(.basicStrategy) != nil)
    }

    // MARK: clear streak

    @Test func retiresAScenarioAfterTheClearStreak() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        for _ in 0 ..< (clearStreak - 1) {
            s.record(.basicStrategy, ref: hard16v10, correct: true)
            #expect(s.weakSpotFor(.basicStrategy) != nil)
        }
        s.record(.basicStrategy, ref: hard16v10, correct: true)

        #expect(s.weakSpots(.basicStrategy).isEmpty)
        #expect(s.weakSpotFor(.basicStrategy) == nil)
        #expect(s.clearedSpots(.basicStrategy).map(\.label) == ["16 vs 10"])
    }

    @Test func aSingleMissUnclearsAClearedScenario() {
        let s = store(freshDefaults(), now: { Self.base() })
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        for _ in 0 ..< clearStreak {
            s.record(.basicStrategy, ref: hard16v10, correct: true)
        }
        #expect(s.clearedSpots(.basicStrategy).count == 1)

        s.record(.basicStrategy, ref: hard16v10, correct: false)
        #expect(s.clearedSpots(.basicStrategy).isEmpty)
        #expect(s.weakSpotFor(.basicStrategy)?.streak == 0)
    }

    @Test func neverCountsAScenarioAnsweredCorrectlyFromTheStart() {
        let s = store(freshDefaults(), now: { Self.base() })
        for _ in 0 ..< (clearStreak + 2) {
            s.record(.basicStrategy, ref: hard16v10, correct: true)
        }
        // Clearing is only meaningful for something that was missed this week.
        #expect(s.clearedSpots(.basicStrategy).isEmpty)
        #expect(s.weakSpots(.basicStrategy).isEmpty)
    }

    @Test func survivesAPayloadWrittenBeforeClearStreakTracking() throws {
        let defaults = freshDefaults()
        let legacy: [String: Any] = [
            "basic-strategy": [
                scenarioKey(hard16v10): [
                    "ref": ["kind": "hard", "hand": "16", "dealer": "10"],
                    "days": [["date": localDateKey(Self.base()), "attempts": 4, "misses": 2]]
                ]
            ]
        ]
        try defaults.set(
            JSONSerialization.data(withJSONObject: legacy),
            forKey: StatsKeys.missTally
        )

        let s = store(defaults, now: { Self.base() })
        let weak = try #require(s.weakSpotFor(.basicStrategy))
        #expect(weak.misses == 2)
        #expect(weak.streak == 0)
    }

    // MARK: weakSpots ranking

    @Test func ordersWeakSpotsByMissesThenRateThenAStableKey() {
        let s = store(freshDefaults(), now: { Self.base() })
        let pair8v10 = ScenarioRef(kind: "pair", hand: "8", dealer: "10")
        // 16v10: 2 of 4. A,7v9: 2 of 2 — same misses, higher rate, so first.
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: hard16v10, correct: true)
        s.record(.basicStrategy, ref: hard16v10, correct: true)
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        // Pair 8s: 3 misses — the most, so it leads.
        s.record(.basicStrategy, ref: pair8v10, correct: false)
        s.record(.basicStrategy, ref: pair8v10, correct: false)
        s.record(.basicStrategy, ref: pair8v10, correct: false)

        #expect(s.weakSpots(.basicStrategy).map(\.label)
            == ["8,8 vs 10", "A,7 vs 9", "16 vs 10"])
    }
}

/// The backup file moves this payload between the phone and the browser, so the
/// stored shape is a cross-platform contract rather than this store's private
/// business — the same reason `PracticeDay` pins its own key set. A field added
/// on one side and not the other is dropped silently on the trip, and here that
/// means the weak spots that decide what a review round drills arrive on the
/// other device meaning something else.
///
/// Its own suite because the tally's behaviour tests already fill one to
/// swiftlint's type-body limit. Mirrors `miss-tally.service.spec.ts` →
/// "the stored shape".
struct MissTallyStoredShapeTests {
    private let hard16v10 = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
    private let soft18v9 = ScenarioRef(kind: "soft", hand: "18", dealer: "9")

    private func store() -> (MissTallyStore, UserDefaults) {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
        return (MissTallyStore(defaults: defaults), defaults)
    }

    @Test func writesExactlyTheFieldsTheWebStoreReads() throws {
        let (s, defaults) = store()
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 2)
        let root = try Self.storedRoot(defaults)

        #expect(Array(root.keys) == ["deviations"])
        let tally = try #require(
            (root["deviations"] as? [String: Any])?[scenarioKey(hard16v10)] as? [String: Any]
        )
        #expect(tally.keys.sorted() == ["days", "missedCounts", "ref", "streak"])
        let ref = try #require(tally["ref"] as? [String: Any])
        #expect(ref.keys.sorted() == ["dealer", "hand", "kind"])
        let day = try #require((tally["days"] as? [[String: Any]])?.first)
        #expect(day.keys.sorted() == ["attempts", "date", "misses"])
    }

    /// Basic Strategy has no count in its question, so it records none. The
    /// absence has to be an absence on both platforms rather than a `[]` on one
    /// and a missing key on the other, or a round trip invents a difference.
    @Test func stillNamesMissedCountsForATrainerThatRecordsNone() throws {
        let (s, defaults) = store()
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        let root = try Self.storedRoot(defaults)
        let tally = try #require(
            (root["basic-strategy"] as? [String: Any])?[scenarioKey(hard16v10)] as? [String: Any]
        )
        #expect(tally.keys.sorted() == ["days", "missedCounts", "ref", "streak"])
        #expect(tally["missedCounts"] as? [Int] == [])
    }

    /// The trainer keys are the other half of the contract: they are the object
    /// keys of the payload, so renaming one on either side loses that trainer's
    /// whole weak list on the trip.
    @Test func keysTrainersByTheNamesBothPlatformsUse() throws {
        let (s, defaults) = store()
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.deviations, ref: soft18v9, correct: false)
        let root = try Self.storedRoot(defaults)
        #expect(root.keys.sorted() == ["basic-strategy", "deviations"])
    }

    private static func storedRoot(_ defaults: UserDefaults) throws -> [String: Any] {
        let data = try #require(defaults.data(forKey: StatsKeys.missTally))
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
