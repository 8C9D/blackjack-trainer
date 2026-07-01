import Observation
import SwiftUI

/// Drives the Basic Strategy trainer: holds the current scenario, rule state,
/// and graded result, and records attempts. Mirrors the web
/// `BasicStrategyPageComponent`. Kept separate from the view so the deal →
/// answer → feedback → next loop is unit-testable.
@Observable
final class BasicStrategyModel {
    var ruleSet: RuleSet
    var options: EngineOptions
    private(set) var scenario: Scenario
    private(set) var result: EvaluationResult?

    @ObservationIgnored private let engine: BasicStrategyEngine
    @ObservationIgnored private let statsStore: SessionStatsStore
    @ObservationIgnored private let generator: CardGenerator

    init(
        engine: BasicStrategyEngine,
        statsStore: SessionStatsStore,
        generator: CardGenerator = CardGenerator(),
        ruleSet: RuleSet = .s17,
        options: EngineOptions = .default
    ) {
        self.engine = engine
        self.statsStore = statsStore
        self.generator = generator
        self.ruleSet = ruleSet
        self.options = options
        scenario = generator.generate()
    }

    var sessionStats: SessionStats {
        statsStore.stats
    }

    /// Grade the current hand (ignored once already answered) and record it.
    func answer(_ action: Action) {
        guard result == nil else { return }
        let input = EngineInput(
            player: scenario.player,
            dealerUpcard: scenario.dealerUpcard,
            ruleSet: ruleSet,
            options: options
        )
        let evaluation = engine.evaluate(input, userAction: action)
        result = evaluation
        statsStore.recordAttempt(correct: evaluation.correct)
    }

    func nextHand() {
        scenario = generator.generate()
        result = nil
    }

    func reset() {
        statsStore.reset()
    }
}

/// The Basic Strategy trainer screen: two-card hand vs dealer upcard, the six
/// actions, rule toggles, per-attempt feedback, and session stats.
struct BasicStrategyView: View {
    @State private var trainer: BasicStrategyModel

    init(app: AppModel) {
        _trainer = State(
            initialValue: BasicStrategyModel(
                engine: app.basicStrategy,
                statsStore: app.basicStrategyStats
            )
        )
    }

    var body: some View {
        @Bindable var trainer = trainer
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    RuleControlsView(ruleSet: $trainer.ruleSet, options: $trainer.options)
                    BlackjackTableView(
                        player: trainer.scenario.player,
                        dealerUpcard: trainer.scenario.dealerUpcard
                    )
                    ActionButtonsView(disabled: trainer.result != nil) { trainer.answer($0) }
                    if let result = trainer.result {
                        feedback(result)
                    }
                    StatsPanelView(stats: trainer.sessionStats, title: "Session stats") {
                        trainer.reset()
                    }
                }
                .padding()
            }
            .appBackground()
            .navigationTitle("Basic Strategy")
        }
        .sensoryFeedback(trigger: trainer.result) { _, new in
            guard let new else { return nil }
            return new.correct ? .success : .error
        }
        .sensoryFeedback(.selection, trigger: trainer.scenario)
    }

    private func feedback(_ result: EvaluationResult) -> some View {
        FeedbackShellView(correct: result.correct, onNext: { trainer.nextHand() }) {
            VStack(alignment: .leading, spacing: 10) {
                detailRow("Hand", result.handDescription)
                detailRow("Correct action", result.action.label)
                detailRow("Why", result.reason)
            }
        }
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.secondaryText)
            Text(value)
                .foregroundStyle(Theme.primaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
