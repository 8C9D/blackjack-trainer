import type { Card, Rank } from './card.model';
import { ALL_RANKS, ALL_SUITS } from './card.model';
import { CARDS_PER_DECK, Shoe, buildShoeCards } from './shoe.model';

// Stable key for comparing card multisets regardless of order.
const key = (c: Card): string => `${c.rank}-${c.suit}`;
const sortedKeys = (cards: readonly Card[]): string[] => cards.map(key).sort();

describe('buildShoeCards', () => {
  it('builds 52 cards for a single deck', () => {
    expect(buildShoeCards(1)).toHaveLength(52);
  });

  it('builds 52×N cards for N decks', () => {
    expect(buildShoeCards(2)).toHaveLength(104);
    expect(buildShoeCards(6)).toHaveLength(312);
    expect(buildShoeCards(8)).toHaveLength(416);
  });

  it('contains one of every rank × suit per deck', () => {
    const cards = buildShoeCards(1);
    expect(sortedKeys(cards)).toEqual(
      ALL_RANKS.flatMap((r) => ALL_SUITS.map((s) => `${r}-${s}`)).sort(),
    );
  });

  it('contains 4×N cards of each rank (one per suit per deck)', () => {
    const cards = buildShoeCards(6);
    for (const r of ALL_RANKS) {
      expect(cards.filter((c) => c.rank === r)).toHaveLength(6 * 4);
    }
  });

  it('builds an empty array for zero decks', () => {
    expect(buildShoeCards(0)).toEqual([]);
  });
});

describe('Shoe', () => {
  const card = (rank: Rank): Card => ({ rank, suit: 'spades' });

  it('starts with the full count remaining and nothing dealt', () => {
    const shoe = new Shoe(buildShoeCards(6), 0.75);
    expect(shoe.size).toBe(312);
    expect(shoe.cardsDealt).toBe(0);
    expect(shoe.cardsRemaining).toBe(312);
    expect(shoe.decksRemaining).toBe(6);
  });

  it('measures decksRemaining to the bottom of the shoe as cardsRemaining / 52', () => {
    const shoe = new Shoe(buildShoeCards(6), 0.75);
    shoe.deal(52);
    expect(shoe.cardsRemaining).toBe(260);
    expect(shoe.decksRemaining).toBe(5);
  });

  it('deals the requested number of cards and advances the cursor', () => {
    const shoe = new Shoe(buildShoeCards(1), 0.75);
    const dealt = shoe.deal(5);
    expect(dealt).toHaveLength(5);
    expect(shoe.cardsDealt).toBe(5);
    expect(shoe.cardsRemaining).toBe(47);
  });

  it('deals without replacement — successive deals are disjoint, consecutive slices', () => {
    const cards = [card('2'), card('3'), card('4'), card('5'), card('6')];
    const shoe = new Shoe(cards, 1);
    expect(shoe.deal(2)).toEqual([card('2'), card('3')]);
    expect(shoe.deal(2)).toEqual([card('4'), card('5')]);
    expect(shoe.deal(2)).toEqual([card('6')]);
  });

  it('never deals past the bottom of the shoe', () => {
    const shoe = new Shoe(buildShoeCards(1), 1);
    const dealt = shoe.deal(1000);
    expect(dealt).toHaveLength(52);
    expect(shoe.cardsRemaining).toBe(0);
    expect(shoe.deal(5)).toEqual([]);
  });

  it('places the cut card at floor(size × penetration) and flags reshuffle once reached', () => {
    const shoe = new Shoe(buildShoeCards(1), 0.75); // cut at floor(52*0.75) = 39
    expect(shoe.cutCardPosition).toBe(39);
    shoe.deal(38);
    expect(shoe.needsReshuffle).toBe(false);
    shoe.deal(1); // 39 dealt — cut card surfaces
    expect(shoe.needsReshuffle).toBe(true);
  });

  it('clamps the cut card to at least one card for tiny penetration', () => {
    const shoe = new Shoe(buildShoeCards(1), 0);
    expect(shoe.cutCardPosition).toBe(1);
    expect(shoe.needsReshuffle).toBe(false);
    shoe.deal(1);
    expect(shoe.needsReshuffle).toBe(true);
  });

  it('only flags reshuffle at the very bottom for full penetration', () => {
    const shoe = new Shoe(buildShoeCards(1), 1);
    expect(shoe.cutCardPosition).toBe(52);
    shoe.deal(51);
    expect(shoe.needsReshuffle).toBe(false);
    shoe.deal(1);
    expect(shoe.needsReshuffle).toBe(true);
  });

  it('does not change the multiset it was constructed from', () => {
    const cards = buildShoeCards(2);
    const before = sortedKeys(cards);
    const shoe = new Shoe(cards, 0.75);
    shoe.deal(100);
    // CARDS_PER_DECK is a sanity anchor for the deck math used above.
    expect(CARDS_PER_DECK).toBe(52);
    expect(sortedKeys(cards)).toEqual(before);
  });
});
