import Observation
import SwiftUI

/// One player hand in the showdown. Hands come from two places: the opening deal
/// gives one per occupied box, and splitting a pair turns one hand into several.
/// Either way each is played and settled independently against the one dealer.
struct PlayerHand {
    var cards: [Card]
    /// Which box (0-based) this hand belongs to. Splits stay in their box, so the
    /// four-hand cap counts only the hands sharing a box.
    var box = 0
    /// Doubled: took exactly one card at a doubled stake.
    var doubled = false
    /// A split-ace hand takes exactly one card, then stands (no hit/double/re-split).
    var isSplitAce = false
    /// Came out of a split. A 21 on such a hand is not a natural and pays even
    /// money — tracked per hand rather than inferred from the hand count, because
    /// multiple boxes also produce multiple hands without any split involved.
    var fromSplit = false
    /// Finished acting (stood, busted, doubled, or a completed split ace).
    var done = false
    var settlement: Settlement?
}

/// Post-count showdown: deals a hand from the persistent shoe the player just
/// counted, plays it hit/stand/double/split (re-splits to four hands; split aces
/// take one card), auto-plays the dealer by the active rule set, and settles each
/// hand win/lose/push (3:2 naturals). Mirrors the web `ShowdownComponent`. No
/// surrender, bankroll, or bets.
@MainActor
@Observable
final class ShowdownModel {
    enum Phase {
        case playerTurn, resolved, exhausted
    }

    /// Most a pair can be split to (3 splits → 4 hands), the common casino cap.
    /// The cap is per box: occupying three boxes does not shrink any one box's
    /// splits.
    static let maxHandsPerBox = 4

    var ruleSet: RuleSet
    /// Boxes to occupy on the opening deal (1–3). One dealer plays against all.
    let spots: Int
    private(set) var hands: [PlayerHand] = []
    private(set) var activeIndex = 0
    private(set) var dealerCards: [Card] = []
    private(set) var phase: Phase = .playerTurn
    private(set) var remaining = 0

    @ObservationIgnored private let shoe: Shoe
    @ObservationIgnored private let stats: ShowdownStatsStore
    /// Every card this showdown dealt, in order, handed back on exit so the
    /// counting drill can fold their running-count value into its carried count —
    /// the cards really left the shoe.
    @ObservationIgnored private(set) var dealtCards: [Card] = []

    init(shoe: Shoe, ruleSet: RuleSet, stats: ShowdownStatsStore, spots: Int = 1) {
        self.shoe = shoe
        self.ruleSet = ruleSet
        self.stats = stats
        self.spots = Showdown.clampSpots(spots)
        remaining = shoe.cardsRemaining
        dealHand()
    }

    var activeHand: PlayerHand? {
        hands.indices.contains(activeIndex) ? hands[activeIndex] : nil
    }

    /// Backward-compatible views of the active/first hand for the single-hand path.
    var playerCards: [Card] {
        activeHand?.cards ?? []
    }

    var playerTotal: Int {
        Hand.total(playerCards)
    }

    var settlement: Settlement? {
        hands.first?.settlement
    }

    var doubled: Bool {
        activeHand?.doubled ?? false
    }

    var dealerTotal: Int {
        Hand.total(dealerCards)
    }

    var dealerUpcard: Card? {
        dealerCards.first
    }

    var canDealAnother: Bool {
        remaining >= Showdown.minCards(forSpots: spots)
    }

    /// One-line tally of a finished multi-hand round ("2 won, 1 lost"). Empty for
    /// a single hand, whose own verdict line already says everything.
    var roundSummary: String {
        let outcomes = hands.compactMap(\.settlement?.outcome)
        guard outcomes.count > 1 else { return "" }
        let count = { (outcome: ShowdownOutcome) in outcomes.filter { $0 == outcome }.count }
        var parts: [String] = []
        if count(.win) > 0 { parts.append("\(count(.win)) won") }
        if count(.lose) > 0 { parts.append("\(count(.lose)) lost") }
        if count(.push) > 0 { parts.append("\(count(.push)) pushed") }
        return parts.joined(separator: ", ")
    }

    /// Double is offered on any fresh two-card hand (including after a split).
    var canDouble: Bool {
        guard let hand = activeHand else { return false }
        return phase == .playerTurn && hand.cards.count == 2 && !hand.isSplitAce
    }

    /// Split is offered on a fresh two-card pair, under its box's four-hand cap.
    var canSplit: Bool {
        guard let hand = activeHand else { return false }
        return phase == .playerTurn && hand.cards.count == 2 && !hand.isSplitAce
            && isPair(hand.cards) && handsInBox(hand.box) < Self.maxHandsPerBox && remaining >= 1
    }

    /// How many hands the given box currently holds — one until it splits.
    private func handsInBox(_ box: Int) -> Int {
        hands.filter { $0.box == box }.count
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
        default: break
        }
    }

    func dealAnother() {
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

        hands = boxes.enumerated().map { PlayerHand(cards: $1, box: $0) }
        dealerCards = dealer
        activeIndex = 0
        phase = .playerTurn

        if Hand.isBlackjack(dealer) {
            // A dealer natural ends every box at once — no player action, no draw.
            for index in hands.indices {
                settleHand(at: index, dealer: dealer)
            }
            phase = .resolved
            return
        }
        // A box holding a natural is paid straight away (3:2) and sits out the
        // rest of the round; the remaining boxes are played in order.
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
        let splitAce = pair[0].isAce
        // Both halves stay in the box that split, so the box keeps its own cap.
        hands.replaceSubrange(index ... index, with: [
            PlayerHand(cards: [pair[0]], box: box, isSplitAce: splitAce, fromSplit: true),
            PlayerHand(cards: [pair[1]], box: box, isSplitAce: splitAce, fromSplit: true)
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

    private func isPair(_ cards: [Card]) -> Bool {
        cards.count == 2 && cards[0].highValue == cards[1].highValue
    }

    func verdict(_ hand: PlayerHand) -> String {
        guard let result = hand.settlement else { return "" }
        let doubledSuffix = hand.doubled ? " (doubled)" : ""
        switch result.outcome {
        case .win:
            let base = result.playerBlackjack ? "Blackjack! You win (pays 3:2)." : "You win!"
            return base + doubledSuffix
        case .lose:
            if Hand.isBust(hand.cards) { return "Bust — dealer wins." + doubledSuffix }
            return result.dealerBlackjack
                ? "Dealer blackjack — dealer wins."
                : "Dealer wins." + doubledSuffix
        case .push:
            let base = result.playerBlackjack && result.dealerBlackjack
                ? "Push — both blackjack." : "Push."
            return base + doubledSuffix
        }
    }

    func resetStats() {
        stats.reset()
    }
}
