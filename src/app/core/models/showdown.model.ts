import type { Card } from './card.model';
import { handTotal, isBlackjack, isBust, isSoftHand } from './hand.model';
import type { RuleSet } from './strategy.model';

// Pure dealer-play and settlement logic for the post-count showdown. The card
// source is injected as a `draw` callback so the same shoe the player just
// counted can deal the hand, while the rules stay trivially unit-testable.

// Fewest cards needed to deal a single-box showdown's opening hand (two player +
// two dealer). The page only offers a showdown, and the component only enables
// "deal another", when at least this many cards remain; hits beyond the opening
// deal are handled gracefully if the shoe runs out.
export const MIN_SHOWDOWN_CARDS = 4;

// How many simultaneous boxes the player may occupy. One dealer plays against
// all of them from the same shoe.
export const MIN_SHOWDOWN_SPOTS = 1;
export const MAX_SHOWDOWN_SPOTS = 3;

// Selectable box counts, for the settings dropdown.
export const SHOWDOWN_SPOT_OPTIONS: readonly number[] = [1, 2, 3];

export function clampSpots(spots: number): number {
  if (!Number.isFinite(spots)) return MIN_SHOWDOWN_SPOTS;
  return Math.min(MAX_SHOWDOWN_SPOTS, Math.max(MIN_SHOWDOWN_SPOTS, Math.round(spots)));
}

// Cards consumed by the opening deal for `spots` boxes: two per box plus the
// dealer's two. Splits and hits draw beyond this and are handled gracefully if
// the shoe runs dry mid-hand.
export function minCardsForSpots(spots: number): number {
  return clampSpots(spots) * 2 + 2;
}

export type ShowdownOutcome = 'win' | 'lose' | 'push';

export interface Settlement {
  readonly outcome: ShowdownOutcome;
  // The player won (or pushed) with a two-card natural — a real game pays 3:2.
  readonly playerBlackjack: boolean;
  // The dealer held a two-card natural.
  readonly dealerBlackjack: boolean;
}

// Whether the dealer must draw another card. Stands on hard 17 and any total of
// 18+; hits anything 16 and under; hits a soft 17 only under H17.
export function dealerShouldHit(hand: readonly Card[], ruleSet: RuleSet): boolean {
  const total = handTotal(hand);
  if (total < 17) return true;
  if (total > 17) return false;
  return ruleSet === 'H17' && isSoftHand(hand);
}

// Play the dealer's hand to completion from its initial cards, drawing via the
// supplied callback. Stops early if the draw source is exhausted (the caller
// guarantees enough cards for normal play). Returns the final dealer cards.
export function playDealerHand(
  initial: readonly Card[],
  ruleSet: RuleSet,
  draw: () => Card | undefined,
): Card[] {
  const hand = [...initial];
  while (dealerShouldHit(hand, ruleSet)) {
    const card = draw();
    if (!card) break;
    hand.push(card);
  }
  return hand;
}

// Resolve a finished player hand against a finished dealer hand. Order matters:
// naturals settle before bust logic; a player bust loses even if the dealer also
// busts; a dealer bust pays any standing player hand; otherwise the higher total
// wins and equal totals push.
export function settle(
  player: readonly Card[],
  dealer: readonly Card[],
  // Whether the player hand counts as a natural blackjack (3:2). Defaults to a
  // real two-card 21. Split hands pass `false`: a 21 made after splitting is not
  // a natural and pays even money.
  playerNatural: boolean = isBlackjack(player),
): Settlement {
  const playerBlackjack = playerNatural;
  const dealerBlackjack = isBlackjack(dealer);

  if (playerBlackjack || dealerBlackjack) {
    const outcome: ShowdownOutcome =
      playerBlackjack && dealerBlackjack ? 'push' : playerBlackjack ? 'win' : 'lose';
    return { outcome, playerBlackjack, dealerBlackjack };
  }

  if (isBust(player)) return { outcome: 'lose', playerBlackjack, dealerBlackjack };
  if (isBust(dealer)) return { outcome: 'win', playerBlackjack, dealerBlackjack };

  const p = handTotal(player);
  const d = handTotal(dealer);
  const outcome: ShowdownOutcome = p > d ? 'win' : p < d ? 'lose' : 'push';
  return { outcome, playerBlackjack, dealerBlackjack };
}
