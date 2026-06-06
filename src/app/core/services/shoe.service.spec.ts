import type { Card } from '../models/card.model';
import { buildShoeCards } from '../models/shoe.model';
import { ShoeService } from './shoe.service';

const sortedKeys = (cards: readonly Card[]): string[] =>
  cards.map((c) => `${c.rank}-${c.suit}`).sort();

// Yields the scripted values in order, cycling once exhausted — lets a test pin
// the exact Fisher–Yates swaps (mirrors the CardGeneratorService spec helper).
const sequencedRandom = (values: readonly number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('ShoeService', () => {
  let service: ShoeService;

  beforeEach(() => {
    service = new ShoeService();
  });

  it('creates a shoe of 52×N cards with the configured penetration', () => {
    const shoe = service.create(6, 0.75);
    expect(shoe.size).toBe(312);
    expect(shoe.cardsRemaining).toBe(312);
    expect(shoe.cutCardPosition).toBe(Math.floor(312 * 0.75));
  });

  it('shuffles without changing the multiset (every card still present)', () => {
    service.setRandomSource(sequencedRandom([0.1, 0.7, 0.3, 0.9, 0.5]));
    const shoe = service.create(1, 1);
    const dealt = shoe.deal(52);
    expect(sortedKeys(dealt)).toEqual(sortedKeys(buildShoeCards(1)));
  });

  it('is deterministic for a fixed random source', () => {
    const seed = [0.13, 0.42, 0.77, 0.05, 0.61, 0.29];
    service.setRandomSource(sequencedRandom(seed));
    const first = service.create(1, 1).deal(52);
    service.setRandomSource(sequencedRandom(seed));
    const second = service.create(1, 1).deal(52);
    expect(second).toEqual(first);
  });

  it('actually reorders the cards (does not return them in build order)', () => {
    // A non-trivial source so at least one swap moves a card off its origin.
    service.setRandomSource(sequencedRandom([0.99, 0.01, 0.5, 0.2, 0.8]));
    const shuffled = service.create(2, 1).deal(104);
    expect(shuffled).not.toEqual(buildShoeCards(2));
  });
});
