import {
  ALL_RANKS,
  ALL_SUITS,
  TEN_VALUE_RANKS,
  cardHighValue,
  isAce,
  isTenValue,
  softNonAceValue,
  suitColor,
  type Card,
  type Rank,
  type Suit,
} from './card.model';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

describe('card.model helpers', () => {
  describe('isTenValue', () => {
    it('is true for 10, J, Q, K', () => {
      for (const r of ['10', 'J', 'Q', 'K'] as const) {
        expect(isTenValue(card(r))).toBe(true);
      }
    });

    it('is false for 2 through 9 and A', () => {
      for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', 'A'] as const) {
        expect(isTenValue(card(r))).toBe(false);
      }
    });

    it('agrees with TEN_VALUE_RANKS for every rank', () => {
      for (const r of ALL_RANKS) {
        expect(isTenValue(card(r))).toBe(TEN_VALUE_RANKS.includes(r));
      }
    });
  });

  describe('isAce', () => {
    it('is true only for an ace', () => {
      expect(isAce(card('A'))).toBe(true);
    });

    it('is false for every non-ace rank', () => {
      for (const r of ALL_RANKS.filter((r) => r !== 'A')) {
        expect(isAce(card(r))).toBe(false);
      }
    });
  });

  describe('cardHighValue', () => {
    it('treats an ace as 11', () => {
      expect(cardHighValue(card('A'))).toBe(11);
    });

    it('treats every ten-value rank as 10', () => {
      for (const r of ['10', 'J', 'Q', 'K'] as const) {
        expect(cardHighValue(card(r))).toBe(10);
      }
    });

    it('returns the pip value for 2 through 9', () => {
      for (const r of ['2', '3', '4', '5', '6', '7', '8', '9'] as const) {
        expect(cardHighValue(card(r))).toBe(Number(r));
      }
    });

    it('is independent of suit', () => {
      for (const s of ALL_SUITS) {
        expect(cardHighValue(card('A', s))).toBe(11);
        expect(cardHighValue(card('K', s))).toBe(10);
        expect(cardHighValue(card('7', s))).toBe(7);
      }
    });
  });

  describe('softNonAceValue', () => {
    it('returns the partner value when the ace is the first card', () => {
      expect(softNonAceValue([card('A'), card('7')])).toBe(7);
    });

    it('returns the partner value when the ace is the second card', () => {
      expect(softNonAceValue([card('7'), card('A')])).toBe(7);
    });

    it('treats a ten-value partner as 10 (soft 21 keys off 10)', () => {
      expect(softNonAceValue([card('A'), card('K')])).toBe(10);
      expect(softNonAceValue([card('10'), card('A')])).toBe(10);
    });

    it('returns 11 for A,A (outside the single-ace contract, documents behavior)', () => {
      // softNonAceValue assumes exactly one ace; both engines route pairs
      // elsewhere first. With two aces it picks the second card (also an ace).
      expect(softNonAceValue([card('A'), card('A')])).toBe(11);
    });
  });

  describe('suitColor', () => {
    it('maps hearts and diamonds to red', () => {
      expect(suitColor('hearts')).toBe('red');
      expect(suitColor('diamonds')).toBe('red');
    });

    it('maps spades and clubs to black', () => {
      expect(suitColor('spades')).toBe('black');
      expect(suitColor('clubs')).toBe('black');
    });

    it('classifies every suit as exactly red or black', () => {
      for (const s of ALL_SUITS) {
        expect(['red', 'black']).toContain(suitColor(s));
      }
    });
  });
});
