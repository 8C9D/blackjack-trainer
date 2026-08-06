import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `flow-prefs.service.spec.ts`: tolerant field-by-field load over the
/// defaults, clamped daily goal, and persistence round-trips.
struct FlowPrefsStoreTests {
    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)")!
    }

    @Test func startsFromDefaultsWithNoStoredPayload() {
        let store = FlowPrefsStore(defaults: freshDefaults())
        #expect(store.prefs == FlowPrefs.default)
    }

    @Test func persistsUpdatesAndReloadsInAFreshInstance() {
        let defaults = freshDefaults()
        let store = FlowPrefsStore(defaults: defaults)
        store.setLastTrainer(.deviations)
        store.setDailyGoal(30)
        store.setRuleSet(.h17)
        store.setOptions(EngineOptions(doubleAfterSplit: true, lateSurrender: true))
        store.updateDeviations {
            $0.practiceMode = .deviationOnly
            $0.manualTrueCount = 4
        }
        store.updateCounting {
            $0.systemId = "ko"
            $0.numberOfCards = 40
        }

        let reloaded = FlowPrefsStore(defaults: defaults)
        let p = reloaded.prefs
        #expect(p.lastTrainer == .deviations)
        #expect(p.dailyGoal == 30)
        #expect(p.ruleSet == .h17)
        #expect(p.options == EngineOptions(doubleAfterSplit: true, lateSurrender: true))
        #expect(p.deviations.practiceMode == .deviationOnly)
        #expect(p.deviations.manualTrueCount == 4)
        #expect(p.deviations.trueCountSource == .random)
        #expect(p.counting.systemId == "ko")
        #expect(p.counting.numberOfCards == 40)
        #expect(p.counting.penetration == FlowPrefs.default.counting.penetration)
    }

    @Test func clampsTheDailyGoalIntoItsValidRange() {
        let store = FlowPrefsStore(defaults: freshDefaults())
        store.setDailyGoal(0)
        #expect(store.prefs.dailyGoal == FlowPrefsConstants.minDailyGoal)
        store.setDailyGoal(9999)
        #expect(store.prefs.dailyGoal == FlowPrefsConstants.maxDailyGoal)
        store.setDailyGoal(.nan)
        #expect(store.prefs.dailyGoal == FlowPrefs.default.dailyGoal)
    }

    @Test func fallsBackToDefaultsOnAMalformedPayload() {
        let defaults = freshDefaults()
        defaults.set(Data("{{nope".utf8), forKey: StatsKeys.flowPrefs)
        let store = FlowPrefsStore(defaults: defaults)
        #expect(store.prefs == FlowPrefs.default)
    }

    @Test func mergesAPartialPayloadFieldByFieldOverDefaults() {
        let merged = FlowPrefs.merged(from: ["dailyGoal": 15, "counting": ["mode": "true-count"]])
        #expect(merged.dailyGoal == 15)
        #expect(merged.counting.mode == .trueCount)
        #expect(merged.counting.systemId == FlowPrefs.default.counting.systemId)
        #expect(merged.lastTrainer == FlowPrefs.default.lastTrainer)
    }

    @Test func rejectsOutOfVocabularyEnumValuesPerField() {
        let merged = FlowPrefs.merged(from: [
            "lastTrainer": "poker",
            "ruleSet": "X17",
            "deviations": ["practiceMode": "chaos", "manualTrueCount": 2.5]
        ])
        #expect(merged.lastTrainer == FlowPrefs.default.lastTrainer)
        #expect(merged.ruleSet == FlowPrefs.default.ruleSet)
        #expect(merged.deviations.practiceMode == FlowPrefs.default.deviations.practiceMode)
        #expect(merged.deviations.manualTrueCount == 0)
    }

    /// A hand-edited backup is exactly the payload this merge exists for, and a
    /// whole number is not enough to make a manual true count practisable: the
    /// trainer has no indices written outside the range the stepper offers.
    /// The web loader clamps the same field, and the same file restores on both.
    @Test func rejectsAManualTrueCountOutsideTheStepperRange() {
        let high = FlowPrefs.merged(from: ["deviations": ["manualTrueCount": 5000]])
        #expect(high.deviations.manualTrueCount == FlowPrefs.default.deviations.manualTrueCount)

        let low = FlowPrefs.merged(from: ["deviations": ["manualTrueCount": -21]])
        #expect(low.deviations.manualTrueCount == FlowPrefs.default.deviations.manualTrueCount)

        // The ends of the range are practisable, so they survive the merge.
        let edge = FlowPrefs.merged(from: ["deviations": ["manualTrueCount": 20]])
        #expect(edge.deviations.manualTrueCount == 20)
        let lowEdge = FlowPrefs.merged(from: ["deviations": ["manualTrueCount": -20]])
        #expect(lowEdge.deviations.manualTrueCount == -20)
    }

    @Test func returnsDefaultsForANonObjectPayload() {
        #expect(FlowPrefs.merged(from: nil) == FlowPrefs.default)
        #expect(FlowPrefs.merged(from: "x") == FlowPrefs.default)
    }

    @Test func clampGoalRoundsAndClamps() {
        #expect(clampGoal(19.6) == 20)
        #expect(clampGoal(-3) == FlowPrefsConstants.minDailyGoal)
        #expect(clampGoal(.infinity) == FlowPrefs.default.dailyGoal)
    }

    @Test func keepsOnlyAKnownThemeDefaultingToSystem() {
        #expect(FlowPrefs.merged(from: ["theme": "light"]).theme == .light)
        #expect(FlowPrefs.merged(from: ["theme": "dark"]).theme == .dark)
        #expect(FlowPrefs.merged(from: ["theme": "sepia"]).theme == .system)
        // Prefs written before the theme existed must not lose it.
        #expect(FlowPrefs.merged(from: ["dailyGoal": 15]).theme == .system)
    }
}

/// The counting half of the same merge: system-dependent modes and shoe-sized
/// rounds. Split from `FlowPrefsStoreTests` to stay inside the suite's
/// type-body limit.
struct FlowPrefsCountingMergeTests {
    @Test func fallsBackFromAnUnknownCountingSystem() {
        let counting = FlowPrefs.merged(from: [
            "counting": ["systemId": "missing-system"]
        ]).counting
        #expect(counting.systemId == FlowPrefs.default.counting.systemId)
    }

    @Test func coercesAnUnbalancedSystemOutOfTrueCountMode() {
        let counting = FlowPrefs.merged(from: [
            "counting": [
                "systemId": "ko",
                "mode": "true-count",
                "trueCountSource": "classic"
            ]
        ]).counting
        #expect(counting.systemId == "ko")
        #expect(counting.mode == .runningCount)
    }

    /// A payload stored by a build that still shipped the archived modes (or by
    /// the web app, which keeps them) names a mode this build no longer hosts.
    /// It degrades to running count rather than erroring.
    @Test func coercesAnArchivedModeBackToRunningCount() {
        for mode in ["key-count", "bet-spread", "deck-speed"] {
            let counting = FlowPrefs.merged(from: [
                "counting": ["systemId": "hi-lo", "mode": mode]
            ]).counting
            #expect(counting.mode == .runningCount, "\(mode)")
        }
    }

    @Test func fallsBackFieldByFieldFromUnsupportedCountingNumbers() {
        let counting = FlowPrefs.merged(from: [
            "counting": [
                "numberOfCards": 0,
                "millisecondsBetweenCards": 99,
                "decksRemaining": 0.75,
                "numberOfDecks": 3,
                "penetration": 0.95
            ]
        ]).counting
        let fallback = FlowPrefs.default.counting
        #expect(counting.numberOfCards == fallback.numberOfCards)
        #expect(counting.millisecondsBetweenCards == fallback.millisecondsBetweenCards)
        #expect(counting.decksRemaining == fallback.decksRemaining)
        #expect(counting.numberOfDecks == fallback.numberOfDecks)
        #expect(counting.penetration == fallback.penetration)
    }

    @Test func rejectsALiveTrueCountRoundThatWouldConsumeTheWholeShoe() {
        let counting = FlowPrefs.merged(from: [
            "counting": [
                "systemId": "hi-lo",
                "mode": "true-count",
                "trueCountSource": "live-shoe",
                "numberOfDecks": 1,
                "numberOfCards": 52
            ]
        ]).counting
        #expect(counting.numberOfDecks == 1)
        #expect(counting.numberOfCards == FlowPrefs.default.counting.numberOfCards)
    }

    @Test func keepsSupportedCountingPreferencesUnchanged() {
        let counting = FlowPrefs.merged(from: [
            "counting": [
                "systemId": "omega-ii",
                "mode": "true-count",
                "numberOfCards": 40,
                "millisecondsBetweenCards": 250,
                "decksRemaining": 2.5,
                "trueCountSource": "live-shoe",
                "numberOfDecks": 2,
                "penetration": 0.8
            ]
        ]).counting
        #expect(counting == CountingPrefs(
            systemId: "omega-ii",
            mode: .trueCount,
            numberOfCards: 40,
            millisecondsBetweenCards: 250,
            decksRemaining: 2.5,
            trueCountSource: .liveShoe,
            numberOfDecks: 2,
            penetration: 0.8
        ))
    }
}
