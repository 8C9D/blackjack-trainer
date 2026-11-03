import { EV_BY_COUNT } from '../../data/ev-by-count.generated';
import { EV_TABLE } from '../../data/ev-table.generated';
import type { EngineOptions } from '../models/strategy.model';
import type { ScenarioRef, WeakSpot } from './miss-tally.service';
import {
  cheapestMiss,
  costOfPlay,
  costSentence,
  formatBetShare,
  houseEdge,
  playValue,
  tableFrequency,
  tableLeak,
} from './play-cost';

const OPTIONS: EngineOptions = { doubleAfterSplit: true, lateSurrender: false };
const LS: EngineOptions = { doubleAfterSplit: true, lateSurrender: true };
const S17 = { ruleSet: 'S17', options: OPTIONS } as const;

const hard = (hand: number, dealer: ScenarioRef['dealer']): ScenarioRef => ({
  kind: 'hard',
  hand: String(hand),
  dealer,
});
const pair = (hand: string, dealer: ScenarioRef['dealer']): ScenarioRef => ({
  kind: 'pair',
  hand,
  dealer,
});

function spot(ref: ScenarioRef, misses: number, attempts: number, costPerMiss: number): WeakSpot {
  return { ref, label: '', misses, attempts, streak: 0, missedCounts: [], costPerMiss };
}

describe('playValue', () => {
  it('reads a play off the full-shoe table', () => {
    const column = EV_TABLE.upcards.indexOf('10');
    expect(playValue(hard(16, '10'), 'H', S17)).toBe(EV_TABLE.rules.S17.hit['hard-16'][column]);
    expect(playValue(hard(16, '10'), 'S', S17)).toBe(EV_TABLE.rules.S17.stand['hard-16'][column]);
  });

  it('prices a surrender at half the bet, whatever the hand', () => {
    expect(playValue(hard(16, '10'), 'SUR', { ...S17, options: LS })).toBe(-5000);
  });

  it('tells a split with DAS from one without', () => {
    const ref = pair('4', '5');
    const das = playValue(ref, 'P', S17) as number;
    const noDas = playValue(ref, 'P', {
      ...S17,
      options: { doubleAfterSplit: false, lateSurrender: false },
    }) as number;
    expect(das).toBeGreaterThan(noDas);
  });

  it('reads a played-out hard 20 from the tens, its only two-card form', () => {
    expect(playValue(hard(20, '6'), 'S', S17)).toBe(playValue(pair('10', '6'), 'S', S17));
  });

  it('has no value for a play that is not a play of the hand', () => {
    expect(playValue(hard(16, '10'), 'INS', S17)).toBeNull();
  });
});

describe('costOfPlay', () => {
  it('measures a mistake against the right play', () => {
    const ref = pair('10', '6');
    const cost = costOfPlay(ref, 'P', 'S', S17) as number;
    // Over an eighth of the bet: the mistake this whole module exists for.
    expect(cost).toBeGreaterThan(1250);
  });

  it('tells a coin flip from a blunder, which grading cannot', () => {
    const coinFlip = costOfPlay(hard(16, '10'), 'S', 'H', S17) as number;
    const blunder = costOfPlay(pair('10', '6'), 'P', 'S', S17) as number;
    expect(coinFlip).toBeLessThan(100);
    expect(blunder).toBeGreaterThan(1250);
  });

  it('never calls a mistake profitable', () => {
    // Backwards on purpose: naming a worse play as correct still costs nothing.
    expect(costOfPlay(pair('10', '6'), 'S', 'P', S17)).toBe(0);
  });

  it('charges nothing for the right play, insurance included', () => {
    expect(costOfPlay(hard(16, '10'), 'H', 'H', S17)).toBe(0);
    expect(costOfPlay(hard(16, 'A'), 'INS', 'INS', S17)).toBe(0);
  });

  it('prices insurance as a side bet', () => {
    expect(costOfPlay(hard(16, 'A'), 'INS', 'H', S17)).toBe(-EV_TABLE.insurance);
  });

  it('has nothing to say about a hand off the table', () => {
    expect(costOfPlay(hard(99, '10'), 'H', 'S', S17)).toBeNull();
  });
});

describe('cheapestMiss', () => {
  it('is the gap to the next best play, so it can only understate', () => {
    const ref = hard(11, '6');
    const gap = cheapestMiss(ref, S17) as number;
    expect(gap).toBe((playValue(ref, 'D', S17) as number) - (playValue(ref, 'H', S17) as number));
  });

  it('prices a miss at an insurance count as the bet, not as the hand', () => {
    const ref = hard(11, 'A');
    const atCount = cheapestMiss(ref, { ...S17, trueCount: 6 }) as number;
    expect(atCount).toBe(EV_BY_COUNT.insurance[6 - EV_BY_COUNT.minCount]);
    // Below the index the question is the hand again, at the count it is played.
    const context = { ...S17, trueCount: 0 };
    const gap = (playValue(ref, 'H', context) as number) - (playValue(ref, 'D', context) as number);
    expect(cheapestMiss(ref, context)).toBe(Math.abs(gap));
  });

  // A tally knows a hand was missed, not how, and against an ace one way to miss
  // it is to insure it. Priced as the next-best play, insuring 10,10 v A read as
  // a 50% mistake; the side bet it was costs 3.7%.
  it('counts insuring the hand as a way to miss it against an ace', () => {
    expect(cheapestMiss(pair('10', 'A'), S17)).toBe(-EV_TABLE.insurance);
    const atZero = EV_BY_COUNT.insurance[0 - EV_BY_COUNT.minCount];
    expect(cheapestMiss(pair('10', 'A'), { ...S17, trueCount: 0 })).toBe(-atZero);
    // Where the next-best play is cheaper still, that is the floor.
    const ref = hard(11, 'A');
    const gap = Math.abs(
      (playValue(ref, 'H', S17) as number) - (playValue(ref, 'D', S17) as number),
    );
    expect(gap).toBeLessThan(-EV_TABLE.insurance);
    expect(cheapestMiss(ref, S17)).toBe(gap);
  });

  it('does not offer insurance to a played-out hand', () => {
    const ref = hard(20, 'A');
    const values = (['H', 'S'] as const).map((play) => playValue(ref, play, S17) as number);
    expect(cheapestMiss(ref, S17)).toBe(Math.abs(values[0] - values[1]));
  });

  it('only counts surrender where the table offers one', () => {
    const ref = hard(16, '10');
    const without = cheapestMiss(ref, S17) as number;
    const withLs = cheapestMiss(ref, { ...S17, options: LS }) as number;
    expect(withLs).not.toBe(without);
  });

  it('offers a split only on a pair', () => {
    expect(cheapestMiss(pair('A', '6'), S17)).toBeGreaterThan(0);
  });

  it('has nothing to compare on a hand off the table', () => {
    expect(cheapestMiss(hard(99, '10'), S17)).toBeNull();
  });
});

describe('tableFrequency', () => {
  it('finds common hands common and rare ones rare', () => {
    expect(tableFrequency(pair('10', '10'))).toBeGreaterThan(tableFrequency(pair('2', '2')));
  });

  it('is zero off the table', () => {
    expect(tableFrequency(hard(99, '10'))).toBe(0);
  });
});

describe('tableLeak', () => {
  it('is what the hand costs, how often it is missed, and how often it comes up', () => {
    const ref = hard(16, '10');
    const leak = tableLeak([spot(ref, 3, 3, 400)]);
    expect(leak).toBeCloseTo(tableFrequency(ref) * 0.75 * 400, 6);
  });

  it('does not read one miss as a hundred percent', () => {
    const ref = hard(16, '10');
    expect(tableLeak([spot(ref, 1, 1, 400)])).toBeCloseTo(tableFrequency(ref) * 0.5 * 400, 6);
  });

  it('adds nothing for a spot the tables cannot price', () => {
    const unpriced: WeakSpot = { ...spot(hard(16, '10'), 1, 1, 0), costPerMiss: null };
    expect(tableLeak([unpriced])).toBe(0);
  });

  it('is nothing with no misses', () => {
    expect(tableLeak([])).toBe(0);
  });
});

describe('houseEdge', () => {
  it('reads the four combinations of the optional rules', () => {
    const edges = EV_TABLE.houseEdge.H17;
    expect(houseEdge('H17', LS)).toBe(edges.das.surrender);
    expect(houseEdge('H17', OPTIONS)).toBe(edges.das.noSurrender);
    expect(houseEdge('H17', { doubleAfterSplit: false, lateSurrender: true })).toBe(
      edges.noDas.surrender,
    );
    expect(houseEdge('H17', { doubleAfterSplit: false, lateSurrender: false })).toBe(
      edges.noDas.noSurrender,
    );
  });
});

describe('formatBetShare', () => {
  it.each([
    [1, 'under 0.1%'],
    [9, 'under 0.1%'],
    [10, '0.1%'],
    [25, '0.3%'],
    [35, '0.4%'],
    [340, '3.4%'],
    [995, '10%'],
    [1000, '10%'],
    [2875, '29%'],
  ])('%i → %s', (units, label) => {
    expect(formatBetShare(units)).toBe(label);
  });
});

describe('costSentence', () => {
  it('calls a thin margin what it is', () => {
    expect(costSentence(30)).toBe('A close call: that play gives up 0.3% of your bet.');
  });

  it('prices a real mistake plainly', () => {
    expect(costSentence(340)).toBe('That play gives up 3.4% of your bet.');
  });

  // Judged on the printed figure: 46 and 50 hundredths both print 0.5%, and one
  // reading "a close call" while the other did not was two verdicts on one number.
  it('gives the same verdict to every cost that prints the same', () => {
    expect(costSentence(44)).toBe('A close call: that play gives up 0.4% of your bet.');
    expect(costSentence(46)).toBe('That play gives up 0.5% of your bet.');
    expect(costSentence(50)).toBe('That play gives up 0.5% of your bet.');
  });
});
