import { cardHighValue, isAce, type Card } from './card.model';

// N-card, soft-aware hand evaluation shared by the showdown's dealer-play and
// settlement logic. Unlike card.model's two-card `softNonAceValue` helper, these
// work for hands of any size — a hit can grow a hand past two cards.

interface HandScore {
  // Best (highest non-busting if possible) blackjack total for the hand.
  readonly total: number;
  // Number of aces still counted as 11 in that total.
  readonly softAces: number;
}

// Sum the hand counting every ace as 11, then demote aces to 1 (−10 each) one at
// a time while the hand busts and an 11-valued ace remains. The leftover
// 11-valued ace count distinguishes a soft hand from a hard one.
function score(cards: readonly Card[]): HandScore {
  let total = 0;
  let softAces = 0;
  for (const card of cards) {
    total += cardHighValue(card);
    if (isAce(card)) softAces++;
  }
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces--;
  }
  return { total, softAces };
}

// The hand's best blackjack total (aces softened as needed). An empty hand is 0.
export function handTotal(cards: readonly Card[]): number {
  return score(cards).total;
}

// A hand is soft when at least one ace is still counted as 11 in its best total,
// so the next hit cannot bust it. A busted hand is never soft.
export function isSoftHand(cards: readonly Card[]): boolean {
  const { total, softAces } = score(cards);
  return softAces > 0 && total <= 21;
}

// True once the hand's best total exceeds 21.
export function isBust(cards: readonly Card[]): boolean {
  return score(cards).total > 21;
}

// A natural blackjack: exactly two cards totalling 21 (an ace + a ten-value).
// A 21 made from three or more cards is not a blackjack.
export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && score(cards).total === 21;
}
