import type { Card, Rank, Suit } from './card.model';
import { handTotal, isBlackjack, isBust, isSoftHand } from './hand.model';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

describe('hand.model', () => {
  describe('handTotal', () => {
    it('is 0 for an empty hand', () => {
      expect(handTotal([])).toBe(0);
    });

    it('sums hard pip cards', () => {
      expect(handTotal([card('5'), card('9')])).toBe(14);
      expect(handTotal([card('7'), card('6'), card('2')])).toBe(15);
    });

    it('counts ten-value cards as 10', () => {
      expect(handTotal([card('K'), card('Q')])).toBe(20);
      expect(handTotal([card('10'), card('J')])).toBe(20);
    });

    it('counts a single ace as 11 when it does not bust (soft total)', () => {
      expect(handTotal([card('A'), card('6')])).toBe(17);
    });

    it('demotes an ace to 1 when 11 would bust', () => {
      // A,6,K → 11+6+10 = 27 busts, soften the ace → 17.
      expect(handTotal([card('A'), card('6'), card('K')])).toBe(17);
    });

    it('keeps only one ace at 11 with multiple aces', () => {
      // A,A → 11+1 = 12 (one soft ace).
      expect(handTotal([card('A'), card('A')])).toBe(12);
      // A,A,9 → 11+1+9 = 21.
      expect(handTotal([card('A'), card('A'), card('9')])).toBe(21);
    });

    it('hardens every ace when needed', () => {
      // A,A,K,9 → all aces hard: 1+1+10+9 = 21.
      expect(handTotal([card('A'), card('A'), card('K'), card('9')])).toBe(21);
    });

    it('reports a busted total above 21', () => {
      expect(handTotal([card('K'), card('Q'), card('5')])).toBe(25);
    });
  });

  describe('isSoftHand', () => {
    it('is true when an ace counts as 11', () => {
      expect(isSoftHand([card('A'), card('6')])).toBe(true);
      expect(isSoftHand([card('A'), card('2'), card('4')])).toBe(true);
    });

    it('is false when the only ace must be hard', () => {
      expect(isSoftHand([card('A'), card('6'), card('K')])).toBe(false);
    });

    it('is true for A,A (one ace stays at 11 → soft 12)', () => {
      expect(isSoftHand([card('A'), card('A')])).toBe(true);
    });

    it('is false for a hand with no ace', () => {
      expect(isSoftHand([card('10'), card('7')])).toBe(false);
    });

    it('is false for a busted hand even if it contains an ace', () => {
      expect(isSoftHand([card('A'), card('K'), card('Q'), card('5')])).toBe(false);
    });

    it('treats soft 17 (A,6) as soft but hard 17 (10,7) as not', () => {
      expect(isSoftHand([card('A'), card('6')])).toBe(true);
      expect(isSoftHand([card('10'), card('7')])).toBe(false);
    });
  });

  describe('isBust', () => {
    it('is false at exactly 21', () => {
      expect(isBust([card('K'), card('A')])).toBe(false);
    });

    it('is true above 21', () => {
      expect(isBust([card('K'), card('Q'), card('2')])).toBe(true);
    });

    it('is false when aces soften the hand below 21', () => {
      expect(isBust([card('A'), card('A'), card('9')])).toBe(false);
    });
  });

  describe('isBlackjack', () => {
    it('is true for an ace + ten-value in exactly two cards', () => {
      expect(isBlackjack([card('A'), card('K')])).toBe(true);
      expect(isBlackjack([card('10'), card('A')])).toBe(true);
    });

    it('is false for a 21 made from three or more cards', () => {
      expect(isBlackjack([card('7'), card('7'), card('7')])).toBe(false);
      expect(isBlackjack([card('A'), card('5'), card('5')])).toBe(false);
    });

    it('is false for a two-card hand that is not 21', () => {
      expect(isBlackjack([card('K'), card('9')])).toBe(false);
    });

    it('is false for a single card', () => {
      expect(isBlackjack([card('A')])).toBe(false);
    });
  });
});
