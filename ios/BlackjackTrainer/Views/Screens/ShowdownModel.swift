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
        case betting, insurance, playerTurn, resolved, exhausted
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

    @ObservationIgnored private let shoe: Shoe
    @ObservationIgnored private let stats: ShowdownStatsStore
    @ObservationIgnored let bankrollStore: BankrollStore
    /// Every card this showdown dealt, in order, handed back on exit so the
    /// counting drill can fold their running-count value into its carried count —
    /// the cards really left the shoe.
    @ObservationIgnored private(set) var dealtCards: [Card] = []

    init(
        shoe: Shoe,
        ruleSet: RuleSet,
        stats: ShowdownStatsStore,
        options: EngineOptions = .default,
        spots: Int = 1,
        betting: Bool = false,
        bankroll: BankrollStore = BankrollStore()
    ) {
        self.shoe = shoe
        self.ruleSet = ruleSet
        self.options = options
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
        guard phase == .betting else { return }
        bet = clampedBet(value)
    }

    func dealAfterBet() {
        guard phase == .betting else { return }
        dealHand()
    }

    func resetBankroll() {
        bankrollStore.reset()
        bet = clampedBet(Bankroll.minBet)
        phase = .betting
    }

    var showdownStats: ShowdownStats {
        stats.stats
    }

    var winRate: String {
        let current = stats.stats
        guard current.hands > 0 else { return "—" }
        return "\(Int((Double(current.wins) / Double(current.hands) * 100).rounded()))%"
    }

    func onAction(_ action: Action) {
        switch action {
        case .hit: hit()
        case .stand: stand()
        case .double: double()
        case .split: split()
        case .surrender: surrender()
        default: break
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
            guard !bankrollStore.bustedOut else { return }
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
        dealer.append(contentsOf: [draw()].compactMap(\.self))

        let posted = betting ? bet : 0
        roundNet = 0
        insuranceNet = nil
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
            phase = .resolved
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
        phase = .resolved
    }

    private func draw() -> Card? {
        let dealt = shoe.deal(1)
        remaining = shoe.cardsRemaining
        if let card = dealt.first { dealtCards.append(card) }
        return dealt.first
    }

    func resetStats() {
        stats.reset()
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
        phase = .playerTurn
        peekAndContinue()
    }
}
