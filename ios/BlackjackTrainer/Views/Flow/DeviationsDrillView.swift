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

    private(set) var phase: DrillPhase = .question
    private(set) var scenario: DeviationScenario
    private(set) var result: DeviationTrainerResult?
    private(set) var target = 0
    let session = DrillSession()

    /// A review round drills only the weak list; an ordinary round mixes it in.
    @ObservationIgnored private var reviewing = false

    init(
        evaluator: DeviationEvaluator,
        charts: ChartsFile,
        generator: CardGenerator = CardGenerator(),
        stats: SessionStatsStore,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        missTally: MissTallyStore,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500)
    ) {
        self.evaluator = evaluator
        self.generator = generator
        scenarioGenerator = DeviationScenarioGenerator(rulesByRuleSet: charts.deviations)
        self.stats = stats
        self.prefs = prefs
        self.history = history
        self.missTally = missTally
        self.scheduler = scheduler ?? RealFlowAdvanceScheduler()
        self.advanceDelay = advanceDelay
        // Placeholder replaced immediately once every stored property is set.
        scenario = DeviationScenario(
            player: TwoCardHand(Card(rank: .two, suit: .spades), Card(rank: .two, suit: .spades)),
            dealerUpcard: Card(rank: .two, suit: .spades),
            trueCount: 0
        )
        prefs.setLastTrainer(.deviations)
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
        scenario = firstScenario()
    }

    convenience init(
        app: AppModel,
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500)
    ) {
        self.init(
            evaluator: app.deviationEvaluator,
            charts: app.charts,
            stats: app.deviationStats,
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

    var trueCountLabel: String {
        DeviationFeedback.formatTrueCount(scenario.trueCount)
    }

    var explanation: String {
        guard let result else { return "" }
        return DeviationFeedback.explanation(result, dealerAce: scenario.dealerUpcard.isAce)
    }

    /// Surrender stays answerable regardless of the Late Surrender rule: the
    /// deviation surrender overlay can expect SUR either way.
    var legalActions: [Action] {
        legalActionsFor(
            scenario.player,
            dealerUpcard: scenario.dealerUpcard,
            options: prefs.prefs.options,
            surrenderAlways: true
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
        history.recordHand()
        missTally.record(
            .deviations,
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

    /// Every later hand: weighted toward the scenarios being missed, so a weakness
    /// gets repetition inside the session that surfaced it. A review round draws
    /// from the weak list every time. This applies in both practice modes — a weak
    /// spot recorded in deviation-only mode is itself a deviation scenario, and
    /// hand one has always been drawn this way.
    private func nextScenario() -> DeviationScenario {
        let share = reviewing ? 1 : weakSpotShare
        let source = { Double.random(in: 0 ..< 1) }
        if let weak = pickWeakSpot(weakSpots, random: source, share: share) {
            let base = scenarioFromRef(weak.ref, random: source)
            return DeviationScenario(
                player: base.player,
                dealerUpcard: base.dealerUpcard,
                trueCount: pickTrueCount()
            )
        }
        return generateScenario()
    }

    /// Load a scenario and reset to the question phase (transition + test seam).
    func deal(_ scenario: DeviationScenario) {
        self.scenario = scenario
        result = nil
        phase = .question
    }

    private func firstScenario() -> DeviationScenario {
        if let weak = missTally.weakSpotFor(.deviations) {
            let base = scenarioFromRef(weak.ref, random: { Double.random(in: 0 ..< 1) })
            return DeviationScenario(
                player: base.player,
                dealerUpcard: base.dealerUpcard,
                trueCount: pickTrueCount()
            )
        }
        return generateScenario()
    }

    /// 'all-hands' draws a uniformly random hand; 'deviation-only' builds the hand
    /// around an encoded rule with a true count biased 50/50 around its threshold.
    private func generateScenario() -> DeviationScenario {
        let prefs = prefs.prefs
        if prefs.deviations.practiceMode == .deviationOnly,
           let rule = scenarioGenerator.pickRule(for: prefs.ruleSet) {
            return scenarioGenerator.scenario(for: rule, trueCount: pickTrueCount(for: rule))
        }
        let base = generator.generate()
        return DeviationScenario(
            player: base.player,
            dealerUpcard: base.dealerUpcard,
            trueCount: pickTrueCount()
        )
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

/// The Deviations drill screen in the Flow shell.
struct DeviationsDrillView: View {
    @State private var model: DeviationsDrillModel
    let onExit: () -> Void

    init(app: AppModel, onExit: @escaping () -> Void) {
        _model = State(initialValue: DeviationsDrillModel(app: app))
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

    private var stageLine: Text {
        if model.phase == .miss, let result = model.result {
            return Text("Correct: \(result.expectedAction.label). ").bold()
                .foregroundStyle(Theme.accentInk)
                + Text(model.explanation).foregroundStyle(Theme.midInk)
        }
        let question = model.question
        let prefix = question.prefix.isEmpty ? Text("") : Text("\(question.prefix) ")
        return prefix
            + Text(question.value).bold().foregroundStyle(Theme.inkStrong)
            + Text(" vs ")
            + Text(question.dealer).bold().foregroundStyle(Theme.inkStrong)
            + Text(" · TC ").foregroundStyle(Theme.muted)
            + Text(model.trueCountLabel).bold().foregroundStyle(Theme.accentInk)
    }

    private func leave() {
        model.exit()
        onExit()
    }
}
