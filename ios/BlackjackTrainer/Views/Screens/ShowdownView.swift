import SwiftUI

/// The showdown sub-screen, shown after a live-shoe true-count round.
struct ShowdownView: View {
    @State private var model: ShowdownModel
    /// Carries every card this showdown dealt back to the counting drill.
    let onExit: ([Card]) -> Void

    @Environment(\.hasHardwareKeyboard) private var hasHardwareKeyboard

    init(shoe: Shoe, ruleSet: RuleSet, stats: ShowdownStatsStore,
         options: EngineOptions = .default, spots: Int = 1,
         betting: Bool = false, bankroll: BankrollStore = BankrollStore(),
         strategy: BasicStrategyEngine? = nil, playStats: SessionStatsStore? = nil,
         system: CountingSystem? = nil, deviations: DeviationEngine? = nil,
         entryRunningCount: Double = 0, missTally: MissTallyStore? = nil,
         betRamp: [Int] = BetRamp.default, betSpreadStats: SessionStatsStore? = nil,
         countCheck: Bool = true, countStats: SessionStatsStore? = nil,
         onExit: @escaping ([Card]) -> Void) {
        _model = State(initialValue: ShowdownModel(
            shoe: shoe, ruleSet: ruleSet, stats: stats, options: options, spots: spots,
            betting: betting, bankroll: bankroll, strategy: strategy, playStats: playStats,
            system: system, deviations: deviations, entryRunningCount: entryRunningCount,
            missTally: missTally, betRamp: betRamp, betSpreadStats: betSpreadStats,
            countCheck: countCheck, countStats: countStats
        ))
        self.onExit = onExit
    }

    /// Wraps an already-driven model, so previews (and render checks) can show a
    /// mid-round state — the public init always starts a fresh round.
    init(model: ShowdownModel, onExit: @escaping ([Card]) -> Void) {
        _model = State(initialValue: model)
        self.onExit = onExit
    }

    private var playerActions: [Action] {
        var actions: [Action] = [.hit, .stand]
        if model.canDouble { actions.append(.double) }
        if model.canSplit { actions.append(.split) }
        if model.canSurrender { actions.append(.surrender) }
        return actions
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(model.spots > 1
                ? "Play \(model.spots) hands vs the dealer"
                : "Play a hand vs the dealer")
                .font(.headline)
                .foregroundStyle(Theme.ink)

            // The indices are Hi-Lo numbers, so a trainee counting anything
            // else is told what this table can and cannot say about their play.
            if let note = model.indexNote {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }

            if model.betting {
                bankrollLine
            }

            if model.phase == .countCheck {
                countCheckStage
            } else if model.phase == .exhausted {
                Text("The shoe is too low to deal a hand. Return to counting to reshuffle.")
                    .foregroundStyle(Theme.muted)
            } else if model.phase == .betting {
                bettingStage
            } else {
                table
                if model.phase == .insurance {
                    insuranceStage
                }
                if let net = model.insuranceNet {
                    Text((net > 0 ? "Insurance paid 2:1" : "Insurance lost")
                        + "  \(Chips.signed(net))")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
                if model.phase == .playerTurn {
                    ActionButtonsView(actions: playerActions) { model.onAction($0) }
                }
                // The verdict on the last decision. The play still stands —
                // this is a table, not a quiz — so it coaches rather than blocks.
                if let verdict = model.lastPlay {
                    PlayCoachView(verdict: verdict)
                }
                if model.phase == .resolved {
                    if !model.roundMisplays.isEmpty {
                        MisplayListView(misplays: model.roundMisplays)
                    }
                    dealAnotherControls
                }
            }

            // No bypass while the count question is up: the way out runs
            // through it, and the answer's own button leaves.
            if model.phase != .countCheck {
                Button("Back to counting") { leave() }
                    .buttonStyle(.bordered)
                    .tint(Theme.accentInk)
            }
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
        let stakeSuffix = model.betting ? "  ·  \(Chips.format(model.stake(hand)))" : ""
        let label = (model.hands.count > 1 ? "Hand \(index + 1) (\(total))" : "You (\(total))")
            + stakeSuffix
        return VStack(spacing: 6) {
            handRow(label: label, cards: hand.cards, showHole: false)
            if let settlement = hand.settlement {
                Text(model.betting
                    ? "\(model.verdict(hand))  \(Chips.signed(model.payout(hand)))"
                    : model.verdict(hand))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(verdictColor(settlement.outcome))
            }
        }
        .padding(8)
        .background(isActive ? Theme.accentInk.opacity(0.08) : Color.clear)
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
        let noun = model.spots > 1 ? "round" : "hand"
        return VStack(alignment: .leading, spacing: 10) {
            if !model.roundSummary.isEmpty {
                Text(model.betting
                    ? "\(model.roundSummary)  \(Chips.signed(model.roundNet))"
                    : model.roundSummary)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
            }
            Button { model.dealAnother() } label: {
                Text(hasHardwareKeyboard
                    ? "Deal another \(noun)  [Enter]"
                    : "Deal another \(noun)")
                    .frame(maxWidth: .infinity, minHeight: 30)
            }
            .accentFilledButton()
            .keyboardShortcut(.return, modifiers: [])
            .disabled(!model.canDealAnother)
            if !model.canDealAnother {
                Text("Shoe too low for another \(noun) — return to counting to reshuffle.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private var countCheckStage: some View {
        CountCheckView(
            cardsSeen: model.cardsSeen,
            holeCardUnseen: model.holeCardUnseen,
            allowFractions: model.fractionalCount,
            verdict: model.countVerdict,
            onAnswer: { model.answerCountCheck($0) },
            onLeave: { onExit(model.seenCards) }
        )
    }

    /// Leaving: the count question first, when the table has cards to answer for.
    private func leave() {
        if model.requestExit() { onExit(model.seenCards) }
    }

    private var insuranceStage: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Dealer shows an ace. Insurance costs \(Chips.format(model.insuranceTotal)) "
                + "(half \(model.hands.count > 1 ? "each bet" : "the bet")) and pays 2:1 "
                + "on a dealer blackjack.")
                .font(.subheadline)
                .foregroundStyle(Theme.ink)
            HStack(spacing: 8) {
                Button { model.takeInsurance() } label: {
                    Text(hasHardwareKeyboard ? "Take insurance  [I]" : "Take insurance")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
                .keyboardShortcut("i", modifiers: [])
                Button { model.declineInsurance() } label: {
                    Text(hasHardwareKeyboard ? "No insurance  [N]" : "No insurance")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .buttonStyle(.bordered)
                .tint(Theme.accentInk)
                .keyboardShortcut("n", modifiers: [])
            }
        }
    }
}

/// The chips half of the screen — the bankroll line and the bet the round opens
/// on. In an extension so the view stays inside the repo's type-body budget,
/// following the split `SettingsView` already uses for its bindings.
extension ShowdownView {
    var bankrollLine: some View {
        let state = model.bankrollStore.state
        return Text(state.wagered > 0
            ? "Bankroll \(Chips.format(state.bankroll))  ·  wagered "
            + "\(Chips.format(state.wagered)), net \(Chips.signed(state.net))"
            : "Bankroll \(Chips.format(state.bankroll))")
            .font(.footnote)
            .foregroundStyle(Theme.midInk)
    }

    @ViewBuilder var bettingStage: some View {
        if model.bankrollStore.bustedOut {
            VStack(alignment: .leading, spacing: 10) {
                Text("Out of chips. Reset the bankroll to keep practising.")
                    .foregroundStyle(Theme.muted)
                Button { model.resetBankroll() } label: {
                    Text("Reset bankroll").frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text(model.spots > 1
                    ? "Size the bet for each of the \(model.spots) boxes."
                    : "Size the bet before the deal.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.ink)
                HStack(spacing: 8) {
                    ForEach(model.betOptions, id: \.self) { option in
                        Button { model.setBet(option) } label: {
                            Text(Chips.format(option))
                                .frame(minWidth: 40, minHeight: 30)
                        }
                        .buttonStyle(.bordered)
                        .tint(option == model.bet ? Theme.accentInk : Theme.midInk)
                        .disabled(!model.betAffordable(option))
                        .accessibilityLabel("Bet \(Chips.format(option))")
                        .accessibilityAddTraits(option == model.bet ? [.isSelected] : [])
                    }
                }
                Text(model.spots > 1
                    ? "Total at risk this round: \(Chips.format(model.bet * Double(model.spots)))"
                    : "At risk this round: \(Chips.format(model.bet))")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                Button { model.dealAfterBet() } label: {
                    Text(hasHardwareKeyboard ? "Deal  [Enter]" : "Deal")
                        .frame(maxWidth: .infinity, minHeight: 30)
                }
                .accentFilledButton()
                .keyboardShortcut(.return, modifiers: [])
            }
        }
    }
}

#Preview("Insurance decision") {
    let defaults = UserDefaults(suiteName: "showdown-preview")!
    let model = ShowdownModel(
        shoe: Shoe(
            cards: [
                Card(rank: .nine, suit: .spades), Card(rank: .ace, suit: .diamonds),
                Card(rank: .seven, suit: .hearts), Card(rank: .six, suit: .clubs),
                Card(rank: .five, suit: .clubs), Card(rank: .five, suit: .hearts)
            ],
            penetration: 0.9
        ),
        ruleSet: .s17,
        stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: defaults),
        betting: true,
        bankroll: BankrollStore(key: StatsKeys.showdownBankroll, defaults: defaults)
    )
    model.setBet(10)
    model.dealAfterBet()
    return ShowdownView(model: model) { _ in }
        .padding()
        .appBackground()
}

/// Chip figures carry no currency symbol — they are units, and a 3:2 on an odd bet
/// is a genuine half chip, so only the halves get a decimal. Mirrors the web
/// `chips` / `signedChips` helpers.
enum Chips {
    static func format(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    static func signed(_ value: Double) -> String {
        guard value != 0 else { return "even" }
        return (value > 0 ? "+" : "\u{2212}") + format(abs(value))
    }
}
