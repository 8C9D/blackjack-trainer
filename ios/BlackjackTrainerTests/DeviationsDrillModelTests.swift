import Foundation
import Testing
@testable import BlackjackTrainer

/// Mirrors `deviations-drill-page.component.spec.ts`: the true count on the
/// question line, deviation grading, the surrender/insurance overlays, and the
/// session lifecycle.
@MainActor
struct DeviationsDrillModelTests {
    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    private func scenario(_ a: Rank, _ b: Rank, vs upcard: Rank, tc: Int) -> DeviationScenario {
        DeviationScenario(
            player: TwoCardHand(card(a), card(b, .hearts)),
            dealerUpcard: card(upcard, .clubs),
            trueCount: tc
        )
    }

    private func freshDefaults() -> UserDefaults {
        UserDefaults(suiteName: "test-\(UUID().uuidString)") ?? .standard
    }

    private struct Harness {
        let model: DeviationsDrillModel
        let scheduler: ManualFlowAdvanceScheduler
        let prefs: FlowPrefsStore
        let missTally: MissTallyStore
    }

    private func makeHarness(
        dailyGoal: Int = 20,
        systemId: String? = nil,
        manualTrueCount: Int? = nil,
        seedWeak: ScenarioRef? = nil,
        missedAt: Int? = nil
    ) -> Harness {
        let defaults = freshDefaults()
        let prefs = FlowPrefsStore(defaults: defaults)
        prefs.setDailyGoal(Double(dailyGoal))
        if let systemId {
            prefs.updateCounting { $0.systemId = systemId }
        }
        if let manualTrueCount {
            prefs.updateDeviations {
                $0.trueCountSource = .manual
                $0.manualTrueCount = manualTrueCount
            }
        }
        let history = PracticeHistoryStore(defaults: defaults)
        let missTally = MissTallyStore(defaults: defaults)
        // Seeded before the model is built: the opening hand is chosen in init.
        if let seedWeak {
            missTally.record(.deviations, ref: seedWeak, correct: false, trueCount: missedAt)
        }
        let stats = SessionStatsStore(key: StatsKeys.deviation, defaults: defaults)
        let scheduler = ManualFlowAdvanceScheduler()
        let model = DeviationsDrillModel(
            evaluator: TestEngines.shared.deviationEvaluator,
            charts: TestEngines.shared.charts,
            stats: stats,
            prefs: prefs,
            history: history,
            missTally: missTally,
            systems: TestEngines.shared.countingSystems,
            scheduler: scheduler,
            advanceDelay: .zero
        )
        return Harness(model: model, scheduler: scheduler, prefs: prefs, missTally: missTally)
    }

    @Test func recordsItselfAsTheLastTrainer() {
        let h = makeHarness()
        #expect(h.prefs.prefs.lastTrainer == .deviations)
    }

    @Test func joinsTheTrueCountToTheQuestionLine() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 4))
        #expect(h.model.question == HandQuestion(prefix: "Hard", value: "16", dealer: "10"))
        #expect(h.model.trueCountLabel == "+4")
    }

    @Test func gradesTheDeviationWhenTheThresholdIsMet() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
        h.model.answer(.stand)
        #expect(h.model.result?.correct == true)
        #expect(h.model.result?.deviationApplied == true)
        #expect(h.model.phase == .flash)
    }

    @Test func gradesBasicStrategyBelowTheThreshold() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: -2))
        h.model.answer(.stand)
        #expect(h.model.result?.correct == false)
        #expect(h.model.correctAction == .hit)
        #expect(h.model.phase == .miss)
    }

    @Test func showsTheDeviationExplanationOnAMiss() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
        h.model.answer(.hit)
        #expect(h.model.correctAction == .stand)
        #expect(h.model.explanation.contains("deviation"))
    }

    @Test func keepsSurrenderAnswerableWithLateSurrenderOff() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .eight, tc: 4))
        #expect(h.model.legalActions.contains(.surrender))
        h.model.answer(.surrender)
        #expect(h.model.result?.correct == true)
        #expect(h.model.correctAction == .surrender)
    }

    @Test func offersInsuranceOnlyAgainstAnAceAndGradesItByTrueCount() {
        let h = makeHarness()
        h.model.deal(scenario(.three, .four, vs: .queen, tc: 0))
        #expect(!h.model.legalActions.contains(.insurance))

        h.model.deal(scenario(.three, .four, vs: .ace, tc: 3))
        #expect(h.model.legalActions.contains(.insurance))
        h.model.answer(.insurance)
        #expect(h.model.result?.correct == true)
        #expect(h.model.result?.source == .insurance)
    }

    @Test func decliningInsuranceBelowThreeIsCorrect() {
        let h = makeHarness()
        h.model.deal(scenario(.three, .four, vs: .ace, tc: 0))
        h.model.answer(.insurance)
        #expect(h.model.result?.correct == false)
        #expect(h.model.explanation.contains("Decline insurance"))
    }

    @Test func talliesMissesUnderTheDeviationsTrainer() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
        h.model.answer(.hit)
        #expect(h.missTally.weakSpotFor(.deviations)?.label == "16 vs 10")
        #expect(h.missTally.weakSpotFor(.basicStrategy) == nil)
    }

    // The count is half a deviation question: 16 vs 10 stands at +2 and hits at
    // −1. A weak spot re-dealt at a fresh count can ask the side the trainee
    // already had right — and three of those would clear it without teaching.

    /// −12 is outside the trainer's random range, so drawing it proves the count
    /// came from the weak spot rather than from a fresh roll.
    private var hard16v10: ScenarioRef {
        ScenarioRef(kind: "hard", hand: "16", dealer: "10")
    }

    @Test func opensTheSessionAtACountTheScenarioWasMissedAt() {
        let h = makeHarness(seedWeak: hard16v10, missedAt: -12)
        #expect(h.model.scenario.trueCount == -12)
    }

    @Test func fallsBackToAFreshCountForASpotRecordedWithoutOne() {
        let h = makeHarness(seedWeak: hard16v10)
        let tc = h.model.scenario.trueCount
        #expect(tc >= DeviationTrainerConstants.minRandomTrueCount)
        #expect(tc <= DeviationTrainerConstants.maxRandomTrueCount)
    }

    /// A pinned manual count is the trainee naming the threshold they are
    /// drilling, so a weak spot must not override it.
    @Test func aPinnedManualCountStillWins() {
        let h = makeHarness(manualTrueCount: 4, seedWeak: hard16v10, missedAt: -12)
        #expect(h.model.scenario.trueCount == 4)
    }

    @Test func recordsTheCountTheMissWasActuallyMadeAt() {
        let h = makeHarness()
        h.model.deal(scenario(.king, .six, vs: .queen, tc: -2)) // hits at −2
        h.model.answer(.stand)
        #expect(h.missTally.weakSpotFor(.deviations)?.missedCounts == [-2])
    }

    @Test func reachesDoneAndOffersOneMoreRound() {
        let h = makeHarness(dailyGoal: 2)
        for _ in 0 ..< 2 {
            h.model.deal(scenario(.king, .six, vs: .queen, tc: 0))
            h.model.answer(.stand)
            h.scheduler.fire()
        }
        #expect(h.model.phase == .done)
        h.model.oneMoreRound()
        #expect(h.model.phase == .question)
        #expect(h.model.target == 4)
    }

    /// The drill grades against Hi-Lo indices whatever the counting trainer is
    /// set to. Silence there would have a Wong Halves counter drilling numbers
    /// their count never produces.
    @Test func staysQuietForAHiLoCounter() {
        let h = makeHarness()
        #expect(h.model.indexNote == nil)
    }

    @Test func namesAMismatchedCountingSystem() throws {
        let h = makeHarness(systemId: "wong-halves")
        let note = try #require(h.model.indexNote)
        #expect(note.contains("Wong Halves"))
        #expect(note.contains("Hi-Lo"))
    }

    @Test func staysQuietForAStoredSystemIdThisBuildDoesNotShip() {
        // That id resolves to Hi-Lo everywhere, so there is no mismatch to warn about.
        let h = makeHarness(systemId: "does-not-exist")
        #expect(h.model.indexNote == nil)
    }
}
