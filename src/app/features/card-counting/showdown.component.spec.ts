import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import { Shoe } from '../../core/models/shoe.model';
import type { Settlement } from '../../core/models/showdown.model';
import type { Action, RuleSet } from '../../core/models/strategy.model';
import type { ShowdownStats } from '../../core/services/showdown-stats.service';
import { ShowdownComponent } from './showdown.component';

// Protected signals/methods are plain properties at runtime; this mirror lets
// the tests drive the hand without scattering `as any`.
type PlayerHandView = {
  cards: readonly Card[];
  doubled: boolean;
  isSplitAce: boolean;
  done: boolean;
  settlement: Settlement | null;
};

type Internals = {
  phase(): 'player-turn' | 'resolved' | 'exhausted';
  playerCards(): readonly Card[];
  dealerCards(): readonly Card[];
  settlement(): Settlement | null;
  hands(): readonly PlayerHandView[];
  activeIndex(): number;
  remaining(): number;
  canDealAnother(): boolean;
  onAction(a: Action): void;
  dealAnother(): void;
  playerActions(): readonly Action[];
  doubled(): boolean;
  verdict(h: PlayerHandView): string;
  stats: { stats(): ShowdownStats; reset(): void };
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
): { fixture: ComponentFixture<ShowdownComponent>; c: Internals } {
  const fixture = TestBed.createComponent(ShowdownComponent);
  fixture.componentRef.setInput('shoe', shoe);
  fixture.componentRef.setInput('ruleSet', ruleSet);
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
      expect(c.playerActions()).toEqual(['H', 'S', 'D']);
      c.onAction('H');
      expect(c.playerCards().length).toBe(3);
      expect(c.playerActions()).toEqual(['H', 'S']); // no Double after a hit
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

    it('a double that busts loses', () => {
      // player [10,6]=16, dealer [10,7]=17; double draws K → 26 bust.
      const { c } = createShowdown(makeShoe(['10', '10', '6', '7', 'K']));
      c.onAction('D');
      expect(c.phase()).toBe('resolved');
      expect(c.settlement()!.outcome).toBe('lose');
      expect(c.stats.stats()).toMatchObject({ hands: 1, losses: 1 });
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

  it('renders Hit, Stand, and Double on the opening hand', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']));
    const buttons = fixture.nativeElement.querySelectorAll('.showdown__action');
    expect(buttons.length).toBe(3);
    expect((buttons[0] as HTMLElement).textContent).toContain('Hit');
    expect((buttons[1] as HTMLElement).textContent).toContain('Stand');
    expect((buttons[2] as HTMLElement).textContent).toContain('Double');
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
});
