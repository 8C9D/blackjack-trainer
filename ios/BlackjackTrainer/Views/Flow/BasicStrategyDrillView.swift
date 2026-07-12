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

    private(set) var phase: DrillPhase = .question
    private(set) var scenario: Scenario
    private(set) var result: EvaluationResult?
    private(set) var target = 0
    let session = DrillSession()

    init(
        engine: BasicStrategyEngine,
        generator: CardGenerator = CardGenerator(),
        stats: SessionStatsStore,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        missTally: MissTallyStore,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500)
    ) {
        self.engine = engine
        self.generator = generator
        self.stats = stats
        self.prefs = prefs
        self.history = history
        self.missTally = missTally
        self.scheduler = scheduler ?? RealFlowAdvanceScheduler()
        self.advanceDelay = advanceDelay
        scenario = Self.firstScenario(missTally: missTally, generator: generator)
        prefs.setLastTrainer(.basicStrategy)
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
    }

    convenience init(
        app: AppModel,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500)
    ) {
        self.init(
            engine: app.basicStrategy,
            stats: app.basicStrategyStats,
            prefs: app.flowPrefs,
            history: app.practiceHistory,
            missTally: app.missTally,
            scheduler: scheduler,
            advanceDelay: advanceDelay
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

    var picked: Action? {
        result?.userAction
    }

    var correctAction: Action? {
        result?.action
    }

    var goalMet: Bool {
        handsToday >= prefs.prefs.dailyGoal
    }

    var weakSpot: WeakSpot? {
        missTally.weakSpotFor(.basicStrategy)
    }

    func answer(_ action: Action) {
        guard phase == .question, legalActions.contains(action) else { return }
        let evaluation = engine.evaluate(
            EngineInput(
                player: scenario.player,
                dealerUpcard: scenario.dealerUpcard,
                ruleSet: prefs.prefs.ruleSet,
                options: prefs.prefs.options
            ),
            userAction: action
        )
        result = evaluation
        stats.recordAttempt(correct: evaluation.correct)
        history.recordHand()
        missTally.record(
            .basicStrategy,
            ref: scenarioRefFor(scenario.player, dealerUpcard: scenario.dealerUpcard),
            correct: evaluation.correct
        )
        session.record(evaluation.correct)

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
        guard phase == .done else { return }
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
        deal(generator.generate())
    }

    /// Load a scenario and reset to the question phase. A transition step and a
    /// test seam (mirrors the web page's settable `scenario` signal).
    func deal(_ scenario: Scenario) {
        self.scenario = scenario
        result = nil
        phase = .question
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
                    weakSpot: model.weakSpot,
                    onAgain: { model.oneMoreRound() },
                    onExit: leave
                )
            } else {
                drillBody
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ground.ignoresSafeArea())
    }

    private var drillBody: some View {
        VStack(spacing: 0) {
            FlowTopBarView(
                count: model.handsToday,
                target: model.target,
                streak: model.session.streak,
                onExit: leave
            )
            FlowStageView(player: model.scenario.player, dealer: model.scenario.dealerUpcard) {
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
            return Text("Correct: \(result.action.label). ").bold().foregroundStyle(Theme.accent)
                + Text(result.reason).foregroundStyle(Theme.midInk)
        }
        let question = model.question
        let prefix = question.prefix.isEmpty ? Text("") : Text("\(question.prefix) ")
        return prefix
            + Text(question.value).bold().foregroundStyle(.white)
            + Text(" vs ")
            + Text(question.dealer).bold().foregroundStyle(.white)
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
