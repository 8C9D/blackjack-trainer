import type { DeviationRule } from '../core/models/deviation.model';
import { H17_CHART } from './h17-basic-strategy';
import { S17_CHART } from './s17-basic-strategy';
import { H17_DEVIATIONS } from './h17-deviations';
import { S17_DEVIATIONS } from './s17-deviations';

// Value-level golden guards for the four hand-transcribed BJA charts. The
// structural spec (basic-strategy-charts.spec.ts) proves each chart's *shape*
// (rows, columns, legal symbols); these guards lock the *values* so a later
// edit (e.g. a Phase B feature touching nearby data) cannot silently flip a
// single chart cell without a test going red.
//
// IMPORTANT: these guard against *regressions*, not original transcription
// errors. The golden constants below are a serialization of the current chart
// data, so they catch any future drift from today's values — but they cannot
// catch a value that was wrong when first transcribed from the BJA PDFs. Re-
// verifying the charts against the published BJA source remains a periodic human
// review task (see the open question in docs/repo-current-state.md), not an
// automated one.
//
// To intentionally change a chart value: make the edit, run this spec, and copy
// the new serialization into the matching golden constant in the same commit.

// Dealer upcards in canonical column order. Each basic-strategy golden row is
// the cells across these columns, space-joined.
const UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

// Serialize a chart table (hard / soft / pair) to a row-key -> "cell cell ..."
// map. Typed loosely to sidestep the charts' numeric-vs-string key types, like
// the sibling structural spec.
function serializeTable(table: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rowKey, row] of Object.entries(table)) {
    out[rowKey] = UPCARDS.map((u) => (row as Record<string, string>)[u]).join(' ');
  }
  return out;
}

// Serialize a deviation list to one line per rule, capturing the decision
// fields (which hand vs which upcard, the index/direction threshold, and the
// basic -> deviation action). playerHandLabel and source are documentation, not
// part of the decision matrix, so they are intentionally excluded.
function serializeDeviations(rules: readonly DeviationRule[]): string[] {
  return rules.map(
    (r) =>
      `${r.ruleSet} ${r.category} ${r.playerHand} v${r.dealerUpcard} idx=${r.index} ${r.direction} ${r.basicAction}->${r.deviationAction}`,
  );
}

// ─── Basic-strategy golden values ──────────────────────────────────────────
// Columns:                  2  3  4  5  6  7  8  9  10 A

const H17_HARD_GOLDEN: Record<string, string> = {
  '5': 'H H H H H H H H H H',
  '6': 'H H H H H H H H H H',
  '7': 'H H H H H H H H H H',
  '8': 'H H H H H H H H H H',
  '9': 'H D D D D H H H H H',
  '10': 'D D D D D D D D H H',
  '11': 'D D D D D D D D D D',
  '12': 'H H S S S H H H H H',
  '13': 'S S S S S H H H H H',
  '14': 'S S S S S H H H H H',
  '15': 'S S S S S H H H SUR_H SUR_H',
  '16': 'S S S S S H H SUR_H SUR_H SUR_H',
  '17': 'S S S S S S S S S SUR_S',
  '18': 'S S S S S S S S S S',
  '19': 'S S S S S S S S S S',
  '20': 'S S S S S S S S S S',
};

const H17_SOFT_GOLDEN: Record<string, string> = {
  '2': 'H H H D D H H H H H',
  '3': 'H H H D D H H H H H',
  '4': 'H H D D D H H H H H',
  '5': 'H H D D D H H H H H',
  '6': 'H D D D D H H H H H',
  '7': 'Ds Ds Ds Ds Ds S S H H H',
  '8': 'S S S S Ds S S S S S',
  '9': 'S S S S S S S S S S',
};

const H17_PAIR_GOLDEN: Record<string, string> = {
  '2': 'YN YN Y Y Y Y N N N N',
  '3': 'YN YN Y Y Y Y N N N N',
  '4': 'N N N YN YN N N N N N',
  '5': 'N N N N N N N N N N',
  '6': 'YN Y Y Y Y N N N N N',
  '7': 'Y Y Y Y Y Y N N N N',
  '8': 'Y Y Y Y Y Y Y Y Y SUR_Y',
  '9': 'Y Y Y Y Y N Y Y N N',
  '10': 'N N N N N N N N N N',
  A: 'Y Y Y Y Y Y Y Y Y Y',
};

const S17_HARD_GOLDEN: Record<string, string> = {
  '5': 'H H H H H H H H H H',
  '6': 'H H H H H H H H H H',
  '7': 'H H H H H H H H H H',
  '8': 'H H H H H H H H H H',
  '9': 'H D D D D H H H H H',
  '10': 'D D D D D D D D H H',
  '11': 'D D D D D D D D D H',
  '12': 'H H S S S H H H H H',
  '13': 'S S S S S H H H H H',
  '14': 'S S S S S H H H H H',
  '15': 'S S S S S H H H SUR_H H',
  '16': 'S S S S S H H SUR_H SUR_H SUR_H',
  '17': 'S S S S S S S S S S',
  '18': 'S S S S S S S S S S',
  '19': 'S S S S S S S S S S',
  '20': 'S S S S S S S S S S',
};

const S17_SOFT_GOLDEN: Record<string, string> = {
  '2': 'H H H D D H H H H H',
  '3': 'H H H D D H H H H H',
  '4': 'H H D D D H H H H H',
  '5': 'H H D D D H H H H H',
  '6': 'H D D D D H H H H H',
  '7': 'S Ds Ds Ds Ds S S H H H',
  '8': 'S S S S S S S S S S',
  '9': 'S S S S S S S S S S',
};

const S17_PAIR_GOLDEN: Record<string, string> = {
  '2': 'YN YN Y Y Y Y N N N N',
  '3': 'YN YN Y Y Y Y N N N N',
  '4': 'N N N YN YN N N N N N',
  '5': 'N N N N N N N N N N',
  '6': 'YN Y Y Y Y N N N N N',
  '7': 'Y Y Y Y Y Y N N N N',
  '8': 'Y Y Y Y Y Y Y Y Y Y',
  '9': 'Y Y Y Y Y N Y Y N N',
  '10': 'N N N N N N N N N N',
  A: 'Y Y Y Y Y Y Y Y Y Y',
};

const BASIC_GOLDENS = [
  {
    name: 'H17_CHART',
    chart: H17_CHART,
    hard: H17_HARD_GOLDEN,
    soft: H17_SOFT_GOLDEN,
    pair: H17_PAIR_GOLDEN,
  },
  {
    name: 'S17_CHART',
    chart: S17_CHART,
    hard: S17_HARD_GOLDEN,
    soft: S17_SOFT_GOLDEN,
    pair: S17_PAIR_GOLDEN,
  },
];

for (const g of BASIC_GOLDENS) {
  describe(`${g.name} golden values`, () => {
    it('hard table values match golden', () => {
      expect(serializeTable(g.chart.hard)).toEqual(g.hard);
    });

    it('soft table values match golden', () => {
      expect(serializeTable(g.chart.soft)).toEqual(g.soft);
    });

    it('pair table values match golden', () => {
      expect(serializeTable(g.chart.pair)).toEqual(g.pair);
    });
  });
}

// ─── Deviation golden values ────────────────────────────────────────────────

const H17_DEVIATIONS_GOLDEN: readonly string[] = [
  'H17 insurance insurance vA idx=3 at-or-above H->INS',
  'H17 pair 10 v4 idx=6 at-or-above S->P',
  'H17 pair 10 v5 idx=5 at-or-above S->P',
  'H17 pair 10 v6 idx=4 at-or-above S->P',
  'H17 soft 19 v4 idx=3 at-or-above S->D',
  'H17 soft 19 v5 idx=1 at-or-above S->D',
  'H17 soft 19 v6 idx=0 at-or-below D->S',
  'H17 soft 17 v2 idx=1 at-or-above H->D',
  'H17 hard 16 v9 idx=4 at-or-above H->S',
  'H17 hard 16 v10 idx=0 at-or-above H->S',
  'H17 hard 16 vA idx=3 at-or-above H->S',
  'H17 hard 15 v10 idx=4 at-or-above H->S',
  'H17 hard 15 vA idx=5 at-or-above H->S',
  'H17 hard 13 v2 idx=-1 at-or-below S->H',
  'H17 hard 12 v2 idx=3 at-or-above H->S',
  'H17 hard 12 v3 idx=2 at-or-above H->S',
  'H17 hard 12 v4 idx=0 at-or-below S->H',
  'H17 hard 10 v10 idx=4 at-or-above H->D',
  'H17 hard 10 vA idx=3 at-or-above H->D',
  'H17 hard 9 v2 idx=1 at-or-above H->D',
  'H17 hard 9 v7 idx=3 at-or-above H->D',
  'H17 hard 8 v6 idx=2 at-or-above H->D',
  'H17 surrender 16 v8 idx=4 at-or-above H->SUR',
  'H17 surrender 16 v9 idx=-1 at-or-below H->SUR',
  'H17 surrender 15 v9 idx=2 at-or-above H->SUR',
  'H17 surrender 15 v10 idx=0 at-or-below H->SUR',
  'H17 surrender 15 vA idx=-1 at-or-above H->SUR',
];

const S17_DEVIATIONS_GOLDEN: readonly string[] = [
  'S17 insurance insurance vA idx=3 at-or-above H->INS',
  'S17 pair 10 v4 idx=6 at-or-above S->P',
  'S17 pair 10 v5 idx=5 at-or-above S->P',
  'S17 pair 10 v6 idx=4 at-or-above S->P',
  'S17 soft 19 v4 idx=3 at-or-above S->D',
  'S17 soft 19 v5 idx=1 at-or-above S->D',
  'S17 soft 19 v6 idx=1 at-or-above S->D',
  'S17 soft 17 v2 idx=1 at-or-above H->D',
  'S17 hard 16 v9 idx=4 at-or-above H->S',
  'S17 hard 16 v10 idx=0 at-or-above H->S',
  'S17 hard 15 v10 idx=4 at-or-above H->S',
  'S17 hard 13 v2 idx=-1 at-or-below S->H',
  'S17 hard 12 v2 idx=3 at-or-above H->S',
  'S17 hard 12 v3 idx=2 at-or-above H->S',
  'S17 hard 12 v4 idx=0 at-or-below S->H',
  'S17 hard 11 vA idx=1 at-or-above H->D',
  'S17 hard 10 v10 idx=4 at-or-above H->D',
  'S17 hard 10 vA idx=4 at-or-above H->D',
  'S17 hard 9 v2 idx=1 at-or-above H->D',
  'S17 hard 9 v7 idx=3 at-or-above H->D',
  'S17 hard 8 v6 idx=2 at-or-above H->D',
  'S17 surrender 16 v8 idx=4 at-or-above H->SUR',
  'S17 surrender 16 v9 idx=-1 at-or-below H->SUR',
  'S17 surrender 15 v9 idx=2 at-or-above H->SUR',
  'S17 surrender 15 v10 idx=0 at-or-below H->SUR',
  'S17 surrender 15 vA idx=2 at-or-above H->SUR',
];

const DEVIATION_GOLDENS = [
  { name: 'H17_DEVIATIONS', rules: H17_DEVIATIONS, golden: H17_DEVIATIONS_GOLDEN },
  { name: 'S17_DEVIATIONS', rules: S17_DEVIATIONS, golden: S17_DEVIATIONS_GOLDEN },
];

for (const g of DEVIATION_GOLDENS) {
  describe(`${g.name} golden values`, () => {
    it('rule count matches golden', () => {
      expect(g.rules.length).toBe(g.golden.length);
    });

    it('serialized rules match golden', () => {
      expect(serializeDeviations(g.rules)).toEqual(g.golden);
    });
  });
}
