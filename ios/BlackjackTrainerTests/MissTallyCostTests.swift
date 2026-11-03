import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `miss-tally.service.spec.ts` → "weakSpots ranking": the list runs by what
/// the misses cost, because whichever hand heads it is the one the next session
/// opens on. Its own suite because the tally's behaviour tests fill theirs to
/// swiftlint's type-body limit.
struct MissTallyCostTests {
    private let hard16v10 = ScenarioRef(kind: "hard", hand: "16", dealer: "10")
    private let soft18v9 = ScenarioRef(kind: "soft", hand: "18", dealer: "9")

    private func harness(
        playCost: PlayCost = CostFixture.playCost
    ) -> (MissTallyStore, FlowPrefsStore) {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
        let prefs = FlowPrefsStore(defaults: defaults)
        return (CostFixture.tally(defaults: defaults, prefs: prefs, playCost: playCost), prefs)
    }

    @Test func picksTheScenarioWhoseMissesHaveCostTheMost() throws {
        let (s, _) = harness()
        // A,7 v 9 is a dear mistake and 16 v 10 a cheap one.
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        #expect(s.weakSpotFor(.basicStrategy)?.ref == soft18v9)

        // Enough of a cheap mistake still adds up.
        let spots = s.weakSpots(.basicStrategy)
        let dear = try #require(spots[0].costPerMiss)
        let cheap = try #require(spots[1].costPerMiss)
        for _ in 0 ..< Int((dear / cheap).rounded(.up)) {
            s.record(.basicStrategy, ref: hard16v10, correct: false)
        }
        #expect(s.weakSpotFor(.basicStrategy)?.ref == hard16v10)
    }

    /// Five misses of a coin flip give up less than one split of tens, and the hand
    /// at the top of this list is the one the next session opens on.
    @Test func leadsWithWhatTheMissesCostNotHowManyThereWere() {
        let (s, _) = harness()
        let tens = ScenarioRef(kind: "pair", hand: "10", dealer: "6")
        for _ in 0 ..< 5 {
            s.record(.basicStrategy, ref: hard16v10, correct: false)
        }
        s.record(.basicStrategy, ref: tens, correct: false)

        #expect(s.weakSpots(.basicStrategy).map(\.label) == ["10,10 vs 6", "16 vs 10"])
        #expect(s.weakSpotFor(.basicStrategy)?.ref == tens)
    }

    /// Soft 21 is on no chart and in no table, so these tie on cost at nothing.
    @Test func fallsBackToMissesThenMissRateThenAStableKey() {
        let (s, _) = harness()
        func unpriced(_ dealer: String) -> ScenarioRef {
            ScenarioRef(kind: "soft", hand: "21", dealer: dealer)
        }
        // 2: 2 of 4. 3: 2 of 2 — same misses, higher rate, so first.
        s.record(.basicStrategy, ref: unpriced("2"), correct: false)
        s.record(.basicStrategy, ref: unpriced("2"), correct: false)
        s.record(.basicStrategy, ref: unpriced("2"), correct: true)
        s.record(.basicStrategy, ref: unpriced("2"), correct: true)
        s.record(.basicStrategy, ref: unpriced("3"), correct: false)
        s.record(.basicStrategy, ref: unpriced("3"), correct: false)
        // 4: 3 misses — the most, so it leads.
        s.record(.basicStrategy, ref: unpriced("4"), correct: false)
        s.record(.basicStrategy, ref: unpriced("4"), correct: false)
        s.record(.basicStrategy, ref: unpriced("4"), correct: false)
        // 5 and 6: the same again as each other, so the key decides.
        s.record(.basicStrategy, ref: unpriced("6"), correct: false)
        s.record(.basicStrategy, ref: unpriced("5"), correct: false)

        #expect(s.weakSpots(.basicStrategy).map(\.ref.dealer) == ["4", "3", "2", "5", "6"])
        #expect(s.weakSpotFor(.basicStrategy)?.costPerMiss == nil)
    }

    @Test func readsAMissAtTheCurrentTableRules() {
        let (s, prefs) = harness()
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        let without = s.weakSpotFor(.basicStrategy)?.costPerMiss
        prefs.setOptions(EngineOptions(doubleAfterSplit: false, lateSurrender: true))
        #expect(s.weakSpotFor(.basicStrategy)?.costPerMiss != without)
    }

    /// A deviation is the size of the mistake it was at the count it was made: an
    /// index missed at a count right beside it is a coin flip, and the same hand
    /// missed well past it is not.
    @Test func pricesADeviationAtTheCountsItWasMissedAt() throws {
        let (s, _) = harness(playCost: CostFixture.counted(
            ["hard-16-v-10": CostFixture.hard16Cell]
        ))
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 2)
        let far = try #require(s.weakSpotFor(.deviations)?.costPerMiss)
        s.reset()
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 0)
        let near = try #require(s.weakSpotFor(.deviations)?.costPerMiss)
        #expect(far == 2000)
        #expect(near == 30)
    }

    /// The counts are kept once each, not once a miss, so a mean of them weighs a
    /// count missed once like one missed four times. The figure says "at least",
    /// so it is the cheapest of them.
    @Test func pricesADeviationAtTheCheapestCountItWasMissedAt() {
        let (s, _) = harness(playCost: CostFixture.counted(
            ["hard-16-v-10": CostFixture.hard16Cell]
        ))
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 2)
        s.record(.deviations, ref: hard16v10, correct: false, trueCount: 1)
        #expect(s.weakSpotFor(.deviations)?.costPerMiss == 1000)
    }

    /// Recorded before the counts were kept, or by a miss with none to keep.
    @Test func pricesASpotWithNoCountsAtAFullShoe() {
        let priced = CostFixture.counted(["hard-16-v-10": CostFixture.hard16Cell])
        let (s, prefs) = harness(playCost: priced)
        s.record(.deviations, ref: hard16v10, correct: false)
        #expect(s.weakSpotFor(.deviations)?.costPerMiss
            == priced.cheapestMiss(hard16v10, prefs.prefs.playContext))
    }

    /// The label on a cleared spot wants the same price as an outstanding one.
    @Test func pricesAClearedSpotToo() {
        let (s, _) = harness()
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        for _ in 0 ..< clearStreak {
            s.record(.basicStrategy, ref: hard16v10, correct: true)
        }
        #expect(s.clearedSpots(.basicStrategy).first?.costPerMiss != nil)
    }

    @Test func leavesEverySpotUnpricedWithNoTablesWiredIn() {
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
        let s = MissTallyStore(defaults: defaults)
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        #expect(s.weakSpotFor(.basicStrategy)?.costPerMiss == nil)
    }

    /// Both figures the Progress card prints, under the default table rules. A,7 v 9
    /// costs more on one miss than 16 v 10 does on two.
    @Test func runsTheProgressListInCostOrderAndSaysWhy() {
        let (s, _) = harness()
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: hard16v10, correct: false)
        s.record(.basicStrategy, ref: soft18v9, correct: false)
        #expect(s.weakSpots(.basicStrategy).map(ProgressSummary.spotDetail) == [
            "missed 1 of 1 · at least 8.4% a miss",
            "missed 2 of 2 · at least 0.5% a miss"
        ])
    }
}
