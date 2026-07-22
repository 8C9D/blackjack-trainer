import Observation
import SwiftUI

/// One player hand in the showdown. Splitting a pair turns one hand into several,
/// each played and settled independently.
struct PlayerHand {
    var cards: [Card]
    /// Doubled: took exactly one card at a doubled stake.
    var doubled = false
    /// A split-ace hand takes exactly one card, then stands (no hit/double/re-split).
    var isSplitAce = false
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
    static let maxHands = 4

    var ruleSet: RuleSet
    private(set) var hands: [PlayerHand] = []
    private(set) var activeIndex = 0
    private(set) var dealerCards: [Card] = []
    private(set) var phase: Phase = .playerTurn
    private(set) var remaining = 0

    @ObservationIgnored private let shoe: Shoe
    @ObservationIgnored private let stats: ShowdownStatsStore

    init(shoe: Shoe, ruleSet: RuleSet, stats: ShowdownStatsStore) {
        self.shoe = shoe
        self.ruleSet = ruleSet
        self.stats = stats
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
        remaining >= Showdown.minShowdownCards
    }

    /// Double is offered on any fresh two-card hand (including after a split).
    var canDouble: Bool {
        guard let hand = activeHand else { return false }
        return phase == .playerTurn && hand.cards.count == 2 && !hand.isSplitAce
    }

    /// Split is offered on a fresh two-card pair, under the four-hand cap.
    var canSplit: Bool {
        guard let hand = activeHand else { return false }
        return phase == .playerTurn && hand.cards.count == 2 && !hand.isSplitAce
            && isPair(hand.cards) && hands.count < Self.maxHands && remaining >= 1
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

    /// Deal a fresh opening hand (player, dealer, player, dealer). A two-card
    /// natural on either side resolves immediately.
    private func dealHand() {
        guard shoe.cardsRemaining >= Showdown.minShowdownCards else {
            phase = .exhausted
            return
        }
        // Casino-style alternating deal (player, dealer, player, dealer), matching
        // the web showdown. The guard guarantees four cards, so none are nil.
        let c0 = draw()
        let c1 = draw()
        let c2 = draw()
        let c3 = draw()
        let player = [c0, c2].compactMap(\.self)
        let dealer = [c1, c3].compactMap(\.self)
        hands = [PlayerHand(cards: player)]
        activeIndex = 0
        dealerCards = dealer
        if Hand.isBlackjack(player) || Hand.isBlackjack(dealer) {
            // Opening natural: settle the single hand against the dealer's two
            // cards (3:2 to a player natural, push on two naturals) — no draw.
            let result = Showdown.settle(player: player, dealer: dealer)
            hands[0].settlement = result
            hands[0].done = true
            stats.record(outcome: result.outcome, playerBlackjack: result.playerBlackjack)
            phase = .resolved
        } else {
            phase = .playerTurn
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
        let splitAce = pair[0].isAce
        hands.replaceSubrange(index ... index, with: [
            PlayerHand(cards: [pair[0]], isSplitAce: splitAce),
            PlayerHand(cards: [pair[1]], isSplitAce: splitAce)
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
        advanceOrResolve()
    }

    private func advanceOrResolve() {
        let cur = activeIndex
        if let next = hands.indices.first(where: { $0 > cur && !hands[$0].done }) {
            activeIndex = next
            // A freshly split hand arrives with one card; deal its second first.
            if hands[next].cards.count == 1 { dealToFreshHand(next) }
        } else {
            resolveAll()
        }
    }

    /// Reveal the dealer's hole card, play it out once (only if a hand can still
    /// win), then settle each hand. A split hand never counts as a natural, so its
    /// two-card 21 pays even money.
    private func resolveAll() {
        let anyLive = hands.contains { !Hand.isBust($0.cards) }
        if anyLive {
            dealerCards = Showdown.playDealerHand(dealerCards, ruleSet: ruleSet) { [weak self] in
                self?.draw()
            }
        }
        let isSplit = hands.count > 1
        for index in hands.indices {
            let natural = isSplit ? false : Hand.isBlackjack(hands[index].cards)
            let result = Showdown.settle(
                player: hands[index].cards, dealer: dealerCards, playerNatural: natural
            )
            hands[index].settlement = result
            stats.record(outcome: result.outcome, playerBlackjack: result.playerBlackjack)
        }
        phase = .resolved
    }

    private func draw() -> Card? {
        let dealt = shoe.deal(1)
        remaining = shoe.cardsRemaining
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

/// The showdown sub-screen, shown after a live-shoe true-count round.
struct ShowdownView: View {
    @State private var model: ShowdownModel
    let onExit: () -> Void

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    init(shoe: Shoe, ruleSet: RuleSet, stats: ShowdownStatsStore, onExit: @escaping () -> Void) {
        _model = State(initialValue: ShowdownModel(shoe: shoe, ruleSet: ruleSet, stats: stats))
        self.onExit = onExit
    }

    private var playerActions: [Action] {
        var actions: [Action] = [.hit, .stand]
        if model.canDouble { actions.append(.double) }
        if model.canSplit { actions.append(.split) }
        return actions
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Play a hand vs the dealer")
                .font(.headline)
                .foregroundStyle(Theme.ink)

            if model.phase == .exhausted {
                Text("The shoe is too low to deal a hand. Return to counting to reshuffle.")
                    .foregroundStyle(Theme.muted)
            } else {
                table
                if model.phase == .playerTurn {
                    ActionButtonsView(actions: playerActions) { model.onAction($0) }
                }
                if model.phase == .resolved {
                    dealAnotherControls
                }
            }

            Button("Back to counting", action: onExit)
                .buttonStyle(.bordered)
                .tint(Theme.accent)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .sensoryFeedback(trigger: model.settlement) { _, new in
            switch new?.outcome {
            case .win: .success
            case .lose: .error
            default: nil
            }
        }
    }

    private var table: some View {
        VStack(spacing: 16) {
            handRow(
                label: model.phase == .resolved ? "Dealer (\(model.dealerTotal))" : "Dealer",
                cards: model.phase == .resolved
                    ? model.dealerCards : Array(model.dealerCards.prefix(1)),
                showHole: model.phase != .resolved
            )
            ForEach(Array(model.hands.enumerated()), id: \.offset) { index, hand in
                playerHandRow(index: index, hand: hand)
            }
        }
    }

    private func playerHandRow(index: Int, hand: PlayerHand) -> some View {
        let isActive = model.phase == .playerTurn && index == model.activeIndex
        let total = Hand.total(hand.cards)
        let label = model.hands.count > 1 ? "Hand \(index + 1) (\(total))" : "You (\(total))"
        return VStack(spacing: 6) {
            handRow(label: label, cards: hand.cards, showHole: false)
            if let settlement = hand.settlement {
                Text(model.verdict(hand))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(verdictColor(settlement.outcome))
            }
        }
        .padding(8)
        .background(isActive ? Theme.accent.opacity(0.08) : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func verdictColor(_ outcome: ShowdownOutcome) -> Color {
        switch outcome {
        case .win: Theme.good
        case .lose: Theme.bad
        case .push: Theme.muted
        }
    }

    private func handRow(label: String, cards: [Card], showHole: Bool) -> some View {
        VStack(spacing: 6) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.muted)
            HStack(spacing: 6) {
                ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
                    CardImage(card, width: 60)
                }
                if showHole {
                    CardImage(faceDown: 60)
                }
            }
        }
    }

    private var dealAnotherControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { model.dealAnother() } label: {
                Text(hasHardwareKeyboard ? "Deal another hand  [Enter]" : "Deal another hand")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
            .keyboardShortcut(.return, modifiers: [])
            .disabled(!model.canDealAnother)
            if !model.canDealAnother {
                Text("Shoe too low for another hand — return to counting to reshuffle.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}
