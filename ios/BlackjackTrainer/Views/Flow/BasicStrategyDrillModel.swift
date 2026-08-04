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
    /// Every hand the deal is holding, in the order they are played: one until a
    /// split makes more. A hand waiting behind the one in play holds a single
    /// card — its second is dealt when it is reached, as a dealer deals it.
    private(set) var hands: [[Card]]
    private(set) var activeIndex = 0
    /// Split aces take one card each and stand, so those hands are never asked a
    /// question — the rule the showdown's table already plays.
    private(set) var splitAces = false

    /// The hand in front of you: the deal's two cards, plus every card a correct
    /// hit has drawn since. The scenario keeps the opening deal, which is what a
    /// weak spot is filed against and what the next hand resets to.
    var hand: [Card] {
        hands.indices.contains(activeIndex) ? hands[activeIndex] : []
    }

    private(set) var result: EvaluationResult?
    private(set) var target = 0
    let session = DrillSession()

    /// A review round drills only the weak list; an ordinary round mixes it in.
    @ObservationIgnored private var reviewing = false

    /// One hand, every deal: the chart's own entry into this drill.
    @ObservationIgnored private(set) var pinned: ScenarioRef?

    /// The deal's first decision — the question the drill has always asked, and
    /// the only one with a weak spot to file or a clock worth reading. A hit
    /// deepens the hand and a split replaces it; either way what follows is a
    /// different question from the one the deal put up.
    @ObservationIgnored private var atDeal = true

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
        let opening = Self.firstScenario(
            missTally: missTally,
            generator: generator,
            pinned: pinned
        )
        scenario = opening
        hands = [opening.player.cards]
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
        handQuestion(hand, dealerUpcard: scenario.dealerUpcard)
    }

    var legalActions: [Action] {
        legalActionsFor(
            hand,
            dealerUpcard: scenario.dealerUpcard,
            options: prefs.prefs.options,
            split: splitContext
        )
    }

    /// What a split has left the hand in front of you. More than one hand in play
    /// means every one of them came out of a split: a split replaces the hand that
    /// made it, so there is no unsplit hand left to confuse this with.
    var splitContext: SplitContext {
        SplitContext(fromSplit: hands.count > 1, canSplitAgain: hands.count < maxSplitHands)
    }

    var handLabel: String {
        hands.count < 2 ? "" : "Hand \(activeIndex + 1) of \(hands.count)"
    }

    /// A pinned round narrows the practice to one hand, which is worth saying:
    /// nothing else on screen distinguishes it from a run of coincidences.
    var pinnedLabel: String? {
        pinned.map(scenarioLabel)
    }

    /// Why the played-out hand stopped asking: a hit that busted, one that reached
    /// 21, or a split ace, which takes its one card and stands.
    var handOver: String {
        let cards = hand
        let total = Hand.total(cards)
        if total > 21 { return "Bust — \(total)." }
        if splitAces, cards.count == 2 { return "\(total) — split aces take one card." }
        return "\(total) — nothing left to decide."
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
        let openingDecision = atDeal
        let evaluation = gradeDecision(action)
        result = evaluation
        atDeal = false
        stats.recordAttempt(correct: evaluation.correct)
        // Only the deal's decision is timed, and for the same reason only it is
        // filed as a weak spot: it is the question the drill has always asked. A
        // continued decision offers two buttons and one total where the deal
        // offers six and a pair-or-soft-or-hard lookup, so mixing them would
        // move the week's figure when the trainee turned a setting on rather
        // than when they got faster. A hand out of a split is two cards again but
        // is not the deal: it cannot surrender, cannot insure, and doubles only
        // under DAS.
        let elapsedMs = openingDecision
            ? plausibleDecisionMs(Int(now().timeIntervalSince(askedAt) * 1000))
            : nil
        history.recordHand(correct: evaluation.correct, elapsedMs: elapsedMs)
        // Only the deal's decision has a weak spot to file under: a `ScenarioRef`
        // names the two cards that were dealt, and re-dealing a three-card 16 —
        // or the 11 a split of 8s made — as an opening hand asks a different
        // question.
        if openingDecision {
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

    /// The deal's question is `decide`: two cards, every action on the table.
    /// Every question after it is `decidePlay`, told what the table still offers —
    /// the engine narrows further on its own, since doubling, splitting and
    /// surrender are first-two-card actions whatever the caller passes.
    private func gradeDecision(_ action: Action) -> EvaluationResult {
        guard atDeal else {
            let split = splitContext
            return engine.evaluatePlay(
                PlayInput(
                    player: hand,
                    dealerUpcard: scenario.dealerUpcard,
                    ruleSet: prefs.prefs.ruleSet,
                    options: prefs.prefs.options,
                    canDouble: !split.fromSplit || prefs.prefs.options.doubleAfterSplit,
                    canSplit: split.canSplitAgain,
                    canSurrender: !split.fromSplit
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

    /// A hit and a split are the two correct answers that leave another decision
    /// behind them: a hit draws the next card and asks again, a split turns one
    /// hand into two and asks about each in turn. Stand, double and surrender
    /// finish the hand in front of you, exactly as they would at a table.
    /// Internal so tests can drive the loop without a real timer.
    func afterCorrect(_ action: Action) {
        guard prefs.prefs.playHandsOut else {
            advance()
            return
        }
        switch action {
        case .hit: drawToActive()
        case .split: splitActive()
        default: finishHand()
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

/// The hand-by-hand half of the loop: what a correct answer does to the cards in
/// front of you. An extension so the class body stays inside the lint limit;
/// `private` is file-scoped, so the generator and scheduler are still in reach.
@MainActor
private extension BasicStrategyDrillModel {
    func drawToActive() {
        hands[activeIndex].append(generator.generateCard())
        // Busting, or reaching 21, ends the hand with nothing left to ask.
        if Hand.total(hand) >= 21 {
            holdThenFinish()
            return
        }
        ask()
    }

    /// The two halves each keep one card; the one in play is dealt its second.
    func splitActive() {
        splitAces = hand.first?.isAce ?? false
        hands = splitHandAt(hands, activeIndex)
        dealSecondCard()
    }

    /// A hand out of a split arrives holding one card. Deal its second, then ask —
    /// unless it is a split ace, which takes that card and stands, or it landed on
    /// 21, which leaves nothing to decide either.
    func dealSecondCard() {
        hands[activeIndex].append(generator.generateCard())
        if splitAces || Hand.total(hand) >= 21 {
            holdThenFinish()
            return
        }
        ask()
    }

    /// Hold the card that ended the hand on screen — that is the answer to the
    /// decision before it — then move on.
    func holdThenFinish() {
        phase = .over
        scheduler.schedule(after: advanceDelay * 2) { [weak self] in self?.finishHand() }
    }

    /// The hand in front of you is done. A split leaves others waiting behind it;
    /// when none is left, so is the deal.
    func finishHand() {
        let next = activeIndex + 1
        guard next < hands.count else {
            advance()
            return
        }
        activeIndex = next
        dealSecondCard()
    }

    func ask() {
        result = nil
        phase = .question
        askedAt = now()
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
        hands = [scenario.player.cards]
        activeIndex = 0
        splitAces = false
        atDeal = true
        ask()
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
