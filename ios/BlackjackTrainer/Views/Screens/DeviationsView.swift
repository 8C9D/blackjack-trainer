import Observation
import SwiftUI

/// Drives the Deviations trainer: a random two-card hand + upcard + practice true
/// count, graded against the BJA Hi-Lo overlay. Mirrors the web
/// `DeviationsPageComponent`. Kept separate from the view so the loop is testable.
@Observable
final class DeviationsModel {
    var ruleSet: RuleSet = .s17
    var options: EngineOptions = .default
    var trueCountSource: DeviationTrueCountSource = .random
    /// `nil` represents an invalid manual entry; next-hand is gated on it.
    var manualTrueCount: Int? = 0
    var practiceMode: DeviationPracticeMode = .allHands
    private(set) var scenario: DeviationScenario
    private(set) var result: DeviationTrainerResult?
    private(set) var lastWasDeviationCandidate = false

    @ObservationIgnored private let evaluator: DeviationEvaluator
    @ObservationIgnored private let statsStore: SessionStatsStore
    @ObservationIgnored private let generator: CardGenerator
    @ObservationIgnored private let scenarioGenerator: DeviationScenarioGenerator
    @ObservationIgnored private let random: () -> Double

    init(
        evaluator: DeviationEvaluator,
        charts: ChartsFile,
        statsStore: SessionStatsStore,
        random: @escaping () -> Double = { Double.random(in: 0 ..< 1) }
    ) {
        self.evaluator = evaluator
        self.statsStore = statsStore
        self.random = random
        generator = CardGenerator(random: random)
        scenarioGenerator = DeviationScenarioGenerator(
            random: random,
            rulesByRuleSet: charts.deviations
        )
        // Temporary placeholder; replaced by the first real scenario below (a
        // method call is only allowed once every stored property is set).
        scenario = DeviationScenario(
            player: TwoCardHand(Card(rank: .two, suit: .spades), Card(rank: .two, suit: .spades)),
            dealerUpcard: Card(rank: .two, suit: .spades),
            trueCount: 0
        )
        scenario = makeScenario()
    }

    var canDealNextHand: Bool {
        trueCountSource == .random || manualTrueCount != nil
    }

    var sessionStats: SessionStats {
        statsStore.stats
    }

    var formattedTrueCount: String {
        DeviationFeedback.formatTrueCount(scenario.trueCount)
    }

    var dealerAce: Bool {
        scenario.dealerUpcard.isAce
    }

    func answer(_ action: Action) {
        guard result == nil else { return }
        let evaluation = evaluator.evaluate(
            scenario, userAction: action, ruleSet: ruleSet, options: options
        )
        result = evaluation
        statsStore.recordAttempt(correct: evaluation.correct)
    }

    func nextHand() {
        guard canDealNextHand else { return }
        scenario = makeScenario()
        result = nil
    }

    /// Switch the true-count source; entering manual with no value resets to 0.
    func setTrueCountSource(_ source: DeviationTrueCountSource) {
        guard source != trueCountSource else { return }
        trueCountSource = source
        if source == .manual, manualTrueCount == nil { manualTrueCount = 0 }
    }

    func reset() {
        statsStore.reset()
    }

    private func makeScenario() -> DeviationScenario {
        if practiceMode == .deviationOnly, let rule = scenarioGenerator.pickRule(for: ruleSet) {
            lastWasDeviationCandidate = true
            return scenarioGenerator.scenario(for: rule, trueCount: pickTrueCount(for: rule))
        }
        lastWasDeviationCandidate = false
        let base = generator.generate()
        return DeviationScenario(
            player: base.player, dealerUpcard: base.dealerUpcard, trueCount: pickTrueCount()
        )
    }

    private func pickTrueCount() -> Int {
        trueCountSource == .manual ? (manualTrueCount ?? 0) : randomTrueCount()
    }

    private func pickTrueCount(for rule: DeviationRule) -> Int {
        if trueCountSource == .manual { return manualTrueCount ?? 0 }
        return scenarioGenerator.pickTrueCount(
            for: rule,
            minTc: DeviationTrainerConstants.minRandomTrueCount,
            maxTc: DeviationTrainerConstants.maxRandomTrueCount
        )
    }

    private func randomTrueCount() -> Int {
        let span = DeviationTrainerConstants.maxRandomTrueCount
            - DeviationTrainerConstants.minRandomTrueCount + 1
        return DeviationTrainerConstants.minRandomTrueCount + min(
            Int(random() * Double(span)),
            span - 1
        )
    }
}

/// The Deviations trainer screen.
struct DeviationsView: View {
    @State private var trainer: DeviationsModel

    init(app: AppModel) {
        _trainer = State(
            initialValue: DeviationsModel(
                evaluator: app.deviationEvaluator,
                charts: app.charts,
                statsStore: app.deviationStats
            )
        )
    }

    var body: some View {
        @Bindable var trainer = trainer
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    RuleControlsView(ruleSet: $trainer.ruleSet, options: $trainer.options)
                    practiceControls(trainer)
                    BlackjackTableView(
                        player: trainer.scenario.player,
                        dealerUpcard: trainer.scenario.dealerUpcard
                    )
                    trueCountReadout
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
            .navigationTitle("Deviations")
        }
    }

    private var trueCountReadout: some View {
        HStack {
            Text("Practice true count")
                .foregroundStyle(Theme.secondaryText)
            Spacer()
            Text(trainer.formattedTrueCount)
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func practiceControls(_ trainer: DeviationsModel) -> some View {
        @Bindable var trainer = trainer
        return VStack(alignment: .leading, spacing: 12) {
            Picker("Practice mode", selection: $trainer.practiceMode) {
                Text("All hands").tag(DeviationPracticeMode.allHands)
                Text("Deviation-only").tag(DeviationPracticeMode.deviationOnly)
            }
            .pickerStyle(.segmented)
            Picker("True count source", selection: sourceBinding(trainer)) {
                Text("Random").tag(DeviationTrueCountSource.random)
                Text("Manual").tag(DeviationTrueCountSource.manual)
            }
            .pickerStyle(.segmented)
            if trainer.trueCountSource == .manual {
                ManualTrueCountField(trainer: trainer)
            }
        }
        .foregroundStyle(Theme.primaryText)
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func sourceBinding(_ trainer: DeviationsModel) -> Binding<DeviationTrueCountSource> {
        Binding(get: { trainer.trueCountSource }, set: { trainer.setTrueCountSource($0) })
    }

    private func feedback(_ result: DeviationTrainerResult) -> some View {
        FeedbackShellView(
            correct: result.correct,
            nextDisabled: !trainer.canDealNextHand,
            onNext: { trainer.nextHand() }
        ) {
            VStack(alignment: .leading, spacing: 8) {
                if trainer.lastWasDeviationCandidate {
                    Text("Deviation candidate hand.")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                }
                detailRow("Hand", DeviationFeedback.handDescription(trainer.scenario))
                detailRow("True count", DeviationFeedback.formatTrueCount(result.trueCount))
                detailRow("Your action", result.userAction.label)
                detailRow("Correct action", result.expectedAction.label)
                detailRow("Basic strategy", result.basicAction.label)
                detailRow("Deviation applied", result.deviationApplied ? "Yes" : "No")
                if let rule = result.matchedRule {
                    detailRow("Matched rule", matchedRuleText(rule))
                }
                detailRow(
                    "Why",
                    DeviationFeedback.explanation(result, dealerAce: trainer.dealerAce)
                )
            }
        }
    }

    private func matchedRuleText(_ rule: DeviationRule) -> String {
        let action = Action(rawValue: rule.deviationAction)?.label ?? rule.deviationAction
        return "\(rule.playerHandLabel) vs \(rule.dealerUpcard) — \(action) "
            + "when \(DeviationFeedback.formatThreshold(rule))"
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

/// Manual true-count entry; keeps the raw text so an invalid value stays visible
/// while the model holds `nil`. Mirrors the web manual input.
private struct ManualTrueCountField: View {
    let trainer: DeviationsModel
    @State private var raw: String

    init(trainer: DeviationsModel) {
        self.trainer = trainer
        _raw = State(initialValue: trainer.manualTrueCount.map(String.init) ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("True count")
                    .foregroundStyle(Theme.primaryText)
                TextField("0", text: $raw)
                    .keyboardType(.numbersAndPunctuation)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 90)
                    .onChange(of: raw) { _, value in
                        trainer.manualTrueCount = parseManualTrueCount(value)
                    }
            }
            if trainer.manualTrueCount == nil {
                Text(
                    "Enter an integer between \(DeviationTrainerConstants.minManualTrueCount) "
                        + "and \(DeviationTrainerConstants.maxManualTrueCount)."
                )
                .font(.footnote)
                .foregroundStyle(Theme.incorrect)
            }
        }
    }
}
