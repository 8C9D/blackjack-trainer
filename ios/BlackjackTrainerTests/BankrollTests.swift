import Foundation
import Testing
@testable import BlackjackTrainer

/// The showdown bankroll: its persisted store, and the betting path through the
/// showdown model. The pure payout/clamp math is covered by the parity vectors in
/// `ShowdownParityTests`; these cover the wiring around it.
@MainActor
struct BankrollTests {
    private func defaults() -> UserDefaults {
        let suite = "bankroll-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func card(_ rank: Rank, _ suit: Suit = .spades) -> Card {
        Card(rank: rank, suit: suit)
    }

    /// A shoe dealing the given cards in order, padded so nothing runs dry.
    private func stacked(_ cards: [Card]) -> Shoe {
        Shoe(
            cards: cards + Array(repeating: Card(rank: .five, suit: .clubs), count: 10),
            penetration: 0.9
        )
    }

    private func model(
        _ cards: [Card],
        spots: Int = 1,
        betting: Bool = true,
        bankroll: BankrollStore? = nil
    ) -> ShowdownModel {
        let store = defaults()
        return ShowdownModel(
            shoe: stacked(cards),
            ruleSet: .s17,
            stats: ShowdownStatsStore(key: StatsKeys.showdown, defaults: store),
            spots: spots,
            betting: betting,
            bankroll: bankroll ?? BankrollStore(key: StatsKeys.showdownBankroll, defaults: store)
        )
    }

    // MARK: store

    @Test func storeStartsFromTheDefaultBankroll() {
        let store = BankrollStore(key: StatsKeys.showdownBankroll, defaults: defaults())
        #expect(store.state == BankrollState(bankroll: 500, wagered: 0, net: 0))
        #expect(!store.bustedOut)
    }

    @Test func storeRecordsWinsLossesAndPushes() {
        let store = BankrollStore(key: StatsKeys.showdownBankroll, defaults: defaults())
        store.record(stake: 10, payout: 15) // a natural
        store.record(stake: 5, payout: -5)
        store.record(stake: 5, payout: 0)
        #expect(store.state == BankrollState(bankroll: 510, wagered: 20, net: 10))
    }

    @Test func storeFlagsABustOutAndResets() {
        let store = BankrollStore(key: StatsKeys.showdownBankroll, defaults: defaults())
        store.record(stake: 500, payout: -500)
        #expect(store.bankroll == 0)
        #expect(store.bustedOut)
        store.reset()
        #expect(store.state == .empty)
    }

    @Test func storePersistsAcrossInstances() {
        let shared = defaults()
        BankrollStore(key: StatsKeys.showdownBankroll, defaults: shared)
            .record(stake: 25, payout: -25)
        let reloaded = BankrollStore(key: StatsKeys.showdownBankroll, defaults: shared)
        #expect(reloaded.bankroll == 475)
    }

    @Test func impossiblePersistedStateFallsBackToTheDefaultBankroll() throws {
        let shared = defaults()
        let impossible = BankrollState(bankroll: 510, wagered: 20, net: 5)
        try shared.set(JSONEncoder().encode(impossible), forKey: StatsKeys.showdownBankroll)
        let store = BankrollStore(key: StatsKeys.showdownBankroll, defaults: shared)
        #expect(store.state == .empty)
    }

    // MARK: the betting path through the showdown

    @Test func opensOnTheBetAndDealsNothingUntilItIsPlaced() {
        let showdown = model([card(.nine), card(.ten), card(.seven), card(.six)])
        #expect(showdown.phase == .betting)
        #expect(showdown.hands.isEmpty)
        #expect(showdown.bet == 1)
    }

    @Test func postsTheChosenBetOnEveryBox() {
        let cards = [
            card(.nine), card(.eight), card(.ten), card(.seven), card(.four), card(.six)
        ]
        let showdown = model(cards, spots: 2)
        showdown.setBet(5)
        showdown.dealAfterBet()
        #expect(showdown.hands.map(\.bet) == [5, 5])
        #expect(showdown.committed == 10)
    }

    @Test func creditsAWinToTheBankroll() {
        // player [10,9]=19 beats dealer [10,8]=18.
        let cards = [card(.ten), card(.ten, .hearts), card(.nine), card(.eight)]
        let showdown = model(cards)
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.onAction(.stand)
        #expect(showdown.hands[0].settlement?.outcome == .win)
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 510, wagered: 10, net: 10))
        #expect(showdown.roundNet == 10)
    }

    @Test func paysANaturalThreeToTwoOnTheBet() {
        let cards = [card(.ace), card(.nine), card(.king), card(.seven)]
        let showdown = model(cards)
        showdown.setBet(10)
        showdown.dealAfterBet()
        #expect(showdown.phase == .resolved)
        #expect(showdown.bankrollStore.bankroll == 515)
    }

    @Test func risksAndSettlesBothBetsOnADouble() {
        // player [5,6]=11 doubles into a ten → 21 vs dealer [10,8]=18.
        let cards = [
            card(.five), card(.ten), card(.six), card(.eight), card(.ten, .hearts)
        ]
        let showdown = model(cards)
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.onAction(.double)
        #expect(showdown.stake(showdown.hands[0]) == 20)
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 520, wagered: 20, net: 20))
    }

    @Test func postsASecondBetOnASplit() {
        // [8,8] split; each draws a ten → 18 apiece vs dealer [10,7]=17.
        let cards = [
            card(.eight), card(.ten), card(.eight, .hearts), card(.seven),
            card(.ten, .clubs), card(.ten, .diamonds)
        ]
        let showdown = model(cards)
        showdown.setBet(10)
        showdown.dealAfterBet()
        showdown.onAction(.split)
        #expect(showdown.hands.map(\.bet) == [10, 10])
        #expect(showdown.committed == 20)
        showdown.onAction(.stand)
        showdown.onAction(.stand)
        #expect(showdown.bankrollStore.state == BankrollState(bankroll: 520, wagered: 20, net: 20))
    }

    @Test func withholdsADoubleTheBankrollCannotBack() {
        let cards = [
            card(.five), card(.ten), card(.six), card(.eight), card(.ten, .hearts)
        ]
        let showdown = model(cards)
        showdown.setBet(500) // the whole bankroll on the only box
        showdown.dealAfterBet()
        #expect(showdown.hands[0].bet == 500)
        #expect(!showdown.canDouble)
        #expect(!showdown.canSplit)
    }

    @Test func clampsTheBetToWhatTheBoxesCanCover() {
        let cards = [
            card(.nine), card(.eight), card(.nine, .hearts), card(.ten),
            card(.seven), card(.four), card(.six), card(.five)
        ]
        let showdown = model(cards, spots: 3)
        showdown.setBet(500)
        // 500 across three boxes is not payable; the per-box bet caps at a third.
        #expect(showdown.bet == 166)
    }

    @Test func returnsToTheBetBetweenRounds() {
        let cards = [
            card(.ten), card(.ten, .hearts), card(.nine), card(.eight),
            card(.nine, .clubs), card(.ten, .diamonds), card(.seven), card(.six)
        ]
        let showdown = model(cards)
        showdown.setBet(5)
        showdown.dealAfterBet()
        showdown.onAction(.stand)
        #expect(showdown.phase == .resolved)
        showdown.dealAnother()
        #expect(showdown.phase == .betting)
        #expect(showdown.hands.isEmpty)
    }

    @Test func offersAResetOnceTheChipsAreGone() {
        // player [10,6]=16 hits into a bust for the whole bankroll.
        let cards = [
            card(.ten), card(.ten, .hearts), card(.six), card(.two), card(.king)
        ]
        let showdown = model(cards)
        showdown.setBet(500)
        showdown.dealAfterBet()
        showdown.onAction(.hit)
        #expect(showdown.bankrollStore.bustedOut)
        showdown.dealAnother()
        #expect(showdown.phase == .resolved) // no round is dealt while busted out
        showdown.resetBankroll()
        #expect(showdown.bankrollStore.bankroll == 500)
        #expect(showdown.phase == .betting)
    }

    /// A bet is never nothing — `Bankroll.clampBet` floors at the table minimum
    /// whatever the bankroll says — so a stack too short for the boxes in play
    /// would be dealt a round it could not pay for and settle it into a negative
    /// bankroll, which the next launch would reject and silently reset to 500.
    @Test func refusesARoundTheBankrollCannotBackAcrossEveryBox() {
        let store = defaults()
        let bankroll = BankrollStore(key: StatsKeys.showdownBankroll, defaults: store)
        bankroll.record(stake: 499, payout: -499)
        #expect(bankroll.bankroll == 1)
        // Not busted out — a single box could still be played — but two cannot.
        #expect(!bankroll.bustedOut)

        let cards = [
            card(.ten), card(.ten, .hearts), card(.ten, .diamonds),
            card(.six), card(.six, .hearts), card(.ten, .clubs)
        ]
        let showdown = model(cards, spots: 2, bankroll: bankroll)
        #expect(!showdown.canBackRound)

        showdown.dealAfterBet()
        #expect(showdown.phase == .betting)
        #expect(showdown.hands.isEmpty)
    }

    @Test func settlesEveryBoxOnAStackThatCanBackThem() {
        let store = defaults()
        let bankroll = BankrollStore(key: StatsKeys.showdownBankroll, defaults: store)
        bankroll.record(stake: 498, payout: -498)
        #expect(bankroll.bankroll == 2)

        // Two boxes of [10,6]=16 against the dealer's [10,10]=20: both lose.
        let cards = [
            card(.ten), card(.ten, .hearts), card(.ten, .diamonds),
            card(.six), card(.six, .hearts), card(.ten, .clubs)
        ]
        let showdown = model(cards, spots: 2, bankroll: bankroll)
        #expect(showdown.canBackRound)
        showdown.dealAfterBet()
        showdown.onAction(.stand)
        showdown.onAction(.stand)

        // Every chip the round says it lost is a chip that left the bankroll.
        #expect(showdown.roundNet == -2)
        #expect(bankroll.state == BankrollState(bankroll: 0, wagered: 500, net: -500))
    }

    @Test func leavesTheBankrollAloneWhenBettingIsOff() {
        let cards = [card(.ten), card(.ten, .hearts), card(.nine), card(.eight)]
        let showdown = model(cards, betting: false)
        #expect(showdown.phase == .playerTurn)
        showdown.onAction(.stand)
        #expect(showdown.hands[0].bet == 0)
        #expect(showdown.bankrollStore.state == .empty)
    }

    @Test func formatsChipFiguresLikeTheWeb() {
        #expect(Chips.format(10) == "10")
        #expect(Chips.format(7.5) == "7.5")
        #expect(Chips.signed(10) == "+10")
        #expect(Chips.signed(-10) == "\u{2212}10")
        #expect(Chips.signed(0) == "even")
    }
}
