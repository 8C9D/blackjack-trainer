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
        #expect(scenarioRefFor(TwoCardHand(card(.king), card(.six)), dealerUpcard: card(.queen))
            == hard16v10)
    }

    @Test func classifiesSoftHandsByTotal() {
        #expect(scenarioRefFor(TwoCardHand(card(.ace), card(.seven)), dealerUpcard: card(.nine))
            == soft18v9)
    }

    @Test func classifiesPairsByRankKeyIncludingTenValuesAndAces() {
        #expect(scenarioRefFor(
            TwoCardHand(card(.eight), card(.eight, .hearts)), dealerUpcard: card(.ten)
        ) == ScenarioRef(kind: "pair", hand: "8", dealer: "10"))
        #expect(scenarioRefFor(
            TwoCardHand(card(.king), card(.ten, .hearts)), dealerUpcard: card(.ace)
        ) == ScenarioRef(kind: "pair", hand: "10", dealer: "A"))
        #expect(scenarioRefFor(
            TwoCardHand(card(.ace), card(.ace, .hearts)), dealerUpcard: card(.six)
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
