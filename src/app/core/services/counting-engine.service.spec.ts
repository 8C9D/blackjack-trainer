import type { Card, Rank } from '../models/card.model';
import { MAX_CARDS_PER_DRILL, type CountingDrillSettings } from '../models/card-counting.model';
import { HI_LO } from '../../data/counting-systems';
import { CardGeneratorService } from './card-generator.service';
import { CountingEngineService } from './counting-engine.service';

const card = (rank: Rank): Card => ({ rank, suit: 'spades' });
const seq = (...ranks: Rank[]): Card[] => ranks.map(card);

// Default settings shape used by validateSettings tests. Individual tests
// override the fields they care about.
const rcSettings = (
  overrides: Partial<CountingDrillSettings> = {},
): CountingDrillSettings => ({
  mode: 'running-count',
  numberOfCards: 20,
  millisecondsBetweenCards: 500,
  decksRemaining: 1,
  ...overrides,
});

const tcSettings = (
  overrides: Partial<CountingDrillSettings> = {},
): CountingDrillSettings => ({
  mode: 'true-count',
  numberOfCards: 20,
  millisecondsBetweenCards: 500,
  decksRemaining: 2,
  ...overrides,
});

describe('CountingEngineService', () => {
  let engine: CountingEngineService;

  beforeEach(() => {
    engine = new CountingEngineService();
  });

  describe('Hi-Lo per-rank values', () => {
    it('2 through 6 count as +1', () => {
      for (const r of ['2', '3', '4', '5', '6'] as const) {
        expect(engine.runningCount([card(r)], HI_LO)).toBe(1);
      }
    });

    it('7 through 9 count as 0', () => {
      for (const r of ['7', '8', '9'] as const) {
        expect(engine.runningCount([card(r)], HI_LO)).toBe(0);
      }
    });

    it('10, J, Q, K, A count as -1', () => {
      for (const r of ['10', 'J', 'Q', 'K', 'A'] as const) {
        expect(engine.runningCount([card(r)], HI_LO)).toBe(-1);
      }
    });
  });

  describe('runningCount for known sequences', () => {
    it('[2, 3, K, A, 7] => 0', () => {
      expect(engine.runningCount(seq('2', '3', 'K', 'A', '7'), HI_LO)).toBe(0);
    });

    it('[5, 6, 10] => 1', () => {
      expect(engine.runningCount(seq('5', '6', '10'), HI_LO)).toBe(1);
    });

    it('[A, K, Q, J, 10] => -5', () => {
      expect(engine.runningCount(seq('A', 'K', 'Q', 'J', '10'), HI_LO)).toBe(-5);
    });

    it('[2, 3, 4, 5, 6] => 5', () => {
      expect(engine.runningCount(seq('2', '3', '4', '5', '6'), HI_LO)).toBe(5);
    });

    it('[7, 8, 9] => 0', () => {
      expect(engine.runningCount(seq('7', '8', '9'), HI_LO)).toBe(0);
    });

    it('empty sequence returns 0', () => {
      expect(engine.runningCount([], HI_LO)).toBe(0);
    });
  });

  describe('Hi-Lo system metadata', () => {
    it('is marked balanced', () => {
      expect(HI_LO.balanced).toBe(true);
    });

    it('full 52-card deck sums to 0 (balanced property)', () => {
      // Construct a single deck: all 13 ranks × 4 suits.
      const ranks: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
      const deck: Card[] = [];
      for (const r of ranks) {
        for (let i = 0; i < 4; i++) deck.push(card(r));
      }
      expect(engine.runningCount(deck, HI_LO)).toBe(0);
    });
  });

  describe('evaluate()', () => {
    it('marks a correct positive answer as correct', () => {
      const cards = seq('2', '3', '4', '5', '6'); // +5
      const result = engine.evaluate(cards, 5, HI_LO);
      expect(result.mode).toBe('running-count');
      expect(result.correctRunningCount).toBe(5);
      expect(result.userRunningCount).toBe(5);
      expect(result.isCorrect).toBe(true);
      expect(result.cards).toBe(cards);
    });

    it('marks a correct negative answer as correct', () => {
      const cards = seq('A', 'K', 'Q', 'J', '10'); // -5
      const result = engine.evaluate(cards, -5, HI_LO);
      expect(result.isCorrect).toBe(true);
      expect(result.correctRunningCount).toBe(-5);
    });

    it('marks a correct zero answer as correct', () => {
      const cards = seq('2', '3', 'K', 'A', '7'); // 0
      const result = engine.evaluate(cards, 0, HI_LO);
      expect(result.isCorrect).toBe(true);
      expect(result.correctRunningCount).toBe(0);
    });

    it('marks a wrong answer as incorrect (off by sign)', () => {
      const cards = seq('A', 'K'); // -2
      const result = engine.evaluate(cards, 2, HI_LO);
      expect(result.isCorrect).toBe(false);
      expect(result.correctRunningCount).toBe(-2);
      expect(result.userRunningCount).toBe(2);
    });

    it('marks a wrong answer as incorrect (off by one)', () => {
      const cards = seq('5', '5', '6'); // +3
      const result = engine.evaluate(cards, 2, HI_LO);
      expect(result.isCorrect).toBe(false);
    });
  });

  describe('trueCount()', () => {
    it('positive: running 6 / 2 decks => 3', () => {
      expect(engine.trueCount(6, 2)).toBe(3);
    });

    it('truncates toward zero: running 5 / 2 decks => 2', () => {
      expect(engine.trueCount(5, 2)).toBe(2);
    });

    it('truncates toward zero for negatives: running -5 / 2 decks => -2', () => {
      expect(engine.trueCount(-5, 2)).toBe(-2);
    });

    it('running 0 over any deck count is 0', () => {
      expect(engine.trueCount(0, 3)).toBe(0);
    });

    it('fractional decks scale up: running 3 / 0.5 decks => 6', () => {
      expect(engine.trueCount(3, 0.5)).toBe(6);
    });
  });

  describe('evaluateTrueCount()', () => {
    it('returns a true-count-shaped result', () => {
      const cards = seq('2', '3', '4', '5', '6'); // running count +5
      const result = engine.evaluateTrueCount(cards, 2, 2, HI_LO);
      expect(result.mode).toBe('true-count');
      expect(result.cards).toBe(cards);
      expect(result.correctRunningCount).toBe(5);
      expect(result.decksRemaining).toBe(2);
      expect(result.correctTrueCount).toBe(2);
      expect(result.userTrueCount).toBe(2);
      expect(result.isCorrect).toBe(true);
    });

    it('marks a correct answer as correct', () => {
      // running count -6 over 2 decks => true count -3
      const cards = seq('A', 'K', 'Q', 'J', '10', '10');
      const result = engine.evaluateTrueCount(cards, -3, 2, HI_LO);
      expect(result.correctRunningCount).toBe(-6);
      expect(result.correctTrueCount).toBe(-3);
      expect(result.isCorrect).toBe(true);
    });

    it('marks an incorrect answer as incorrect', () => {
      // running count +5 over 2 decks => true count 2 (truncated). User says 3.
      const cards = seq('2', '3', '4', '5', '6');
      const result = engine.evaluateTrueCount(cards, 3, 2, HI_LO);
      expect(result.correctTrueCount).toBe(2);
      expect(result.userTrueCount).toBe(3);
      expect(result.isCorrect).toBe(false);
    });
  });

  describe('validateSettings()', () => {
    it('accepts valid running-count settings', () => {
      const v = engine.validateSettings(rcSettings());
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    });

    it('accepts the boundary timing of exactly 100ms', () => {
      const v = engine.validateSettings(
        rcSettings({ numberOfCards: 1, millisecondsBetweenCards: 100 }),
      );
      expect(v.valid).toBe(true);
    });

    it('rejects zero cards', () => {
      const v = engine.validateSettings(rcSettings({ numberOfCards: 0 }));
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    });

    it('rejects negative card counts', () => {
      const v = engine.validateSettings(rcSettings({ numberOfCards: -3 }));
      expect(v.valid).toBe(false);
    });

    it('rejects non-integer card counts', () => {
      const v = engine.validateSettings(rcSettings({ numberOfCards: 2.5 }));
      expect(v.valid).toBe(false);
    });

    it('rejects NaN card counts', () => {
      const v = engine.validateSettings(rcSettings({ numberOfCards: NaN }));
      expect(v.valid).toBe(false);
    });

    it(`accepts the boundary maximum of exactly MAX_CARDS_PER_DRILL (${MAX_CARDS_PER_DRILL})`, () => {
      const v = engine.validateSettings(
        rcSettings({ numberOfCards: MAX_CARDS_PER_DRILL }),
      );
      expect(v.valid).toBe(true);
    });

    it('rejects card counts above MAX_CARDS_PER_DRILL', () => {
      const v = engine.validateSettings(
        rcSettings({ numberOfCards: MAX_CARDS_PER_DRILL + 1 }),
      );
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes(String(MAX_CARDS_PER_DRILL)))).toBe(true);
    });

    it('rejects sub-100ms timing', () => {
      const v = engine.validateSettings(rcSettings({ millisecondsBetweenCards: 50 }));
      expect(v.valid).toBe(false);
    });

    it('rejects NaN timing', () => {
      const v = engine.validateSettings(rcSettings({ millisecondsBetweenCards: NaN }));
      expect(v.valid).toBe(false);
    });

    it('reports both errors when both fields are bad', () => {
      const v = engine.validateSettings(
        rcSettings({ numberOfCards: -1, millisecondsBetweenCards: 0 }),
      );
      expect(v.errors.length).toBe(2);
    });

    it('running-count mode ignores decksRemaining (zero is fine)', () => {
      const v = engine.validateSettings(rcSettings({ decksRemaining: 0 }));
      expect(v.valid).toBe(true);
    });

    it('running-count mode ignores decksRemaining (NaN is fine)', () => {
      const v = engine.validateSettings(rcSettings({ decksRemaining: NaN }));
      expect(v.valid).toBe(true);
    });

    it('running-count mode ignores decksRemaining (negative is fine)', () => {
      const v = engine.validateSettings(rcSettings({ decksRemaining: -2 }));
      expect(v.valid).toBe(true);
    });

    it('accepts valid true-count settings', () => {
      const v = engine.validateSettings(tcSettings());
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    });

    it('true-count mode rejects decksRemaining = 0', () => {
      const v = engine.validateSettings(tcSettings({ decksRemaining: 0 }));
      expect(v.valid).toBe(false);
    });

    it('true-count mode rejects negative decksRemaining', () => {
      const v = engine.validateSettings(tcSettings({ decksRemaining: -1 }));
      expect(v.valid).toBe(false);
    });

    it('true-count mode rejects NaN decksRemaining', () => {
      const v = engine.validateSettings(tcSettings({ decksRemaining: NaN }));
      expect(v.valid).toBe(false);
    });

    it('true-count mode rejects non-finite decksRemaining', () => {
      const v = engine.validateSettings(
        tcSettings({ decksRemaining: Number.POSITIVE_INFINITY }),
      );
      expect(v.valid).toBe(false);
    });
  });

  describe('isValidIntegerAnswer()', () => {
    it('accepts positive, negative, and zero integers', () => {
      expect(engine.isValidIntegerAnswer('0')).toBe(true);
      expect(engine.isValidIntegerAnswer('5')).toBe(true);
      expect(engine.isValidIntegerAnswer('-5')).toBe(true);
      expect(engine.isValidIntegerAnswer('  3  ')).toBe(true);
    });

    it('rejects decimals, empty, and non-numeric strings', () => {
      expect(engine.isValidIntegerAnswer('')).toBe(false);
      expect(engine.isValidIntegerAnswer('1.5')).toBe(false);
      expect(engine.isValidIntegerAnswer('abc')).toBe(false);
      expect(engine.isValidIntegerAnswer('+')).toBe(false);
      expect(engine.isValidIntegerAnswer('--3')).toBe(false);
      expect(engine.isValidIntegerAnswer('3.0')).toBe(false);
    });
  });
});

describe('CardGeneratorService — counting extensions', () => {
  it('generateCard() returns a valid Card with rank + suit', () => {
    const gen = new CardGeneratorService();
    const c = gen.generateCard();
    expect(c.rank).toBeDefined();
    expect(c.suit).toBeDefined();
  });

  it('generateSequence(n) returns exactly n cards', () => {
    const gen = new CardGeneratorService();
    expect(gen.generateSequence(0).length).toBe(0);
    expect(gen.generateSequence(1).length).toBe(1);
    expect(gen.generateSequence(20).length).toBe(20);
    expect(gen.generateSequence(100).length).toBe(100);
  });

  it('generateSequence respects setRandomSource for determinism', () => {
    const gen = new CardGeneratorService();
    let i = 0;
    // Deterministic source: 0, 0.05, 0.1, ...
    gen.setRandomSource(() => (i++ * 0.05) % 1);
    const a = gen.generateSequence(5);
    i = 0;
    const b = gen.generateSequence(5);
    expect(a).toEqual(b);
  });
});
