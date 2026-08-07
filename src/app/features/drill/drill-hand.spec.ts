import type { Card, Rank, Suit } from '../../core/models/card.model';
import { DEFAULT_ENGINE_OPTIONS } from '../../core/models/strategy.model';
import { classifyAsPair, isSoftHand } from '../../core/services/basic-strategy-engine.service';
import { cardHighValue } from '../../core/models/card.model';
import { handTotal } from '../../core/models/hand.model';
import {
  scenarioRefFor,
  type ScenarioRef,
  type WeakSpot,
} from '../../core/services/miss-tally.service';
import {
  MAX_SPLIT_HANDS,
  UNSPLIT,
  parseScenarioKey,
  WEAK_SPOT_SHARE,
  handQuestion,
  legalActionsFor,
  nextSessionTarget,
  pickWeakSpot,
  scenarioFromRef,
  splitHandAt,
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

  // Past two cards there is no pair to name, and an ace may have softened.
  it('labels a hand played out by its N-card total', () => {
    expect(handQuestion([card('4'), card('4', 'hearts'), card('8')], card('6'))).toEqual({
      prefix: 'Hard',
      value: '16',
      dealer: '6',
    });
    expect(handQuestion([card('A'), card('2'), card('4')], card('6'))).toEqual({
      prefix: 'Soft',
      value: '17',
      dealer: '6',
    });
    // The ace demotes to 1 rather than reading as a soft 27.
    expect(handQuestion([card('A'), card('9'), card('7')], card('6'))).toEqual({
      prefix: 'Hard',
      value: '17',
      dealer: '6',
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

  // Both trainers ask it this way: the deviation surrender overlay is gated on
  // the same rule, so there is no caller that wants SUR answerable without it.
  it('gates surrender on the Late Surrender rule', () => {
    expect(legalActionsFor(NON_PAIR, card('10'), DEFAULT_ENGINE_OPTIONS)).not.toContain('SUR');
    expect(legalActionsFor(NON_PAIR, card('10'), LS_ON)).toContain('SUR');
  });

  // Double, split and surrender are first-two-card actions, and insurance was
  // settled before the hand was played, so a drawn card leaves hit and stand.
  it('leaves only hit and stand once the hand is past two cards', () => {
    const deep = [card('8'), card('8', 'hearts'), card('2')];
    expect(legalActionsFor(deep, card('A'), LS_ON)).toEqual(['H', 'S']);
  });

  // A hand out of a split is two cards again but is not the hand that was
  // dealt: insurance was settled before it existed and surrender is a
  // first-two-cards action of the hand that was.
  describe('after a split', () => {
    const FROM_SPLIT = { fromSplit: true, canSplitAgain: true };
    const AT_THE_CAP = { fromSplit: true, canSplitAgain: false };

    it('takes surrender and insurance away for good', () => {
      const legal = legalActionsFor(NON_PAIR, card('A'), LS_ON, FROM_SPLIT);
      expect(legal).not.toContain('SUR');
      expect(legal).not.toContain('INS');
    });

    it('gives the double back only under DAS', () => {
      expect(legalActionsFor(NON_PAIR, card('6'), DEFAULT_ENGINE_OPTIONS, FROM_SPLIT)).toEqual([
        'H',
        'S',
      ]);
      const das = { ...DEFAULT_ENGINE_OPTIONS, doubleAfterSplit: true };
      expect(legalActionsFor(NON_PAIR, card('6'), das, FROM_SPLIT)).toContain('D');
    });

    it('re-splits a pair until the deal is at its cap', () => {
      const pair: readonly Card[] = [card('8'), card('8', 'hearts')];
      expect(legalActionsFor(pair, card('6'), DEFAULT_ENGINE_OPTIONS, FROM_SPLIT)).toContain('P');
      expect(legalActionsFor(pair, card('6'), DEFAULT_ENGINE_OPTIONS, AT_THE_CAP)).not.toContain(
        'P',
      );
    });

    it('leaves an unsplit hand every action it had', () => {
      expect(legalActionsFor(NON_PAIR, card('A'), LS_ON, UNSPLIT)).toEqual(
        legalActionsFor(NON_PAIR, card('A'), LS_ON),
      );
    });
  });
});

describe('splitHandAt', () => {
  const eights: readonly Card[] = [card('8'), card('8', 'hearts')];

  it('gives each half one card, in the order they are played', () => {
    expect(splitHandAt([eights], 0)).toEqual([[card('8')], [card('8', 'hearts')]]);
  });

  it('lands a re-split in place, so the hands stay in playing order', () => {
    const waiting: readonly Card[] = [card('9')];
    expect(splitHandAt([eights, waiting], 0)).toEqual([
      [card('8')],
      [card('8', 'hearts')],
      waiting,
    ]);
  });

  // Defensive: a one-card hand waiting behind the active one is not a pair to
  // split, and nothing should be able to turn it into two.
  it('leaves anything that is not a two-card hand alone', () => {
    const one = [[card('8')]];
    expect(splitHandAt(one, 0)).toBe(one);
    expect(splitHandAt([eights], 3)).toEqual([eights]);
  });

  it('caps a deal at four hands', () => {
    expect(MAX_SPLIT_HANDS).toBe(4);
  });
});

// The chart's entry into a drill. Its value is the tally's own scenario key, so
// the three surfaces that name a hand — chart, weak list, drill — share one
// encoding rather than three.
describe('parseScenarioKey', () => {
  it('reads each kind of hand back out', () => {
    expect(parseScenarioKey('hard-16-v-10')).toEqual({ kind: 'hard', hand: '16', dealer: '10' });
    expect(parseScenarioKey('soft-18-v-9')).toEqual({ kind: 'soft', hand: '18', dealer: '9' });
    expect(parseScenarioKey('pair-8-v-A')).toEqual({ kind: 'pair', hand: '8', dealer: 'A' });
    expect(parseScenarioKey('pair-10-v-2')).toEqual({ kind: 'pair', hand: '10', dealer: '2' });
    expect(parseScenarioKey('pair-A-v-6')).toEqual({ kind: 'pair', hand: 'A', dealer: '6' });
  });

  // Strict for the same reason `?review=1` is: pinning every hand of a round to
  // something no chart ever showed is worse than an ordinary round.
  it('refuses anything that is not a hand this app deals', () => {
    expect(parseScenarioKey(null)).toBeNull();
    expect(parseScenarioKey('')).toBeNull();
    expect(parseScenarioKey('hard-16-vs-10')).toBeNull();
    expect(parseScenarioKey('bogus-16-v-10')).toBeNull();
    expect(parseScenarioKey('hard-16-v-J')).toBeNull(); // faces normalize to 10
    expect(parseScenarioKey('hard-4-v-6')).toBeNull(); // below the chart
    expect(parseScenarioKey('hard-21-v-6')).toBeNull(); // above it
    expect(parseScenarioKey('soft-12-v-6')).toBeNull(); // A,A is a pair, not soft 12
    expect(parseScenarioKey('soft-21-v-6')).toBeNull();
    expect(parseScenarioKey('pair-J-v-6')).toBeNull();
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

  // Narrow a deal the test knows is two cards to the tuple the classifiers take.
  function asTwoCards(player: readonly Card[]): readonly [Card, Card] {
    expect(player).toHaveLength(2);
    return [player[0], player[1]];
  }

  it('rebuilds a hard total as a non-pair hand with the right dealer', () => {
    const ref: ScenarioRef = { kind: 'hard', hand: '16', dealer: '10' };
    for (let run = 0; run < 10; run++) {
      const s = scenarioFromRef(ref, Math.random);
      const player = asTwoCards(s.player);
      expect(classifyAsPair(player)).toBeNull();
      expect(isSoftHand(player)).toBe(false);
      expect(cardHighValue(player[0]) + cardHighValue(player[1])).toBe(16);
      expect(cardHighValue(s.dealerUpcard)).toBe(10);
    }
  });

  it('rebuilds a soft total', () => {
    const s = scenarioFromRef({ kind: 'soft', hand: '18', dealer: '9' }, seededRandom());
    const player = asTwoCards(s.player);
    expect(isSoftHand(player)).toBe(true);
    const values = [cardHighValue(player[0]), cardHighValue(player[1])].sort((a, b) => a - b);
    expect(values).toEqual([7, 11]);
    expect(s.dealerUpcard.rank).toBe('9');
  });

  // F4: hard 20 has no two-card non-pair form — two ten-values are the 10,10
  // pair — so the pin deals a third card rather than falling through to a pair
  // that asks a different question and files under a different key.
  it('rebuilds hard 20 as a non-pair hand that files back under hard 20', () => {
    const ref: ScenarioRef = { kind: 'hard', hand: '20', dealer: '10' };
    for (let run = 0; run < 10; run++) {
      const s = scenarioFromRef(ref, Math.random);
      expect(handTotal(s.player)).toBe(20);
      expect(handQuestion(s.player, s.dealerUpcard)).toEqual({
        prefix: 'Hard',
        value: '20',
        dealer: '10',
      });
      expect(legalActionsFor(s.player, s.dealerUpcard, DEFAULT_ENGINE_OPTIONS)).toEqual(['H', 'S']);
      expect(scenarioRefFor(s.player, s.dealerUpcard)).toEqual(ref);
    }
  });

  it('rebuilds pairs, including ten-value and ace pairs', () => {
    const eights = scenarioFromRef({ kind: 'pair', hand: '8', dealer: '6' }, seededRandom());
    expect(eights.player.map((c) => c.rank)).toEqual(['8', '8']);

    const tens = scenarioFromRef({ kind: 'pair', hand: '10', dealer: 'A' }, seededRandom());
    expect(classifyAsPair(asTwoCards(tens.player))).toBe('10');
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
    missedCounts: [],
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
