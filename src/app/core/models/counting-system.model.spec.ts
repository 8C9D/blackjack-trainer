import type { Card, Rank, Suit } from './card.model';
import {
  cardCountValue,
  formatCorrelation,
  metricsParts,
  type CountingSystem,
} from './counting-system.model';
import { countingSystemById } from '../../data/counting-systems';

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
