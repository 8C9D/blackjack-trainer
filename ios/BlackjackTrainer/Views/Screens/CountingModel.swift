import Observation
import SwiftUI

/// Drives the Card Counting trainer: the classic running/true-count drill plus
/// (Slice 3.4) the live, depleting shoe with a decks-remaining estimate. Mirrors
/// the web `CardCountingPageComponent`. `@MainActor` because the card stream
/// advances from an async task. Kept separate from the view so the loop is
/// testable.
@MainActor
@Observable
final class CountingModel {
    enum DrillState {
        case idle, streaming, estimating, answering, feedback
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
    /// until the cut card. Not observed (it is a class mutated in place; the view
    /// re-reads it at round boundaries).
    @ObservationIgnored private(set) var shoe: Shoe?
    @ObservationIgnored private(set) var actualDecksRemaining: Double = 0
    @ObservationIgnored private(set) var deckEstimate: Double?

    @ObservationIgnored let systems: [CountingSystem]
    // Internal rather than private so the read-only accessors can live in
    // CountingModel+Presentation.swift (private is file-scoped in Swift).
    @ObservationIgnored let engine: CountingEngine
    @ObservationIgnored let runningStore: SessionStatsStore
    @ObservationIgnored let trueCountStore: SessionStatsStore
    @ObservationIgnored let deckEstimationStore: SessionStatsStore
    @ObservationIgnored private let generator: CardGenerator
    @ObservationIgnored let shoeFactory: ShoeFactory
    @ObservationIgnored private var streamTask: Task<Void, Never>?

    init(
        systems: [CountingSystem],
        engine: CountingEngine,
        runningStore: SessionStatsStore,
        trueCountStore: SessionStatsStore,
        deckEstimationStore: SessionStatsStore,
        generator: CardGenerator = CardGenerator(),
        shoeFactory: ShoeFactory = ShoeFactory()
    ) {
        self.systems = systems
        self.engine = engine
        self.runningStore = runningStore
        self.trueCountStore = trueCountStore
        self.deckEstimationStore = deckEstimationStore
        self.generator = generator
        self.shoeFactory = shoeFactory
        system = systems.first { $0.id == "hi-lo" } ?? systems[0]
    }

    /// Begin a drill (no-op while one is active or settings are invalid).
    func start() {
        guard !isDrillActive, validation.valid else { return }
        currentIndex = 0
        result = nil
        deckEstimate = nil
        cards = usesLiveShoe
            ? dealLiveShoeRound()
            : generator.generateSequence(settings.numberOfCards)
        state = .streaming
        streamTask?.cancel()
        streamTask = Task { [weak self] in await self?.runStream() }
    }

    private func runStream() async {
        // Duration arithmetic, not a nanosecond multiply: the stored pace is
        // only lower-bounded (parity with the web merge), and a huge value
        // must stall the stream rather than trap the conversion.
        let interval = Duration.milliseconds(max(1, settings.millisecondsBetweenCards))
        while !Task.isCancelled {
            try? await Task.sleep(for: interval)
            if Task.isCancelled { return }
            let next = currentIndex + 1
            if next >= cards.count {
                state = asksDeckEstimate ? .estimating : .answering
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

    /// The answer field validates shape, not magnitude, so a typed count wider
    /// than `Int` must grade as wrong rather than trap the conversion.
    private static func intAnswer(_ value: Double) -> Int {
        Int(min(max(value.rounded(), -1_000_000_000), 1_000_000_000))
    }

    func answer(_ value: Double) {
        guard state == .answering else { return }
        switch settings.mode {
        case .trueCount:
            if liveShoeTrueCount {
                answerLiveShoe(Self.intAnswer(value))
            } else {
                let evaluated = engine.evaluateTrueCount(
                    cards,
                    userTrueCount: Self.intAnswer(value),
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
    /// live shoe restarts fresh. A mode the new system cannot host coerces back
    /// to running count.
    func changeSystem(_ id: String) {
        guard let next = systems.first(where: { $0.id == id }) else { return }
        system = next
        invalidateShoe()
        if !next.allows(settings.mode) {
            settings.mode = .runningCount
        }
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
