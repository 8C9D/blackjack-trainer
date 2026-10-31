import type { DeviationRule } from '../core/models/deviation.model';
import type { Action } from '../core/models/strategy.model';
import { BasicStrategyEngineService } from '../core/services/basic-strategy-engine.service';
import { DeviationEngineService } from '../core/services/deviation-engine.service';
import { EV_BY_COUNT } from './ev-by-count.generated';
import { H17_DEVIATIONS } from './h17-deviations';
import { S17_DEVIATIONS } from './s17-deviations';

// Holds the published indices to sampled shoes. Exact numbers are not the point:
// indices are rounded, differ a little by penetration, and the charts are the
// source this trainer teaches. What may not be wrong is which way an index points
// and roughly where, and that is precisely what a misread chart gets wrong. Three
// rules once pointed the wrong way and four sat on the wrong side of zero, and
// nothing could see it, because every test compared the charts to themselves.

const SURRENDER = -5000;
// Published indices are whole numbers and a true count truncates, so a hand a
// count or so from its index can honestly land on either side.
const MARGIN = 2;
// Sampled means carry noise, and some hands really are a coin flip at a neutral
// count: S17 12 v 4 measures within a tenth of a percent of even.
const NOISE = 25;

const engine = new DeviationEngineService(new BasicStrategyEngineService());
const COUNTS = Array.from(
  { length: EV_BY_COUNT.maxCount - EV_BY_COUNT.minCount + 1 },
  (_, i) => EV_BY_COUNT.minCount + i,
);

function valueOf(rule: DeviationRule, action: Action, tc: number): number {
  const i = tc - EV_BY_COUNT.minCount;
  if (action === 'SUR') return SURRENDER;
  const kind = rule.category === 'surrender' ? 'hard' : rule.category;
  const key = `${kind}-${rule.playerHand}-v-${rule.dealerUpcard}`;
  const cell = EV_BY_COUNT.cells[rule.ruleSet][key];
  const column = { S: 'stand', H: 'hit', D: 'double', P: 'split' }[action as 'S' | 'H' | 'D' | 'P'];
  return cell[column][i];
}

// What taking the rule's play is worth over not taking it.
function gain(rule: DeviationRule, tc: number): number {
  if (rule.category === 'insurance') return EV_BY_COUNT.insurance[tc - EV_BY_COUNT.minCount];
  return valueOf(rule, rule.deviationAction, tc) - valueOf(rule, rule.basicAction, tc);
}

// The nearest count to `tc` where the rule's answer is the other one.
function distanceToBoundary(rule: DeviationRule, tc: number): number {
  const met = engine.isDeviationThresholdMet(rule, tc);
  return Math.min(
    ...COUNTS.filter((other) => engine.isDeviationThresholdMet(rule, other) !== met).map((other) =>
      Math.abs(other - tc),
    ),
  );
}

describe.each([...H17_DEVIATIONS, ...S17_DEVIATIONS])('$source', (rule) => {
  it('is worth playing where it fires and not where it does not', () => {
    for (const tc of COUNTS) {
      if (distanceToBoundary(rule, tc) < MARGIN) continue;
      const met = engine.isDeviationThresholdMet(rule, tc);
      expect(gain(rule, tc) > 0, `at TC ${tc}`).toBe(met);
    }
  });
});

describe('a neutral count', () => {
  // The legend's "0+" and "0-" exclude zero, and at zero there is nothing to
  // deviate from: these are the hands the chart has to get right there.
  it.each([
    ['16 v 10 hits', H17_DEVIATIONS, 'hard', '16', '10'],
    ['12 v 4 stands', H17_DEVIATIONS, 'hard', '12', '4'],
    ['A,8 v 6 doubles under H17', H17_DEVIATIONS, 'soft', '19', '6'],
    ['16 v 10 hits under S17', S17_DEVIATIONS, 'hard', '16', '10'],
    ['12 v 4 stands under S17', S17_DEVIATIONS, 'hard', '12', '4'],
  ])('%s', (_label, rules, category, hand, up) => {
    const rule = rules.find(
      (r) => r.category === category && r.playerHand === hand && r.dealerUpcard === up,
    ) as DeviationRule;
    expect(engine.isDeviationThresholdMet(rule, 0)).toBe(false);
    expect(gain(rule, 0)).toBeLessThan(NOISE);
  });
});

describe('insurance', () => {
  it('turns profitable at its published index', () => {
    const value = (tc: number) => EV_BY_COUNT.insurance[tc - EV_BY_COUNT.minCount];
    expect(value(2)).toBeLessThan(0);
    expect(value(3)).toBeGreaterThan(0);
  });
});
