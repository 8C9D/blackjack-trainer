export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const ALL_RANKS: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
] as const;

export const ALL_SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

export const TEN_VALUE_RANKS: readonly Rank[] = ['10', 'J', 'Q', 'K'] as const;

export function isTenValue(card: Card): boolean {
  return TEN_VALUE_RANKS.includes(card.rank);
}

export function isAce(card: Card): boolean {
  return card.rank === 'A';
}

// Returns the card's blackjack value, treating aces as 11. Hand-total
// computation softens aces from 11 to 1 separately.
export function cardHighValue(card: Card): number {
  if (isAce(card)) return 11;
  if (isTenValue(card)) return 10;
  return Number(card.rank);
}

// The non-ace card's high value (2..10) for a soft two-card hand — a hand
// with exactly one ace. Both engines key their soft-total lookups off this.
export function softNonAceValue(player: readonly [Card, Card]): number {
  const nonAce = isAce(player[0]) ? player[1] : player[0];
  return cardHighValue(nonAce);
}

// Initial two-card deal: the player's two cards plus the dealer's upcard.
// Shared by the trainers' scenario generators.
export interface Scenario {
  readonly player: readonly [Card, Card];
  readonly dealerUpcard: Card;
}
