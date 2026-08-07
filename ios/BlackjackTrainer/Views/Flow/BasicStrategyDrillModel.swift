import Observation
import SwiftUI

/// Drives the Basic Strategy drill inside the Flow shell: a correct answer
/// flashes in place and auto-advances, a miss is the loop's only pause, and the
/// session ends at the target. Mirrors `BasicStrategyDrillPageComponent`. Kept
/// separate from the view so the loop is testable.
@MainActor
@Observable
final class BasicStrategyDrillModel {
    @ObservationIgnored private let engine: BasicStrategyEngine
    @ObservationIgnored private let generator: CardGenerator
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

    private(set) var phase: DrillPhase = .question
    private(set) var scenario: Scenario
    private(set) var result: EvaluationResult?
    private(set) var target = 0
    let session = DrillSession()

    /// A review round drills only the weak list; an ordinary round mixes it in.
    @ObservationIgnored private var reviewing = false

    /// One hand, every deal: the chart's own entry into this drill.
    @ObservationIgnored private(set) var pinned: ScenarioRef?

    init(
        engine: BasicStrategyEngine,
        generator: CardGenerator = CardGenerator(),
        stats: SessionStatsStore,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        missTally: MissTallyStore,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500),
        now: @escaping () -> Date = { Date() },
        review: Bool = false,
        pinned: ScenarioRef? = nil
    ) {
        self.engine = engine
        self.generator = generator
        self.stats = stats
        self.prefs = prefs
        self.history = history
        self.missTally = missTally
        self.scheduler = scheduler ?? RealFlowAdvanceScheduler()
        self.advanceDelay = advanceDelay
        self.now = now
        askedAt = now()
        self.pinned = pinned
        scenario = Self.firstScenario(
            missTally: missTally,
            generator: generator,
            pinned: pinned
        )
        prefs.setLastTrainer(.basicStrategy)
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
        // Arriving from Progress's weak-spot card, which is the same promise the
        // Done screen's "Drill my misses" makes — the round opens on the weakness
        // (`firstScenario` already does) and every later hand comes from the list.
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
            engine: app.basicStrategy,
            stats: app.basicStrategyStats,
            prefs: app.flowPrefs,
            history: app.practiceHistory,
            missTally: app.missTally,
            scheduler: scheduler,
            advanceDelay: advanceDelay,
            now: now,
            review: review,
            pinned: pinned
        )
    }

    var handsToday: Int {
        history.handsToday()
    }

    var question: HandQuestion {
        handQuestion(scenario.player, dealerUpcard: scenario.dealerUpcard)
    }

    var legalActions: [Action] {
        legalActionsFor(
            scenario.player,
            dealerUpcard: scenario.dealerUpcard,
            options: prefs.prefs.options
        )
    }

    /// A pinned round narrows the practice to one hand, which is worth saying:
    /// nothing else on screen distinguishes it from a run of coincidences.
    var pinnedLabel: String? {
        pinned.map(scenarioLabel)
    }

    var picked: Action? {
        result?.userAction
    }

    var correctAction: Action? {
        result?.action
    }

    var goalMet: Bool {
        handsToday >= prefs.prefs.dailyGoal
    }

    var weakSpots: [WeakSpot] {
        missTally.weakSpots(.basicStrategy)
    }

    var weakSpot: WeakSpot? {
        weakSpots.first
    }

    var clearedSpots: [WeakSpot] {
        missTally.clearedSpots(.basicStrategy)
    }

    func answer(_ action: Action) {
        guard phase == .question, legalActions.contains(action) else { return }
        let evaluation = gradeAnswer(action)
        result = evaluation
        stats.recordAttempt(correct: evaluation.correct)
        let elapsedMs = plausibleDecisionMs(Int(now().timeIntervalSince(askedAt) * 1000))
        history.recordHand(correct: evaluation.correct, elapsedMs: elapsedMs)
        missTally.record(
            .basicStrategy,
            ref: scenarioRefFor(scenario.player, dealerUpcard: scenario.dealerUpcard),
            correct: evaluation.correct
        )
        session.record(evaluation.correct, elapsedMs: elapsedMs)

        if evaluation.correct {
            phase = .flash
            scheduler.schedule(after: advanceDelay) { [weak self] in self?.advance() }
        } else {
            phase = .miss
        }
    }

    /// The deal's question is `evaluate`: two cards, every action on the table.
    /// A pinned hard 20 is the one three-card deal (F4); its opening question
    /// is already a played hand's, read at the N-card total.
    private func gradeAnswer(_ action: Action) -> EvaluationResult {
        guard let opening = TwoCardHand(scenario.player) else {
            return engine.evaluateMultiCard(
                scenario.player,
                dealerUpcard: scenario.dealerUpcard,
                ruleSet: prefs.prefs.ruleSet,
                userAction: action
            )
        }
        return engine.evaluate(
            EngineInput(
                player: opening,
                dealerUpcard: scenario.dealerUpcard,
                ruleSet: prefs.prefs.ruleSet,
                options: prefs.prefs.options
            ),
            userAction: action
        )
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
        guard missTally.weakSpotFor(.basicStrategy) != nil else { return }
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

    /// Advance out of the flash/miss step: end at the target, else deal the next
    /// hand. Internal so tests can drive the loop without a real timer.
    func advance() {
        if history.handsToday() >= target {
            result = nil
            phase = .done
            return
        }
        deal(nextScenario())
    }
}

/// Which hand comes next. An extension so the class body stays inside the lint
/// limit; `private` is file-scoped, so the tally and generator are still in reach.
@MainActor
extension BasicStrategyDrillModel {
    /// Every later hand: weighted toward the scenarios being missed, so a weakness
    /// gets repetition inside the session that surfaced it. A review round draws
    /// from the weak list every time. Mirrors the web page's `nextScenario`.
    private func nextScenario() -> Scenario {
        let source = { Double.random(in: 0 ..< 1) }
        if let pinned { return scenarioFromRef(pinned, random: source) }
        let share = reviewing ? 1 : weakSpotShare
        if let weak = pickWeakSpot(weakSpots, random: source, share: share) {
            return scenarioFromRef(weak.ref, random: source)
        }
        return generator.generate()
    }

    /// Load a scenario and reset to the question phase. A transition step and a
    /// test seam (mirrors the web page's settable `scenario` signal).
    func deal(_ scenario: Scenario) {
        self.scenario = scenario
        result = nil
        phase = .question
        askedAt = now()
    }

    private func firstScenario() -> Scenario {
        Self.firstScenario(missTally: missTally, generator: generator, pinned: pinned)
    }

    /// Sessions open on the pinned hand when the chart named one, else on the
    /// current weak spot — the Done screen's "Drill next" is a promise the next
    /// round keeps.
    private static func firstScenario(
        missTally: MissTallyStore,
        generator: CardGenerator,
        pinned: ScenarioRef?
    ) -> Scenario {
        let source = { Double.random(in: 0 ..< 1) }
        if let pinned { return scenarioFromRef(pinned, random: source) }
        if let weak = missTally.weakSpotFor(.basicStrategy) {
            return scenarioFromRef(weak.ref, random: source)
        }
        return generator.generate()
    }
}
