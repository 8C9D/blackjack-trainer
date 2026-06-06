import { ALL_RANKS, ALL_SUITS, type Card } from './card.model';

export const CARDS_PER_DECK = 52;

// Shoe sizes the trainer offers: single- and double-deck games plus the common
// 6- and 8-deck shoes.
export const SHOE_DECK_OPTIONS = [1, 2, 6, 8] as const;
export const DEFAULT_NUMBER_OF_DECKS = 6;

// Penetration is the fraction of the shoe dealt before the cut card forces a
// reshuffle. Real games run roughly 50–90%; 75% is a sensible default.
export const PENETRATION_PRESETS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9] as const;
export const MIN_PENETRATION = 0.5;
export const MAX_PENETRATION = 0.9;
export const DEFAULT_PENETRATION = 0.75;

// Build an ordered N-deck multiset: 52×N cards, one of every rank × suit per
// deck. The ShoeService shuffles this before play; kept pure here so specs can
// assert the pre-shuffle composition.
export function buildShoeCards(numberOfDecks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < numberOfDecks; d++) {
    for (const rank of ALL_RANKS) {
      for (const suit of ALL_SUITS) {
        cards.push({ rank, suit });
      }
    }
  }
  return cards;
}

// A finite, depleting shoe. Unlike CardGeneratorService (i.i.d. draws with
// replacement that never deplete), the shoe deals each physical card exactly
// once. `decksRemaining` is measured to the bottom of the shoe — the
// discard-tray convention players estimate from — while the cut card, placed at
// `penetration` of the shoe, flags when a reshuffle is due.
export class Shoe {
  private index = 0;
  readonly size: number;
  // Number of cards dealt at which the cut card surfaces and a reshuffle is due.
  readonly cutCardPosition: number;

  constructor(
    private readonly cards: readonly Card[],
    penetration: number,
  ) {
    this.size = cards.length;
    // Clamp so at least one card is dealable and the cut never sits past the
    // bottom of the shoe.
    const raw = Math.floor(cards.length * penetration);
    this.cutCardPosition = Math.min(Math.max(raw, 1), cards.length);
  }

  get cardsDealt(): number {
    return this.index;
  }

  get cardsRemaining(): number {
    return this.size - this.index;
  }

  // Decks remaining to the bottom of the shoe (not to the cut card).
  get decksRemaining(): number {
    return this.cardsRemaining / CARDS_PER_DECK;
  }

  // True once dealing has reached or passed the cut card: the caller should
  // reshuffle before dealing the next round.
  get needsReshuffle(): boolean {
    return this.index >= this.cutCardPosition;
  }

  // Deal up to n cards without replacement. Never deals past the bottom of the
  // shoe; if fewer than n remain, returns what is left.
  deal(n: number): Card[] {
    const count = Math.max(0, Math.min(n, this.cardsRemaining));
    const dealt = this.cards.slice(this.index, this.index + count);
    this.index += count;
    return dealt;
  }
}
