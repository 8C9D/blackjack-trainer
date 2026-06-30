import Observation
import SwiftUI

/// Post-count showdown: deals a single hand from the persistent shoe the player
/// just counted, plays it hit/stand only, auto-plays the dealer by the active
/// rule set, and settles win/lose/push (3:2 naturals). Mirrors the web
/// `ShowdownComponent`. No doubles, splits, surrender, bankroll, or bets.
@MainActor
@Observable
final class ShowdownModel {
    enum Phase {
        case playerTurn, resolved, exhausted
    }

    var ruleSet: RuleSet
    private(set) var playerCards: [Card] = []
    private(set) var dealerCards: [Card] = []
    private(set) var phase: Phase = .playerTurn
    private(set) var settlement: Settlement?
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

    var playerTotal: Int {
        Hand.total(playerCards)
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

    var showdownStats: ShowdownStats {
        stats.stats
    }

    var winRate: String {
        let current = stats.stats
        guard current.hands > 0 else { return "—" }
        return "\(Int((Double(current.wins) / Double(current.hands) * 100).rounded()))%"
    }

    func onAction(_ action: Action) {
        if action == .hit { hit() } else if action == .stand { stand() }
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
        // The guard guarantees four cards are available, so none of these are nil.
        let player = [draw(), draw()].compactMap(\.self)
        let dealer = [draw(), draw()].compactMap(\.self)
        playerCards = player
        dealerCards = dealer
        settlement = nil
        if Hand.isBlackjack(player) || Hand.isBlackjack(dealer) {
            resolve()
        } else {
            phase = .playerTurn
        }
    }

    private func hit() {
        guard phase == .playerTurn else { return }
        guard let card = draw() else {
            resolve()
            return
        }
        playerCards.append(card)
        if Hand.isBust(playerCards) { resolve() }
    }

    private func stand() {
        guard phase == .playerTurn else { return }
        resolve()
    }

    /// Reveal the dealer hole card, play the dealer out (unless already decided by
    /// a bust or natural), settle, and record the tally.
    private func resolve() {
        if !Hand.isBust(playerCards), !Hand.isBlackjack(playerCards),
           !Hand.isBlackjack(dealerCards) {
            dealerCards = Showdown.playDealerHand(dealerCards, ruleSet: ruleSet) { [weak self] in
                self?.draw()
            }
        }
        let result = Showdown.settle(player: playerCards, dealer: dealerCards)
        settlement = result
        stats.record(outcome: result.outcome, playerBlackjack: result.playerBlackjack)
        phase = .resolved
    }

    private func draw() -> Card? {
        let dealt = shoe.deal(1)
        remaining = shoe.cardsRemaining
        return dealt.first
    }

    func verdict(_ result: Settlement) -> String {
        switch result.outcome {
        case .win:
            return result.playerBlackjack ? "Blackjack! You win (pays 3:2)." : "You win!"
        case .lose:
            if Hand.isBust(playerCards) { return "Bust — dealer wins." }
            return result.dealerBlackjack ? "Dealer blackjack — dealer wins." : "Dealer wins."
        case .push:
            return result.playerBlackjack && result.dealerBlackjack ? "Push — both blackjack." : "Push."
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

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 16) {
            Text("Play a hand vs the dealer")
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
            Picker("Dealer rule", selection: $model.ruleSet) {
                Text("S17").tag(RuleSet.s17)
                Text("H17").tag(RuleSet.h17)
            }
            .pickerStyle(.segmented)

            if model.phase == .exhausted {
                Text("The shoe is too low to deal a hand. Return to counting to reshuffle.")
                    .foregroundStyle(Theme.secondaryText)
            } else {
                table
                if model.phase == .playerTurn {
                    ActionButtonsView(actions: [.hit, .stand]) { model.onAction($0) }
                }
                if model.phase == .resolved, let settlement = model.settlement {
                    resolution(settlement)
                }
            }

            Button("Back to counting", action: onExit)
                .buttonStyle(.bordered)
                .tint(Theme.accent)

            statsPanel
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var table: some View {
        VStack(spacing: 16) {
            handRow(
                label: model.phase == .resolved ? "Dealer (\(model.dealerTotal))" : "Dealer",
                cards: model.phase == .resolved ? model
                    .dealerCards : Array(model.dealerCards.prefix(1)),
                showHole: model.phase != .resolved
            )
            handRow(label: "You (\(model.playerTotal))", cards: model.playerCards, showHole: false)
        }
    }

    private func handRow(label: String, cards: [Card], showHole: Bool) -> some View {
        VStack(spacing: 6) {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.secondaryText)
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

    private func resolution(_ settlement: Settlement) -> some View {
        let won = settlement.outcome == .win
        let lost = settlement.outcome == .lose
        let tint = won ? Theme.correct : (lost ? Theme.incorrect : Theme.secondaryText)
        return VStack(alignment: .leading, spacing: 10) {
            Text(model.verdict(settlement))
                .font(.headline)
                .foregroundStyle(tint)
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
                    .foregroundStyle(Theme.secondaryText)
            }
        }
    }

    private var statsPanel: some View {
        let stats = model.showdownStats
        return VStack(alignment: .leading, spacing: 10) {
            Text("Showdown")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Theme.primaryText)
            let columns = [GridItem(.adaptive(minimum: 84), alignment: .leading)]
            LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                statCell("Hands", "\(stats.hands)")
                statCell("Wins", "\(stats.wins)")
                statCell("Losses", "\(stats.losses)")
                statCell("Pushes", "\(stats.pushes)")
                statCell("Blackjacks", "\(stats.blackjacks)")
                statCell("Win rate", model.winRate)
            }
            Button("Reset showdown stats", role: .destructive) { model.resetStats() }
                .buttonStyle(.bordered)
                .tint(Theme.incorrect)
                .disabled(stats.hands == 0)
        }
    }

    private func statCell(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Theme.secondaryText)
            Text(value)
                .font(.headline)
                .foregroundStyle(Theme.primaryText)
        }
    }
}
