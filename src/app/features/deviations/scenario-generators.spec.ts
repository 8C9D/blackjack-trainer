import {
  cardHighValue,
  isAce,
  isTenValue,
  type Card,
} from '../../core/models/card.model';
import { H17_DEVIATIONS } from '../../data/h17-deviations';
import { S17_DEVIATIONS } from '../../data/s17-deviations';
import {
  classifyForDeviation,
  deviationsFor,
} from '../../core/services/deviation-engine.service';
import type { DeviationRule } from '../../core/models/deviation.model';
import {
  deviationRulesFor,
  generateScenarioForDeviationRule,
  makeDealerUpcardCard,
  makePlayerCardsForDeviationRule,
  pickDeviationRule,
  pickTrueCountForDeviationRule,
} from './scenario-generators';

// Deterministic-ish random source: returns the next value from a list,
// wrapping when exhausted. Use for tests that need a specific selection.
function seqRandom(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe('deviationRulesFor', () => {
  it('returns the H17 chart for H17', () => {
    expect(deviationRulesFor('H17')).toBe(H17_DEVIATIONS);
  });

  it('returns the S17 chart for S17', () => {
    expect(deviationRulesFor('S17')).toBe(S17_DEVIATIONS);
  });
});

describe('pickDeviationRule', () => {
  it('returns a rule from the H17 chart when ruleSet=H17', () => {
    const r = pickDeviationRule('H17', () => 0);
    expect(r.ruleSet).toBe('H17');
    expect(H17_DEVIATIONS).toContain(r);
  });

  it('returns a rule from the S17 chart when ruleSet=S17', () => {
    const r = pickDeviationRule('S17', () => 0);
    expect(r.ruleSet).toBe('S17');
    expect(S17_DEVIATIONS).toContain(r);
  });

  it('picks across the entire chart over many calls (random)', () => {
    const seen = new Set<DeviationRule>();
    for (let i = 0; i < 500; i++) seen.add(pickDeviationRule('S17', Math.random));
    // S17 chart has many rules; expect at least 5 distinct picks in 500 draws.
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe('makePlayerCardsForDeviationRule', () => {
  function ruleOf(rule: Partial<DeviationRule>): DeviationRule {
    return {
      ruleSet: 'S17',
      category: 'hard',
      playerHand: '16',
      playerHandLabel: 'Hard 16',
      dealerUpcard: '10',
      index: 0,
      direction: 'at-or-above',
      basicAction: 'H',
      deviationAction: 'S',
      source: 'test',
      ...rule,
    } as DeviationRule;
  }

  describe('hard category', () => {
    it('produces a non-pair two-card combo matching the hard total', () => {
      const rule = ruleOf({ category: 'hard', playerHand: '16' });
      for (let i = 0; i < 100; i++) {
        const [a, b] = makePlayerCardsForDeviationRule(rule, Math.random);
        // Neither card is an Ace (would make the hand soft).
        expect(isAce(a)).toBe(false);
        expect(isAce(b)).toBe(false);
        // Total matches.
        expect(cardHighValue(a) + cardHighValue(b)).toBe(16);
        // Cards classify as hard / playerHand=16 in the engine.
        const klass = classifyForDeviation([a, b]);
        expect(klass.category).toBe('hard');
        expect(klass.playerHand).toBe('16');
      }
    });

    it('handles hard 8 without falling back to the 4,4 pair', () => {
      const rule = ruleOf({ category: 'hard', playerHand: '8' });
      for (let i = 0; i < 50; i++) {
        const cards = makePlayerCardsForDeviationRule(rule, Math.random);
        const klass = classifyForDeviation(cards);
        expect(klass.category).toBe('hard');
        expect(klass.playerHand).toBe('8');
      }
    });

    it('handles hard 12 without falling back to the 6,6 pair', () => {
      const rule = ruleOf({ category: 'hard', playerHand: '12' });
      for (let i = 0; i < 50; i++) {
        const cards = makePlayerCardsForDeviationRule(rule, Math.random);
        const klass = classifyForDeviation(cards);
        expect(klass.category).toBe('hard');
        expect(klass.playerHand).toBe('12');
      }
    });
  });

  describe('soft category', () => {
    it('produces A + non-ace summing to the soft total', () => {
      const rule = ruleOf({ category: 'soft', playerHand: '19' });
      for (let i = 0; i < 50; i++) {
        const cards = makePlayerCardsForDeviationRule(rule, Math.random);
        // Exactly one Ace.
        const aceCount = cards.filter(isAce).length;
        expect(aceCount).toBe(1);
        const klass = classifyForDeviation(cards);
        expect(klass.category).toBe('soft');
        expect(klass.playerHand).toBe('19');
      }
    });

    it('produces soft 17 (A,6) from playerHand "17"', () => {
      const rule = ruleOf({ category: 'soft', playerHand: '17' });
      const cards = makePlayerCardsForDeviationRule(rule, Math.random);
      const nonAce = isAce(cards[0]) ? cards[1] : cards[0];
      expect(cardHighValue(nonAce)).toBe(6);
    });
  });

  describe('pair category', () => {
    it('produces two ten-value cards for playerHand "10"', () => {
      const rule = ruleOf({ category: 'pair', playerHand: '10' });
      for (let i = 0; i < 50; i++) {
        const cards = makePlayerCardsForDeviationRule(rule, Math.random);
        expect(isTenValue(cards[0])).toBe(true);
        expect(isTenValue(cards[1])).toBe(true);
        const klass = classifyForDeviation(cards);
        expect(klass.category).toBe('pair');
        expect(klass.playerHand).toBe('10');
      }
    });

    it('produces two cards of the same rank for non-ten pairs', () => {
      const rule = ruleOf({ category: 'pair', playerHand: '8' });
      const cards = makePlayerCardsForDeviationRule(rule, Math.random);
      expect(cards[0].rank).toBe('8');
      expect(cards[1].rank).toBe('8');
    });
  });

  describe('surrender category', () => {
    it('produces a non-pair hard total matching the rule (so engine routes hard, then surrender overlay fires)', () => {
      const rule = ruleOf({ category: 'surrender', playerHand: '16' });
      const cards = makePlayerCardsForDeviationRule(rule, Math.random);
      // Same shape as hard — non-pair hard total.
      const klass = classifyForDeviation(cards);
      expect(klass.category).toBe('hard');
      expect(klass.playerHand).toBe('16');
    });
  });

  describe('insurance category', () => {
    it('produces any two cards regardless of rank', () => {
      const rule = ruleOf({ category: 'insurance', playerHand: 'insurance' });
      // Just verify it doesn't throw and returns two cards.
      const cards = makePlayerCardsForDeviationRule(rule, Math.random);
      expect(cards.length).toBe(2);
    });
  });
});

describe('makeDealerUpcardCard', () => {
  it('returns an Ace for upcard "A"', () => {
    const c = makeDealerUpcardCard('A', () => 0);
    expect(isAce(c)).toBe(true);
  });

  it('returns a ten-value card for upcard "10"', () => {
    for (let i = 0; i < 50; i++) {
      const c = makeDealerUpcardCard('10', Math.random);
      expect(isTenValue(c)).toBe(true);
    }
  });

  it('returns a same-rank card for numeric upcards 2..9', () => {
    for (const k of ['2', '3', '4', '5', '6', '7', '8', '9'] as const) {
      const c = makeDealerUpcardCard(k, () => 0);
      expect(c.rank).toBe(k);
    }
  });
});

describe('pickTrueCountForDeviationRule', () => {
  const MIN = -5;
  const MAX = 8;

  function ruleOf(d: Partial<DeviationRule>): DeviationRule {
    return {
      ruleSet: 'S17',
      category: 'hard',
      playerHand: '16',
      playerHandLabel: 'Hard 16',
      dealerUpcard: '10',
      index: 0,
      direction: 'at-or-above',
      basicAction: 'H',
      deviationAction: 'S',
      source: 'test',
      ...d,
    } as DeviationRule;
  }

  it('returns a value in [minTc, maxTc] regardless of which side is picked', () => {
    const rule = ruleOf({ direction: 'at-or-above', index: 4 });
    for (let i = 0; i < 200; i++) {
      const tc = pickTrueCountForDeviationRule(rule, Math.random, MIN, MAX);
      expect(tc).toBeGreaterThanOrEqual(MIN);
      expect(tc).toBeLessThanOrEqual(MAX);
    }
  });

  describe('at-or-above', () => {
    it('returns TC >= index when wantMet (random() < 0.5)', () => {
      const rule = ruleOf({ direction: 'at-or-above', index: 4 });
      // First random() call drives wantMet (0.1 < 0.5 → met). Second call
      // picks within the met range.
      const tc = pickTrueCountForDeviationRule(rule, seqRandom([0.1, 0]), MIN, MAX);
      expect(tc).toBeGreaterThanOrEqual(4);
    });

    it('returns TC < index when wantUnmet (random() >= 0.5)', () => {
      const rule = ruleOf({ direction: 'at-or-above', index: 4 });
      const tc = pickTrueCountForDeviationRule(rule, seqRandom([0.9, 0]), MIN, MAX);
      expect(tc).toBeLessThan(4);
    });

    it('over many draws produces both met and unmet outcomes', () => {
      const rule = ruleOf({ direction: 'at-or-above', index: 4 });
      let metCount = 0;
      let unmetCount = 0;
      for (let i = 0; i < 300; i++) {
        const tc = pickTrueCountForDeviationRule(rule, Math.random, MIN, MAX);
        if (tc >= 4) metCount++;
        else unmetCount++;
      }
      expect(metCount).toBeGreaterThan(0);
      expect(unmetCount).toBeGreaterThan(0);
    });
  });

  describe('at-or-below', () => {
    it('returns TC <= index when wantMet', () => {
      const rule = ruleOf({ direction: 'at-or-below', index: -1 });
      const tc = pickTrueCountForDeviationRule(rule, seqRandom([0.1, 0]), MIN, MAX);
      expect(tc).toBeLessThanOrEqual(-1);
    });

    it('returns TC > index when wantUnmet', () => {
      const rule = ruleOf({ direction: 'at-or-below', index: -1 });
      const tc = pickTrueCountForDeviationRule(rule, seqRandom([0.9, 0]), MIN, MAX);
      expect(tc).toBeGreaterThan(-1);
    });
  });
});

describe('generateScenarioForDeviationRule', () => {
  it('returns a player hand and dealer upcard for a known rule', () => {
    const rule = H17_DEVIATIONS.find(
      (r) => r.category === 'hard' && r.playerHand === '16' && r.dealerUpcard === '10',
    )!;
    const { player, dealerUpcard } = generateScenarioForDeviationRule({
      rule,
      random: Math.random,
    });
    expect(player.length).toBe(2);
    expect(isTenValue(dealerUpcard)).toBe(true);
  });

  // Walk through every encoded rule for a rule set and confirm that the
  // generated (player, dealerUpcard) lands in the same (category, playerHand)
  // bucket when classifyForDeviation runs on it. Insurance is excluded
  // because its player hand is intentionally random.
  for (const ruleSet of ['S17', 'H17'] as const) {
    it(`the generated hand classifies to the rule for all encoded rules (${ruleSet})`, () => {
      for (const rule of deviationsFor(ruleSet)) {
        if (rule.category === 'insurance') continue;
        const { player, dealerUpcard } = generateScenarioForDeviationRule({
          rule,
          random: Math.random,
        });
        const klass = classifyForDeviation(player);
        if (rule.category === 'surrender') {
          // Surrender rules are looked up over the same hard total.
          expect(klass.category).toBe('hard');
        } else {
          expect(klass.category).toBe(rule.category);
        }
        expect(klass.playerHand).toBe(rule.playerHand);
        // Dealer upcard rank corresponds to the rule's chart key (ten-value
        // expands to any of '10' | 'J' | 'Q' | 'K').
        if (rule.dealerUpcard === '10') {
          expect(isTenValue(dealerUpcard)).toBe(true);
        } else if (rule.dealerUpcard === 'A') {
          expect(isAce(dealerUpcard)).toBe(true);
        } else {
          expect(dealerUpcard.rank).toBe(rule.dealerUpcard);
        }
      }
    });
  }
});
