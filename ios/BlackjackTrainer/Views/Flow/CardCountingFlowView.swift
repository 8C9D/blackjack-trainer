import Observation
import SwiftUI

/// Wraps the Card Counting drill's internal mechanics (the timed stream, count
/// entry, deck estimate, and live shoe) inside the Flow shell: a session top
/// bar, graded reps that count toward the daily goal, and a Done screen at the
/// target. Drill settings come from the Settings screen. Mirrors
/// `CardCountingPageComponent`.
@MainActor
@Observable
final class CardCountingFlowModel {
    @ObservationIgnored let counting: CountingModel
    @ObservationIgnored private let prefs: FlowPrefsStore
    @ObservationIgnored private let history: PracticeHistoryStore
    /// Which side a wrong running count lands on, over every mode that answers
    /// one — the half of a miscount the accuracy stores never carried. Recorded
    /// here, beside the other things a graded rep feeds, rather than inside the
    /// drill that only knows about its own round.
    @ObservationIgnored let countDrift: CountDriftStore
    let session = DrillSession()
    private(set) var target = 0
    private(set) var done = false

    init(
        counting: CountingModel,
        prefs: FlowPrefsStore,
        history: PracticeHistoryStore,
        countDrift: CountDriftStore = CountDriftStore()
    ) {
        self.counting = counting
        self.prefs = prefs
        self.history = history
        self.countDrift = countDrift
        prefs.setLastTrainer(.cardCounting)
        // Configure the drill entirely from the pre-made decisions.
        counting.settings = prefs.prefs.counting.drillSettings
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
            deckEstimationStore: app.deckEstimationStats
        )
        self.init(
            counting: counting,
            prefs: app.flowPrefs,
            history: app.practiceHistory,
            countDrift: app.countDrift
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

    func start() {
        counting.start()
    }

    func onEstimate(_ decks: Double) {
        counting.onEstimate(decks)
    }

    /// Grade a rep, then count it as one hand toward the daily goal and record it
    /// to the session (in addition to the per-trainer stat stores the counting
    /// model already writes).
    func answer(_ value: Double) {
        guard counting.state == .answering else { return }
        counting.answer(value)
        if let result = counting.result {
            countDrift.record(result)
            history.recordHand(correct: result.isCorrect)
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

    /// Render seam: a caller-built model, so probes and screenshots can pose a
    /// mid-round state (the pattern the showdown's screen used pre-trim).
    init(model: CardCountingFlowModel, onExit: @escaping () -> Void) {
        _model = State(initialValue: model)
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
                                    "Shoe reshuffled at the cut card — running count reset to 0."
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
        // The graded count lands as a silent panel swap; the spoken verdict is
        // VoiceOver's whole feedback loop (the web's sr-only status region).
        .onChange(of: model.counting.result) { _, result in
            guard let result else { return }
            let verdict: String = switch result {
            case let .running(graded):
                graded.isCorrect
                    ? "Correct: running count \(CountFormat.count(graded.correctRunningCount))."
                    : "Incorrect. The running count was "
                    + "\(CountFormat.count(graded.correctRunningCount)), you answered "
                    + "\(CountFormat.count(graded.userRunningCount))."
            case let .trueCount(graded):
                graded.isCorrect
                    ? "Correct: true count \(graded.correctTrueCount)."
                    : "Incorrect. The true count was \(graded.correctTrueCount), "
                    + "you answered \(graded.userTrueCount)."
            }
            AccessibilityNotification.Announcement(verdict).post()
        }
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
        case .feedback:
            feedbackView
        }
    }

    private var idleView: some View {
        VStack(spacing: 16) {
            Text(model.counting.system.name)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Theme.ink)
            Text(model.counting.settings.mode.label.uppercased())
                .font(.caption.weight(.semibold))
                .kerning(1)
                .foregroundStyle(Theme.accentInk)
            Text(model.counting.system.description)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            // What this system is for, on the screen the drill starts from —
            // the same three figures Settings shows next to the picker.
            // Non-breaking spaces inside each figure so the line wraps only at
            // the separators — "Insurance" over "correlation .76" reads as two
            // different things.
            Text(
                model.counting.system.metricLabels
                    .map {
                        "\($0.label) \($0.value)".replacingOccurrences(of: " ", with: "\u{00A0}")
                    }
                    .joined(separator: " · ")
            )
            .font(.caption)
            .monospacedDigit()
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            // The last moment before the cards start coming, on the screen that
            // names the system: the one place a trainee about to be graded on
            // these tags might want to read them.
            Button("See what each card is worth") {
                model.exit()
                router.go(.chart(.count))
            }
            .font(.footnote)
            .tint(Theme.accentInk)
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
    }

    private func leave() {
        model.exit()
        onExit()
    }
}
