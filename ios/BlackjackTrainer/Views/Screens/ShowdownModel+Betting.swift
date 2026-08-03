import Foundation

/// The showdown's read side: the bet ladder, what a hand has at risk and what it
/// returned, and the gates on the player's next move. Split from `ShowdownModel`
/// so neither file outgrows the repo's length limits. The state and the mutators
/// stay with the model — `bet` and `phase` are `private(set)`, which is
/// file-scoped.
@MainActor
extension ShowdownModel {
    var activeHand: PlayerHand? {
        hands.indices.contains(activeIndex) ? hands[activeIndex] : nil
    }

    /// A table deals no round past the cut card: the round in progress when it
    /// surfaces is the shoe's last, and the next one is off a fresh shoe.
    /// Dealing on would also divide the true count by a sliver of a shoe — a +2
    /// over a tenth of a deck reads as +20 — and grade bets and index plays
    /// against counts no casino ever deals. `remaining` is the observed mirror
    /// of the shoe, so reading it here is what refreshes the view.
    var cutCardOut: Bool {
        _ = remaining
        return shoe.needsReshuffle
    }

    var canDealAnother: Bool {
        !cutCardOut && remaining >= Showdown.minCards(forSpots: spots)
    }

    /// Double is offered on an original fresh hand, and on a split hand only
    /// when the shared table rules enable DAS.
    var canDouble: Bool {
        guard let hand = activeHand else { return false }
        return phase == .playerTurn && hand.cards.count == 2 && !hand.isSplitAce
            && (!hand.fromSplit || options.doubleAfterSplit)
            && remaining >= 1
            && canPostAnotherBet(hand)
    }

    /// Split is offered on a fresh two-card pair, under its box's four-hand cap.
    var canSplit: Bool {
        guard let hand = activeHand else { return false }
        return phase == .playerTurn && hand.cards.count == 2 && !hand.isSplitAce
            && isPair(hand.cards) && handsInBox(hand.box) < Self.maxHandsPerBox && remaining >= 1
            && canPostAnotherBet(hand)
    }

    /// Late surrender: a box's original two cards may be given up for half the
    /// bet. Never after a split, and the option lapses once a card is drawn. By
    /// the time a hand is played the peek has already settled any dealer
    /// natural, which is exactly the "late" in late surrender.
    var canSurrender: Bool {
        guard let hand = activeHand else { return false }
        return options.lateSurrender && phase == .playerTurn
            && hand.cards.count == 2 && !hand.fromSplit
    }

    /// How many hands the given box currently holds — one until it splits.
    private func handsInBox(_ box: Int) -> Int {
        hands.filter { $0.box == box }.count
    }

    private func isPair(_ cards: [Card]) -> Bool {
        cards.count == 2 && cards[0].highValue == cards[1].highValue
    }

    /// The rungs on offer are the player's own spread, so the bet the count
    /// calls for is one the table can actually take.
    var betOptions: [Double] {
        Bankroll.betOptions(for: betRamp)
    }

    /// A bet option the bankroll cannot back across every box is offered disabled,
    /// so the ladder stays legible as the stack shrinks.
    func betAffordable(_ option: Double) -> Bool {
        option * Double(spots) <= bankrollStore.bankroll
    }

    /// Chips already committed to the felt this round. Only the bankroll's free
    /// chips can back another bet, so a double or split has to fit inside them.
    var committed: Double {
        hands.reduce(0) { $0 + Bankroll.stake(bet: $1.bet, doubled: $1.doubled) }
    }

    func canPostAnotherBet(_ hand: PlayerHand) -> Bool {
        guard betting else { return true }
        return bankrollStore.bankroll - committed >= hand.bet
    }

    /// What insuring every box costs: half of each box's bet.
    var insuranceTotal: Double {
        hands.reduce(0) { $0 + Bankroll.insuranceCost(bet: $1.bet) }
    }

    /// Insurance is only offered when the bankroll's free chips can back it, the
    /// same rule a double or split follows.
    var canAffordInsurance: Bool {
        bankrollStore.bankroll - committed >= insuranceTotal
    }

    func stake(_ hand: PlayerHand) -> Double {
        Bankroll.stake(bet: hand.bet, doubled: hand.doubled)
    }

    /// Chips a settled hand returned. Zero until it settles. A surrendered hand
    /// gave up half its bet, not the full stake its loss settlement would imply.
    func payout(_ hand: PlayerHand) -> Double {
        if hand.surrendered { return Bankroll.surrenderForfeit(bet: hand.bet) }
        guard let settlement = hand.settlement else { return 0 }
        return Bankroll.payout(settlement: settlement, bet: hand.bet, doubled: hand.doubled)
    }
}
