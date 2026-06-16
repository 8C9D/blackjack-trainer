import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import { Shoe } from '../../core/models/shoe.model';
import type { Settlement } from '../../core/models/showdown.model';
import type { Action, RuleSet } from '../../core/models/strategy.model';
import type { ShowdownStats } from '../../core/services/showdown-stats.service';
import { ShowdownComponent } from './showdown.component';

// Protected signals/methods are plain properties at runtime; this mirror lets
// the tests drive the hand without scattering `as any`.
type Internals = {
  phase(): 'player-turn' | 'resolved' | 'exhausted';
  playerCards(): readonly Card[];
  dealerCards(): readonly Card[];
  settlement(): Settlement | null;
  remaining(): number;
  canDealAnother(): boolean;
  onAction(a: Action): void;
  dealAnother(): void;
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
    expect(fixture.nativeElement.querySelector('app-action-buttons')).toBeNull();
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

  it('emits exit when "Back to counting" is clicked', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']));
    let exited = false;
    fixture.componentInstance.exit.subscribe(() => (exited = true));
    (fixture.nativeElement.querySelector('.showdown__exit') as HTMLButtonElement).click();
    expect(exited).toBe(true);
  });

  it('emits ruleSetChange when the dealer rule is toggled', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']), 'S17');
    let received: RuleSet | undefined;
    fixture.componentInstance.ruleSetChange.subscribe((r) => (received = r));
    const radios = fixture.nativeElement.querySelectorAll(
      '.showdown__rule input[type=radio]',
    ) as NodeListOf<HTMLInputElement>;
    radios[1].dispatchEvent(new Event('change')); // H17
    expect(received).toBe('H17');
  });

  it('renders Hit and Stand buttons only during the player turn', () => {
    const { fixture } = createShowdown(makeShoe(['9', '10', '7', '6']));
    const buttons = fixture.nativeElement.querySelectorAll('.actions__button');
    expect(buttons.length).toBe(2);
    expect((buttons[0] as HTMLElement).textContent).toContain('Hit');
    expect((buttons[1] as HTMLElement).textContent).toContain('Stand');
  });

  it("'s' key stands the hand", () => {
    const { c } = createShowdown(makeShoe(['10', '10', '9', '8', '2']));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(c.phase()).toBe('resolved');
  });

  it('resets the showdown tally', () => {
    const { fixture, c } = createShowdown(makeShoe(['10', '10', '9', '8', '2']));
    c.onAction('S');
    expect(c.stats.stats().hands).toBe(1);
    fixture.detectChanges(); // enable the reset button now that a hand was played
    (fixture.nativeElement.querySelector('.showdown__stats-reset') as HTMLButtonElement).click();
    expect(c.stats.stats().hands).toBe(0);
  });
});
