import Observation
import SwiftUI

/// Drives the Card Counting trainer: the classic running/true-count drill plus
/// (Slice 3.4) the live, depleting shoe with a decks-remaining estimate and the
/// post-count showdown. Mirrors the web `CardCountingPageComponent`. `@MainActor`
/// because the card stream advances from an async task. Kept separate from the
/// view so the loop is testable.
@MainActor
@Observable
final class CountingModel {
    enum DrillState {
        case idle, streaming, estimating, answering, feedback, showdown
    }

    var system: CountingSystem
    var settings = CountingDrillSettings()
    private(set) var state: DrillState = .idle
    private(set) var cards: [Card] = []
    private(set) var currentIndex = 0
    private(set) var result: CountingDrillResult?
    private(set) var reshuffleNotice = false
    private(set) var shoeRunningCount: Double = 0

    /// The persistent live shoe; carries depletion + running count across rounds
    /// until the cut card, and is the showdown's card source. Not observed (it is
    /// a class mutated in place; the view re-reads it at round boundaries).
    @ObservationIgnored private(set) var shoe: Shoe?
    @ObservationIgnored private(set) var actualDecksRemaining: Double = 0
    @ObservationIgnored private(set) var deckEstimate: Double?

    @ObservationIgnored let systems: [CountingSystem]
    @ObservationIgnored let showdownStatsStore: ShowdownStatsStore
    @ObservationIgnored private let engine: CountingEngine
    @ObservationIgnored private let runningStore: SessionStatsStore
    @ObservationIgnored private let trueCountStore: SessionStatsStore
    @ObservationIgnored private let deckEstimationStore: SessionStatsStore
    @ObservationIgnored private let generator: CardGenerator
    @ObservationIgnored let shoeFactory: ShoeFactory
    @ObservationIgnored private var streamTask: Task<Void, Never>?

    init(
        systems: [CountingSystem],
        engine: CountingEngine,
        runningStore: SessionStatsStore,
        trueCountStore: SessionStatsStore,
        deckEstimationStore: SessionStatsStore,
        showdownStatsStore: ShowdownStatsStore,
        generator: CardGenerator = CardGenerator(),
        shoeFactory: ShoeFactory = ShoeFactory()
    ) {
        self.systems = systems
        self.engine = engine
        self.runningStore = runningStore
        self.trueCountStore = trueCountStore
        self.deckEstimationStore = deckEstimationStore
        self.showdownStatsStore = showdownStatsStore
        self.generator = generator
        self.shoeFactory = shoeFactory
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

    /// A balanced-system true-count drill reading a live, depleting shoe (vs the
    /// classic preset). Gates the deck-estimate step, the shoe, and the showdown.
    var liveShoeTrueCount: Bool {
        settings.mode == .trueCount
            && settings.trueCountSource == .liveShoe
            && system.balanced
    }

    var validation: SettingsValidation {
        engine.validateSettings(settings)
    }

    var isDrillActive: Bool {
        state == .streaming || state == .estimating || state == .answering
    }

    var settingsLocked: Bool {
        isDrillActive || state == .showdown
    }

    var currentCard: Card? {
        currentIndex >= 0 && currentIndex < cards.count ? cards[currentIndex] : nil
    }

    var liveDecksRemaining: Double {
        shoe?.decksRemaining ?? Double(settings.numberOfDecks)
    }

    private var activeStore: SessionStatsStore {
        settings.mode == .trueCount ? trueCountStore : runningStore
    }

    var activeStats: SessionStats {
        activeStore.stats
    }

    var trueCountStats: SessionStats {
        trueCountStore.stats
    }

    var deckEstimationStats: SessionStats {
        deckEstimationStore.stats
    }

    var showdownAvailable: Bool {
        guard let shoe else { return false }
        return shoe.cardsRemaining >= Showdown.minShowdownCards
    }

    /// Begin a drill (no-op while one is active or settings are invalid).
    func start() {
        guard !isDrillActive, validation.valid else { return }
        cards = liveShoeTrueCount
            ? dealLiveShoeRound()
            : generator.generateSequence(settings.numberOfCards)
        currentIndex = 0
        result = nil
        deckEstimate = nil
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
                state = liveShoeTrueCount ? .estimating : .answering
                return
            }
            currentIndex = next
        }
    }

    /// Live-shoe only: capture the decks-remaining estimate, then ask for the
    /// true count (scored against actual at answer time).
    func onEstimate(_ decks: Double) {
        guard state == .estimating else { return }
        deckEstimate = decks
        state = .answering
    }

    func answer(_ value: Double) {
        guard state == .answering else { return }
        switch settings.mode {
        case .trueCount:
            if liveShoeTrueCount {
                answerLiveShoe(Int(value))
            } else {
                let evaluated = engine.evaluateTrueCount(
                    cards,
                    userTrueCount: Int(value),
                    decksRemaining: settings.decksRemaining,
                    system: system
                )
                result = .trueCount(evaluated)
                trueCountStore.recordAttempt(correct: evaluated.isCorrect)
            }
        case .runningCount:
            let evaluated = engine.evaluate(cards, userRunningCount: value, system: system)
            result = .running(evaluated)
            runningStore.recordAttempt(correct: evaluated.isCorrect)
        }
        state = .feedback
    }

    /// Switch system; a different system means a different running count, so the
    /// live shoe restarts fresh. Unbalanced systems (KO) are running-count-only.
    func changeSystem(_ id: String) {
        guard let next = systems.first(where: { $0.id == id }) else { return }
        system = next
        invalidateShoe()
        if !next.balanced, settings.mode == .trueCount {
            settings.mode = .runningCount
        }
    }

    func enterShowdown() {
        guard state == .feedback, liveShoeTrueCount, showdownAvailable else { return }
        state = .showdown
    }

    func exitShowdown() {
        guard state == .showdown else { return }
        state = .feedback
    }

    func resetActiveStats() {
        activeStore.reset()
    }

    func resetTrueCountStats() {
        trueCountStore.reset()
    }

    func resetDeckEstimationStats() {
        deckEstimationStore.reset()
    }

    func cancel() {
        streamTask?.cancel()
        streamTask = nil
    }
}

// MARK: - live shoe internals

extension CountingModel {
    /// Reshuffle if needed, deal one round off the persistent shoe, and record the
    /// actual decks remaining (post-deal) for grading.
    func dealLiveShoeRound() -> [Card] {
        ensureShoeForRound()
        guard let shoe else { return [] }
        let round = shoe.deal(settings.numberOfCards)
        actualDecksRemaining = shoe.decksRemaining
        return round
    }

    /// Build a fresh shoe when there is none, the cut card has surfaced, or the
    /// shoe can't serve a full round. A reshuffle resets the carried running count
    /// and raises the notice.
    func ensureShoeForRound() {
        let needsFresh: Bool = if let shoe {
            shoe.needsReshuffle || shoe.cardsRemaining < settings.numberOfCards
        } else {
            true
        }
        if needsFresh {
            let replacing = shoe != nil
            shoe = shoeFactory.create(
                numberOfDecks: settings.numberOfDecks,
                penetration: settings.penetration
            )
            shoeRunningCount = 0
            reshuffleNotice = replacing
        } else {
            reshuffleNotice = false
        }
    }

    /// Discard the shoe so the next live-shoe round starts fresh (used when decks/
    /// penetration/system change makes the carried count meaningless).
    func invalidateShoe() {
        shoe = nil
        shoeRunningCount = 0
        reshuffleNotice = false
    }

    /// Grade a live-shoe true-count answer against the shoe's actual decks
    /// remaining (folding in the carried running count), score the deck estimate
    /// (±0.5), and carry the cumulative running count into the next round.
    private func answerLiveShoe(_ userTrueCount: Int) {
        let prior = shoeRunningCount
        let decks = actualDecksRemaining
        let evaluated = engine.evaluateTrueCount(
            cards,
            userTrueCount: userTrueCount,
            decksRemaining: decks,
            system: system,
            priorRunningCount: prior
        )
        var enriched = evaluated
        if let estimate = deckEstimate {
            let within = engine.scoreDeckEstimate(estimate: estimate, actual: decks)
            enriched.deckEstimate = estimate
            enriched.deckEstimateWithinBand = within
            deckEstimationStore.recordAttempt(correct: within)
        }
        result = .trueCount(enriched)
        trueCountStore.recordAttempt(correct: evaluated.isCorrect)
        shoeRunningCount = evaluated.correctRunningCount
    }
}
