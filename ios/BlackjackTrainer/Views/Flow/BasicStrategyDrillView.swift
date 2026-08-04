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
    /// The hand as it stands: the deal's two cards, plus every card a correct hit
    /// has drawn since. The scenario keeps the opening deal, which is what a weak
    /// spot is filed against and what the next hand resets to.
    private(set) var hand: [Card]
    private(set) var result: EvaluationResult?
    private(set) var target = 0
    let session = DrillSession()

    /// A review round drills only the weak list; an ordinary round mixes it in.
    @ObservationIgnored private var reviewing = false

    init(
        engine: BasicStrategyEngine,
        generator: CardGenerator = CardGenerator(),
        stats: SessionStatsStore,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        missTally: MissTallyStore,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500),
        now: @escaping () -> Date = { Date() }
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
        let opening = Self.firstScenario(missTally: missTally, generator: generator)
        scenario = opening
        hand = opening.player.cards
        prefs.setLastTrainer(.basicStrategy)
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
    }

    convenience init(
        app: AppModel,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500),
        now: @escaping () -> Date = { Date() }
    ) {
        self.init(
            engine: app.basicStrategy,
            stats: app.basicStrategyStats,
            prefs: app.flowPrefs,
            history: app.practiceHistory,
            missTally: app.missTally,
            scheduler: scheduler,
            advanceDelay: advanceDelay,
            now: now
        )
    }

    var handsToday: Int {
        history.handsToday()
    }

    var question: HandQuestion {
        handQuestion(hand, dealerUpcard: scenario.dealerUpcard)
    }

    var legalActions: [Action] {
        legalActionsFor(
            hand,
            dealerUpcard: scenario.dealerUpcard,
            options: prefs.prefs.options
        )
    }

    /// Why the played-out hand stopped asking: a hit that busted, or one that
    /// reached 21 and left nothing to decide.
    var handOver: String {
        let total = Hand.total(hand)
        return total > 21 ? "Bust — \(total)." : "\(total) — nothing left to decide."
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
        let evaluation = gradeDecision(action)
        result = evaluation
        stats.recordAttempt(correct: evaluation.correct)
        // Only the opening decision is timed, and for the same reason only it is
        // filed as a weak spot: it is the question the drill has always asked. A
        // continued decision offers two buttons and one total where the deal
        // offers six and a pair-or-soft-or-hard lookup, so mixing them would
        // move the week's figure when the trainee turned a setting on rather
        // than when they got faster.
        let elapsedMs = hand.count == 2
            ? plausibleDecisionMs(Int(now().timeIntervalSince(askedAt) * 1000))
            : nil
        history.recordHand(correct: evaluation.correct, elapsedMs: elapsedMs)
        // Only the opening decision has a weak spot to file under: a
        // `ScenarioRef` names a two-card hand, and re-dealing a three-card 16 as
        // a two-card one would ask a different question (that one can double).
        if hand.count == 2 {
            missTally.record(
                .basicStrategy,
                ref: scenarioRefFor(scenario.player, dealerUpcard: scenario.dealerUpcard),
                correct: evaluation.correct
            )
        }
        session.record(evaluation.correct, elapsedMs: elapsedMs)

        if evaluation.correct {
            phase = .flash
            scheduler.schedule(after: advanceDelay) { [weak self] in self?.afterCorrect(action) }
        } else {
            phase = .miss
        }
    }

    /// The opening question is `decide`: two cards, every action on the table.
    /// Every question after it is `decidePlay` — the hand is deeper than two
    /// cards, so doubling, splitting and surrender are gone as a matter of the
    /// rules.
    private func gradeDecision(_ action: Action) -> EvaluationResult {
        guard hand.count == 2 else {
            return engine.evaluatePlay(
                PlayInput(
                    player: hand,
                    dealerUpcard: scenario.dealerUpcard,
                    ruleSet: prefs.prefs.ruleSet,
                    options: prefs.prefs.options,
                    canDouble: false,
                    canSplit: false,
                    canSurrender: false
                ),
                userAction: action
            )
        }
        return engine.evaluate(
            EngineInput(
                player: scenario.player,
                dealerUpcard: scenario.dealerUpcard,
                ruleSet: prefs.prefs.ruleSet,
                options: prefs.prefs.options
            ),
            userAction: action
        )
    }

    /// A hit is the one correct answer that leaves another decision behind it, so
    /// it draws the next card and asks again. Every other action ends the hand,
    /// exactly as it would at a table. Internal so tests can drive the loop
    /// without a real timer.
    func afterCorrect(_ action: Action) {
        guard prefs.prefs.playHandsOut, action == .hit else {
            advance()
            return
        }
        hand.append(generator.generateCard())
        // Busting, or reaching 21, ends the hand with nothing left to ask. Hold
        // the card that did it on screen — that is the answer to the hit — then
        // move on.
        if Hand.total(hand) >= 21 {
            phase = .over
            scheduler.schedule(after: advanceDelay * 2) { [weak self] in self?.advance() }
            return
        }
        result = nil
        phase = .question
        askedAt = now()
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

    /// Every later hand: weighted toward the scenarios being missed, so a weakness
    /// gets repetition inside the session that surfaced it. A review round draws
    /// from the weak list every time. Mirrors the web page's `nextScenario`.
    private func nextScenario() -> Scenario {
        let share = reviewing ? 1 : weakSpotShare
        let source = { Double.random(in: 0 ..< 1) }
        if let weak = pickWeakSpot(weakSpots, random: source, share: share) {
            return scenarioFromRef(weak.ref, random: source)
        }
        return generator.generate()
    }

    /// Load a scenario and reset to the question phase. A transition step and a
    /// test seam (mirrors the web page's settable `scenario` signal).
    func deal(_ scenario: Scenario) {
        self.scenario = scenario
        hand = scenario.player.cards
        result = nil
        phase = .question
        askedAt = now()
    }

    private func firstScenario() -> Scenario {
        Self.firstScenario(missTally: missTally, generator: generator)
    }

    /// Sessions open on the current weak spot when one exists — the Done screen's
    /// "Drill next" is a promise the next round keeps.
    private static func firstScenario(missTally: MissTallyStore,
                                      generator: CardGenerator) -> Scenario {
        if let weak = missTally.weakSpotFor(.basicStrategy) {
            return scenarioFromRef(weak.ref, random: { Double.random(in: 0 ..< 1) })
        }
        return generator.generate()
    }
}

/// The Basic Strategy drill screen in the Flow shell.
struct BasicStrategyDrillView: View {
    @State private var model: BasicStrategyDrillModel
    let onExit: () -> Void

    init(app: AppModel, onExit: @escaping () -> Void) {
        _model = State(initialValue: BasicStrategyDrillModel(app: app))
        self.onExit = onExit
    }

    var body: some View {
        Group {
            if model.phase == .done {
                FlowDoneView(
                    hands: model.handsToday,
                    target: model.target,
                    goalMet: model.goalMet,
                    bestStreak: model.session.bestStreak,
                    accuracy: model.session.accuracy,
                    medianSeconds: model.session.medianSeconds,
                    weakSpot: model.weakSpot,
                    weakSpots: model.weakSpots,
                    cleared: model.clearedSpots,
                    onAgain: { model.oneMoreRound() },
                    onReview: { model.reviewMisses() },
                    onExit: leave
                )
            } else {
                drillBody
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ground.ignoresSafeArea())
        .onDisappear { model.exit() }
    }

    private var drillBody: some View {
        VStack(spacing: 0) {
            FlowTopBarView(
                count: model.handsToday,
                target: model.target,
                streak: model.session.streak,
                onExit: leave
            )
            FlowStageView(player: model.hand, dealer: model.scenario.dealerUpcard) {
                DrillLineView(line: stageLine)
            }
            FlowActionsView(
                legal: model.legalActions,
                picked: model.picked,
                correct: model.correctAction,
                onAction: { model.answer($0) }
            )
            Text("tap anywhere to continue")
                .font(.system(size: 11))
                .tracking(1)
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
                .opacity(model.phase == .miss ? 1 : 0)
                .padding(.bottom, 8)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if model.phase == .miss { model.continueFromMiss() }
        }
    }

    /// The miss rule line, or the computed question line, as one styled Text.
    /// Basic-strategy miss: "Correct: <action>. <reason>"; question: the total
    /// computed for the user, e.g. "Hard 16 vs 10".
    private var stageLine: Text {
        if model.phase == .miss, let result = model.result {
            return Text("Correct: \(result.action.label). ").bold().foregroundStyle(Theme.accentInk)
                + Text(result.reason).foregroundStyle(Theme.midInk)
        }
        if model.phase == .over {
            return Text(model.handOver).bold().foregroundStyle(Theme.accentInk)
        }
        let question = model.question
        let prefix = question.prefix.isEmpty ? Text("") : Text("\(question.prefix) ")
        return prefix
            + Text(question.value).bold().foregroundStyle(Theme.inkStrong)
            + Text(" vs ")
            + Text(question.dealer).bold().foregroundStyle(Theme.inkStrong)
    }

    private func leave() {
        model.exit()
        onExit()
    }
}

/// Renders the composed question/rule line beneath the stage.
struct DrillLineView: View {
    let line: Text

    var body: some View {
        line
            .font(.system(size: 16))
            .foregroundStyle(Theme.midInk)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}
