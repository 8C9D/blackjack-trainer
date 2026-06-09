import type { RuleSet, StrategyChart } from '../core/models/strategy.model';
import { H17_CHART } from './h17-basic-strategy';
import { S17_CHART } from './s17-basic-strategy';

// Structural integrity guards for the two hand-transcribed BJA charts. These
// assert the *shape* (every expected row, every dealer column, only legal cell
// symbols) so a dropped row, missing column, or typo'd cell is caught — without
// re-asserting specific strategy actions, which the engine specs already cover.

const DEALER_UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const HARD_ROW_KEYS = [
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
];
const SOFT_ROW_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9'];
const PAIR_ROW_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

const LEGAL_HARD_CELLS = ['H', 'S', 'D', 'SUR_H', 'SUR_S'];
const LEGAL_SOFT_CELLS = ['H', 'S', 'D', 'Ds'];
const LEGAL_PAIR_CELLS = ['Y', 'N', 'YN', 'SUR_Y'];

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

// table is an object keyed by row label, each row an object keyed by dealer
// upcard. Typed loosely to sidestep the charts' numeric-literal key types.
function expectTable(
  table: object,
  expectedRowKeys: readonly string[],
  legalCells: readonly string[],
): void {
  expect(sorted(Object.keys(table))).toEqual(sorted(expectedRowKeys));
  for (const [rowKey, row] of Object.entries(table)) {
    expect(sorted(Object.keys(row)), `row ${rowKey} columns`).toEqual(sorted(DEALER_UPCARDS));
    for (const [upcard, cell] of Object.entries(row)) {
      expect(legalCells, `row ${rowKey} vs ${upcard}`).toContain(cell);
    }
  }
}

const CHARTS: ReadonlyArray<{
  name: string;
  chart: StrategyChart;
  ruleSet: RuleSet;
}> = [
  { name: 'H17_CHART', chart: H17_CHART, ruleSet: 'H17' },
  { name: 'S17_CHART', chart: S17_CHART, ruleSet: 'S17' },
];

for (const { name, chart, ruleSet } of CHARTS) {
  describe(name, () => {
    it(`declares ruleSet '${ruleSet}'`, () => {
      expect(chart.ruleSet).toBe(ruleSet);
    });

    it('hard table has totals 5..20, each a full dealer row of legal cells', () => {
      expectTable(chart.hard, HARD_ROW_KEYS, LEGAL_HARD_CELLS);
    });

    it('soft table has keys 2..9, each a full dealer row of legal cells', () => {
      expectTable(chart.soft, SOFT_ROW_KEYS, LEGAL_SOFT_CELLS);
    });

    it('pair table has keys 2..10 and A, each a full dealer row of legal cells', () => {
      expectTable(chart.pair, PAIR_ROW_KEYS, LEGAL_PAIR_CELLS);
    });
  });
}
