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
    /// The hand as it stands: the deal's two cards, plus every card a correct hit
    /// has drawn since. The scenario keeps the opening deal, which is what a weak
    /// spot is filed against and what the next hand resets to.
    private(set) var hand: [Card] = []
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
        systems: [CountingSystem] = [],
        scheduler: FlowAdvanceScheduler? = nil,
        advanceDelay: Duration = .milliseconds(500),
        now: @escaping () -> Date = { Date() },
        review: Bool = false
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
        scenario = firstScenario()
        hand = scenario.player.cards
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
        review: Bool = false
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
            review: review
        )
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
        // Only the opening decision has a weak spot to file under: a `ScenarioRef`
        // names a two-card hand, and re-dealing a three-card 16 as a two-card one
        // would ask a different question (that one can double).
        //
        // The count goes in with the miss: here it is half the question, and a
        // hand re-dealt at a fresh count is a different one.
        if hand.count == 2 {
            missTally.record(
                .deviations,
                ref: scenarioRefFor(scenario.player, dealerUpcard: scenario.dealerUpcard),
                correct: evaluation.correct,
                trueCount: scenario.trueCount
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

    /// The opening question takes every action on the table and the insurance
    /// overlay with it. Every question after it is a playing decision on a hand
    /// more than two cards deep, where an index still applies — it is written
    /// against a total — but doubling, splitting and surrender are gone.
    private func gradeDecision(_ action: Action) -> DeviationTrainerResult {
        guard hand.count == 2 else {
            return evaluator.evaluatePlay(
                PlayedOutHand(
                    player: hand,
                    dealerUpcard: scenario.dealerUpcard,
                    trueCount: scenario.trueCount,
                    ruleSet: prefs.prefs.ruleSet,
                    options: prefs.prefs.options
                ),
                userAction: action
            )
        }
        return evaluator.evaluate(
            scenario,
            userAction: action,
            ruleSet: prefs.prefs.ruleSet,
            options: prefs.prefs.options
        )
    }

    /// A hit is the one correct answer that leaves another decision behind it, so
    /// it draws the next card and asks again — at the same count, which is the
    /// scenario's given rather than a live shoe's. Internal so tests can drive
    /// the loop without a real timer.
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
                trueCount: trueCount(for: weak, random: source)
            )
        }
        return generateScenario()
    }

    /// Load a scenario and reset to the question phase (transition + test seam).
    func deal(_ scenario: DeviationScenario) {
        self.scenario = scenario
        hand = scenario.player.cards
        result = nil
        phase = .question
        askedAt = now()
    }

    private func firstScenario() -> DeviationScenario {
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
        handQuestion(hand, dealerUpcard: scenario.dealerUpcard)
    }

    /// Why the played-out hand stopped asking: a hit that busted, or one that
    /// reached 21 and left nothing to decide.
    var handOver: String {
        let total = Hand.total(hand)
        return total > 21 ? "Bust — \(total)." : "\(total) — nothing left to decide."
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

    /// Surrender stays answerable regardless of the Late Surrender rule: the
    /// deviation surrender overlay can expect SUR either way.
    var legalActions: [Action] {
        legalActionsFor(
            hand,
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
}

struct DeviationsDrillView: View {
    @State private var model: DeviationsDrillModel
    let onExit: () -> Void

    init(app: AppModel, review: Bool = false, onExit: @escaping () -> Void) {
        _model = State(initialValue: DeviationsDrillModel(app: app, review: review))
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
            if let note = model.indexNote {
                AdvisoryNoteView(text: note)
                    .padding(.top, 10)
            }
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

    private var stageLine: Text {
        if model.phase == .miss, let result = model.result {
            return Text("Correct: \(result.expectedAction.label). ").bold()
                .foregroundStyle(Theme.accentInk)
                + Text(model.explanation).foregroundStyle(Theme.midInk)
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
            + Text(" · TC ").foregroundStyle(Theme.muted)
            + Text(model.trueCountLabel).bold().foregroundStyle(Theme.accentInk)
    }

    private func leave() {
        model.exit()
        onExit()
    }
}
