import { formatSignedCount } from './card-counting.model';
import { ALL_RANKS, type Card, type Rank, type Suit } from './card.model';
import {
  cardCountValue,
  formatCorrelation,
  metricsParts,
  tagTableFor,
  type CountingSystem,
} from './counting-system.model';
import { COUNTING_SYSTEMS, countingSystemById } from '../../data/counting-systems';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

// A synthetic color-dependent system: the 7 is +1 when red, 0 when black
// (averaging to the scalar 0.5), every other rank is rank-only. Mirrors the
// Red Seven shape without depending on the registry, so this stays valid even
// before any color system is registered.
const COLOR_SYSTEM: CountingSystem = {
  id: 'test-color',
  name: 'Test Color',
  description: 'Synthetic color system for cardCountValue tests.',
  metrics: { bettingCorrelation: 0.9, playingEfficiency: 0.5, insuranceCorrelation: 0.7 },
  balanced: false,
  values: {
    '2': 1,
    '3': 1,
    '4': 1,
    '5': 1,
    '6': 1,
    '7': 0.5,
    '8': 0,
    '9': 0,
    '10': -1,
    J: -1,
    Q: -1,
    K: -1,
    A: -1,
  },
  colorValues: { '7': { red: 1, black: 0 } },
};

describe('cardCountValue', () => {
  it('uses the red tag for an overridden rank on a red suit', () => {
    expect(cardCountValue(COLOR_SYSTEM, card('7', 'hearts'))).toBe(1);
    expect(cardCountValue(COLOR_SYSTEM, card('7', 'diamonds'))).toBe(1);
  });

  it('uses the black tag for an overridden rank on a black suit', () => {
    expect(cardCountValue(COLOR_SYSTEM, card('7', 'spades'))).toBe(0);
    expect(cardCountValue(COLOR_SYSTEM, card('7', 'clubs'))).toBe(0);
  });

  it('falls back to the scalar value for a non-overridden rank, regardless of suit', () => {
    for (const s of ['hearts', 'diamonds', 'spades', 'clubs'] as const) {
      expect(cardCountValue(COLOR_SYSTEM, card('5', s))).toBe(1);
      expect(cardCountValue(COLOR_SYSTEM, card('A', s))).toBe(-1);
    }
  });

  it('uses the scalar value for every rank when no colorValues are defined', () => {
    const rankOnly: CountingSystem = { ...COLOR_SYSTEM, colorValues: undefined };
    expect(cardCountValue(rankOnly, card('7', 'hearts'))).toBe(0.5);
    expect(cardCountValue(rankOnly, card('7', 'spades'))).toBe(0.5);
  });
});

describe('formatCorrelation', () => {
  // The published table's own form: two decimals, no leading zero. These are
  // dimensionless correlations, never quantities, so the leading zero would
  // only suggest arithmetic that is never done on them.
  it.each([
    [0.97, '.97'],
    [0.4, '.40'],
    [0, '.00'],
    [1, '1.00'],
  ])('renders %s as %s', (value, expected) => {
    expect(formatCorrelation(value)).toBe(expected);
  });
});

describe('metricsParts', () => {
  it('names all three figures in the order a hand meets them', () => {
    expect(metricsParts(countingSystemById('hi-lo'))).toEqual([
      { label: 'Betting correlation', value: '.97' },
      { label: 'Playing efficiency', value: '.51' },
      { label: 'Insurance correlation', value: '.76' },
    ]);
  });
});

describe('tagTableFor', () => {
  it('collapses a run of ranks that share a tag into one column', () => {
    expect(tagTableFor(countingSystemById('hi-lo'))).toEqual({
      rowLabels: ['Count'],
      columns: [
        { label: '2–6', values: ['+1'] },
        { label: '7–9', values: ['0'] },
        { label: '10–A', values: ['-1'] },
      ],
    });
  });

  it('labels a column of one rank with that rank alone', () => {
    // KO differs from Hi-Lo only by the 7, which lands it in the low run and
    // leaves 8–9 as the neutral column.
    expect(tagTableFor(countingSystemById('ko')).columns.map((c) => c.label)).toEqual([
      '2–7',
      '8–9',
      '10–A',
    ]);
    // Wong Halves is fractional, and the ranks it weights apart stay apart.
    expect(tagTableFor(countingSystemById('wong-halves')).columns).toEqual([
      { label: '2', values: ['+0.5'] },
      { label: '3–4', values: ['+1'] },
      { label: '5', values: ['+1.5'] },
      { label: '6', values: ['+1'] },
      { label: '7', values: ['+0.5'] },
      { label: '8', values: ['0'] },
      { label: '9', values: ['-0.5'] },
      { label: '10–A', values: ['-1'] },
    ]);
  });

  it('gives a color-dependent system a row per color and breaks the split rank out', () => {
    // The 7 agrees with 2–6 when red and with 8–9 when black, so it can join
    // neither: a column is only merged when every row agrees.
    expect(tagTableFor(COLOR_SYSTEM)).toEqual({
      rowLabels: ['Red', 'Black'],
      columns: [
        { label: '2–6', values: ['+1', '+1'] },
        { label: '7', values: ['+1', '0'] },
        { label: '8–9', values: ['0', '0'] },
        { label: '10–A', values: ['-1', '-1'] },
      ],
    });
  });

  it('reads every tag back through the engine accessor, for every registered system', () => {
    // The point of the table is that it cannot drift from what a miss is
    // graded on, so each printed figure is checked against cardCountValue.
    for (const system of COUNTING_SYSTEMS) {
      const table = tagTableFor(system);
      const printed = new Map<Rank, readonly string[]>();
      for (const column of table.columns) {
        for (const rank of ranksIn(column.label)) printed.set(rank, column.values);
      }
      expect(printed.size, `${system.id} covers every rank`).toBe(ALL_RANKS.length);
      for (const rank of ALL_RANKS) {
        const suits: Suit[] = table.rowLabels.length === 2 ? ['hearts', 'spades'] : ['spades'];
        expect(printed.get(rank), `${system.id} ${rank}`).toEqual(
          suits.map((suit) => formatSignedCount(cardCountValue(system, card(rank, suit)))),
        );
      }
    }
  });
});

// The ranks a column label covers: '7' is one, '2–6' is the ALL_RANKS slice
// between its ends.
function ranksIn(label: string): readonly Rank[] {
  const [first, last] = label.split('–') as [Rank, Rank?];
  if (last === undefined) return [first];
  return ALL_RANKS.slice(ALL_RANKS.indexOf(first), ALL_RANKS.indexOf(last) + 1);
}
