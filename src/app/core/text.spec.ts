import { countOf } from './text';

describe('countOf', () => {
  it('reads singular at exactly one', () => {
    expect(countOf(1, 'hand')).toBe('1 hand');
  });

  it('reads plural at every other whole count, zero included', () => {
    expect(countOf(0, 'hand')).toBe('0 hands');
    expect(countOf(2, 'hand')).toBe('2 hands');
    expect(countOf(42, 'blackjack')).toBe('42 blackjacks');
  });

  // The true-count formula divides by a deck count that is usually fractional.
  it('reads plural for a fractional count either side of one', () => {
    expect(countOf(0.5, 'deck')).toBe('0.5 decks');
    expect(countOf(1.5, 'deck')).toBe('1.5 decks');
  });

  it("takes the caller's formatting for the number while the noun follows the value", () => {
    expect(countOf(1, 'deck', '1.0')).toBe('1.0 deck');
    expect(countOf(2.25, 'deck', '2.3')).toBe('2.3 decks');
  });
});
