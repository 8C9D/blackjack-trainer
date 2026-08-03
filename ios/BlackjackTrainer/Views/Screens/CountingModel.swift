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
        case idle, streaming, estimating, answering, advantage, betting, flipping, feedback,
             showdown
    }

    var system: CountingSystem
    var settings = CountingDrillSettings()
    /// Boxes the post-count showdown deals to, pushed in from the Settings prefs
    /// alongside `settings` (it configures the showdown, not the count drill).
    var showdownSpots = 1
    /// Whether the showdown opens each round on a bet, pushed in from prefs.
    var showdownBetting = false
    /// Whether leaving the showdown asks what its cards did to the count.
    var showdownCountCheck = true
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
    /// Key-count and bet-spread modes: the count answer held while the second
    /// question is up, graded with it in `answerAdvantage` / `answerBet`.
    @ObservationIgnored private var pendingUserCount: Double = 0

    @ObservationIgnored let systems: [CountingSystem]
    @ObservationIgnored let showdownStatsStore: ShowdownStatsStore
    // Internal rather than private so the read-only accessors can live in
    // CountingModel+Presentation.swift (private is file-scoped in Swift).
    @ObservationIgnored let engine: CountingEngine
    @ObservationIgnored let runningStore: SessionStatsStore
    @ObservationIgnored let trueCountStore: SessionStatsStore
    @ObservationIgnored let deckEstimationStore: SessionStatsStore
    @ObservationIgnored let keyCountStore: SessionStatsStore
    @ObservationIgnored let betSpreadStore: SessionStatsStore
    @ObservationIgnored let deckSpeedStore: SessionStatsStore
    @ObservationIgnored let deckSpeedBestStore: DeckSpeedBestStore
    @ObservationIgnored private let generator: CardGenerator
    @ObservationIgnored let shoeFactory: ShoeFactory
    @ObservationIgnored private var streamTask: Task<Void, Never>?
    /// The clock the deck-speed stopwatch reads, injectable so a test can drive
    /// it (the drill is self-paced, so there is no timer to fast-forward).
    @ObservationIgnored private let now: () -> Date
    /// Deck-speed state: the card held back from the deck, and the stopwatch.
    @ObservationIgnored private var burnedCard: Card?
    @ObservationIgnored private var startedAt: Date?
    @ObservationIgnored private var elapsedMilliseconds = 0

    init(
        systems: [CountingSystem],
        engine: CountingEngine,
        runningStore: SessionStatsStore,
        trueCountStore: SessionStatsStore,
        deckEstimationStore: SessionStatsStore,
        keyCountStore: SessionStatsStore,
        betSpreadStore: SessionStatsStore,
        deckSpeedStore: SessionStatsStore,
        deckSpeedBestStore: DeckSpeedBestStore,
        showdownStatsStore: ShowdownStatsStore,
        generator: CardGenerator = CardGenerator(),
        shoeFactory: ShoeFactory = ShoeFactory(),
        now: @escaping () -> Date = Date.init
    ) {
        self.systems = systems
        self.engine = engine
        self.runningStore = runningStore
        self.trueCountStore = trueCountStore
        self.deckEstimationStore = deckEstimationStore
        self.keyCountStore = keyCountStore
        self.betSpreadStore = betSpreadStore
        self.deckSpeedStore = deckSpeedStore
        self.deckSpeedBestStore = deckSpeedBestStore
        self.showdownStatsStore = showdownStatsStore
        self.now = now
        self.generator = generator
        self.shoeFactory = shoeFactory
        system = systems.first { $0.id == "hi-lo" } ?? systems[0]
    }

    /// Whether the post-count showdown can be offered: a live shoe still short
    /// of its cut card, with enough cards to deal an opening round to every
    /// configured box.
    var showdownAvailable: Bool {
        guard let shoe, !shoe.needsReshuffle else { return false }
        return shoe.cardsRemaining >= Showdown.minCards(forSpots: showdownSpots)
    }

    /// The cut card surfaced during the round just counted, so there is no hand
    /// to play off this shoe — the next round is dealt from a fresh one. Said
    /// where the showdown button would have been, rather than letting it vanish.
    var shoeSpent: Bool {
        shoe?.needsReshuffle ?? false
    }

    /// Begin a drill (no-op while one is active or settings are invalid).
    func start() {
        guard !isDrillActive, validation.valid else { return }
        currentIndex = 0
        result = nil
        deckEstimate = nil
        if settings.mode == .deckSpeed {
            dealBurnedDeck()
            // No timer: the player sets the pace, and the clock starts on the
            // first card they are already looking at.
            startedAt = now()
            state = .flipping
            return
        }
        cards = usesLiveShoe
            ? dealLiveShoeRound()
            : generator.generateSequence(settings.numberOfCards)
        state = .streaming
        streamTask?.cancel()
        streamTask = Task { [weak self] in await self?.runStream() }
    }

    /// Shuffle a single deck, hold one card back, and show the other 51. The
    /// burned card is the answer's proof: a full deck sums to a known constant,
    /// so the count of the 51 is that constant minus the burned card's tag.
    private func dealBurnedDeck() {
        let deck = shoeFactory.create(numberOfDecks: 1, penetration: 1)
            .deal(ShoeConstants.cardsPerDeck)
        burnedCard = deck.last
        cards = Array(deck.prefix(DeckSpeed.cards))
    }

    /// Advance the self-paced countdown; the last card stops the clock and asks
    /// for the count.
    func flipNext() {
        guard state == .flipping else { return }
        let next = currentIndex + 1
        if next >= cards.count {
            elapsedMilliseconds = Int((now().timeIntervalSince(startedAt ?? now())) * 1000)
            state = .answering
            return
        }
        currentIndex = next
    }

    private func runStream() async {
        let interval = UInt64(max(1, settings.millisecondsBetweenCards)) * 1_000_000
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: interval)
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

    func answer(_ value: Double) {
        guard state == .answering else { return }
        switch settings.mode {
        case .keyCount:
            // Hold the count answer and ask for the advantage call; both are
            // graded together in answerAdvantage.
            pendingUserCount = value
            state = .advantage
            return
        case .betSpread:
            // Same hold, but the second question is the bet.
            pendingUserCount = value
            state = .betting
            return
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
        case .deckSpeed:
            gradeDeckSpeed(value)
        case .runningCount:
            let evaluated = engine.evaluate(cards, userRunningCount: value, system: system)
            result = .running(evaluated)
            runningStore.recordAttempt(correct: evaluated.isCorrect)
        }
        state = .feedback
    }

    /// Grade the key-count round: the held count answer against the IRC-seeded
    /// running count, and the advantage call against the key count. The count
    /// answer feeds the running store and the advantage call its own store; the
    /// caller reads `result.isCorrect` (both right) for the session rep. The
    /// cumulative count then carries into the next round of this shoe.
    func answerAdvantage(_ userSaidAdvantage: Bool) {
        guard state == .advantage else { return }
        let answer = KeyCountAnswer(
            runningCount: pendingUserCount,
            saidAdvantage: userSaidAdvantage
        )
        guard let evaluated = engine.evaluateKeyCount(
            cards,
            answer: answer,
            system: system,
            numberOfDecks: settings.numberOfDecks,
            priorRunningCount: shoeRunningCount
        ) else { return }
        result = .keyCount(evaluated)
        runningStore.recordAttempt(correct: evaluated.countCorrect)
        keyCountStore.recordAttempt(correct: evaluated.advantageCorrect)
        shoeRunningCount = evaluated.correctRunningCount
        state = .feedback
    }

    /// Grade the bet-spread round: the held true-count answer exactly as the
    /// true-count drill grades it (deck estimate included off a live shoe), and
    /// the bet against the player's ramp at the correct true count. The count
    /// feeds the true-count store, the bet its own store, and the caller reads
    /// `result.isCorrect` (both right) for the session rep.
    func answerBet(_ units: Int) {
        guard state == .betting else { return }
        let live = liveShoeBetSpread
        let decks = live ? actualDecksRemaining : settings.decksRemaining
        var evaluated = engine.evaluateBetSpread(
            cards,
            answer: BetSpreadAnswer(trueCount: Int(pendingUserCount), units: units),
            decksRemaining: decks,
            system: system,
            ramp: settings.betRamp,
            priorRunningCount: live ? shoeRunningCount : 0
        )
        if live, let estimate = deckEstimate {
            let within = engine.scoreDeckEstimate(estimate: estimate, actual: decks)
            evaluated.deckEstimate = estimate
            evaluated.deckEstimateWithinBand = within
            deckEstimationStore.recordAttempt(correct: within)
        }
        result = .betSpread(evaluated)
        trueCountStore.recordAttempt(correct: evaluated.countCorrect)
        betSpreadStore.recordAttempt(correct: evaluated.betCorrect)
        if live {
            shoeRunningCount = evaluated.correctRunningCount
        }
        state = .feedback
    }

    /// Grade the countdown against the burned card, and the clock against the
    /// record. The record only moves on a correct round.
    private func gradeDeckSpeed(_ value: Double) {
        guard let burnedCard else { return }
        let previousBest = deckSpeedBestStore.bestMilliseconds
        let evaluated = engine.evaluateDeckSpeed(
            cards,
            burnedCard: burnedCard,
            answer: DeckSpeedAnswer(
                runningCount: value,
                elapsedMilliseconds: elapsedMilliseconds
            ),
            system: system,
            previousBestMilliseconds: previousBest
        )
        result = .deckSpeed(evaluated)
        deckSpeedStore.recordAttempt(correct: evaluated.isCorrect)
        deckSpeedBestStore.record(
            correct: evaluated.isCorrect,
            elapsedMilliseconds: elapsedMilliseconds
        )
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

    func enterShowdown() {
        guard state == .feedback, usesLiveShoe, showdownAvailable else { return }
        state = .showdown
    }

    /// Return to the count-drill feedback; the shoe keeps whatever depletion the
    /// showdown caused, so the next round reshuffles if it has crossed the cut.
    /// The showdown's dealt cards really left the shoe, so fold their
    /// running-count value into the carried count: otherwise the next round's
    /// numerator (carried count, missing these cards) and denominator (decks
    /// remaining, already reduced by them) disagree, and a trainee who counted the
    /// visible showdown cards is graded wrong. A reshuffle next round resets the
    /// count to 0 anyway.
    func exitShowdown(_ showdownCards: [Card]) {
        guard state == .showdown else { return }
        if !showdownCards.isEmpty {
            shoeRunningCount += engine.runningCount(showdownCards, system: system)
        }
        state = .feedback
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
            // A fresh key-count shoe opens at the system's IRC, not 0.
            shoeRunningCount = Double(keyCountSchedule?.irc ?? 0)
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
