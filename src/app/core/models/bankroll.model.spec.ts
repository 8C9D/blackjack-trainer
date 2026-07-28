import {
  BET_OPTIONS,
  DEFAULT_BANKROLL,
  MIN_BET,
  clampBet,
  handPayout,
  insuranceCost,
  insurancePayout,
  largestAffordableBet,
  stakeFor,
} from './bankroll.model';
import type { Settlement } from './showdown.model';

function settlement(
  outcome: Settlement['outcome'],
  playerBlackjack = false,
  dealerBlackjack = false,
): Settlement {
  return { outcome, playerBlackjack, dealerBlackjack };
}

describe('bankroll model', () => {
  describe('clampBet', () => {
    it('keeps a playable bet as-is', () => {
      expect(clampBet(10, 500)).toBe(10);
    });

    it('never returns less than the table minimum', () => {
      expect(clampBet(0, 500)).toBe(MIN_BET);
      expect(clampBet(-5, 500)).toBe(MIN_BET);
    });

    it('caps the bet at what the bankroll can cover', () => {
      expect(clampBet(25, 7)).toBe(7);
    });

    it('still allows the minimum when the bankroll is short of it', () => {
      // The caller offers a reset rather than a sub-minimum bet.
      expect(clampBet(5, 0)).toBe(MIN_BET);
    });

    it('floors a fractional bet and treats a non-finite one as invalid', () => {
      expect(clampBet(7.9, 500)).toBe(7);
      expect(clampBet(Number.NaN, 500)).toBe(MIN_BET);
      expect(clampBet(Number.POSITIVE_INFINITY, 500)).toBe(MIN_BET);
    });
  });

  describe('largestAffordableBet', () => {
    it('picks the top option a healthy bankroll covers', () => {
      expect(largestAffordableBet(DEFAULT_BANKROLL)).toBe(BET_OPTIONS[BET_OPTIONS.length - 1]);
    });

    it('steps down as the bankroll shrinks', () => {
      expect(largestAffordableBet(10)).toBe(10);
      expect(largestAffordableBet(9)).toBe(5);
      expect(largestAffordableBet(1)).toBe(1);
    });

    it('falls back to the minimum when nothing is affordable', () => {
      expect(largestAffordableBet(0)).toBe(MIN_BET);
    });
  });

  describe('stakeFor', () => {
    it('doubles the chips at risk on a doubled hand', () => {
      expect(stakeFor(10, false)).toBe(10);
      expect(stakeFor(10, true)).toBe(20);
    });
  });

  describe('handPayout', () => {
    it('pays the stake on a win', () => {
      expect(handPayout(settlement('win'), 10, false)).toBe(10);
    });

    it('pays 3:2 on a natural', () => {
      expect(handPayout(settlement('win', true), 10, false)).toBe(15);
    });

    it('pays both bets on a doubled win', () => {
      expect(handPayout(settlement('win'), 10, true)).toBe(20);
    });

    it('returns nothing on a push, doubled or not', () => {
      expect(handPayout(settlement('push'), 10, false)).toBe(0);
      expect(handPayout(settlement('push'), 10, true)).toBe(0);
      expect(handPayout(settlement('push', true, true), 10, false)).toBe(0);
    });

    it('forfeits the stake on a loss, and both bets when doubled', () => {
      expect(handPayout(settlement('lose'), 10, false)).toBe(-10);
      expect(handPayout(settlement('lose'), 10, true)).toBe(-20);
      expect(handPayout(settlement('lose', false, true), 10, false)).toBe(-10);
    });

    it('pays a natural on the bet, never on a doubled stake', () => {
      // A natural settles at the deal, so it cannot have been doubled; if a
      // caller ever passes both, the 3:2 is still on the single bet.
      expect(handPayout(settlement('win', true), 10, true)).toBe(15);
    });

    it('pays a half chip on an odd bet, as a real 3:2 does', () => {
      expect(handPayout(settlement('win', true), 5, false)).toBe(7.5);
    });
  });

  describe('insurance', () => {
    it('costs half the bet, down to a half chip on an odd bet', () => {
      expect(insuranceCost(10)).toBe(5);
      expect(insuranceCost(5)).toBe(2.5);
      expect(insuranceCost(1)).toBe(0.5);
    });

    it('pays 2:1 on a dealer natural — exactly covering the bet', () => {
      expect(insurancePayout(10, true)).toBe(10);
      expect(insurancePayout(5, true)).toBe(5);
      expect(insurancePayout(1, true)).toBe(1);
    });

    it('is forfeited when the dealer has no natural', () => {
      expect(insurancePayout(10, false)).toBe(-5);
      expect(insurancePayout(1, false)).toBe(-0.5);
    });
  });
});
