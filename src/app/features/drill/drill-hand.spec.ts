import type { Card, Rank, Suit } from '../../core/models/card.model';
import { DEFAULT_ENGINE_OPTIONS } from '../../core/models/strategy.model';
import { classifyAsPair, isSoftHand } from '../../core/services/basic-strategy-engine.service';
import { cardHighValue } from '../../core/models/card.model';
import type { ScenarioRef, WeakSpot } from '../../core/services/miss-tally.service';
import {
  WEAK_SPOT_SHARE,
  handQuestion,
  legalActionsFor,
  nextSessionTarget,
  pickWeakSpot,
  scenarioFromRef,
} from './drill-hand';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const LS_ON = { ...DEFAULT_ENGINE_OPTIONS, lateSurrender: true };

describe('handQuestion', () => {
  it('labels hard totals', () => {
    expect(handQuestion([card('2'), card('8')], card('6'))).toEqual({
      prefix: 'Hard',
      value: '10',
      dealer: '6',
    });
  });

  it('labels soft totals and normalizes ten-value dealers', () => {
    expect(handQuestion([card('A'), card('7')], card('Q'))).toEqual({
      prefix: 'Soft',
      value: '18',
      dealer: '10',
    });
  });

  it('labels pairs without a prefix', () => {
    expect(handQuestion([card('8'), card('8', 'hearts')], card('A'))).toEqual({
      prefix: '',
      value: '8,8',
      dealer: 'A',
    });
    expect(handQuestion([card('K'), card('J', 'hearts')], card('5'))).toEqual({
      prefix: '',
      value: '10,10',
      dealer: '5',
    });
  });
});

describe('legalActionsFor', () => {
  const NON_PAIR: readonly [Card, Card] = [card('2'), card('8')];

  it('always allows hit, stand, double on an initial hand', () => {
    const legal = legalActionsFor(NON_PAIR, card('6'), DEFAULT_ENGINE_OPTIONS);
    expect(legal).toEqual(['H', 'S', 'D']);
  });

  it('allows split only on pairs (including mixed ten-values)', () => {
    expect(
      legalActionsFor([card('8'), card('8', 'hearts')], card('6'), DEFAULT_ENGINE_OPTIONS),
    ).toContain('P');
    expect(
      legalActionsFor([card('K'), card('10', 'hearts')], card('6'), DEFAULT_ENGINE_OPTIONS),
    ).toContain('P');
    expect(legalActionsFor(NON_PAIR, card('6'), DEFAULT_ENGINE_OPTIONS)).not.toContain('P');
  });

  it('allows insurance only against a dealer ace', () => {
    expect(legalActionsFor(NON_PAIR, card('A'), DEFAULT_ENGINE_OPTIONS)).toContain('INS');
    expect(legalActionsFor(NON_PAIR, card('10'), DEFAULT_ENGINE_OPTIONS)).not.toContain('INS');
  });

  it('gates surrender on the Late Surrender rule', () => {
    expect(legalActionsFor(NON_PAIR, card('10'), DEFAULT_ENGINE_OPTIONS)).not.toContain('SUR');
    expect(legalActionsFor(NON_PAIR, card('10'), LS_ON)).toContain('SUR');
  });

  it('offers surrender regardless of the rule when surrenderAlways is set', () => {
    expect(legalActionsFor(NON_PAIR, card('10'), DEFAULT_ENGINE_OPTIONS, true)).toContain('SUR');
  });
});

describe('nextSessionTarget', () => {
  it('targets the daily goal while under it', () => {
    expect(nextSessionTarget(0, 20)).toBe(20);
    expect(nextSessionTarget(14, 20)).toBe(20);
    expect(nextSessionTarget(19, 20)).toBe(20);
  });

  it('extends by a full goal once met ("one more round")', () => {
    expect(nextSessionTarget(20, 20)).toBe(40);
    expect(nextSessionTarget(27, 20)).toBe(40);
    expect(nextSessionTarget(40, 20)).toBe(60);
  });

  it('tolerates degenerate inputs', () => {
    expect(nextSessionTarget(-1, 20)).toBe(20);
    expect(nextSessionTarget(5, 0)).toBe(6);
  });
});

describe('scenarioFromRef', () => {
  // Cycle through varied fractions so suits/orderings differ but stay valid.
  function seededRandom(): () => number {
    let i = 0;
    const seq = [0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8];
    return () => seq[i++ % seq.length];
  }

  it('rebuilds a hard total as a non-pair hand with the right dealer', () => {
    const ref: ScenarioRef = { kind: 'hard', hand: '16', dealer: '10' };
    for (let run = 0; run < 10; run++) {
      const s = scenarioFromRef(ref, Math.random);
      expect(classifyAsPair(s.player)).toBeNull();
      expect(isSoftHand(s.player)).toBe(false);
      expect(cardHighValue(s.player[0]) + cardHighValue(s.player[1])).toBe(16);
      expect(cardHighValue(s.dealerUpcard)).toBe(10);
    }
  });

  it('rebuilds a soft total', () => {
    const s = scenarioFromRef({ kind: 'soft', hand: '18', dealer: '9' }, seededRandom());
    expect(isSoftHand(s.player)).toBe(true);
    const values = [cardHighValue(s.player[0]), cardHighValue(s.player[1])].sort((a, b) => a - b);
    expect(values).toEqual([7, 11]);
    expect(s.dealerUpcard.rank).toBe('9');
  });

  it('rebuilds pairs, including ten-value and ace pairs', () => {
    const eights = scenarioFromRef({ kind: 'pair', hand: '8', dealer: '6' }, seededRandom());
    expect(eights.player.map((c) => c.rank)).toEqual(['8', '8']);

    const tens = scenarioFromRef({ kind: 'pair', hand: '10', dealer: 'A' }, seededRandom());
    expect(classifyAsPair(tens.player)).toBe('10');
    expect(tens.dealerUpcard.rank).toBe('A');

    const aces = scenarioFromRef({ kind: 'pair', hand: 'A', dealer: '5' }, seededRandom());
    expect(aces.player.map((c) => c.rank)).toEqual(['A', 'A']);
  });
});

describe('pickWeakSpot', () => {
  const weak = (label: string, misses: number): WeakSpot => ({
    ref: { kind: 'hard', hand: label, dealer: '10' },
    label,
    misses,
    attempts: misses * 2,
    streak: 0,
  });

  // Feeds the two `random()` calls in order: the share roll, then the
  // weighted draw.
  function rolls(...values: number[]): () => number {
    let i = 0;
    return () => values[i++];
  }

  it('deals a fresh hand when nothing has been missed', () => {
    expect(pickWeakSpot([], rolls(0))).toBeNull();
  });

  it('deals a fresh hand when the share roll misses', () => {
    const spots = [weak('16', 3)];
    expect(pickWeakSpot(spots, rolls(WEAK_SPOT_SHARE))).toBeNull();
    expect(pickWeakSpot(spots, rolls(0.99))).toBeNull();
  });

  it('draws from the weak list when the share roll hits', () => {
    const picked = pickWeakSpot([weak('16', 3)], rolls(0, 0));
    expect(picked!.label).toBe('16');
  });

  it('weights the draw by miss count', () => {
    // Weights 3 and 1 over a total of 4: the first spot owns [0, 0.75).
    const spots = [weak('16', 3), weak('12', 1)];
    expect(pickWeakSpot(spots, rolls(0, 0))!.label).toBe('16');
    expect(pickWeakSpot(spots, rolls(0, 0.74))!.label).toBe('16');
    expect(pickWeakSpot(spots, rolls(0, 0.76))!.label).toBe('12');
    // A share of 1 makes every hand a weak spot — the review round.
    expect(pickWeakSpot(spots, rolls(0.99, 0.9), 1)!.label).toBe('12');
  });

  it('lands on the last spot when the draw rounds past the end', () => {
    const spots = [weak('16', 3), weak('12', 1)];
    expect(pickWeakSpot(spots, rolls(0, 1))!.label).toBe('12');
  });

  it('holds the share it advertises over many draws', () => {
    const spots = [weak('16', 1)];
    let hits = 0;
    for (let i = 0; i < 10_000; i++) {
      if (pickWeakSpot(spots, Math.random)) hits++;
    }
    // ±4 points is far outside sampling noise at n = 10,000 but immune to
    // an unlucky seed.
    expect(Math.abs(hits / 10_000 - WEAK_SPOT_SHARE)).toBeLessThan(0.04);
  });
});
