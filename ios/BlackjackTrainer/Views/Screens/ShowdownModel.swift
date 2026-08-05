import Observation
import SwiftUI

/// Post-count showdown: deals a hand from the persistent shoe the player just
/// counted, plays it hit/stand/double/split (re-splits to four hands; split aces
/// take one card), auto-plays the dealer by the active rule set, and settles each
/// hand win/lose/push (3:2 naturals). A box's original two cards may also
/// late-surrender for half the bet when the shared LS rule is enabled (the peek
/// has already settled any dealer natural). With bet sizing on, each round opens
/// on a bet and settles against the persisted bankroll, and a dealer ace offers
/// insurance (half each bet, pays 2:1) before the hole card is checked. Mirrors
/// the web `ShowdownComponent`.
@MainActor
@Observable
final class ShowdownModel {
    enum Phase {
        /// `betting` and `insurance` are only reached when bet sizing is on: the
        /// round waits for a bet before any card is dealt (the point of
        /// practising against the count), and a dealer ace pauses the deal on
        /// the insurance decision before the hole card is checked.
        /// `countCheck` is the way out: the table asks what the cards it dealt
        /// did to the count before handing the shoe back.
        case betting, insurance, playerTurn, resolved, exhausted, countCheck
    }

    /// Most a pair can be split to (3 splits → 4 hands), the common casino cap.
    /// The cap is per box: occupying three boxes does not shrink any one box's
    /// splits.
    static let maxHandsPerBox = 4

    var ruleSet: RuleSet
    /// DAS / LS availability from the shared table rules.
    let options: EngineOptions
    /// Boxes to occupy on the opening deal (1–3). One dealer plays against all.
    let spots: Int
    /// Bet sizing: when on, each round opens on a bet and settles against the
    /// persisted bankroll. Off, the showdown is the pure hand tally it has always
    /// been and no chip figure is shown.
    let betting: Bool
    /// The bet each box posts for the coming round.
    private(set) var bet = Bankroll.minBet
    /// Net chips of the round just resolved, for the result line.
    private(set) var roundNet = 0.0
    /// Net chips the round's insurance bet returned, or nil when no insurance
    /// was taken. Settled the moment the hole card is checked.
    private(set) var insuranceNet: Double?
    private(set) var hands: [PlayerHand] = []
    private(set) var activeIndex = 0
    private(set) var dealerCards: [Card] = []
    private(set) var phase: Phase = .playerTurn
    private(set) var remaining = 0
    /// Verdict on the most recent playing decision, shown until the next one
    /// replaces it. Nil before the first decision of a round.
    private(set) var lastPlay: PlayVerdict?
    /// Every misplay of the round just dealt, named in the result panel — a
    /// verdict that scrolls past as the next hand is played would be no use.
    private(set) var roundMisplays: [String] = []
    /// Verdict on the count carried off the table, once it has been answered.
    private(set) var countVerdict: PlayVerdict?
    /// Ask for the running count on the way out. On by default: this table has
    /// been keeping the count for the player, and holding it through played-out
    /// hands is the skill they came here for.
    let countCheck: Bool
    /// And the count carried off the table is the same skill the running-count
    /// drill measures.
    @ObservationIgnored private let countStats: SessionStatsStore?
    /// The count on the way out is the same skill the drill grades, so which
    /// side it lands on is remembered in the same place.
    @ObservationIgnored private let countDrift: CountDriftStore?

    /// Not `private`: `+Grading` divides the count by what is left of it.
    @ObservationIgnored let shoe: Shoe
    /// The system being counted, and the chart the insurance call is graded
    /// against. Both optional for the same reason `strategy` is: a preview or a
    /// spec may be built without them, and grading is then skipped.
    @ObservationIgnored let system: CountingSystem?
    @ObservationIgnored let deviations: DeviationEngine?
    /// The count as the player can actually see it: the count carried in from
    /// the drill plus every card this showdown has turned face up. The dealer's
    /// hole card is deliberately excluded until the round resolves and turns it
    /// over — insurance is decided before it is seen, and grading against a card
    /// the player cannot see would be grading a different game.
    @ObservationIgnored private(set) var visibleRunningCount: Double
    /// Index into `dealtCards` of the hole card still face down, or nil when the
    /// round has none outstanding. An index rather than the card itself because
    /// `dealtCards` is what leaves with the player, and the one card that must
    /// not is this one.
    @ObservationIgnored private var pendingHoleIndex: Int?
    /// The hole card still face down, if the round has one. Readable outside
    /// this file: `+Grading` counts the cards the player has actually seen, and
    /// a face-down hole card is not one of them.
    var pendingHoleCard: Card? {
        pendingHoleIndex.map { dealtCards[$0] }
    }

    /// What leaves with the player: every card this table turned face up. A
    /// round walked away from mid-hand leaves the dealer's hole card dealt but
    /// never shown — it is gone from the shoe, but a counter who never saw it
    /// cannot have it in their count, exactly as a burn card is gone and
    /// uncounted. Handing it back would move the drill's carried count by a card
    /// the table never showed, and mark the next answer wrong for it.
    var seenCards: [Card] {
        guard let index = pendingHoleIndex else { return dealtCards }
        var cards = dealtCards
        cards.remove(at: index)
        return cards
    }

    /// Not `private`: the win/lose/push readers live in `+Presentation`.
    @ObservationIgnored let stats: ShowdownStatsStore
    /// Optional so a spec (and the `#Preview`s) can build a model without the
    /// charts; grading is simply skipped when either is absent. Not `private`:
    /// the scoring lives in `ShowdownModel+Grading.swift`.
    @ObservationIgnored let strategy: BasicStrategyEngine?
    @ObservationIgnored private let playStats: SessionStatsStore?
    /// Misplays here feed the same weak-spot tally the Basic Strategy drill keeps.
    @ObservationIgnored private let missTally: MissTallyStore?
    /// The spread the player configured: both the rungs the bet control offers
    /// and what the bet is graded against. Not `private`: `+Betting` reads it.
    @ObservationIgnored let betRamp: [Int]
    /// The bet at this table is the same skill the bet-spread drill measures.
    @ObservationIgnored private let betSpreadStats: SessionStatsStore?
    @ObservationIgnored let bankrollStore: BankrollStore
    /// Every card this showdown dealt, in order. `seenCards` is what leaves with
    /// the player, so the counting drill can fold their running-count value into
    /// its carried count — the cards really left the shoe.
    @ObservationIgnored private(set) var dealtCards: [Card] = []

    init(
        shoe: Shoe,
        ruleSet: RuleSet,
        stats: ShowdownStatsStore,
        options: EngineOptions = .default,
        spots: Int = 1,
        betting: Bool = false,
        bankroll: BankrollStore = BankrollStore(),
        strategy: BasicStrategyEngine? = nil,
        playStats: SessionStatsStore? = nil,
        system: CountingSystem? = nil,
        deviations: DeviationEngine? = nil,
        entryRunningCount: Double = 0,
        missTally: MissTallyStore? = nil,
        betRamp: [Int] = BetRamp.default,
        betSpreadStats: SessionStatsStore? = nil,
        countCheck: Bool = true,
        countStats: SessionStatsStore? = nil,
        countDrift: CountDriftStore? = nil
    ) {
        self.countCheck = countCheck
        self.countStats = countStats
        self.countDrift = countDrift
        self.missTally = missTally
        self.betRamp = betRamp
        self.betSpreadStats = betSpreadStats
        self.shoe = shoe
        self.ruleSet = ruleSet
        self.options = options
        self.strategy = strategy
        self.system = system
        self.deviations = deviations
        // The count the drill was carrying is where this table's count starts.
        visibleRunningCount = entryRunningCount
        self.playStats = playStats
        self.stats = stats
        self.spots = Showdown.clampSpots(spots)
        self.betting = betting
        bankrollStore = bankroll
        remaining = shoe.cardsRemaining
        if betting {
            // Size the bet before seeing a card — the count just practised is the
            // only information the decision should rest on.
            bet = clampedBet(Bankroll.minBet)
            phase = .betting
        } else {
            dealHand()
        }
    }

    /// Keep a bet inside both the table minimum and what the bankroll can back
    /// across every occupied box.
    private func clampedBet(_ value: Double) -> Double {
        Bankroll.clampBet(value, bankroll: bankrollStore.bankroll / Double(spots))
    }

    func setBet(_ value: Double) {
        guard phase == .betting, canBackRound else { return }
        bet = clampedBet(value)
    }

    func dealAfterBet() {
        guard phase == .betting, canBackRound else { return }
        // Snapshot the count before a card is turned: the bet was decided on what
        // the player could see at that moment, and dealing moves the count.
        let trueCount = betTrueCount
        let placed = bet
        dealHand()
        // A shoe too low to serve the round leaves the table on `.exhausted`
        // with nothing dealt. There is no round to have bet into, so there is
        // nothing to grade — and the misplay list was never cleared either.
        guard phase != .exhausted else { return }
        if let graded = gradeBet(trueCount: trueCount, bet: placed) {
            betSpreadStats?.recordAttempt(correct: graded.verdict.correct)
            lastPlay = graded.verdict
            if let misplay = graded.misplay { roundMisplays.append(misplay) }
        }
    }

    func resetBankroll() {
        bankrollStore.reset()
        bet = clampedBet(Bankroll.minBet)
        phase = .betting
    }

    func onAction(_ action: Action) {
        // Graded before the action is taken: the decision is about the hand as
        // it stands, and hit/split have already changed it by the time they
        // return. `private(set)` is file-scoped, so the scoring lives next door
        // but the recording of it has to happen here.
        if let graded = grade(action) { record(graded) }
        switch action {
        case .hit: hit()
        case .stand: stand()
        case .double: double()
        case .split: split()
        case .surrender: surrender()
        default: break
        }
    }

    /// Post one graded decision: the running accuracy, the coach line, and the
    /// round's misplay list. Lives here because all three are `private(set)`,
    /// which is file-scoped, while the scoring itself is next door in `+Grading`.
    private func record(_ graded: GradedPlay) {
        playStats?.recordAttempt(correct: graded.verdict.correct)
        lastPlay = graded.verdict
        if let misplay = graded.misplay { roundMisplays.append(misplay) }
        if let ref = graded.tallyRef {
            missTally?.record(
                graded.tallyTrainer,
                ref: ref,
                correct: graded.verdict.correct,
                trueCount: graded.tallyTrueCount
            )
        }
    }

    /// Give up the hand for half the bet. It settles as a loss on the spot — the
    /// dealer owes it nothing — so `resolveAll`'s any-live check and the tally
    /// both see a finished hand, and the round moves to the next box.
    private func surrender() {
        guard canSurrender else { return }
        let index = activeIndex
        let bet = hands[index].bet
        hands[index].surrendered = true
        hands[index].done = true
        hands[index].settlement = Settlement(
            outcome: .lose, playerBlackjack: false, dealerBlackjack: false
        )
        stats.record(outcome: .lose, playerBlackjack: false)
        if betting {
            let payout = Bankroll.surrenderForfeit(bet: bet)
            bankrollStore.record(stake: bet, payout: payout)
            roundNet += payout
        }
        activateNextOrResolve()
    }

    /// Between rounds, betting returns to the bet: the count has moved on, so the
    /// spread should be reconsidered rather than silently repeated.
    func dealAnother() {
        if betting {
            guard canBackRound else { return }
            // Clear the settled round before the next bet, so nothing on the felt
            // (or in `committed`) belongs to a hand that is already paid.
            hands = []
            dealerCards = []
            bet = clampedBet(bet)
            phase = .betting
            return
        }
        dealHand()
    }

    /// Deal a fresh opening round to every occupied box in casino order: one card
    /// to each box, the dealer's upcard, a second to each box, the dealer's hole
    /// card. Naturals on either side resolve without any player action.
    private func dealHand() {
        guard shoe.cardsRemaining >= Showdown.minCards(forSpots: spots) else {
            phase = .exhausted
            return
        }
        // The guard guarantees the whole opening round, so no draw here is nil.
        var boxes: [[Card]] = Array(repeating: [], count: spots)
        for index in boxes.indices {
            boxes[index].append(contentsOf: [draw()].compactMap(\.self))
        }
        var dealer = [draw()].compactMap(\.self)
        for index in boxes.indices {
            boxes[index].append(contentsOf: [draw()].compactMap(\.self))
        }
        dealer.append(contentsOf: [drawHole()].compactMap(\.self))

        let posted = betting ? bet : 0
        roundNet = 0
        insuranceNet = nil
        lastPlay = nil
        roundMisplays = []
        hands = boxes.enumerated().map { PlayerHand(cards: $1, box: $0, bet: posted) }
        dealerCards = dealer
        activeIndex = 0
        phase = .playerTurn

        // A dealer ace pauses on the insurance decision before the peek — but
        // only with chips in play (insurance is purely a money bet) that can
        // back the side bet.
        if betting, dealer.first?.isAce == true, canAffordInsurance {
            phase = .insurance
            return
        }
        peekAndContinue()
    }

    /// Check the hole card and continue the round: a dealer natural ends every
    /// box at once, an opening player natural is paid 3:2 and sits out, and the
    /// remaining boxes are played in order.
    private func peekAndContinue() {
        let dealer = dealerCards
        if Hand.isBlackjack(dealer) {
            // A dealer natural ends every box at once — no player action, no draw.
            for index in hands.indices {
                settleHand(at: index, dealer: dealer)
            }
            resolveRound()
            return
        }
        for index in hands.indices where Hand.isBlackjack(hands[index].cards) {
            settleHand(at: index, dealer: dealer)
        }
        activateNextOrResolve()
    }

    /// Settle one hand against the dealer's final cards and record it. Idempotent:
    /// a hand that already carries a settlement (an opening natural) is left alone
    /// so its tally is never double-counted.
    private func settleHand(at index: Int, dealer: [Card]) {
        guard hands[index].settlement == nil else { return }
        let natural = hands[index].fromSplit ? false : Hand.isBlackjack(hands[index].cards)
        let result = Showdown.settle(
            player: hands[index].cards, dealer: dealer, playerNatural: natural
        )
        hands[index].settlement = result
        hands[index].done = true
        stats.record(outcome: result.outcome, playerBlackjack: result.playerBlackjack)
        if betting {
            let hand = hands[index]
            let chips = Bankroll.payout(settlement: result, bet: hand.bet, doubled: hand.doubled)
            bankrollStore.record(stake: stake(hand), payout: chips)
            roundNet += chips
        }
    }

    private func draw() -> Card? {
        let dealt = shoe.deal(1)
        remaining = shoe.cardsRemaining
        if let card = dealt.first {
            dealtCards.append(card)
            visibleRunningCount += system?.value(for: card) ?? 0
        }
        return dealt.first
    }

    /// The dealer's second card, drawn face down: dealt and tracked like any
    /// other, but held out of the visible count until the round resolves and
    /// turns it over.
    private func drawHole() -> Card? {
        guard let card = draw() else { return nil }
        visibleRunningCount -= system?.value(for: card) ?? 0
        pendingHoleIndex = dealtCards.count - 1
        return card
    }

    func resetStats() {
        stats.reset()
    }
}

/// Playing the boxes out: the player's actions, hand-to-hand progression, and
/// the dealer's turn once every box is finished. Same file as the model — the
/// mutators drive the file-scoped `private(set)` state — but outside the class
/// body to respect the repo's type-length limit.
@MainActor
extension ShowdownModel {
    private func hit() {
        guard phase == .playerTurn, hands.indices.contains(activeIndex) else { return }
        guard let card = draw() else {
            finishActive()
            return
        }
        hands[activeIndex].cards.append(card)
        if Hand.isBust(hands[activeIndex].cards) { finishActive() }
    }

    private func stand() {
        guard phase == .playerTurn else { return }
        finishActive()
    }

    /// Double down: take exactly one card at a doubled stake, then the hand ends.
    private func double() {
        guard canDouble else { return }
        hands[activeIndex].doubled = true
        if let card = draw() { hands[activeIndex].cards.append(card) }
        finishActive()
    }

    /// Split a pair: the two cards seed two hands. The active hand keeps the first
    /// card and is dealt a new second card; the second card starts a new hand
    /// inserted right after, played once the active one finishes. Split aces take
    /// a single card each and stand.
    private func split() {
        guard canSplit else { return }
        let index = activeIndex
        let pair = hands[index].cards
        let box = hands[index].box
        let posted = hands[index].bet
        let splitAce = pair[0].isAce
        // Both halves stay in the box that split, so the box keeps its own cap, and
        // each carries the box's bet — a split posts a second one.
        hands.replaceSubrange(index ... index, with: [
            PlayerHand(
                cards: [pair[0]], box: box, isSplitAce: splitAce, fromSplit: true, bet: posted
            ),
            PlayerHand(
                cards: [pair[1]], box: box, isSplitAce: splitAce, fromSplit: true, bet: posted
            )
        ])
        dealToFreshHand(index)
    }

    /// Deal the second card to a one-card (freshly split) hand, then either finish
    /// it (a split ace stands after one card) or leave it for the player.
    private func dealToFreshHand(_ index: Int) {
        if let card = draw() { hands[index].cards.append(card) }
        let hand = hands[index]
        if hand.isSplitAce || hand.cards.count < 2 || Hand.isBust(hand.cards) {
            finishHand(index)
        }
    }

    private func finishActive() {
        finishHand(activeIndex)
    }

    private func finishHand(_ index: Int) {
        hands[index].done = true
        activateNextOrResolve()
    }

    /// Hand play to the earliest hand still owed a decision, or resolve the round
    /// when every hand is finished. Hands are always completed front to back, so
    /// the first not-done hand is the next one to act.
    private func activateNextOrResolve() {
        guard let next = hands.indices.first(where: { !hands[$0].done }) else {
            resolveAll()
            return
        }
        activeIndex = next
        // A freshly split hand arrives with one card; deal its second first.
        if hands[next].cards.count == 1 { dealToFreshHand(next) }
    }

    /// Reveal the dealer's hole card, play it out once (only if a hand can still
    /// win — every hand busted or already settled means no draw), then settle the
    /// hands still open. A split hand never counts as a natural, so its two-card
    /// 21 pays even money.
    private func resolveAll() {
        let anyLive = hands.contains { $0.settlement == nil && !Hand.isBust($0.cards) }
        if anyLive {
            dealerCards = Showdown.playDealerHand(dealerCards, ruleSet: ruleSet) { [weak self] in
                self?.draw()
            }
        }
        for index in hands.indices {
            settleHand(at: index, dealer: dealerCards)
        }
        resolveRound()
    }

    /// Close the round: the hole card is on its face from here on, so it joins
    /// the count now. Waiting for the next deal would leave the bet that opens
    /// that round graded against a count one card behind the felt — and a player
    /// who counted the card they can see marked wrong for it.
    private func resolveRound() {
        if let hole = pendingHoleCard {
            visibleRunningCount += system?.value(for: hole) ?? 0
            pendingHoleIndex = nil
        }
        phase = .resolved
    }
}

/// The insurance decision. Same file as the model — the mutators drive the
/// file-scoped `private(set)` state — but outside the class body to respect the
/// repo's type-length limit.
@MainActor
extension ShowdownModel {
    /// Insure every box for half its bet: the side bets settle against the hole
    /// card immediately — paid 2:1 on a dealer natural, forfeited otherwise —
    /// and the round then continues exactly as an uninsured one.
    func takeInsurance() {
        guard phase == .insurance else { return }
        if let graded = gradeInsurance(took: true) { record(graded) }
        let dealerBlackjack = Hand.isBlackjack(dealerCards)
        var net = 0.0
        for hand in hands {
            let payout = Bankroll.insurancePayout(bet: hand.bet, dealerBlackjack: dealerBlackjack)
            bankrollStore.record(stake: Bankroll.insuranceCost(bet: hand.bet), payout: payout)
            net += payout
        }
        insuranceNet = net
        roundNet += net
        phase = .playerTurn
        peekAndContinue()
    }

    func declineInsurance() {
        guard phase == .insurance else { return }
        if let graded = gradeInsurance(took: false) { record(graded) }
        phase = .playerTurn
        peekAndContinue()
    }
}

/// The way out. Same file as the model — the mutators drive the file-scoped
/// `private(set)` state — but outside the class body to respect the repo's
/// type-length limit; the reads it acts on live in `+Grading`.
@MainActor
extension ShowdownModel {
    /// The exit button's decision, mirroring the web `returnToCounting`: stop on
    /// the count question when the table has cards to answer for. Returns
    /// whether the table is finished with the player, so the caller — which owns
    /// the handing back of the cards — knows whether to leave.
    func requestExit() -> Bool {
        guard asksForTheCount else { return true }
        countVerdict = nil
        phase = .countCheck
        return false
    }

    /// One answer, graded and recorded. A second guess at the same question is
    /// ignored — the verdict it would revise is already on screen.
    func answerCountCheck(_ answer: Double) {
        guard phase == .countCheck, countVerdict == nil else { return }
        let verdict = gradeCountCheck(answer)
        countStats?.recordAttempt(correct: verdict.correct)
        countDrift?.record(answer: answer, actual: visibleRunningCount)
        countVerdict = verdict
    }
}
