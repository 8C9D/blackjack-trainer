import type { Action, RuleSet, StrategyChart } from '../core/models/strategy.model';
import { EV_TABLE } from './ev-table.generated';
import { H17_CHART } from './h17-basic-strategy';
import { S17_CHART } from './s17-basic-strategy';

// The check `chart-values.golden.spec.ts` says it cannot make. That file stops a
// chart changing; this one asks whether it was right, against a table derived
// from the rules of the game by a solver that never reads a chart
// (`tools/ev/`, regenerated and diffed in CI).
//
// Every cell, under every combination of the table rules the app offers, has to
// name the most valuable play on offer.

type Play = Exclude<Action, 'INS'>;

const SURRENDER = -5000;
const UPCARDS = EV_TABLE.upcards;

interface Rules {
  readonly ruleSet: RuleSet;
  readonly das: boolean;
  readonly ls: boolean;
}

const ALL_RULES: readonly Rules[] = (['H17', 'S17'] as const).flatMap((ruleSet) =>
  [true, false].flatMap((das) => [true, false].map((ls) => ({ ruleSet, das, ls }))),
);

// What a chart cell tells a player to do under these rules, where `null` means
// the cell passes the hand on to the total it makes.
function cellPlay(cell: string, { das, ls }: Rules): Play | null {
  switch (cell) {
    case 'H':
    case 'S':
    case 'D':
      return cell;
    case 'Ds':
      return 'D';
    case 'Y':
      return 'P';
    case 'N':
      return null;
    case 'YN':
      return das ? 'P' : null;
    case 'SUR_H':
      return ls ? 'SUR' : 'H';
    case 'SUR_S':
      return ls ? 'SUR' : 'S';
    case 'SUR_Y':
      return ls ? 'SUR' : 'P';
  }
  throw new Error(`Unknown cell ${cell}`);
}

function valuesOf(row: string, column: number, rules: Rules): ReadonlyMap<Play, number> {
  const table = EV_TABLE.rules[rules.ruleSet];
  const values = new Map<Play, number>([
    ['S', table.stand[row][column]],
    ['H', table.hit[row][column]],
    ['D', table.double[row][column]],
  ]);
  const split = (rules.das ? table.split : table.splitNoDas)[row];
  if (split) values.set('P', split[column]);
  if (rules.ls) values.set('SUR', SURRENDER);
  return values;
}

function bestPlay(values: ReadonlyMap<Play, number>): Play {
  return [...values.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

interface Cell {
  readonly label: string;
  readonly row: string;
  readonly column: number;
  readonly play: Play;
}

function cellsOf(chart: StrategyChart, rules: Rules): readonly Cell[] {
  const hard = chart.hard as Readonly<Record<string, Readonly<Record<string, string>>>>;
  const soft = chart.soft as Readonly<Record<string, Readonly<Record<string, string>>>>;
  const pair = chart.pair as Readonly<Record<string, Readonly<Record<string, string>>>>;
  const cells: Cell[] = [];

  UPCARDS.forEach((upcard, column) => {
    for (const total of Object.keys(hard)) {
      const row = `hard-${total}`;
      // Hard 20 has no two-card form but a pair of tens, which its row reads as.
      if (!(row in EV_TABLE.rules.S17.stand)) continue;
      const play = cellPlay(hard[total][upcard], rules);
      cells.push({ label: `${row} v ${upcard}`, row, column, play: play as Play });
    }
    for (const key of Object.keys(soft)) {
      const row = `soft-${11 + Number(key)}`;
      const play = cellPlay(soft[key][upcard], rules);
      cells.push({ label: `${row} v ${upcard}`, row, column, play: play as Play });
    }
    for (const key of Object.keys(pair)) {
      const row = `pair-${key}`;
      const fallback = hard[String(Math.max(5, 2 * Number(key)))]?.[upcard];
      const play = cellPlay(pair[key][upcard], rules) ?? cellPlay(fallback, rules);
      cells.push({ label: `${row} v ${upcard}`, row, column, play: play as Play });
    }
  });
  return cells;
}

function chartFor(ruleSet: RuleSet): StrategyChart {
  return ruleSet === 'H17' ? H17_CHART : S17_CHART;
}

describe.each(ALL_RULES)('$ruleSet das=$das ls=$ls', (rules) => {
  const cells = cellsOf(chartFor(rules.ruleSet), rules);

  it('reaches every chart cell the table has a row for', () => {
    // 15 hard rows (hard 20 has none), 8 soft and 10 pairs, each ten upcards.
    expect(cells).toHaveLength(330);
  });

  it('names the most valuable play in every cell', () => {
    const wrong = cells
      .filter((cell) => cell.play !== bestPlay(valuesOf(cell.row, cell.column, rules)))
      .map((cell) => cell.label);
    expect(wrong).toEqual([]);
  });
});

describe('the check itself', () => {
  const rules = ALL_RULES[0];

  // A comparison that could not fail would prove nothing, so a chart with one
  // cell changed has to come back with exactly that cell.
  it('catches a single wrong cell', () => {
    const chart = chartFor(rules.ruleSet);
    const hard = { ...chart.hard, 16: { ...chart.hard[16], '7': 'S' } } as StrategyChart['hard'];
    const wrong = cellsOf({ ...chart, hard }, rules)
      .filter((cell) => cell.play !== bestPlay(valuesOf(cell.row, cell.column, rules)))
      .map((cell) => cell.label);
    expect(wrong).toEqual(['hard-16 v 7']);
  });
});

describe('the table against what is published about it', () => {
  it('prices the rules in the direction every table does', () => {
    const edge = EV_TABLE.houseEdge;
    for (const ruleSet of ['H17', 'S17'] as const) {
      expect(edge[ruleSet].das.noSurrender).toBeLessThan(edge[ruleSet].noDas.noSurrender);
      expect(edge[ruleSet].das.surrender).toBeLessThan(edge[ruleSet].das.noSurrender);
    }
    expect(edge.S17.das.noSurrender).toBeLessThan(edge.H17.das.noSurrender);
  });

  it('lands on the published six-deck edges', () => {
    expect(EV_TABLE.houseEdge.S17.das.noSurrender).toBe(40);
    expect(EV_TABLE.houseEdge.H17.das.noSurrender).toBe(62);
  });

  it('deals every hand that survives the peek', () => {
    const total = Object.values(EV_TABLE.frequency)
      .flat()
      .reduce((sum, perMillion) => sum + perMillion, 0);
    // Naturals are not rows, and a dealer natural ends the hand first.
    expect(total / 1_000_000).toBeGreaterThan(0.9);
    expect(total / 1_000_000).toBeLessThan(0.93);
  });

  it('prices insurance at its known cost', () => {
    // A little under four percent of the bet off the top of a six-deck shoe.
    expect(EV_TABLE.insurance).toBe(-370);
  });
});
