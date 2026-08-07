export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

// Suit color. Used by color-dependent counting systems (e.g. Red Seven, KISS),
// which tag a rank differently by the card's color rather than by rank alone.
export type CardColor = 'red' | 'black';

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

// Hearts and diamonds are red; spades and clubs are black.
export function suitColor(suit: Suit): CardColor {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
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

// Initial deal: the player's cards plus the dealer's upcard. Every generator
// deals two; a pinned hard 20 deals three, the only non-pair form that total
// has (two ten-values are the 10,10 pair — a different chart row).
export interface Scenario {
  readonly player: readonly Card[];
  readonly dealerUpcard: Card;
}
