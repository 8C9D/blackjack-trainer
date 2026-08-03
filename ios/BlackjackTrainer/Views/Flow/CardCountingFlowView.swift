import Observation
import SwiftUI

/// Wraps the Card Counting drill's internal mechanics (the timed stream, count
/// entry, deck estimate, live shoe, and post-count showdown) inside the Flow
/// shell: a session top bar, graded reps that count toward the daily goal, and a
/// Done screen at the target. Drill settings come from the Settings screen.
/// Mirrors `CardCountingPageComponent`.
@MainActor
@Observable
final class CardCountingFlowModel {
    @ObservationIgnored let counting: CountingModel
    @ObservationIgnored private let prefs: FlowPrefsStore
    @ObservationIgnored private let history: PracticeHistoryStore
    @ObservationIgnored let showdownBankroll: BankrollStore
    let session = DrillSession()
    private(set) var target = 0
    private(set) var done = false

    init(
        counting: CountingModel,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        bankroll: BankrollStore = BankrollStore()
    ) {
        self.counting = counting
        self.prefs = prefs
        self.history = history
        showdownBankroll = bankroll
        prefs.setLastTrainer(.cardCounting)
        // Configure the drill entirely from the pre-made decisions.
        counting.settings = prefs.prefs.counting.drillSettings
        counting.showdownSpots = prefs.prefs.counting.showdownSpots
        counting.showdownBetting = prefs.prefs.counting.showdownBetting
        if let system = counting.systems.first(where: { $0.id == prefs.prefs.counting.systemId }) {
            counting.system = system
        }
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
    }

    convenience init(app: AppModel) {
        let counting = CountingModel(
            systems: app.countingSystems,
            engine: app.counting,
            runningStore: app.runningCountStats,
            trueCountStore: app.trueCountStats,
            deckEstimationStore: app.deckEstimationStats,
            keyCountStore: app.keyCountStats,
            betSpreadStore: app.betSpreadStats,
            deckSpeedStore: app.deckSpeedStats,
            deckSpeedBestStore: app.deckSpeedBest,
            showdownStatsStore: app.showdownStats
        )
        self.init(
            counting: counting,
            prefs: app.flowPrefs,
            history: app.practiceHistory,
            bankroll: app.showdownBankroll
        )
    }

    var state: CountingModel.DrillState {
        counting.state
    }

    var handsToday: Int {
        history.handsToday()
    }

    var goalMet: Bool {
        handsToday >= prefs.prefs.dailyGoal
    }

    var ruleSet: RuleSet {
        prefs.prefs.ruleSet
    }

    var tableOptions: EngineOptions {
        prefs.prefs.options
    }

    func start() {
        counting.start()
    }

    func onEstimate(_ decks: Double) {
        counting.onEstimate(decks)
    }

    /// Grade a rep, then count it as one hand toward the daily goal and record it
    /// to the session (in addition to the per-trainer stat stores the counting
    /// model already writes). In key-count and bet-spread modes the count answer
    /// only advances to the second question — the rep is recorded there.
    func answer(_ value: Double) {
        guard counting.state == .answering else { return }
        counting.answer(value)
        if let result = counting.result {
            history.recordHand()
            session.record(result.isCorrect)
        }
    }

    /// The key-count drill's advantage call completes the rep.
    func advantage(_ saidYes: Bool) {
        guard counting.state == .advantage else { return }
        counting.answerAdvantage(saidYes)
        if let result = counting.result {
            history.recordHand()
            session.record(result.isCorrect)
        }
    }

    /// The deck-speed drill's self-paced advance; the last card ends the
    /// countdown and asks for the count.
    func flipNext() {
        counting.flipNext()
    }

    /// The bet-spread drill's bet completes the rep.
    func bet(_ units: Int) {
        guard counting.state == .betting else { return }
        counting.answerBet(units)
        if let result = counting.result {
            history.recordHand()
            session.record(result.isCorrect)
        }
    }

    /// After feedback: another rep, or the Done moment once the target is reached.
    func runAgain() {
        guard counting.state == .feedback else { return }
        if history.handsToday() >= target {
            done = true
            return
        }
        counting.start()
    }

    func oneMoreRound() {
        guard done else { return }
        session.reset()
        target = nextSessionTarget(handsToday: history.handsToday(), goal: prefs.prefs.dailyGoal)
        done = false
        counting.start()
    }

    func enterShowdown() {
        counting.enterShowdown()
    }

    /// Carries the showdown's dealt cards through so the drill can fold their
    /// running-count value into its carried count.
    func exitShowdown(_ dealtCards: [Card]) {
        counting.exitShowdown(dealtCards)
    }

    func exit() {
        counting.cancel()
    }
}

/// The Card Counting drill screen in the Flow shell.
struct CardCountingFlowView: View {
    @Environment(FlowRouter.self) private var router
    @State private var model: CardCountingFlowModel
    let onExit: () -> Void

    init(app: AppModel, onExit: @escaping () -> Void) {
        _model = State(initialValue: CardCountingFlowModel(app: app))
        self.onExit = onExit
    }

    var body: some View {
        Group {
            if model.done {
                FlowDoneView(
                    hands: model.handsToday,
                    target: model.target,
                    goalMet: model.goalMet,
                    bestStreak: model.session.bestStreak,
                    accuracy: model.session.accuracy,
                    weakSpot: nil,
                    onAgain: { model.oneMoreRound() },
                    onExit: leave
                )
            } else {
                VStack(spacing: 0) {
                    FlowTopBarView(
                        count: model.handsToday,
                        target: model.target,
                        streak: model.session.streak,
                        onExit: leave
                    )
                    ScrollView {
                        VStack(spacing: 20) {
                            if model.counting.reshuffleNotice, model.state != .idle {
                                Text(
                                    "Shoe reshuffled at the cut card — running count reset to "
                                        + "\(model.counting.countResetLabel)."
                                )
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                                .multilineTextAlignment(.center)
                            }
                            stage
                        }
                        .padding()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.ground.ignoresSafeArea())
        .onDisappear { model.exit() }
    }

    @ViewBuilder private var stage: some View {
        switch model.state {
        case .idle:
            idleView
        case .streaming:
            CountStreamView(
                card: model.counting.currentCard,
                index: model.counting.currentIndex,
                total: model.counting.cards.count
            )
        case .estimating:
            DeckEstimateView { model.onEstimate($0) }
        case .answering:
            CountAnswerView(
                mode: model.counting.settings.mode,
                allowFractions: model.counting.fractionalAnswers
            ) { model.answer($0) }
        case .flipping:
            deckSpeedStage
        case .advantage:
            AdvantageCallView { model.advantage($0) }
        case .betting:
            CountAnswerView(
                mode: model.counting.settings.mode,
                allowFractions: false,
                question: .bet
            ) { model.bet(Int($0)) }
        case .feedback:
            feedbackView
        case .showdown:
            showdownView
        }
    }

    /// The self-paced countdown: the card, the control that advances it, and the
    /// line of context. The stream view is reused so the card and its progress
    /// read identically to every other mode.
    private var deckSpeedStage: some View {
        VStack(spacing: 16) {
            CountStreamView(
                card: model.counting.currentCard,
                index: model.counting.currentIndex,
                total: model.counting.cards.count
            )
            Button { model.flipNext() } label: {
                Text("Next card")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .accentFilledButton()
            .keyboardShortcut(.space, modifiers: [])
            Text("One card is burned. Count the rest as fast as you can — the clock is running.")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
    }

    private var idleView: some View {
        VStack(spacing: 16) {
            Text(model.counting.system.name)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Theme.ink)
            Text(model.counting.system.description)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            if model.counting.validation.valid {
                Button { model.start() } label: {
                    Text("Start counting")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
            } else {
                Text("The drill settings need attention before this drill can start.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.bad)
                    .multilineTextAlignment(.center)
                Button("Open Settings") {
                    model.exit()
                    router.go(.settings)
                }
                .tint(Theme.accentInk)
            }
        }
        .padding(.top, 40)
    }

    @ViewBuilder private var feedbackView: some View {
        if let result = model.counting.result {
            CountFeedbackView(result: result, system: model.counting.system) { model.runAgain() }
        }
        if model.counting.usesLiveShoe, model.counting.showdownAvailable {
            Button(model.counting.showdownSpots > 1
                ? "Play \(model.counting.showdownSpots) hands vs the dealer"
                : "Play a hand vs the dealer") { model.enterShowdown() }
                .buttonStyle(.bordered)
                .tint(Theme.accentInk)
        }
    }

    @ViewBuilder private var showdownView: some View {
        if let shoe = model.counting.shoe {
            ShowdownView(
                shoe: shoe,
                ruleSet: model.ruleSet,
                stats: model.counting.showdownStatsStore,
                options: model.tableOptions,
                spots: model.counting.showdownSpots,
                betting: model.counting.showdownBetting,
                bankroll: model.showdownBankroll
            ) { dealtCards in
                model.exitShowdown(dealtCards)
            }
        }
    }

    private func leave() {
        model.exit()
        onExit()
    }
}
