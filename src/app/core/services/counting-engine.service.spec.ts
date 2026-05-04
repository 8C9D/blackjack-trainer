import type { Card, Rank } from '../models/card.model';
import { HI_LO } from '../../data/counting-systems';
import { CardGeneratorService } from './card-generator.service';
import { CountingEngineService } from './counting-engine.service';

const card = (rank: Rank): Card => ({ rank, suit: 'spades' });
const seq = (...ranks: Rank[]): Card[] => ranks.map(card);

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

  describe('validateSettings()', () => {
    it('accepts valid settings', () => {
      const v = engine.validateSettings({ numberOfCards: 20, millisecondsBetweenCards: 500 });
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    });

    it('accepts the boundary timing of exactly 100ms', () => {
      const v = engine.validateSettings({ numberOfCards: 1, millisecondsBetweenCards: 100 });
      expect(v.valid).toBe(true);
    });

    it('rejects zero cards', () => {
      const v = engine.validateSettings({ numberOfCards: 0, millisecondsBetweenCards: 500 });
      expect(v.valid).toBe(false);
      expect(v.errors.length).toBeGreaterThan(0);
    });

    it('rejects negative card counts', () => {
      const v = engine.validateSettings({ numberOfCards: -3, millisecondsBetweenCards: 500 });
      expect(v.valid).toBe(false);
    });

    it('rejects non-integer card counts', () => {
      const v = engine.validateSettings({ numberOfCards: 2.5, millisecondsBetweenCards: 500 });
      expect(v.valid).toBe(false);
    });

    it('rejects NaN card counts', () => {
      const v = engine.validateSettings({ numberOfCards: NaN, millisecondsBetweenCards: 500 });
      expect(v.valid).toBe(false);
    });

    it('rejects sub-100ms timing', () => {
      const v = engine.validateSettings({ numberOfCards: 10, millisecondsBetweenCards: 50 });
      expect(v.valid).toBe(false);
    });

    it('rejects NaN timing', () => {
      const v = engine.validateSettings({ numberOfCards: 10, millisecondsBetweenCards: NaN });
      expect(v.valid).toBe(false);
    });

    it('reports both errors when both fields are bad', () => {
      const v = engine.validateSettings({ numberOfCards: -1, millisecondsBetweenCards: 0 });
      expect(v.errors.length).toBe(2);
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
