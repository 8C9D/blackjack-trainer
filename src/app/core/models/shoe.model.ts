import { ALL_RANKS, ALL_SUITS, type Card } from './card.model';

export const CARDS_PER_DECK = 52;

// Shoe sizes the trainer offers: single- and double-deck games plus the common
// 6- and 8-deck shoes.
export const SHOE_DECK_OPTIONS = [1, 2, 6, 8] as const;
export const DEFAULT_NUMBER_OF_DECKS = 6;
export const MAX_NUMBER_OF_DECKS = SHOE_DECK_OPTIONS[SHOE_DECK_OPTIONS.length - 1];

// The fewest decks the charts this app grades against are written for. The
// Blackjack Apprenticeship basic-strategy and deviation charts are four-to-
// eight-deck charts, the Hi-Lo indices on them are multi-deck numbers, and the
// mistake costs are priced from a six-deck solve (tools/ev/export-tables.ts).
// The live shoe also deals one and two decks, where a few hands play
// differently, and the app has no chart of its own for them.
export const CHART_MIN_DECKS = 4;

// A hand that plays differently at this deck count than the charts say, for
// the note below to name. Found with the repo's own solver (`solveTable` at one
// and two decks against six) and kept only where the difference holds under
// every rule combination the app offers — H17 or S17, with or without DAS — so
// the example is true whatever the table rules are. At one deck there are a
// dozen or so (A,3 vs 4 and A,6 vs 2 double too, and 7,7 vs 10 stands); at two
// decks, 9 vs 2 is the one that holds under every rule set.
const FEW_DECK_EXAMPLES: Readonly<Record<number, string>> = {
  1: '9 vs 2 and A,2 vs 4 double, for instance',
  2: '9 vs 2 doubles, for one',
};

// What a shoe of this size does to the grading, or null when the charts are
// written for it. Each surface that grades against the charts adds what that
// means for it, the way `deviationIndexNote` is used.
export function chartDeckNote(decks: number): string | null {
  if (!Number.isFinite(decks) || decks >= CHART_MIN_DECKS) return null;
  const size = decks === 1 ? 'one deck' : decks === 2 ? 'two decks' : `${decks} decks`;
  const example = FEW_DECK_EXAMPLES[decks];
  const lead = `The charts this app grades against are written for four to eight decks, and at ${size} a few hands play differently`;
  return example === undefined ? `${lead}.` : `${lead}: ${example}.`;
}

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
  if (
    !Number.isSafeInteger(numberOfDecks) ||
    numberOfDecks <= 0 ||
    numberOfDecks > MAX_NUMBER_OF_DECKS
  ) {
    return [];
  }
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
    const safePenetration = Number.isFinite(penetration) ? penetration : DEFAULT_PENETRATION;
    const raw = Math.floor(cards.length * safePenetration);
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
    if (!Number.isFinite(n) || n <= 0) return [];
    const count = Math.min(Math.floor(n), this.cardsRemaining);
    const dealt = this.cards.slice(this.index, this.index + count);
    this.index += count;
    return dealt;
  }
}
