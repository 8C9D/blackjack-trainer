import type { Card, Rank, Suit } from './card.model';
import { countingSystemById } from '../../data/counting-systems';
import {
  MAX_SHOWDOWN_SPOTS,
  MIN_SHOWDOWN_CARDS,
  MIN_SHOWDOWN_SPOTS,
  clampSpots,
  countBasisFor,
  dealerShouldHit,
  insuranceIsCorrect,
  minCardsForSpots,
  playDealerHand,
  settle,
} from './showdown.model';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

// Deterministic draw: deals the given cards in order, then undefined.
function drawFrom(cards: readonly Card[]): () => Card | undefined {
  const queue = [...cards];
  return () => queue.shift();
}

describe('showdown.model', () => {
  describe('dealerShouldHit', () => {
    it('hits any hard total of 16 or less', () => {
      expect(dealerShouldHit([card('10'), card('6')], 'S17')).toBe(true);
      expect(dealerShouldHit([card('10'), card('6')], 'H17')).toBe(true);
    });

    it('stands on hard 17 under both rule sets', () => {
      expect(dealerShouldHit([card('10'), card('7')], 'S17')).toBe(false);
      expect(dealerShouldHit([card('10'), card('7')], 'H17')).toBe(false);
    });

    it('stands on soft 17 under S17 but hits it under H17', () => {
      expect(dealerShouldHit([card('A'), card('6')], 'S17')).toBe(false);
      expect(dealerShouldHit([card('A'), card('6')], 'H17')).toBe(true);
    });

    it('stands on 18 and above', () => {
      expect(dealerShouldHit([card('10'), card('8')], 'H17')).toBe(false);
      expect(dealerShouldHit([card('A'), card('7')], 'H17')).toBe(false); // soft 18
    });
  });

  describe('playDealerHand', () => {
    it('stands immediately on a pat hand', () => {
      const result = playDealerHand([card('10'), card('9')], 'S17', () => {
        throw new Error('should not draw');
      });
      expect(result).toEqual([card('10'), card('9')]);
    });

    it('draws until reaching a hard 17+', () => {
      // 10,4 (14) → draw 3 (17) → stand.
      const result = playDealerHand([card('10'), card('4')], 'S17', drawFrom([card('3')]));
      expect(result.map((c) => c.rank)).toEqual(['10', '4', '3']);
    });

    it('hits a soft 17 under H17 (A,6 → draw)', () => {
      // A,6 (soft 17) → H17 hits → draw 4 → A,6,4 = hard 21? 11+6+4=21 → stand.
      const result = playDealerHand([card('A'), card('6')], 'H17', drawFrom([card('4')]));
      expect(result.map((c) => c.rank)).toEqual(['A', '6', '4']);
    });

    it('stands on a soft 17 under S17 without drawing', () => {
      const result = playDealerHand([card('A'), card('6')], 'S17', () => {
        throw new Error('should not draw');
      });
      expect(result.map((c) => c.rank)).toEqual(['A', '6']);
    });

    it('keeps drawing through soft hands until pat', () => {
      // A,2 (13) → A → soft 14 → 4 → soft 18 → stand. (S17)
      const result = playDealerHand(
        [card('A'), card('2')],
        'S17',
        drawFrom([card('A'), card('4')]),
      );
      expect(result.map((c) => c.rank)).toEqual(['A', '2', 'A', '4']);
    });

    it('stops drawing when the shoe is exhausted', () => {
      // 10,2 (12) wants to hit but the draw source is empty.
      const result = playDealerHand([card('10'), card('2')], 'S17', () => undefined);
      expect(result.map((c) => c.rank)).toEqual(['10', '2']);
    });
  });

  describe('settle', () => {
    it('pays a player win on the higher standing total', () => {
      const s = settle([card('10'), card('9')], [card('10'), card('7')]);
      expect(s.outcome).toBe('win');
    });

    it('loses on the lower standing total', () => {
      const s = settle([card('10'), card('7')], [card('10'), card('9')]);
      expect(s.outcome).toBe('lose');
    });

    it('pushes equal standing totals', () => {
      const s = settle([card('10'), card('8')], [card('10'), card('8')]);
      expect(s.outcome).toBe('push');
    });

    it('loses on a player bust even when the dealer also busts', () => {
      const s = settle([card('10'), card('8'), card('9')], [card('10'), card('6'), card('9')]);
      expect(s.outcome).toBe('lose');
    });

    it('wins a standing hand when the dealer busts', () => {
      const s = settle([card('10'), card('6')], [card('10'), card('6'), card('9')]);
      expect(s.outcome).toBe('win');
    });

    it('pays a player natural against a dealer non-natural', () => {
      const s = settle([card('A'), card('K')], [card('10'), card('9')]);
      expect(s.outcome).toBe('win');
      expect(s.playerBlackjack).toBe(true);
      expect(s.dealerBlackjack).toBe(false);
    });

    it('loses to a dealer natural with a non-natural player hand', () => {
      const s = settle([card('10'), card('9')], [card('A'), card('K')]);
      expect(s.outcome).toBe('lose');
      expect(s.dealerBlackjack).toBe(true);
      expect(s.playerBlackjack).toBe(false);
    });

    it('pushes two naturals', () => {
      const s = settle([card('A'), card('K')], [card('A'), card('Q')]);
      expect(s.outcome).toBe('push');
      expect(s.playerBlackjack).toBe(true);
      expect(s.dealerBlackjack).toBe(true);
    });

    it('does not treat a three-card 21 as a natural (beats a 20, not a push vs BJ)', () => {
      const threeCard21 = [card('7'), card('7'), card('7')];
      expect(settle(threeCard21, [card('10'), card('10')]).outcome).toBe('win');
      // A three-card 21 loses to a dealer natural.
      expect(settle(threeCard21, [card('A'), card('K')]).outcome).toBe('lose');
    });

    it('honors playerNatural=false so a split-ace 21 is not a natural (even money)', () => {
      const splitAce21 = [card('A'), card('K')]; // two cards totalling 21
      // Default: treated as a natural.
      expect(settle(splitAce21, [card('10'), card('9')]).playerBlackjack).toBe(true);
      // Overridden (a split hand): still wins, but not as a blackjack.
      const s = settle(splitAce21, [card('10'), card('9')], false);
      expect(s.outcome).toBe('win');
      expect(s.playerBlackjack).toBe(false);
    });
  });

  describe('clampSpots', () => {
    it('keeps a supported box count', () => {
      expect(clampSpots(1)).toBe(1);
      expect(clampSpots(2)).toBe(2);
      expect(clampSpots(3)).toBe(3);
    });

    it('clamps out-of-range values to the supported bounds', () => {
      expect(clampSpots(0)).toBe(MIN_SHOWDOWN_SPOTS);
      expect(clampSpots(-5)).toBe(MIN_SHOWDOWN_SPOTS);
      expect(clampSpots(99)).toBe(MAX_SHOWDOWN_SPOTS);
    });

    it('rounds fractions and falls back on non-finite input', () => {
      expect(clampSpots(2.4)).toBe(2);
      expect(clampSpots(Number.NaN)).toBe(MIN_SHOWDOWN_SPOTS);
      expect(clampSpots(Number.POSITIVE_INFINITY)).toBe(MIN_SHOWDOWN_SPOTS);
    });
  });

  describe('minCardsForSpots', () => {
    it('needs two cards per box plus the dealer two', () => {
      expect(minCardsForSpots(1)).toBe(MIN_SHOWDOWN_CARDS);
      expect(minCardsForSpots(2)).toBe(6);
      expect(minCardsForSpots(3)).toBe(8);
    });

    it('clamps its argument like clampSpots', () => {
      expect(minCardsForSpots(0)).toBe(4);
      expect(minCardsForSpots(99)).toBe(8);
    });
  });
});

describe('countBasisFor', () => {
  const hiLo = countingSystemById('hi-lo');
  const ko = countingSystemById('ko');
  const wongHalves = countingSystemById('wong-halves');

  it('divides a Hi-Lo running count into a true count, truncated toward zero', () => {
    expect(countBasisFor(hiLo, 7, 2)).toEqual({ kind: 'true-count', trueCount: 3 });
    // -5 over 2 decks is -2, not -3.
    expect(countBasisFor(hiLo, -5, 2)).toEqual({ kind: 'true-count', trueCount: -2 });
  });

  // KO has no true count, but its book publishes a running-count schedule, so
  // it is the one other system whose insurance call the app can grade.
  it('keeps an unbalanced system with a schedule on its running count', () => {
    expect(countBasisFor(ko, -2, 6)).toEqual({
      kind: 'running-count',
      runningCount: -2,
      insuranceAt: 3,
    });
  });

  // A level-3 system reads a different true count off the same shoe, and the
  // app ships no indices for it — so it is dealt and settled, not scored.
  it('refuses to grade a system whose indices this app does not have', () => {
    expect(countBasisFor(wongHalves, 7, 2)).toEqual({ kind: 'ungraded' });
  });

  it('refuses to grade a shoe with no decks left to divide by', () => {
    expect(countBasisFor(hiLo, 7, 0)).toEqual({ kind: 'ungraded' });
  });
});

describe('insuranceIsCorrect', () => {
  it('defers to the Hi-Lo chart index for a true count', () => {
    const basis = { kind: 'true-count', trueCount: 4 } as const;
    expect(insuranceIsCorrect(basis, true)).toBe(true);
    expect(insuranceIsCorrect(basis, false)).toBe(false);
  });

  it('compares an unbalanced running count against its own insurance count', () => {
    const at = (runningCount: number) =>
      insuranceIsCorrect({ kind: 'running-count', runningCount, insuranceAt: 3 }, false);
    expect(at(2)).toBe(false);
    expect(at(3)).toBe(true);
    expect(at(4)).toBe(true);
  });

  it('says nothing at all for a system it cannot grade', () => {
    expect(insuranceIsCorrect({ kind: 'ungraded' }, true)).toBeNull();
  });
});
