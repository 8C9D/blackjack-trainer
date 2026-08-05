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
    /// Every hand the deal is holding, in the order they are played: one until a
    /// split makes more. A hand waiting behind the one in play holds a single
    /// card — its second is dealt when it is reached, as a dealer deals it.
    private(set) var hands: [[Card]] = []
    private(set) var activeIndex = 0
    /// Split aces take one card each and stand, so those hands are never asked a
    /// question — the rule the showdown's table already plays.
    private(set) var splitAces = false
    private(set) var result: DeviationTrainerResult?
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
    @ObservationIgnored var atDeal = true

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
        hands = [scenario.player.cards]
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
        //
        // The count goes in with the miss: here it is half the question, and a
        // hand re-dealt at a fresh count is a different one.
        if openingDecision {
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

    /// The deal's question takes every action on the table and the insurance
    /// overlay with it. Every question after it is a playing decision, where an
    /// index still applies — it is written against a total — told what the table
    /// still offers. Insurance is gone either way, and the engine narrows further
    /// on its own once the hand is deeper than two cards.
    private func gradeDecision(_ action: Action) -> DeviationTrainerResult {
        guard atDeal else {
            let split = splitContext
            return evaluator.evaluatePlay(
                PlayedOutHand(
                    player: hand,
                    dealerUpcard: scenario.dealerUpcard,
                    trueCount: scenario.trueCount,
                    ruleSet: prefs.prefs.ruleSet,
                    options: prefs.prefs.options,
                    canDouble: !split.fromSplit || prefs.prefs.options.doubleAfterSplit,
                    canSplit: split.canSplitAgain,
                    canSurrender: !split.fromSplit
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

    /// A hit and a split are the two correct answers that leave another decision
    /// behind them: a hit draws the next card and asks again, a split turns one
    /// hand into two and asks about each in turn — both at the same count, which
    /// is the scenario's given rather than a live shoe's. Stand, double and
    /// surrender finish the hand in front of you. Internal so tests can drive the
    /// loop without a real timer.
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

/// The hand-by-hand half of the loop: what a correct answer does to the cards in
/// front of you. An extension so the class body stays inside the lint limit;
/// `private` is file-scoped, so the generator and scheduler are still in reach.
@MainActor
private extension DeviationsDrillModel {
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
        hands = [scenario.player.cards]
        activeIndex = 0
        splitAces = false
        atDeal = true
        ask()
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

    /// The hand in front of you: the deal's two cards, plus every card a correct
    /// hit has drawn since. The scenario keeps the opening deal, which is what a
    /// weak spot is filed against and what the next hand resets to.
    var hand: [Card] {
        hands.indices.contains(activeIndex) ? hands[activeIndex] : []
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
    /// the count still moves, so nothing else on screen says the hand will not.
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
            hand,
            dealerUpcard: scenario.dealerUpcard,
            options: prefs.prefs.options,
            split: splitContext
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
