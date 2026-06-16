import type { Card } from './card.model';
import { handTotal, isBlackjack, isBust, isSoftHand } from './hand.model';
import type { RuleSet } from './strategy.model';

// Pure dealer-play and settlement logic for the post-count showdown. The card
// source is injected as a `draw` callback so the same shoe the player just
// counted can deal the hand, while the rules stay trivially unit-testable.

// Fewest cards needed to deal a showdown's opening hand (two player + two
// dealer). The page only offers a showdown, and the component only enables
// "deal another", when at least this many cards remain; hits beyond the opening
// deal are handled gracefully if the shoe runs out.
export const MIN_SHOWDOWN_CARDS = 4;

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
export function settle(player: readonly Card[], dealer: readonly Card[]): Settlement {
  const playerBlackjack = isBlackjack(player);
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
