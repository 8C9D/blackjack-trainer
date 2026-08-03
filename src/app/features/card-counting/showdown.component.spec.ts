import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import { Shoe } from '../../core/models/shoe.model';
import type { Settlement } from '../../core/models/showdown.model';
import type { Action, EngineOptions, RuleSet } from '../../core/models/strategy.model';
import type { ShowdownStats } from '../../core/services/showdown-stats.service';
import type { SessionStats } from '../../core/services/stats-store';
import type { BankrollState } from '../../core/services/bankroll.service';
import { countingSystemById } from '../../data/counting-systems';
import { deviationsFor } from '../../core/services/deviation-engine.service';
import { MissTallyService } from '../../core/services/miss-tally.service';
import { BankrollService } from '../../core/services/bankroll.service';
import { DEFAULT_BET_RAMP } from '../../core/models/bet-ramp.model';
import { ShowdownComponent } from './showdown.component';

// The index the coach quotes has to be the one it graded against, so the spec
// reads it off the chart rather than restating it.
const INSURANCE_INDEX = deviationsFor('S17').find((r) => r.category === 'insurance')!.index;

// Protected signals/methods are plain properties at runtime; this mirror lets
// the tests drive the hand without scattering `as any`.
type PlayerHandView = {
  cards: readonly Card[];
  box: number;
  bet: number;
  doubled: boolean;
  isSplitAce: boolean;
  fromSplit: boolean;
  surrendered: boolean;
  done: boolean;
  settlement: Settlement | null;
};

type Internals = {
  phase(): 'betting' | 'insurance' | 'player-turn' | 'resolved' | 'exhausted';
  insuranceNet(): number | null;
  insuranceTotal(): number;
  takeInsurance(): void;
  declineInsurance(): void;
  bet(): number;
  roundNet(): number;
  committed(): number;
  setBet(v: number): void;
  dealAfterBet(): void;
  resetBankroll(): void;
  betAffordable(option: number): boolean;
  stake(h: PlayerHandView): number;
  payout(h: PlayerHandView): number;
  signedChips(v: number): string;
  bankrollService: { bankroll(): number; state(): BankrollState; bustedOut(): boolean };
  playerCards(): readonly Card[];
  dealerCards(): readonly Card[];
  settlement(): Settlement | null;
  hands(): readonly PlayerHandView[];
  activeIndex(): number;
  remaining(): number;
  canDealAnother(): boolean;
  onAction(a: Action): void;
  onKeyDown(event: KeyboardEvent): void;
  dealAnother(): void;
  playerActions(): readonly Action[];
  doubled(): boolean;
  verdict(h: PlayerHandView): string;
  roundSummary(): string;
  spots(): number;
  stats: { stats(): ShowdownStats; reset(): void };
  playStats: { stats(): SessionStats };
  betSpreadStats: { stats(): SessionStats };
  betOptions(): readonly number[];
  lastPlay(): { correct: boolean; headline: string; reason: string } | null;
  roundMistakes(): readonly string[];
};

// A shoe that deals the given ranks in order (no shuffle): the constructor takes
// cards as-is, so dealing order is deterministic. Opening deal order is
// player, dealer, player, dealer; subsequent draws follow.
function makeShoe(ranks: readonly Rank[]): Shoe {
  const cards: Card[] = ranks.map((rank) => ({ rank, suit: 'spades' as Suit }));
  return new Shoe(cards, 1);
}

function createShowdown(
  shoe: Shoe,
  ruleSet: RuleSet = 'S17',
  spots = 1,
  betting = false,
  options: EngineOptions = { doubleAfterSplit: true, lateSurrender: true },
  count: { systemId?: string; entryRunningCount?: number } = {},
): { fixture: ComponentFixture<ShowdownComponent>; c: Internals } {
  const fixture = TestBed.createComponent(ShowdownComponent);
  fixture.componentRef.setInput('shoe', shoe);
  fixture.componentRef.setInput('ruleSet', ruleSet);
  fixture.componentRef.setInput('options', options);
  fixture.componentRef.setInput('spots', spots);
  fixture.componentRef.setInput('betting', betting);
  fixture.componentRef.setInput('system', countingSystemById(count.systemId ?? 'hi-lo'));
  fixture.componentRef.setInput('entryRunningCount', count.entryRunningCount ?? 0);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance as unknown as Internals };
}

describe('ShowdownComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ShowdownComponent] });
  });

  it('deals an opening hand on init and waits for the player', () => {
    // player [9,7]=16, dealer upcard 10 (hole 6) — no natural.
    const { c } = createShowdown(makeShoe(['9', '10', '7', '6']));
    expect(c.phase()).toBe('player-turn');
    expect(c.playerCards().map((x) => x.rank)).toEqual(['9', '7']);
    expect(c.dealerCards().length).toBe(2);
  });

  it('shows the player cards and a face-down dealer hole during the turn', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']));
    const faceDown = fixture.nativeElement.querySelectorAll('.card-image--face-down');
    expect(faceDown.length).toBe(1);
    // No result region yet.
    expect(fixture.nativeElement.querySelector('.showdown__result')).toBeNull();
  });

  it('player stands; dealer plays out and a dealer bust is a win', () => {
    // player [10,9]=19, dealer [10,6]=16 → hits K → 26 bust.
    const { c } = createShowdown(makeShoe(['10', '10', '9', '6', 'K']));
    c.onAction('S');
    expect(c.phase()).toBe('resolved');
    expect(c.settlement()!.outcome).toBe('win');
    expect(c.dealerCards().map((x) => x.rank)).toEqual(['10', '6', 'K']);
    expect(c.stats.stats()).toMatchObject({ hands: 1, wins: 1, losses: 0, pushes: 0 });
  });

  it('a player bust loses immediately and the dealer does not draw', () => {
    // player [10,6]=16 → hit K → 26 bust. Dealer [10,2] would hit if it played.
    const { c } = createShowdown(makeShoe(['10', '10', '6', '2', 'K', '5']));
    c.onAction('H');
    expect(c.phase()).toBe('resolved');
    expect(c.settlement()!.outcome).toBe('lose');
    // Dealer kept its two cards — it never drew the spare 5.
    expect(c.dealerCards().map((x) => x.rank)).toEqual(['10', '2']);
    expect(c.stats.stats()).toMatchObject({ hands: 1, losses: 1 });
  });

  it('a player natural pays 3:2 and resolves at the deal without a turn', () => {
    // player [A,K] natural, dealer [9,7] non-natural.
    const { fixture, c } = createShowdown(makeShoe(['A', '9', 'K', '7']));
    expect(c.phase()).toBe('resolved');
    expect(c.settlement()).toMatchObject({ outcome: 'win', playerBlackjack: true });
    expect(c.stats.stats()).toMatchObject({ hands: 1, wins: 1, blackjacks: 1 });
    expect(fixture.nativeElement.textContent).toContain('Blackjack');
    // No action buttons once resolved.
    expect(fixture.nativeElement.querySelector('.showdown__action')).toBeNull();
  });

  it('a dealer natural at the deal loses for a non-natural player', () => {
    // player [10,9]=19, dealer [A,K] natural.
    const { c } = createShowdown(makeShoe(['10', 'A', '9', 'K']));
    expect(c.phase()).toBe('resolved');
    expect(c.settlement()).toMatchObject({ outcome: 'lose', dealerBlackjack: true });
  });

  it('two naturals push', () => {
    // player [A,K], dealer [A,Q].
    const { c } = createShowdown(makeShoe(['A', 'A', 'K', 'Q']));
    expect(c.settlement()).toMatchObject({
      outcome: 'push',
      playerBlackjack: true,
      dealerBlackjack: true,
    });
    expect(c.stats.stats()).toMatchObject({ pushes: 1 });
  });

  it('stands on the dealer soft 17 under S17 (player 19 wins)', () => {
    // player [10,9]=19, dealer [A,6]=soft 17.
    const { c } = createShowdown(makeShoe(['10', 'A', '9', '6', '4']), 'S17');
    c.onAction('S');
    expect(c.dealerCards().map((x) => x.rank)).toEqual(['A', '6']);
    expect(c.settlement()!.outcome).toBe('win');
  });

  it('hits the dealer soft 17 under H17 (dealer makes 21, player 19 loses)', () => {
    // Same cards; H17 draws the 4 → A,6,4 = 21.
    const { c } = createShowdown(makeShoe(['10', 'A', '9', '6', '4']), 'H17');
    c.onAction('S');
    expect(c.dealerCards().map((x) => x.rank)).toEqual(['A', '6', '4']);
    expect(c.settlement()!.outcome).toBe('lose');
  });

  it('disables a second hand and goes exhausted when the shoe is too low', () => {
    // 5 cards: opening deal uses 4, leaving 1 (< MIN). Both pat at the deal.
    const { c } = createShowdown(makeShoe(['10', '10', '9', '8', '2']));
    c.onAction('S'); // dealer 18 stands, player 19 wins; no dealer draw.
    expect(c.phase()).toBe('resolved');
    expect(c.remaining()).toBe(1);
    expect(c.canDealAnother()).toBe(false);
    c.dealAnother();
    expect(c.phase()).toBe('exhausted');
  });

  describe('double down', () => {
    it('offers Double only on the opening two-card hand', () => {
      // player [9,7]=16 vs dealer 10; hitting draws a 2 → 3-card hand.
      const { c } = createShowdown(makeShoe(['9', '10', '7', '6', '2']));
      expect(c.playerActions()).toEqual(['H', 'S', 'D', 'SUR']);
      c.onAction('H');
      expect(c.playerCards().length).toBe(3);
      expect(c.playerActions()).toEqual(['H', 'S']); // no Double or Surrender after a hit
    });

    it('takes exactly one card, ends the turn, and marks the win as doubled', () => {
      // player [5,6]=11, dealer [10,7]=17; double draws K → player 21 beats 17.
      const { c } = createShowdown(makeShoe(['5', '10', '6', '7', 'K']));
      c.onAction('D');
      expect(c.doubled()).toBe(true);
      expect(c.playerCards().map((x) => x.rank)).toEqual(['5', '6', 'K']); // one card only
      expect(c.phase()).toBe('resolved');
      expect(c.settlement()!.outcome).toBe('win');
      expect(c.verdict(c.hands()[0])).toContain('(doubled)');
    });

    it('offers a double after splitting only when DAS is enabled', () => {
      const cards: readonly Rank[] = ['8', '10', '8', '7', '3', '5'];
      const withoutDas = createShowdown(makeShoe(cards), 'S17', 1, false, {
        doubleAfterSplit: false,
        lateSurrender: false,
      }).c;
      withoutDas.onAction('P');
      expect(withoutDas.playerCards().map((x) => x.rank)).toEqual(['8', '3']);
      expect(withoutDas.playerActions()).not.toContain('D');

      const withDas = createShowdown(makeShoe(cards), 'S17', 1, false, {
        doubleAfterSplit: true,
        lateSurrender: false,
      }).c;
      withDas.onAction('P');
      expect(withDas.playerActions()).toContain('D');
    });

    it('a double that busts loses', () => {
      // player [10,6]=16, dealer [10,7]=17; double draws K → 26 bust.
      const { c } = createShowdown(makeShoe(['10', '10', '6', '7', 'K']));
      c.onAction('D');
      expect(c.phase()).toBe('resolved');
      expect(c.settlement()!.outcome).toBe('lose');
      expect(c.stats.stats()).toMatchObject({ hands: 1, losses: 1 });
    });

    it('withholds Double when the shoe has no card left to supply it', () => {
      const { c } = createShowdown(makeShoe(['5', '10', '6', '8']));
      expect(c.remaining()).toBe(0);
      expect(c.playerActions()).not.toContain('D');
    });
  });

  describe('splits', () => {
    it('does not offer Split on a non-pair', () => {
      const { c } = createShowdown(makeShoe(['9', '10', '7', '6'])); // 9,7 — not a pair
      expect(c.playerActions()).not.toContain('P');
    });

    it('splits a pair into two independently-settled hands', () => {
      // player 8,8 vs dealer 10,7=17. hand1 draws 10 → 18 (win); hand2 draws 5 →
      // 13 (lose). Dealer stands on 17 (S17).
      const { c } = createShowdown(makeShoe(['8', '10', '8', '7', '10', '5']));
      expect(c.playerActions()).toContain('P');
      c.onAction('P');
      c.onAction('S'); // stand hand 1
      c.onAction('S'); // stand hand 2
      expect(c.hands().length).toBe(2);
      expect(c.phase()).toBe('resolved');
      expect(c.hands()[0].settlement!.outcome).toBe('win');
      expect(c.hands()[1].settlement!.outcome).toBe('lose');
      expect(c.stats.stats()).toMatchObject({ hands: 2, wins: 1, losses: 1 });
    });

    it('split aces take exactly one card each, auto-stand, and a 21 is not a natural', () => {
      // A,A vs dealer 10,7=17. Aces draw 10 → 21 and 9 → 20; both win but neither
      // is a blackjack (split 21 pays even money).
      const { c } = createShowdown(makeShoe(['A', '10', 'A', '7', '10', '9']));
      c.onAction('P');
      expect(c.phase()).toBe('resolved'); // resolves without further input
      expect(c.hands().length).toBe(2);
      expect(c.hands()[0].cards.length).toBe(2); // one card each, no hits
      expect(c.hands()[0].settlement!.outcome).toBe('win');
      expect(c.hands()[0].settlement!.playerBlackjack).toBe(false);
      expect(c.stats.stats()).toMatchObject({ hands: 2, wins: 2, blackjacks: 0 });
    });

    it('offers a re-split when a split hand pairs again (under the four-hand cap)', () => {
      const { c } = createShowdown(makeShoe(['8', '10', '8', '7', '8', '5', '5', '5']));
      c.onAction('P'); // hand 1 draws another 8 → 8,8
      expect(c.playerCards().map((x) => x.rank)).toEqual(['8', '8']);
      expect(c.playerActions()).toContain('P'); // re-split available
    });
  });

  // Bet sizing: with betting on, a round opens on a bet and settles against the
  // persisted bankroll. The default bankroll is 500 and the opening bet the
  // 1-chip minimum.
  describe('bet sizing', () => {
    it('opens on the bet and deals nothing until the bet is placed', () => {
      const { c } = createShowdown(makeShoe(['9', '10', '7', '6']), 'S17', 1, true);
      expect(c.phase()).toBe('betting');
      expect(c.hands().length).toBe(0);
      expect(c.remaining()).toBe(4);
      expect(c.bet()).toBe(1);
    });

    it('posts the chosen bet on the hand it deals', () => {
      const { c } = createShowdown(makeShoe(['9', '10', '7', '6']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      expect(c.phase()).toBe('player-turn');
      expect(c.hands()[0].bet).toBe(10);
      expect(c.committed()).toBe(10);
    });

    it('ignores bet changes and duplicate deal requests after play has started', () => {
      const { c } = createShowdown(makeShoe(['9', '10', '7', '6', '5']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      const remaining = c.remaining();

      c.setBet(25);
      c.dealAfterBet();

      expect(c.bet()).toBe(10);
      expect(c.remaining()).toBe(remaining);
      expect(c.hands()).toHaveLength(1);
    });

    it('posts the bet on every occupied box', () => {
      const { c } = createShowdown(makeShoe(['9', '8', '10', '7', '4', '6']), 'S17', 2, true);
      c.setBet(5);
      c.dealAfterBet();
      expect(c.hands().map((h) => h.bet)).toEqual([5, 5]);
      expect(c.committed()).toBe(10);
    });

    it('credits a win and debits a loss', () => {
      // player [10,9]=19 beats dealer [10,8]=18.
      const { c } = createShowdown(makeShoe(['10', '10', '9', '8']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      c.onAction('S');
      expect(c.hands()[0].settlement!.outcome).toBe('win');
      expect(c.bankrollService.bankroll()).toBe(510);
      expect(c.bankrollService.state()).toEqual({ bankroll: 510, wagered: 10, net: 10 });
      expect(c.roundNet()).toBe(10);
    });

    it('pays a natural 3:2 on the bet', () => {
      const { c } = createShowdown(makeShoe(['A', '9', 'K', '7']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      expect(c.phase()).toBe('resolved');
      expect(c.bankrollService.bankroll()).toBe(515);
      expect(c.roundNet()).toBe(15);
    });

    it('returns the stake on a push', () => {
      // player [10,9]=19, dealer [10,9]=19.
      const { c } = createShowdown(makeShoe(['10', '10', '9', '9']), 'S17', 1, true);
      c.setBet(25);
      c.dealAfterBet();
      c.onAction('S');
      expect(c.hands()[0].settlement!.outcome).toBe('push');
      expect(c.bankrollService.state()).toEqual({ bankroll: 500, wagered: 25, net: 0 });
    });

    it('risks and settles both bets on a double', () => {
      // player [5,6]=11 doubles into a 10 → 21 vs dealer [10,8]=18.
      const { c } = createShowdown(makeShoe(['5', '10', '6', '8', '10']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      c.onAction('D');
      expect(c.hands()[0].doubled).toBe(true);
      expect(c.stake(c.hands()[0])).toBe(20);
      expect(c.bankrollService.state()).toEqual({ bankroll: 520, wagered: 20, net: 20 });
    });

    it('posts a second bet when a pair is split', () => {
      // [8,8] split; each hand draws a ten → 18 apiece vs dealer [10,7]=17.
      const { c } = createShowdown(makeShoe(['8', '10', '8', '7', '10', '10']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      c.onAction('P');
      expect(c.hands().map((h) => h.bet)).toEqual([10, 10]);
      expect(c.committed()).toBe(20);
      c.onAction('S');
      c.onAction('S');
      // Both 18s beat 17: two bets won.
      expect(c.bankrollService.state()).toEqual({ bankroll: 520, wagered: 20, net: 20 });
    });

    it('withholds a double the bankroll cannot back', () => {
      // Bet the whole bankroll on the only box: no chips left for a second bet.
      const { c } = createShowdown(makeShoe(['5', '10', '6', '8', '10']), 'S17', 1, true);
      c.setBet(500);
      c.dealAfterBet();
      expect(c.hands()[0].bet).toBe(500);
      // Surrender stays: it needs no extra chips, unlike the withheld double.
      expect(c.playerActions()).toEqual(['H', 'S', 'SUR']);
    });

    it('offers only the bet sizes every box can cover', () => {
      const { c } = createShowdown(makeShoe(['9', '8', '9', '10', '7', '4', '6', '5']), 'S17', 3);
      // 3 boxes × 25 = 75, well inside 500.
      expect(c.betAffordable(25)).toBe(true);
    });

    it('returns to the bet between rounds rather than dealing straight on', () => {
      const { c } = createShowdown(makeShoe(['10', '10', '9', '8', '9', '10', '7', '6']));
      // Betting off: the next round deals immediately (existing behaviour).
      c.onAction('S');
      c.dealAnother();
      expect(c.phase()).toBe('player-turn');

      const betting = createShowdown(
        makeShoe(['10', '10', '9', '8', '9', '10', '7', '6']),
        'S17',
        1,
        true,
      ).c;
      betting.setBet(5);
      betting.dealAfterBet();
      betting.onAction('S');
      expect(betting.phase()).toBe('resolved');
      betting.dealAnother();
      expect(betting.phase()).toBe('betting');
      expect(betting.hands().length).toBe(0);
    });

    it('clamps a bet to what the bankroll can cover across the boxes', () => {
      const { c } = createShowdown(
        makeShoe(['9', '8', '9', '10', '7', '4', '6', '5']),
        'S17',
        3,
        true,
      );
      c.setBet(500);
      // 500 across three boxes is not payable; the per-box bet caps at a third.
      expect(c.bet()).toBe(166);
    });

    it('offers a reset once the chips are gone, and restores the bankroll', () => {
      // Lose the whole bankroll on one hand: player [10,6]=16 hits into a bust.
      const { c } = createShowdown(makeShoe(['10', '10', '6', '2', 'K']), 'S17', 1, true);
      c.setBet(500);
      c.dealAfterBet();
      c.onAction('H');
      expect(c.bankrollService.bankroll()).toBe(0);
      expect(c.bankrollService.bustedOut()).toBe(true);
      c.dealAnother();
      // Busted out: no further round is dealt until the bankroll is reset.
      expect(c.phase()).toBe('resolved');
      c.resetBankroll();
      expect(c.bankrollService.bankroll()).toBe(500);
      expect(c.phase()).toBe('betting');
    });

    it('shows the chip position and the round result', () => {
      const { fixture, c } = createShowdown(makeShoe(['10', '10', '9', '8']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      c.onAction('S');
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Bankroll');
      expect(text).toContain('510');
      expect(c.signedChips(10)).toBe('+10');
      expect(c.signedChips(-10)).toBe('−10');
      expect(c.signedChips(0)).toBe('even');
    });

    it('leaves the bankroll untouched when betting is off', () => {
      const { fixture, c } = createShowdown(makeShoe(['10', '10', '9', '8']));
      c.onAction('S');
      expect(c.hands()[0].bet).toBe(0);
      expect(c.bankrollService.state()).toEqual({ bankroll: 500, wagered: 0, net: 0 });
      expect(fixture.nativeElement.textContent).not.toContain('Bankroll');
    });
  });

  // Late surrender: a box's original two cards may be given up for half the
  // bet. The peek has already settled any dealer natural by the time a hand is
  // played, which is exactly the "late" in late surrender.
  describe('surrender', () => {
    it('is offered only when the Late Surrender table rule is enabled', () => {
      const cards: readonly Rank[] = ['10', '10', '6', '9'];
      const withoutLs = createShowdown(makeShoe(cards), 'S17', 1, false, {
        doubleAfterSplit: false,
        lateSurrender: false,
      }).c;
      expect(withoutLs.playerActions()).not.toContain('SUR');

      const withLs = createShowdown(makeShoe(cards), 'S17', 1, false, {
        doubleAfterSplit: false,
        lateSurrender: true,
      }).c;
      expect(withLs.playerActions()).toContain('SUR');
    });

    it('settles the hand as an immediate loss and the dealer never draws', () => {
      // player [10,6]=16, dealer [10,9]=19 would stand anyway; the point is the
      // dealer takes no card when the only box has surrendered.
      const { c } = createShowdown(makeShoe(['10', '10', '6', '9', '5']));
      c.onAction('SUR');
      expect(c.phase()).toBe('resolved');
      expect(c.hands()[0].surrendered).toBe(true);
      expect(c.hands()[0].settlement!.outcome).toBe('lose');
      expect(c.dealerCards().length).toBe(2); // never drew the spare 5
      expect(c.stats.stats()).toMatchObject({ hands: 1, losses: 1 });
      expect(c.verdict(c.hands()[0])).toBe('Surrendered.');
    });

    it('is not offered once a card has been hit or on a split hand', () => {
      const { c } = createShowdown(makeShoe(['8', '10', '8', '7', '8', '5', '5', '5']));
      expect(c.playerActions()).toContain('SUR');
      c.onAction('P'); // the split halves are fresh two-card hands, but fromSplit
      expect(c.playerActions()).not.toContain('SUR');
    });

    it('forfeits half the bet with betting on', () => {
      const { c } = createShowdown(makeShoe(['10', '10', '6', '9']), 'S17', 1, true);
      c.setBet(10);
      c.dealAfterBet();
      c.onAction('SUR');
      expect(c.payout(c.hands()[0])).toBe(-5);
      expect(c.roundNet()).toBe(-5);
      expect(c.bankrollService.state()).toEqual({ bankroll: 495, wagered: 10, net: -5 });
      expect(c.verdict(c.hands()[0])).toBe('Surrendered — half the bet back.');
    });

    it('gives up one box while the others play on', () => {
      // box1 [9,7]=16 surrenders; box2 [10,9]=19 stands; dealer [J,6]=16 draws
      // the K for box2's sake and busts.
      const { c } = createShowdown(makeShoe(['9', '10', 'J', '7', '9', '6', 'K']), 'S17', 2);
      c.onAction('SUR');
      expect(c.activeIndex()).toBe(1); // play moved to the second box
      c.onAction('S');
      expect(c.phase()).toBe('resolved');
      expect(c.hands()[0].surrendered).toBe(true);
      expect(c.hands()[1].settlement!.outcome).toBe('win');
      expect(c.dealerCards().length).toBe(3);
      expect(c.roundSummary()).toBe('1 won, 1 lost');
    });

    it("the 'r' key surrenders", () => {
      const { c } = createShowdown(makeShoe(['10', '10', '6', '9']));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
      expect(c.phase()).toBe('resolved');
      expect(c.hands()[0].surrendered).toBe(true);
    });
  });

  // Insurance: with betting on, a dealer ace pauses the round on the take/skip
  // decision before the hole card is checked. Half each bet, pays 2:1.
  describe('insurance', () => {
    // player [9,7]=16, dealer shows an ace with a 6 in the hole — no natural.
    const noNatural: readonly Rank[] = ['9', 'A', '7', '6'];
    // Same upcard, but a K in the hole: a dealer natural.
    const natural: readonly Rank[] = ['9', 'A', '7', 'K'];

    function dealtWithBet(
      ranks: readonly Rank[],
      bet: number,
      spots = 1,
      count: { systemId?: string; entryRunningCount?: number } = {},
    ) {
      const created = createShowdown(
        makeShoe(ranks),
        'S17',
        spots,
        true,
        { doubleAfterSplit: true, lateSurrender: true },
        count,
      );
      created.c.setBet(bet);
      created.c.dealAfterBet();
      return created;
    }

    it('pauses on the insurance decision when the dealer shows an ace', () => {
      const { fixture, c } = dealtWithBet(noNatural, 10);
      expect(c.phase()).toBe('insurance');
      expect(c.insuranceTotal()).toBe(5);
      // No settlement yet — the hole card has not been checked.
      expect(c.hands()[0].settlement).toBeNull();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Take insurance');
    });

    it('is never offered with betting off — insurance is purely a money bet', () => {
      const { c } = createShowdown(makeShoe(noNatural));
      expect(c.phase()).toBe('player-turn');
    });

    it('is not offered on a non-ace upcard', () => {
      const { c } = dealtWithBet(['9', '10', '7', '6'], 10);
      expect(c.phase()).toBe('player-turn');
    });

    it('taking it against a dealer natural pays 2:1, covering the lost hand', () => {
      const { c } = dealtWithBet(natural, 10);
      c.takeInsurance();
      expect(c.phase()).toBe('resolved');
      expect(c.insuranceNet()).toBe(10);
      expect(c.hands()[0].settlement!.outcome).toBe('lose');
      // The insurance win exactly covers the hand's loss.
      expect(c.roundNet()).toBe(0);
      expect(c.bankrollService.state()).toEqual({ bankroll: 500, wagered: 15, net: 0 });
    });

    it('taking it against a no-natural forfeits the premium and play continues', () => {
      const { c } = dealtWithBet(noNatural, 10);
      c.takeInsurance();
      expect(c.phase()).toBe('player-turn');
      expect(c.insuranceNet()).toBe(-5);
      expect(c.bankrollService.bankroll()).toBe(495);
      c.onAction('S'); // 16 stands; dealer soft 17 stands under S17 → lose.
      expect(c.bankrollService.state()).toEqual({ bankroll: 485, wagered: 15, net: -15 });
      expect(c.roundNet()).toBe(-15);
    });

    it('declining leaves the bankroll untouched and checks the hole card', () => {
      const { c } = dealtWithBet(natural, 10);
      c.declineInsurance();
      expect(c.phase()).toBe('resolved');
      expect(c.insuranceNet()).toBeNull();
      expect(c.hands()[0].settlement!.outcome).toBe('lose');
      expect(c.bankrollService.state()).toEqual({ bankroll: 490, wagered: 10, net: -10 });
    });

    // Insurance is the one decision here that is purely about the count, and the
    // showdown hangs off the drill that just practised it. Whether the bet won
    // is beside the point: insurance at +3 that loses was still right.
    describe('graded against the count', () => {
      // The true count divides by the decks actually left, so these rounds are
      // dealt off a shoe padded to leave exactly one deck behind — which makes
      // the true count equal the running count and keeps the arithmetic legible.
      // The filler is 8s: zero in Hi-Lo and in KO, so it moves nothing.
      const oneDeckLeft = (ranks: readonly Rank[]): Rank[] => [
        ...ranks,
        ...(Array<Rank>(52).fill('8') as Rank[]),
      ];
      // The opening deal of [A,?] vs one box is 4 cards; the hole card is held
      // out of the visible count until the next round, so only 3 count here.
      // noNatural is ['9','A','7','6'] → visible 9, A, 7 = 0 + (-1) + 0 = -1.
      it('marks taking it at a low count as a misplay, and says the count', () => {
        const { c } = dealtWithBet(oneDeckLeft(noNatural), 10, 1, { entryRunningCount: 0 });
        c.takeInsurance();
        expect(c.lastPlay()).toMatchObject({ correct: false, headline: 'Declining was the play.' });
        expect(c.lastPlay()!.reason).toContain(`insurance index of +${INSURANCE_INDEX}`);
        // These rounds also over-bet the spread at a flat count, which is its
        // own misplay; the insurance call is the one under test here.
        expect(c.roundMistakes().filter((m) => m.startsWith('Insurance'))).toHaveLength(1);
      });

      it('confirms declining at a low count', () => {
        const { c } = dealtWithBet(oneDeckLeft(noNatural), 10, 1, { entryRunningCount: 0 });
        c.declineInsurance();
        expect(c.lastPlay()).toMatchObject({ correct: true });
        expect(c.roundMistakes().filter((m) => m.startsWith('Insurance'))).toEqual([]);
      });

      // A shoe of ~0.15 decks with a carried +1 puts the true count well past
      // the index, so insurance becomes the correct call.
      it('confirms taking it once the count reaches the index', () => {
        // Visible A takes the carried +4 to +3, and one deck left makes that TC +3.
        const { c } = dealtWithBet(oneDeckLeft(noNatural), 10, 1, { entryRunningCount: 4 });
        c.takeInsurance();
        expect(c.lastPlay()).toMatchObject({ correct: true });
      });

      // Insurance is a losing bet at a low count whether or not it happens to
      // win — that is the whole lesson.
      it('calls it a misplay even when the insurance bet wins', () => {
        const { c } = dealtWithBet(oneDeckLeft(natural), 10, 1, { entryRunningCount: 0 });
        c.takeInsurance();
        expect(c.insuranceNet()).toBe(10);
        expect(c.lastPlay()!.correct).toBe(false);
      });

      // KO has no true count; its book publishes a running-count trigger, and
      // that is what a KO counter is actually taught to use.
      it('grades KO against its own published insurance count', () => {
        const { c } = dealtWithBet(oneDeckLeft(noNatural), 10, 1, {
          systemId: 'ko',
          entryRunningCount: 4,
        });
        c.takeInsurance();
        expect(c.lastPlay()).toMatchObject({ correct: true });
        expect(c.lastPlay()!.reason).toContain("KO's insurance count");
      });

      // Wong Halves reads a different count off the same shoe and the app ships
      // no indices for it, so the decision is settled without being scored. The
      // bet is still graded — a ramp is the player's own, so any balanced system
      // has a true count to index it by — which is why the verdict on screen is
      // the bet's, and the insurance call leaves it alone rather than wiping it.
      it('says nothing for a system whose indices this app does not have', () => {
        const { c } = dealtWithBet(oneDeckLeft(noNatural), 10, 1, {
          systemId: 'wong-halves',
          entryRunningCount: 0,
        });
        const beforeInsurance = c.lastPlay();
        c.takeInsurance();
        expect(c.lastPlay()).toBe(beforeInsurance);
        expect(c.playStats.stats().attempts).toBe(0);
        expect(c.roundMistakes().filter((m) => m.startsWith('Insurance'))).toEqual([]);
      });
    });

    it('ignores insurance commands after the decision phase has passed', () => {
      const { c } = dealtWithBet(noNatural, 10);
      c.declineInsurance();
      expect(c.phase()).toBe('player-turn');

      c.takeInsurance();
      c.declineInsurance();

      expect(c.phase()).toBe('player-turn');
      expect(c.insuranceNet()).toBeNull();
      expect(c.bankrollService.state()).toEqual({ bankroll: 500, wagered: 0, net: 0 });
    });

    it('is skipped when the free chips cannot back it', () => {
      // The whole bankroll is on the box: nothing left for the side bet.
      const { c } = dealtWithBet(noNatural, 500);
      expect(c.phase()).toBe('player-turn');
    });

    it('covers every occupied box at half its bet', () => {
      // boxes [9,7] and [8,4]; dealer [A,6] — no natural.
      const { c } = dealtWithBet(['9', '8', 'A', '7', '4', '6'], 10, 2);
      expect(c.phase()).toBe('insurance');
      expect(c.insuranceTotal()).toBe(10);
      c.takeInsurance();
      expect(c.insuranceNet()).toBe(-10);
      expect(c.bankrollService.bankroll()).toBe(490);
    });

    it("keys 'i' and 'n' decide, and action keys are swallowed meanwhile", () => {
      const take = dealtWithBet(noNatural, 10).c;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
      expect(take.phase()).toBe('insurance'); // Stand must not leak through
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
      expect(take.insuranceNet()).toBe(-5);
      expect(take.phase()).toBe('player-turn');
    });

    it("the 'n' key declines insurance without posting a side bet", () => {
      const { c } = dealtWithBet(noNatural, 10);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
      expect(c.phase()).toBe('player-turn');
      expect(c.insuranceNet()).toBeNull();
      expect(c.bankrollService.state()).toEqual({ bankroll: 500, wagered: 0, net: 0 });
    });

    it('ignores insurance shortcuts while focus is in an editable control', () => {
      const { c } = dealtWithBet(noNatural, 10);
      const input = document.createElement('input');
      document.body.append(input);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));
      input.remove();

      expect(c.phase()).toBe('insurance');
      expect(c.insuranceNet()).toBeNull();
    });

    it('resets between rounds', () => {
      const { c } = dealtWithBet([...natural, '9', '10', '7', '6'], 10);
      c.takeInsurance();
      c.dealAnother();
      c.dealAfterBet();
      expect(c.insuranceNet()).toBeNull();
    });
  });

  it('emits exit with every dealt card when "Back to counting" is clicked', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']));
    let emitted: readonly Card[] | undefined;
    fixture.componentInstance.exit.subscribe((cards) => (emitted = cards));
    (fixture.nativeElement.querySelector('.showdown__exit') as HTMLButtonElement).click();
    expect(emitted).toBeDefined();
    // The opening deal drew all four cards from the shoe (player, dealer, ×2),
    // and they carry back so the drill can fold their count into the shoe.
    expect(emitted!.map((c) => c.rank)).toEqual(['9', '10', '7', '6']);
  });

  it('hosts no rule controls — the dealer rule comes from the shared table rules', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']), 'S17');
    expect(fixture.nativeElement.querySelector('input[type=radio]')).toBeNull();
  });

  it('renders Hit, Stand, Double, and Surrender on the opening hand', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6', '2']));
    const buttons = fixture.nativeElement.querySelectorAll('.showdown__action');
    expect(buttons.length).toBe(4);
    expect((buttons[0] as HTMLElement).textContent).toContain('Hit');
    expect((buttons[1] as HTMLElement).textContent).toContain('Stand');
    expect((buttons[2] as HTMLElement).textContent).toContain('Double');
    expect((buttons[3] as HTMLElement).textContent).toContain('Surrender');
  });

  it("'s' key stands the hand", () => {
    const { c } = createShowdown(makeShoe(['10', '10', '9', '8', '2']));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(c.phase()).toBe('resolved');
  });

  it('keeps recording the win/loss tally even without a stats panel', () => {
    const { c } = createShowdown(makeShoe(['10', '10', '9', '8', '2']));
    c.onAction('S');
    expect(c.stats.stats().hands).toBe(1);
    expect(localStorage.getItem('blackjack-showdown-stats')).not.toBeNull();
  });

  // Multiple boxes: one dealer plays against every occupied box. Opening deal
  // order is one card to each box, the dealer upcard, a second to each box,
  // then the dealer hole card.
  describe('multiple boxes', () => {
    it('deals one two-card hand per box against a single dealer hand', () => {
      // boxes [9,7]=16 and [8,4]=12; dealer [10,6].
      const { c } = createShowdown(makeShoe(['9', '8', '10', '7', '4', '6']), 'S17', 2);
      expect(c.hands().length).toBe(2);
      expect(c.hands()[0].cards.map((x) => x.rank)).toEqual(['9', '7']);
      expect(c.hands()[1].cards.map((x) => x.rank)).toEqual(['8', '4']);
      expect(c.dealerCards().map((x) => x.rank)).toEqual(['10', '6']);
      expect(c.activeIndex()).toBe(0);
    });

    it('settles each box independently against the same dealer hand', () => {
      // box1 [10,10]=20 wins, box2 [9,6]=15 loses, dealer [10,9]=19 stands.
      const { c } = createShowdown(makeShoe(['10', '9', '10', '10', '6', '9']), 'S17', 2);
      c.onAction('S');
      c.onAction('S');
      expect(c.phase()).toBe('resolved');
      expect(c.hands()[0].settlement!.outcome).toBe('win');
      expect(c.hands()[1].settlement!.outcome).toBe('lose');
    });

    it('pays a natural in a later box at 3:2 rather than treating it as a split', () => {
      // box1 [9,7]=16, box2 [A,K] natural; dealer [10,6] — no dealer natural.
      const { c } = createShowdown(makeShoe(['9', 'A', '10', '7', 'K', '6']), 'S17', 2);
      const box2 = c.hands()[1];
      expect(box2.settlement!.outcome).toBe('win');
      expect(box2.settlement!.playerBlackjack).toBe(true);
      // The natural sits out; play falls to the box that still owes a decision.
      expect(box2.done).toBe(true);
      expect(c.activeIndex()).toBe(0);
      expect(c.phase()).toBe('player-turn');
    });

    it('a dealer natural ends every box at once with no player turn', () => {
      const { c } = createShowdown(makeShoe(['9', '9', 'A', '7', '7', 'K']), 'S17', 2);
      expect(c.phase()).toBe('resolved');
      expect(c.hands().map((h) => h.settlement!.outcome)).toEqual(['lose', 'lose']);
      expect(c.hands().every((h) => h.settlement!.dealerBlackjack)).toBe(true);
    });

    it('records exactly one tally entry per box', () => {
      const { c } = createShowdown(makeShoe(['10', '9', '10', '10', '6', '9']), 'S17', 2);
      c.onAction('S');
      c.onAction('S');
      expect(c.stats.stats().hands).toBe(2);
      expect(c.stats.stats().wins).toBe(1);
      expect(c.stats.stats().losses).toBe(1);
    });

    it('does not double-count a box settled early by an opening natural', () => {
      const { c } = createShowdown(makeShoe(['9', 'A', '10', '7', 'K', '6', '5']), 'S17', 2);
      c.onAction('S'); // stand box1 on 16; dealer 16 draws the 5 → 21.
      expect(c.phase()).toBe('resolved');
      expect(c.stats.stats().hands).toBe(2);
      expect(c.stats.stats().blackjacks).toBe(1);
    });

    it('skips the dealer draw when no box is still live', () => {
      // Both boxes bust; the dealer should never take a card on 16.
      const { c } = createShowdown(makeShoe(['10', '10', '10', '9', '9', '6', '5', '5']), 'S17', 2);
      c.onAction('H'); // box1 19 + 5 = 24 bust → moves to box2
      c.onAction('H'); // box2 19 + 5 = 24 bust
      expect(c.phase()).toBe('resolved');
      expect(c.dealerCards().length).toBe(2);
      expect(c.hands().map((h) => h.settlement!.outcome)).toEqual(['lose', 'lose']);
    });

    it('requires enough cards for every box before offering another round', () => {
      // 6 cards deal the opening round for two boxes; 0 remain afterwards.
      const { c } = createShowdown(makeShoe(['10', '9', '10', '10', '6', '9']), 'S17', 2);
      c.onAction('S');
      c.onAction('S');
      expect(c.remaining()).toBe(0);
      expect(c.canDealAnother()).toBe(false);
    });

    it('summarizes a finished multi-box round', () => {
      const { c } = createShowdown(makeShoe(['10', '9', '10', '10', '6', '9']), 'S17', 2);
      c.onAction('S');
      c.onAction('S');
      expect(c.roundSummary()).toBe('1 won, 1 lost');
    });

    it('leaves a single-box round without a summary line', () => {
      const { c } = createShowdown(makeShoe(['10', '10', '9', '8', '2']));
      c.onAction('S');
      expect(c.roundSummary()).toBe('');
    });

    it('clamps the spots input to the supported range', () => {
      const { c } = createShowdown(makeShoe(['9', '8', '10', '7', '4', '6']), 'S17', 99);
      expect(c.spots()).toBe(3);
    });

    it('gives each box its own four-hand split cap', () => {
      // Three boxes each dealt 8,8. Splitting box 1 to its own two hands must
      // not spend box 2's allowance — the cap is four hands per box, as at a
      // real table, not four across the table.
      const { c } = createShowdown(
        makeShoe(['8', '8', '8', '10', '8', '8', '8', '6', '3', '3', '4', '4', '5']),
        'S17',
        3,
      );
      c.onAction('P'); // split box 1 → two hands, the first drawing a 3 → 11
      c.onAction('S'); // stand box 1 hand 1
      c.onAction('S'); // stand box 1 hand 2 (drew the second 3)
      expect(c.hands().length).toBe(4);
      // Play is now on box 2, a fresh 8,8 pair that has never been split.
      expect(c.hands()[c.activeIndex()].cards.map((x) => x.rank)).toEqual(['8', '8']);
      expect(c.playerActions()).toContain('P');
    });

    it('still caps one box at four hands however many boxes are in play', () => {
      // Two boxes; box 1 keeps pairing 8s. It may split three times (four hands)
      // and no more, regardless of box 2 sitting alongside it.
      const { c } = createShowdown(
        makeShoe(['8', '9', '10', '8', '9', '6', '8', '8', '8', '8', '5', '5', '5']),
        'S17',
        2,
      );
      c.onAction('P'); // box 1 → 2 hands, active draws an 8 → 8,8
      c.onAction('P'); // box 1 → 3 hands, active draws an 8 → 8,8
      c.onAction('P'); // box 1 → 4 hands, active draws an 8 → 8,8
      expect(c.hands()[c.activeIndex()].cards.map((x) => x.rank)).toEqual(['8', '8']);
      expect(c.playerActions()).not.toContain('P');
    });

    it('marks split hands so a split 21 is not paid as a natural', () => {
      // Single box [A,A]; split, each ace draws a ten → 21 apiece, dealer 20.
      const { c } = createShowdown(makeShoe(['A', '10', 'A', '10', 'K', 'Q']));
      c.onAction('P');
      expect(c.hands().every((h) => h.fromSplit)).toBe(true);
      expect(c.phase()).toBe('resolved');
      expect(c.hands().every((h) => h.settlement!.playerBlackjack)).toBe(false);
    });
  });

  // The table now says whether the hand was played right. It still settles the
  // play either way — this is a table, not a quiz.
  // The bet-spread drill asks for a number in the abstract; this is the table
  // where the chips actually go out, and until now a trainee could flat-bet the
  // minimum through a rich shoe and hear nothing.
  describe('grading the bet against the spread', () => {
    // The bet is placed before a card is dealt, so the shoe is padded to exactly
    // one deck *including* the round to come — that makes the true count equal
    // the carried running count at the moment the bet is graded. 8s are zero in
    // Hi-Lo, so the filler moves nothing.
    const oneDeckLeft = (ranks: readonly Rank[]): Rank[] => [
      ...ranks,
      ...(Array<Rank>(52 - ranks.length).fill('8') as Rank[]),
    ];
    const hand: readonly Rank[] = ['9', '10', '7', '6'];

    function bet(units: number, entryRunningCount: number) {
      const created = createShowdown(makeShoe(oneDeckLeft(hand)), 'S17', 1, true, undefined, {
        entryRunningCount,
      });
      created.c.setBet(units);
      created.c.dealAfterBet();
      return created;
    }

    it('offers the spread as the bet ladder, not a generic chip tray', () => {
      const { c } = createShowdown(makeShoe(oneDeckLeft(hand)), 'S17', 1, true);
      expect(c.betOptions()).toEqual([...DEFAULT_BET_RAMP]);
    });

    it('confirms a bet that matches the spread at this count', () => {
      // No cards are dealt when the bet is placed, so the count is the carried
      // one: 0 → the TC ≤ +1 band, where the default spread calls for 1 unit.
      const { c } = bet(1, 0);
      expect(c.lastPlay()).toMatchObject({ correct: true });
      expect(c.roundMistakes()).toEqual([]);
    });

    it('names the bet the spread called for when it was not the one placed', () => {
      // A carried +3 with one deck left is TC +3, where the spread calls for 4.
      const { c } = bet(1, 3);
      expect(c.lastPlay()).toMatchObject({ correct: false, headline: '4 units was the bet.' });
      expect(c.lastPlay()!.reason).toContain('TC +3');
      expect(c.roundMistakes()[0]).toBe('Bet: 4 at TC +3, not 1');
    });

    it('records the call in the bet-spread accuracy', () => {
      const { c } = bet(1, 3);
      expect(c.betSpreadStats.stats()).toMatchObject({ attempts: 1, correct: 0 });
    });

    // The ramp is the player's own, indexed by whatever true count they keep, so
    // it applies to any balanced system — unlike the insurance index, which is a
    // Hi-Lo number and is only ever applied to Hi-Lo.
    it('grades any balanced system against its own true count', () => {
      // Omega II is level 2: the same four cards read a different count, and the
      // ramp is graded on that one.
      const { c } = createShowdown(makeShoe(oneDeckLeft(hand)), 'S17', 1, true, undefined, {
        systemId: 'omega-ii',
        entryRunningCount: 3,
      });
      c.setBet(4);
      c.dealAfterBet();
      expect(c.lastPlay()).toMatchObject({ correct: true });
    });

    // A system with no true count at all is not scored against a ramp indexed
    // by one — the same honesty the insurance call gets.
    it('says nothing about the bet for a system with no true count', () => {
      const { c } = createShowdown(makeShoe(oneDeckLeft(hand)), 'S17', 1, true, undefined, {
        systemId: 'ko',
        entryRunningCount: 3,
      });
      c.setBet(1);
      c.dealAfterBet();
      expect(c.lastPlay()).toBeNull();
      expect(c.betSpreadStats.stats().attempts).toBe(0);
    });

    // Pressing Deal into a shoe that cannot serve the round leaves the table on
    // 'exhausted' with nothing dealt. There was no round to bet into.
    it('says nothing when the shoe was too low to deal the round', () => {
      const { c } = createShowdown(makeShoe(['9', '10', '7']), 'S17', 1, true);
      c.setBet(1);
      c.dealAfterBet();
      expect(c.phase()).toBe('exhausted');
      expect(c.lastPlay()).toBeNull();
      expect(c.betSpreadStats.stats().attempts).toBe(0);
    });

    // A losing run clamps the carried bet down to whatever the stack can still
    // back, which need not land on a rung. Scoring that would mark a figure the
    // player never chose — the ladder is the only way to place a bet.
    it('skips a bet the bankroll clamped off the ladder', () => {
      // 7 chips left: the carried 8 clamps to 7, which is on no rung.
      TestBed.inject(BankrollService).record(0, -493);
      const { c } = bet(8, 0);
      expect(c.bet()).toBe(7);
      expect(c.lastPlay()).toBeNull();
      expect(c.betSpreadStats.stats().attempts).toBe(0);
    });

    // The top rung is offered disabled once the stack cannot back it, so scoring
    // it would mark a bet the table never let the player place.
    it('skips a called bet the bankroll could not have covered', () => {
      // Three chips left, but TC +3 calls for four.
      TestBed.inject(BankrollService).record(0, -497);
      const { c } = bet(1, 3);
      expect(c.lastPlay()).toBeNull();
      expect(c.betSpreadStats.stats().attempts).toBe(0);
    });

    // The hole card is face up on the felt the moment the round pays, so a
    // counter has it in their count before the next bet goes out. Grading that
    // bet against a count still missing it marks a correctly-sized bet wrong.
    it('counts the revealed hole card before grading the next bet', () => {
      // 57 cards: the opening round plus the bust card leave exactly one deck,
      // so the running count at the second bet *is* the true count.
      const shoe = makeShoe([
        // Player [10,6], dealer 10 up / 5 in the hole, then a 10 to bust on.
        '10',
        '10',
        '6',
        '5',
        '10',
        ...(Array<Rank>(52).fill('8') as Rank[]),
      ]);
      const { c } = createShowdown(shoe, 'S17', 1, true, undefined, { entryRunningCount: 3 });
      c.setBet(2);
      c.dealAfterBet();
      // Bust the hand: the dealer never draws, but the hole card is turned over.
      c.onAction('H');
      expect(c.phase()).toBe('resolved');
      expect(c.dealerCards().map((x) => x.rank)).toEqual(['10', '5']);

      // Seen: 10, 10, 6, 5, 10 → a carried +3 becomes +2 over one deck, which is
      // the band the spread bets 2 units in.
      c.dealAnother();
      c.setBet(2);
      c.dealAfterBet();
      expect(c.lastPlay()).toMatchObject({ correct: true });
      expect(c.lastPlay()!.reason).toContain('TC +2');
      expect(c.roundMistakes()).toEqual([]);
    });
  });

  describe('grading the play against basic strategy', () => {
    // A dealt round with chips on, for the cases where the bankroll is what
    // withholds an action.
    function withBet(ranks: readonly Rank[], bet: number) {
      const created = createShowdown(makeShoe(ranks), 'S17', 1, true);
      created.c.setBet(bet);
      created.c.dealAfterBet();
      return created;
    }

    it('confirms a correct decision without changing what happens', () => {
      // Player [10,9]=19 vs dealer 10: stand. Dealer [10,6] hits K → bust.
      const { c } = createShowdown(makeShoe(['10', '10', '9', '6', 'K']));
      c.onAction('S');
      expect(c.lastPlay()).toMatchObject({ correct: true, headline: 'Stand was the play.' });
      // The round resolved exactly as it did before grading existed.
      expect(c.settlement()!.outcome).toBe('win');
      expect(c.roundMistakes()).toEqual([]);
    });

    it('names the play that was correct, and lets the misplay stand', () => {
      // Player [10,9]=19 vs dealer 10: standing is correct, so hitting is not.
      const { c } = createShowdown(makeShoe(['10', '10', '9', '6', '2', 'K']));
      c.onAction('H');
      expect(c.lastPlay()).toMatchObject({ correct: false, headline: 'Stand was the play.' });
      // The card was still dealt: 19 + 2 = 21.
      expect(c.playerCards().length).toBe(3);
    });

    it('records every decision to the play-accuracy store', () => {
      // Player [5,4]=9 vs dealer 6: double. Hit is wrong, then 9+2=11 vs 6,
      // where a three-card hand can only hit — and hitting is now correct.
      const { c } = createShowdown(makeShoe(['5', '6', '4', '10', '2', '9', '5']));
      c.onAction('H');
      expect(c.playStats.stats()).toMatchObject({ attempts: 1, correct: 0 });
      c.onAction('H');
      expect(c.playStats.stats()).toMatchObject({ attempts: 2, correct: 1 });
    });

    // Doubling is a first-two-card action; the engine must not ask for it on a
    // hand that has already drawn.
    it('never asks a three-card hand to double', () => {
      // [5,4]=9 vs 6 doubles; after a hit, 9+2=11 vs 6 must be a hit.
      const { c } = createShowdown(makeShoe(['5', '6', '4', '10', '2', '9', '5']));
      c.onAction('H');
      c.onAction('H');
      expect(c.lastPlay()!.headline).toBe('Hit was the play.');
    });

    it('collects the round’s misplays for the result panel', () => {
      // Player [10,9]=19 vs 10: hit (wrong) to 21, then stand (correct).
      const { c } = createShowdown(makeShoe(['10', '10', '9', '6', '2', 'K']));
      c.onAction('H');
      c.onAction('S');
      expect(c.roundMistakes()).toHaveLength(1);
      expect(c.roundMistakes()[0]).toContain('Hard 19 vs 10');
      expect(c.roundMistakes()[0]).toContain('Stand');
    });

    it('clears the verdict and the misplay list when the next hand is dealt', () => {
      const { c } = createShowdown(
        makeShoe(['10', '10', '9', '6', '2', 'K', '10', '10', '9', '6', 'K']),
      );
      c.onAction('H');
      expect(c.roundMistakes()).toHaveLength(1);
      c.dealAnother();
      expect(c.lastPlay()).toBeNull();
      expect(c.roundMistakes()).toEqual([]);
    });

    it('grades a split offer the chart wants taken', () => {
      // [8,8] vs dealer 10 splits under every rule set.
      const { c } = createShowdown(makeShoe(['8', '10', '8', '6', '3', '3', 'K']));
      c.onAction('P');
      expect(c.lastPlay()).toMatchObject({ correct: true, headline: 'Split was the play.' });
    });

    it('shows the verdict on the felt', () => {
      const { fixture, c } = createShowdown(makeShoe(['10', '10', '9', '6', '2', 'K']));
      c.onAction('H');
      fixture.detectChanges();
      const coach = fixture.nativeElement.querySelector('.showdown__coach') as HTMLElement;
      expect(coach.textContent).toContain('Stand was the play');
      expect(coach.classList).toContain('showdown__coach--wrong');
    });

    // A misplay at the table is a basic-strategy miss on that hand, so it has to
    // reach the weak-spot tally — otherwise the verdict is said once and lost,
    // and the drill never learns what the trainee actually gets wrong in play.
    describe('feeding the weak-spot tally', () => {
      function tally(): MissTallyService {
        return TestBed.inject(MissTallyService);
      }

      // Scenario keys the showdown filed, whatever their outcome — `weakSpots`
      // only surfaces the ones with a miss.
      function filed(): readonly string[] {
        return Object.keys(tally().state()['basic-strategy'] ?? {}).sort();
      }

      it('files a misplay under the hand it was made on', () => {
        // Player [10,9]=19 vs dealer 10: standing is correct, so hitting is not.
        const { c } = createShowdown(makeShoe(['10', '10', '9', '6', '2', 'K']));
        c.onAction('H');
        const spots = tally().weakSpots('basic-strategy');
        expect(spots).toHaveLength(1);
        expect(spots[0]).toMatchObject({ label: '19 vs 10', misses: 1, attempts: 1 });
      });

      it('records a correct play too, so a weak spot can clear', () => {
        const { c } = createShowdown(makeShoe(['10', '10', '9', '6', 'K']));
        c.onAction('S');
        // Correct, so nothing is outstanding — but the attempt was filed, and
        // its clear-streak is what eventually retires the scenario.
        expect(tally().weakSpots('basic-strategy')).toEqual([]);
        expect(filed()).toEqual(['hard-19-v-10']);
      });

      // A ScenarioRef names a two-card hand — it is the seed the drill re-deals
      // from — so a three-card total has no identity to file under.
      it('leaves a three-card decision out of the tally', () => {
        // [5,4]=9 vs 6 doubles, so hitting is wrong. The hand is then a
        // three-card 11 vs 6, where hitting is the only play there is.
        const { c } = createShowdown(makeShoe(['5', '6', '4', '10', '2', '9', '5']));
        c.onAction('H');
        c.onAction('H');
        expect(c.playerCards().length).toBe(4);
        // Two decisions were graded; only the opening one was filed.
        expect(c.playStats.stats().attempts).toBe(2);
        expect(filed()).toEqual(['hard-9-v-6']);
        expect(tally().weakSpots('basic-strategy')[0]).toMatchObject({
          label: '9 vs 6',
          misses: 1,
          attempts: 1,
        });
      });

      // The felt can withhold an action the chart wants. Recording that would
      // clear a weak spot on a question the drill never asks.
      it('skips a hand whose double the free chips could not back', () => {
        // The whole bankroll rides on the box, so [5,4]=9 vs 6 cannot double and
        // hitting becomes the best play actually on offer.
        const { c } = withBet(['5', '6', '4', '10', '2', '9', '5'], 500);
        c.onAction('H');
        expect(c.lastPlay()).toMatchObject({ correct: true });
        expect(filed()).toEqual([]);
      });
    });

    // Three other screens already tell a trainee counting something else that
    // the indices are not theirs. This is the fourth place indices matter, and
    // the only one that applies them to a hand they actually played.
    describe('saying whose numbers these are', () => {
      function noteFor(systemId: string): string | null {
        const { fixture } = createShowdown(
          makeShoe(['9', '10', '7', '6']),
          'S17',
          1,
          false,
          undefined,
          {
            systemId,
          },
        );
        const el = fixture.nativeElement.querySelector('.showdown__index-note');
        return el === null ? null : (el.textContent as string).replace(/\s+/g, ' ').trim();
      }

      it('says nothing to a Hi-Lo counter, whose numbers these are', () => {
        expect(noteFor('hi-lo')).toBeNull();
      });

      it('tells a balanced counter their true count is a different number', () => {
        const note = noteFor('omega-ii');
        expect(note).toContain('Omega II');
        expect(note).toContain('different true count');
        expect(note).toContain('graded on basic strategy alone');
        expect(note).toContain('insurance call is left ungraded');
      });

      // KO is the one other system this table can grade at all, and only for
      // insurance — so its note has to promise less than the others, not more.
      it('credits KO with the one decision its book does publish', () => {
        const note = noteFor('ko');
        expect(note).toContain('unbalanced and has no true count');
        expect(note).toContain("KO's own running-count trigger");
        expect(note).not.toContain('left ungraded');
      });
    });

    // The count carried in from the drill is the whole reason this table exists,
    // and the Deviations trainer teaches standing 16 vs 10 at 0 or higher. A
    // table that marked that wrong would be teaching two different games.
    describe('against the count', () => {
      // The same hand at two counts. Padded to leave exactly one deck behind, so
      // the true count equals the running count; the filler is 8s, worth zero in
      // both Hi-Lo and KO. Player [9,7]=16 vs dealer 10 (hole 6, held out of the
      // visible count), so the visible running count is the entry count less the
      // dealer's ten.
      const SIXTEEN_V_TEN: readonly Rank[] = [
        '9',
        '10',
        '7',
        '6',
        ...(Array<Rank>(52).fill('8') as Rank[]),
      ];
      // Late surrender off: with it on, 16 vs 10 is a basic-strategy surrender
      // and the index is not allowed to downgrade it — its own case below.
      const noSurrender: EngineOptions = { doubleAfterSplit: true, lateSurrender: false };

      function atCount(entryRunningCount: number, systemId = 'hi-lo') {
        return createShowdown(makeShoe(SIXTEEN_V_TEN), 'S17', 1, false, noSurrender, {
          systemId,
          entryRunningCount,
        });
      }

      it('stands 16 vs 10 at the index, and says which index and what basic would do', () => {
        const { c } = atCount(1); // visible RC 0 over one deck → TC 0
        c.onAction('S');
        expect(c.lastPlay()).toMatchObject({ correct: true, headline: 'Stand was the play.' });
        expect(c.lastPlay()!.reason).toContain('0 or higher');
        expect(c.lastPlay()!.reason).toContain('Basic strategy alone would hit');
      });

      it('hits the same hand one count lower, where the index does not fire', () => {
        const { c } = atCount(0); // visible RC -1 → TC -1
        c.onAction('S');
        expect(c.lastPlay()).toMatchObject({ correct: false, headline: 'Hit was the play.' });
      });

      it('names an index miss as such in the round’s misplays', () => {
        const { c } = atCount(1);
        c.onAction('H');
        expect(c.roundMistakes()).toHaveLength(1);
        expect(c.roundMistakes()[0]).toContain('Stand, not Hit');
        expect(c.roundMistakes()[0]).toContain('(index play)');
      });

      // An index play is a Deviations question. Filing it under Basic Strategy
      // would seed that drill a hand whose chart answer the trainee got right.
      it('files an index miss as a Deviations weak spot, not a basic-strategy one', () => {
        const { c } = atCount(1);
        c.onAction('H');
        const tallies = TestBed.inject(MissTallyService);
        expect(tallies.weakSpots('deviations')[0]).toMatchObject({
          label: '16 vs 10',
          misses: 1,
        });
        expect(tallies.weakSpots('basic-strategy')).toEqual([]);
      });

      it('still files an ordinary miss under Basic Strategy', () => {
        const { c } = atCount(0);
        c.onAction('S');
        const tallies = TestBed.inject(MissTallyService);
        expect(tallies.weakSpots('basic-strategy')[0]).toMatchObject({ label: '16 vs 10' });
        expect(tallies.weakSpots('deviations')).toEqual([]);
      });

      // A playing index is a Hi-Lo true count. KO's book publishes an insurance
      // trigger and no playing schedule, so its running count grades that one
      // decision and leaves the hand to basic strategy.
      it('grades another system’s hand on basic strategy alone', () => {
        const { c } = atCount(1, 'ko');
        c.onAction('S');
        expect(c.lastPlay()).toMatchObject({ correct: false, headline: 'Hit was the play.' });
      });

      // The index for 16 vs 10 assumes surrender was unavailable; the BJA late-
      // surrender overlay says give the hand up at any count.
      it('does not let the index downgrade a surrender the chart already wants', () => {
        const { c } = createShowdown(
          makeShoe(SIXTEEN_V_TEN),
          'S17',
          1,
          false,
          { doubleAfterSplit: true, lateSurrender: true },
          { entryRunningCount: 1 },
        );
        c.onAction('S');
        expect(c.lastPlay()).toMatchObject({ correct: false, headline: 'Surrender was the play.' });
      });
    });
  });
});
