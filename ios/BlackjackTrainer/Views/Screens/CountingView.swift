import Observation
import SwiftUI

/// Drives the Card Counting trainer (classic running/true-count drill; the live
/// shoe + deck estimation + showdown land in Slice 3.4). Mirrors the running/
/// true-count slice of the web `CardCountingPageComponent`. `@MainActor` because
/// the card stream advances from an async task. Kept separate from the view so
/// the loop is testable.
@MainActor
@Observable
final class CountingModel {
    enum DrillState {
        case idle, streaming, answering, feedback
    }

    var system: CountingSystem
    var settings = CountingDrillSettings()
    private(set) var state: DrillState = .idle
    private(set) var cards: [Card] = []
    private(set) var currentIndex = 0
    private(set) var result: CountingDrillResult?

    @ObservationIgnored let systems: [CountingSystem]
    @ObservationIgnored private let engine: CountingEngine
    @ObservationIgnored private let runningStore: SessionStatsStore
    @ObservationIgnored private let trueCountStore: SessionStatsStore
    @ObservationIgnored private let generator: CardGenerator
    @ObservationIgnored private var streamTask: Task<Void, Never>?

    init(
        systems: [CountingSystem],
        engine: CountingEngine,
        runningStore: SessionStatsStore,
        trueCountStore: SessionStatsStore,
        generator: CardGenerator = CardGenerator()
    ) {
        self.systems = systems
        self.engine = engine
        self.runningStore = runningStore
        self.trueCountStore = trueCountStore
        self.generator = generator
        system = systems.first { $0.id == "hi-lo" } ?? systems[0]
    }

    var trueCountAvailable: Bool {
        system.balanced
    }

    /// Fractional running counts (Wong Halves) need decimal input; true counts
    /// are always whole, so this only applies in running-count mode.
    var fractionalAnswers: Bool {
        settings.mode == .runningCount && engine.isFractionalSystem(system)
    }

    var validation: SettingsValidation {
        engine.validateSettings(settings)
    }

    var isDrillActive: Bool {
        state == .streaming || state == .answering
    }

    var settingsLocked: Bool {
        isDrillActive
    }

    var currentCard: Card? {
        currentIndex >= 0 && currentIndex < cards.count ? cards[currentIndex] : nil
    }

    private var activeStore: SessionStatsStore {
        settings.mode == .trueCount ? trueCountStore : runningStore
    }

    var activeStats: SessionStats {
        activeStore.stats
    }

    /// Begin a drill (no-op while one is active or settings are invalid).
    func start() {
        guard !isDrillActive, validation.valid else { return }
        cards = generator.generateSequence(settings.numberOfCards)
        currentIndex = 0
        result = nil
        state = .streaming
        streamTask?.cancel()
        streamTask = Task { [weak self] in await self?.runStream() }
    }

    private func runStream() async {
        let interval = UInt64(max(1, settings.millisecondsBetweenCards)) * 1_000_000
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: interval)
            if Task.isCancelled { return }
            let next = currentIndex + 1
            if next >= cards.count {
                state = .answering
                return
            }
            currentIndex = next
        }
    }

    func answer(_ value: Double) {
        guard state == .answering else { return }
        if settings.mode == .trueCount {
            let evaluated = engine.evaluateTrueCount(
                cards,
                userTrueCount: Int(value),
                decksRemaining: settings.decksRemaining,
                system: system
            )
            result = .trueCount(evaluated)
            trueCountStore.recordAttempt(correct: evaluated.isCorrect)
        } else {
            let evaluated = engine.evaluate(cards, userRunningCount: value, system: system)
            result = .running(evaluated)
            runningStore.recordAttempt(correct: evaluated.isCorrect)
        }
        state = .feedback
    }

    /// Switch system; unbalanced systems (KO) are running-count-only, so coerce
    /// the mode back if true count was selected.
    func changeSystem(_ id: String) {
        guard let next = systems.first(where: { $0.id == id }) else { return }
        system = next
        if !next.balanced, settings.mode == .trueCount {
            settings.mode = .runningCount
        }
    }

    func resetActiveStats() {
        activeStore.reset()
    }

    func cancel() {
        streamTask?.cancel()
        streamTask = nil
    }
}

/// The Card Counting trainer screen.
struct CountingView: View {
    @State private var trainer: CountingModel

    init(app: AppModel) {
        _trainer = State(
            initialValue: CountingModel(
                systems: app.countingSystems,
                engine: app.counting,
                runningStore: app.runningCountStats,
                trueCountStore: app.trueCountStats
            )
        )
    }

    var body: some View {
        @Bindable var trainer = trainer
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    settings(trainer)
                    drill(trainer)
                    StatsPanelView(stats: trainer.activeStats, title: statsTitle) {
                        trainer.resetActiveStats()
                    }
                }
                .padding()
            }
            .appBackground()
            .navigationTitle("Card Counting")
        }
        .onDisappear { trainer.cancel() }
    }

    private var statsTitle: String {
        trainer.settings.mode == .trueCount ? "True count" : "Running count"
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(trainer.system.name)
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
            Text(trainer.system.description)
                .font(.subheadline)
                .foregroundStyle(Theme.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - settings

    private func settings(_ trainer: CountingModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Counting system", selection: systemBinding(trainer)) {
                ForEach(trainer.systems, id: \.id) { system in
                    Text(system.name).tag(system.id)
                }
            }
            .pickerStyle(.menu)
            .tint(Theme.primaryText)

            modeControl(trainer)
            drillFields(trainer)
            validationErrors(trainer)
        }
        .foregroundStyle(Theme.primaryText)
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .disabled(trainer.settingsLocked)
    }

    @ViewBuilder
    private func modeControl(_ trainer: CountingModel) -> some View {
        @Bindable var trainer = trainer
        if trainer.trueCountAvailable {
            Picker("Mode", selection: $trainer.settings.mode) {
                Text("Running count").tag(DrillMode.runningCount)
                Text("True count").tag(DrillMode.trueCount)
            }
            .pickerStyle(.segmented)
        } else {
            Text(
                "True count is only trained for balanced systems; this one is "
                    + "unbalanced, so only running count is available."
            )
            .font(.footnote)
            .foregroundStyle(Theme.secondaryText)
        }
    }

    @ViewBuilder
    private func drillFields(_ trainer: CountingModel) -> some View {
        @Bindable var trainer = trainer
        Stepper(
            "Number of cards: \(trainer.settings.numberOfCards)",
            value: $trainer.settings.numberOfCards,
            in: 1 ... CountingConstants.maxCardsPerDrill
        )
        Stepper(
            "Time between cards: \(trainer.settings.millisecondsBetweenCards) ms",
            value: $trainer.settings.millisecondsBetweenCards,
            in: CountingConstants.minMillisecondsBetweenCards ... 5000,
            step: 100
        )
        if trainer.settings.mode == .trueCount {
            Picker("Decks remaining", selection: $trainer.settings.decksRemaining) {
                ForEach(CountingConstants.decksRemainingPresets, id: \.self) { preset in
                    Text(CountFormat.decks(preset)).tag(preset)
                }
            }
            .pickerStyle(.menu)
            .tint(Theme.primaryText)
        }
    }

    @ViewBuilder
    private func validationErrors(_ trainer: CountingModel) -> some View {
        if !trainer.validation.valid {
            ForEach(trainer.validation.errors, id: \.self) { error in
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Theme.incorrect)
            }
        }
    }

    private func systemBinding(_ trainer: CountingModel) -> Binding<String> {
        Binding(get: { trainer.system.id }, set: { trainer.changeSystem($0) })
    }

    // MARK: - drill

    @ViewBuilder
    private func drill(_ trainer: CountingModel) -> some View {
        switch trainer.state {
        case .idle:
            Button { trainer.start() } label: {
                Text("Start drill")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .keyboardShortcut(.return, modifiers: [])
            .disabled(!trainer.validation.valid)
        case .streaming:
            CountStreamView(
                card: trainer.currentCard,
                index: trainer.currentIndex,
                total: trainer.cards.count
            )
        case .answering:
            CountAnswerView(mode: trainer.settings.mode,
                            allowFractions: trainer.fractionalAnswers) {
                trainer.answer($0)
            }
        case .feedback:
            if let result = trainer.result {
                CountFeedbackView(result: result, system: trainer.system) { trainer.start() }
            }
        }
    }
}

/// The streamed card plus a progress readout, mirroring `card-stream`.
struct CountStreamView: View {
    let card: Card?
    let index: Int
    let total: Int

    var body: some View {
        VStack(spacing: 12) {
            if let card {
                CardImage(card, width: 120)
            } else {
                CardImage(faceDown: 120)
            }
            Text("Card \(min(index + 1, max(total, 1))) of \(total)")
                .foregroundStyle(Theme.secondaryText)
                .accessibilityLabel("Card \(min(index + 1, max(total, 1))) of \(total)")
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}
