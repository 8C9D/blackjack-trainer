import Observation
import SwiftUI

/// Drives the Deviations drill in the Flow loop: identical to Basic Strategy
/// except the true count joins the question line and grading goes through the
/// deviation evaluator (insurance/surrender overlays included). Practice mode and
/// true-count source come from Settings. Mirrors `DeviationsDrillPageComponent`.
@MainActor
@Observable
final class DeviationsDrillModel {
    @ObservationIgnored private let evaluator: DeviationEvaluator
    @ObservationIgnored private let generator: CardGenerator
    @ObservationIgnored private let scenarioGenerator: DeviationScenarioGenerator
    @ObservationIgnored private let stats: SessionStatsStore
    @ObservationIgnored private let prefs: FlowPrefsStore
    @ObservationIgnored private let history: PracticeHistoryStore
    @ObservationIgnored private let missTally: MissTallyStore
    @ObservationIgnored private let scheduler: FlowAdvanceScheduler
    @ObservationIgnored private let advanceDelay: Duration
    /// The wall clock, injected so a spec can drive the decision timer. The
    /// drill grades whether the answer was right and has never said how long it
    /// took, which at a table is half of whether you can play.
    @ObservationIgnored private let now: () -> Date
    /// When the question on screen was put up.
    @ObservationIgnored private var askedAt = Date()
    @ObservationIgnored private let systems: [CountingSystem]

    private(set) var phase: DrillPhase = .question
    private(set) var scenario: DeviationScenario
    private(set) var result: DeviationTrainerResult?
    private(set) var target = 0
    let session = DrillSession()

    /// A review round drills only the weak list; an ordinary round mixes it in.
    @ObservationIgnored private var reviewing = false

    /// One hand, every deal: the chart's own entry into this drill.
    @ObservationIgnored private(set) var pinned: ScenarioRef?

    init(
        evaluator: DeviationEvaluator,
        charts: ChartsFile,
        generator: CardGenerator = CardGenerator(),
        stats: SessionStatsStore,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        missTally: MissTallyStore,
        systems: [CountingSystem] = [],
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500),
        now: @escaping () -> Date = { Date() },
        review: Bool = false,
        pinned: ScenarioRef? = nil
    ) {
        self.evaluator = evaluator
        self.generator = generator
        self.systems = systems
        scenarioGenerator = DeviationScenarioGenerator(rulesByRuleSet: charts.deviations)
        self.stats = stats
        self.prefs = prefs
        self.history = history
        self.missTally = missTally
        self.scheduler = scheduler ?? RealFlowAdvanceScheduler()
        self.advanceDelay = advanceDelay
        self.now = now
        askedAt = now()
        // Placeholder replaced immediately once every stored property is set.
        scenario = DeviationScenario(
            player: TwoCardHand(Card(rank: .two, suit: .spades), Card(rank: .two, suit: .spades)),
            dealerUpcard: Card(rank: .two, suit: .spades),
            trueCount: 0
        )
        prefs.setLastTrainer(.deviations)
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
        self.pinned = pinned
        scenario = firstScenario()
        // Arriving from Progress's weak-spot card, which is the same promise the
        // Done screen's "Drill my misses" makes — the round opens on the weakness
        // (`firstScenario` already does) and every later hand comes from the list,
        // each at a count it was actually missed at.
        reviewing = review
    }

    convenience init(
        app: AppModel,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500),
        now: @escaping () -> Date = { Date() },
        review: Bool = false,
        pinned: ScenarioRef? = nil
    ) {
        self.init(
            evaluator: app.deviationEvaluator,
            charts: app.charts,
            stats: app.deviationStats,
            prefs: app.flowPrefs,
            history: app.practiceHistory,
            missTally: app.missTally,
            systems: app.countingSystems,
            scheduler: scheduler,
            advanceDelay: advanceDelay,
            now: now,
            review: review,
            pinned: pinned
        )
    }

    func answer(_ action: Action) {
        guard phase == .question, legalActions.contains(action) else { return }
        let evaluation = evaluator.evaluate(
            scenario,
            userAction: action,
            ruleSet: prefs.prefs.ruleSet,
            options: prefs.prefs.options
        )
        result = evaluation
        stats.recordAttempt(correct: evaluation.correct)
        let elapsedMs = plausibleDecisionMs(Int(now().timeIntervalSince(askedAt) * 1000))
        history.recordHand(correct: evaluation.correct, elapsedMs: elapsedMs)
        // The count goes in with the miss: here it is half the question, and a
        // hand re-dealt at a fresh count is a different one.
        missTally.record(
            .deviations,
            ref: scenarioRefFor(scenario.player, dealerUpcard: scenario.dealerUpcard),
            correct: evaluation.correct,
            trueCount: scenario.trueCount
        )
        session.record(evaluation.correct, elapsedMs: elapsedMs)

        if evaluation.correct {
            phase = .flash
            scheduler.schedule(after: advanceDelay) { [weak self] in self?.advance() }
        } else {
            phase = .miss
        }
    }

    func continueFromMiss() {
        guard phase == .miss else { return }
        advance()
    }

    func oneMoreRound() {
        startRound(reviewing: false)
    }

    /// "Drill my misses": the same round, but every hand comes from the weak list
    /// (falling back to fresh hands once it empties mid-round).
    func reviewMisses() {
        guard missTally.weakSpotFor(.deviations) != nil else { return }
        startRound(reviewing: true)
    }

    private func startRound(reviewing: Bool) {
        guard phase == .done else { return }
        self.reviewing = reviewing
        // The pin belongs to the round the chart started, the same way review
        // mode belongs to the round the Done screen started: another round is
        // ordinary practice unless it is asked for again.
        pinned = nil
        session.reset()
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
        deal(firstScenario())
    }

    func exit() {
        scheduler.cancel()
    }

    func advance() {
        if history.handsToday() >= target {
            result = nil
            phase = .done
            return
        }
        deal(nextScenario())
    }
}

/// Which hand comes next, and at what count. An extension so the class body stays
/// inside the lint limit; `private` is file-scoped, so the stores are in reach.
@MainActor
extension DeviationsDrillModel {
    /// Every later hand: weighted toward the scenarios being missed, so a weakness
    /// gets repetition inside the session that surfaced it. A review round draws
    /// from the weak list every time. This applies in both practice modes — a weak
    /// spot recorded in deviation-only mode is itself a deviation scenario, and
    /// hand one has always been drawn this way.
    private func nextScenario() -> DeviationScenario {
        let source = { Double.random(in: 0 ..< 1) }
        if let pinned { return pinnedScenario(pinned, random: source) }
        let share = reviewing ? 1 : weakSpotShare
        if let weak = pickWeakSpot(weakSpots, random: source, share: share) {
            let base = scenarioFromRef(weak.ref, random: source)
            return DeviationScenario(
                player: base.player,
                dealerUpcard: base.dealerUpcard,
                trueCount: trueCount(for: weak, random: source)
            )
        }
        return generateScenario()
    }

    /// Load a scenario and reset to the question phase (transition + test seam).
    func deal(_ scenario: DeviationScenario) {
        self.scenario = scenario
        result = nil
        phase = .question
        askedAt = now()
    }

    private func firstScenario() -> DeviationScenario {
        if let pinned {
            return pinnedScenario(pinned, random: { Double.random(in: 0 ..< 1) })
        }
        if let weak = missTally.weakSpotFor(.deviations) {
            let source = { Double.random(in: 0 ..< 1) }
            let base = scenarioFromRef(weak.ref, random: source)
            return DeviationScenario(
                player: base.player,
                dealerUpcard: base.dealerUpcard,
                trueCount: trueCount(for: weak, random: source)
            )
        }
        return generateScenario()
    }

    /// The pinned hand, at whatever count the settings deal: the hand is pinned
    /// and the count is not, or the round only ever asks the side of an index the
    /// trainee already knows.
    private func pinnedScenario(_ ref: ScenarioRef, random: () -> Double) -> DeviationScenario {
        let base = scenarioFromRef(ref, random: random)
        return DeviationScenario(
            player: base.player,
            dealerUpcard: base.dealerUpcard,
            trueCount: pickTrueCount()
        )
    }

    /// 'all-hands' draws a uniformly random hand; 'deviation-only' builds the hand
    /// around an encoded rule with a true count biased 50/50 around its threshold.
    private func generateScenario() -> DeviationScenario {
        let prefs = prefs.prefs
        if prefs.deviations.practiceMode == .deviationOnly,
           let rule = scenarioGenerator.pickRule(for: prefs.ruleSet, options: prefs.options) {
            return scenarioGenerator.scenario(for: rule, trueCount: pickTrueCount(for: rule))
        }
        let base = generator.generate()
        return DeviationScenario(
            player: base.player,
            dealerUpcard: base.dealerUpcard,
            trueCount: pickTrueCount()
        )
    }

    /// A weak spot comes back at a count it was actually missed at. The hand alone
    /// is not the question here: 16 vs 10 is a stand at +2 and a hit at −1, so a
    /// re-deal at a fresh count can ask the side the trainee already had right —
    /// and three of those would clear the spot without teaching anything.
    /// A manually pinned count still wins: that is the trainee naming the
    /// threshold they are drilling.
    private func trueCount(for weak: WeakSpot, random: () -> Double) -> Int {
        if prefs.prefs.deviations.trueCountSource == .manual { return pickTrueCount() }
        // Empty for a spot recorded before the counts were kept: a fresh count is
        // what that scenario has always come back at.
        guard !weak.missedCounts.isEmpty else { return pickTrueCount() }
        let index = min(
            weak.missedCounts.count - 1,
            Int(random() * Double(weak.missedCounts.count))
        )
        return weak.missedCounts[index]
    }

    private func pickTrueCount() -> Int {
        let deviations = prefs.prefs.deviations
        if deviations.trueCountSource == .manual { return deviations.manualTrueCount }
        return randomTrueCount()
    }

    private func pickTrueCount(for rule: DeviationRule) -> Int {
        let deviations = prefs.prefs.deviations
        if deviations.trueCountSource == .manual { return deviations.manualTrueCount }
        return scenarioGenerator.pickTrueCount(
            for: rule,
            minTc: DeviationTrainerConstants.minRandomTrueCount,
            maxTc: DeviationTrainerConstants.maxRandomTrueCount
        )
    }

    private func randomTrueCount() -> Int {
        let span = DeviationTrainerConstants.maxRandomTrueCount
            - DeviationTrainerConstants.minRandomTrueCount + 1
        return DeviationTrainerConstants.minRandomTrueCount
            + min(Int(Double.random(in: 0 ..< 1) * Double(span)), span - 1)
    }
}

// The Deviations drill screen in the Flow shell.

/// The read-only half of the model: everything the screen renders and nothing
/// that mutates. Split out to keep the class body inside the lint limit; `private`
/// is file-scoped, so the stores it reads are still in reach.
@MainActor
extension DeviationsDrillModel {
    var handsToday: Int {
        history.handsToday()
    }

    var question: HandQuestion {
        handQuestion(scenario.player, dealerUpcard: scenario.dealerUpcard)
    }

    /// A pinned round narrows the practice to one hand, which is worth saying:
    /// the count still moves, so nothing else on screen says the hand will not.
    var pinnedLabel: String? {
        pinned.map(scenarioLabel)
    }

    var trueCountLabel: String {
        DeviationFeedback.formatTrueCount(scenario.trueCount)
    }

    /// The counts this drill grades against are Hi-Lo. A trainee who has picked
    /// another system in Settings would otherwise drill Hi-Lo indices against a
    /// count that never produces those numbers, and nothing on screen would say so.
    var indexNote: String? {
        systems.system(withId: prefs.prefs.counting.systemId).flatMap(DeviationIndexSystem.note)
    }

    var explanation: String {
        guard let result else { return "" }
        return DeviationFeedback.explanation(result, dealerAce: scenario.dealerUpcard.isAce)
    }

    /// The same six buttons the Basic Strategy drill offers, under the same table
    /// rules: with Late Surrender off there is no surrender to make, and the
    /// surrender overlay no longer asks for one.
    var legalActions: [Action] {
        legalActionsFor(
            scenario.player,
            dealerUpcard: scenario.dealerUpcard,
            options: prefs.prefs.options
        )
    }

    var picked: Action? {
        result?.userAction
    }

    var correctAction: Action? {
        result?.expectedAction
    }

    var goalMet: Bool {
        handsToday >= prefs.prefs.dailyGoal
    }

    var weakSpots: [WeakSpot] {
        missTally.weakSpots(.deviations)
    }

    var weakSpot: WeakSpot? {
        weakSpots.first
    }

    var clearedSpots: [WeakSpot] {
        missTally.clearedSpots(.deviations)
    }
}
