import SwiftUI

/// The Card Counting trainer screen.
struct CountingView: View {
    @State private var trainer: CountingModel

    init(app: AppModel) {
        _trainer = State(
            initialValue: CountingModel(
                systems: app.countingSystems,
                engine: app.counting,
                runningStore: app.runningCountStats,
                trueCountStore: app.trueCountStats,
                deckEstimationStore: app.deckEstimationStats,
                showdownStatsStore: app.showdownStats
            )
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    settings(trainer)
                    reshuffleBanner
                    drill(trainer)
                    statsSection(trainer)
                }
                .padding()
            }
            .appBackground()
            .navigationTitle("Card Counting")
        }
        .onDisappear { trainer.cancel() }
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

    @ViewBuilder
    private var reshuffleBanner: some View {
        if trainer.reshuffleNotice, trainer.state != .idle {
            Text("Shoe reshuffled at the cut card — running count reset to 0.")
                .font(.footnote)
                .foregroundStyle(Theme.accent)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
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
            sourceControl(trainer)
            drillFields(trainer)
            trueCountConfig(trainer)
            validationErrors(trainer)
        }
        .foregroundStyle(Theme.primaryText)
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .disabled(trainer.settingsLocked)
        .onChange(of: trainer.settings.numberOfDecks) { _, _ in trainer.invalidateShoe() }
        .onChange(of: trainer.settings.penetration) { _, _ in trainer.invalidateShoe() }
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
    private func sourceControl(_ trainer: CountingModel) -> some View {
        @Bindable var trainer = trainer
        if trainer.settings.mode == .trueCount {
            Picker("Decks source", selection: $trainer.settings.trueCountSource) {
                Text("Live shoe").tag(TrueCountSource.liveShoe)
                Text("Classic").tag(TrueCountSource.classic)
            }
            .pickerStyle(.segmented)
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
    }

    @ViewBuilder
    private func trueCountConfig(_ trainer: CountingModel) -> some View {
        @Bindable var trainer = trainer
        if trainer.settings.mode == .trueCount {
            if trainer.settings.trueCountSource == .classic {
                Picker("Decks remaining", selection: $trainer.settings.decksRemaining) {
                    ForEach(CountingConstants.decksRemainingPresets, id: \.self) { preset in
                        Text(CountFormat.decks(preset)).tag(preset)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.primaryText)
            } else {
                Picker("Number of decks", selection: $trainer.settings.numberOfDecks) {
                    ForEach(ShoeConstants.deckOptions, id: \.self) { decks in
                        Text("\(decks)").tag(decks)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.primaryText)
                Picker("Penetration", selection: $trainer.settings.penetration) {
                    ForEach(ShoeConstants.penetrationPresets, id: \.self) { value in
                        Text("\(Int((value * 100).rounded()))%").tag(value)
                    }
                }
                .pickerStyle(.menu)
                .tint(Theme.primaryText)
                Text("Decks remaining (live): \(CountFormat.decks(trainer.liveDecksRemaining))")
                    .font(.footnote)
                    .foregroundStyle(Theme.secondaryText)
            }
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
        case .estimating:
            DeckEstimateView { trainer.onEstimate($0) }
        case .answering:
            CountAnswerView(
                mode: trainer.settings.mode,
                allowFractions: trainer.fractionalAnswers
            ) { trainer.answer($0) }
        case .feedback:
            feedbackSection(trainer)
        case .showdown:
            showdownSection(trainer)
        }
    }

    @ViewBuilder
    private func feedbackSection(_ trainer: CountingModel) -> some View {
        if let result = trainer.result {
            CountFeedbackView(result: result, system: trainer.system) { trainer.start() }
        }
        if trainer.liveShoeTrueCount, trainer.showdownAvailable {
            Button("Play a hand vs the dealer") { trainer.enterShowdown() }
                .buttonStyle(.bordered)
                .tint(Theme.accent)
        }
    }

    @ViewBuilder
    private func showdownSection(_ trainer: CountingModel) -> some View {
        if let shoe = trainer.shoe {
            ShowdownView(shoe: shoe, ruleSet: .s17, stats: trainer.showdownStatsStore) {
                trainer.exitShowdown()
            }
        }
    }

    @ViewBuilder
    private func statsSection(_ trainer: CountingModel) -> some View {
        if trainer.liveShoeTrueCount {
            StatsPanelView(stats: trainer.trueCountStats, title: "True count") {
                trainer.resetTrueCountStats()
            }
            StatsPanelView(
                stats: trainer.deckEstimationStats,
                title: "Deck estimation (within ±0.5)"
            ) { trainer.resetDeckEstimationStats() }
        } else {
            StatsPanelView(stats: trainer.activeStats, title: statsTitle) {
                trainer.resetActiveStats()
            }
        }
    }

    private var statsTitle: String {
        trainer.settings.mode == .trueCount ? "True count" : "Running count"
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
