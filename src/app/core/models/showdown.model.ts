import type { Card } from './card.model';
import type { CountingSystem } from './counting-system.model';
import { DEVIATION_INDEX_SYSTEM_ID } from './deviation.model';
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

// Whether the count the showdown is carrying can be graded against, and how.
//
// The insurance index is a Hi-Lo true count and the playing indices are the
// same — a level-2 or fractional system reads a different number off the same
// shoe (see `deviationIndexNote`). KO is the one other system the app can grade,
// because its book publishes a running-count schedule of its own. Everything
// else is dealt and settled exactly as before, ungraded, rather than scored
// against numbers that are not its own.
export type CountBasis =
  | { readonly kind: 'true-count'; readonly trueCount: number }
  | { readonly kind: 'running-count'; readonly runningCount: number; readonly insuranceAt: number }
  | { readonly kind: 'ungraded' };

// This system's own true count, or null when it has none to read.
//
// Kept apart from `countBasisFor` because the two questions are different. A
// deviation index is a Hi-Lo number, so only Hi-Lo may be graded against it. A
// bet ramp is the player's own, indexed by whatever true count they are keeping
// — so any balanced system qualifies, exactly as the bet-spread drill allows.
export function trueCountFor(
  system: CountingSystem,
  runningCount: number,
  decksRemaining: number,
): number | null {
  if (!system.balanced || decksRemaining <= 0) return null;
  return Math.trunc(runningCount / decksRemaining);
}

export function countBasisFor(
  system: CountingSystem,
  runningCount: number,
  decksRemaining: number,
): CountBasis {
  if (system.id === DEVIATION_INDEX_SYSTEM_ID) {
    // A shoe dealt to the felt has no decks left to divide by; nothing is
    // dealt from it either, so the value is never actually consumed.
    if (decksRemaining <= 0) return { kind: 'ungraded' };
    return { kind: 'true-count', trueCount: Math.trunc(runningCount / decksRemaining) };
  }
  const insuranceAt = system.keyCounts?.insuranceCount;
  if (insuranceAt !== undefined) {
    return { kind: 'running-count', runningCount, insuranceAt };
  }
  return { kind: 'ungraded' };
}

// Whether the count says to take insurance, or null when this system's count is
// not one the app can grade. The Hi-Lo threshold is not hard-coded here: it is
// read off the deviation chart by the caller, which is where the index lives.
export function insuranceIsCorrect(basis: CountBasis, hiLoThresholdMet: boolean): boolean | null {
  switch (basis.kind) {
    case 'true-count':
      return hiLoThresholdMet;
    case 'running-count':
      return basis.runningCount >= basis.insuranceAt;
    case 'ungraded':
      return null;
  }
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
