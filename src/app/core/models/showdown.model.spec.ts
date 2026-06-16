import type { Card, Rank, Suit } from './card.model';
import { dealerShouldHit, playDealerHand, settle } from './showdown.model';

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
  });
});
