import type { Card, Rank } from '../models/card.model';
import { MAX_CARDS_PER_DRILL, type CountingDrillSettings } from '../models/card-counting.model';
import { HI_LO, KO, OMEGA_II, WONG_HALVES } from '../../data/counting-systems';
import { CardGeneratorService } from './card-generator.service';
import { CountingEngineService } from './counting-engine.service';

const card = (rank: Rank): Card => ({ rank, suit: 'spades' });
const seq = (...ranks: Rank[]): Card[] => ranks.map(card);

// Default settings shape used by validateSettings tests. Individual tests
// override the fields they care about.
const rcSettings = (overrides: Partial<CountingDrillSettings> = {}): CountingDrillSettings => ({
  mode: 'running-count',
  numberOfCards: 20,
  millisecondsBetweenCards: 500,
  decksRemaining: 1,
  trueCountSource: 'classic',
  numberOfDecks: 6,
  penetration: 0.75,
  ...overrides,
});

// Classic preset true-count settings (the original behavior).
const tcSettings = (overrides: Partial<CountingDrillSettings> = {}): CountingDrillSettings => ({
  mode: 'true-count',
  numberOfCards: 20,
  millisecondsBetweenCards: 500,
  decksRemaining: 2,
  trueCountSource: 'classic',
  numberOfDecks: 6,
  penetration: 0.75,
  ...overrides,
});

// Live-shoe true-count settings.
const liveSettings = (overrides: Partial<CountingDrillSettings> = {}): CountingDrillSettings => ({
  mode: 'true-count',
  numberOfCards: 20,
  millisecondsBetweenCards: 500,
  decksRemaining: 2,
  trueCountSource: 'live-shoe',
  numberOfDecks: 6,
  penetration: 0.75,
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
      const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const deck: Card[] = [];
      for (const r of ranks) {
        for (let i = 0; i < 4; i++) deck.push(card(r));
      }
      expect(engine.runningCount(deck, HI_LO)).toBe(0);
    });
  });

  describe('KO running count', () => {
    it('counts 2 through 7 as +1 (7 differs from Hi-Lo)', () => {
      for (const r of ['2', '3', '4', '5', '6', '7'] as const) {
        expect(engine.runningCount([card(r)], KO)).toBe(1);
      }
    });

    it('counts 8 and 9 as 0', () => {
      for (const r of ['8', '9'] as const) {
        expect(engine.runningCount([card(r)], KO)).toBe(0);
      }
    });

    it('counts 10, J, Q, K, A as -1', () => {
      for (const r of ['10', 'J', 'Q', 'K', 'A'] as const) {
        expect(engine.runningCount([card(r)], KO)).toBe(-1);
      }
    });

    it('[2, 3, K, A, 7] => 1 under KO (the 7 is +1, vs 0 under Hi-Lo)', () => {
      const cards = seq('2', '3', 'K', 'A', '7');
      expect(engine.runningCount(cards, KO)).toBe(1);
      // Same sequence is 0 under Hi-Lo — confirms the systems diverge on the 7.
      expect(engine.runningCount(cards, HI_LO)).toBe(0);
    });

    it('full 52-card deck sums to +4 (unbalanced)', () => {
      const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const deck: Card[] = [];
      for (const r of ranks) {
        for (let i = 0; i < 4; i++) deck.push(card(r));
      }
      expect(engine.runningCount(deck, KO)).toBe(4);
    });
  });

  describe('Omega II running count (level-2)', () => {
    it('sums multi-level (±2) per-rank values over a sequence', () => {
      // 4(+2) 5(+2) 9(-1) 10(-2) 2(+1) => +2
      expect(engine.runningCount(seq('4', '5', '9', '10', '2'), OMEGA_II)).toBe(2);
    });

    it('counts 4, 5, 6 as +2 (level-2; +1 under Hi-Lo)', () => {
      for (const r of ['4', '5', '6'] as const) {
        expect(engine.runningCount([card(r)], OMEGA_II)).toBe(2);
      }
    });

    it('counts 10, J, Q, K as -2 and the ace as 0', () => {
      for (const r of ['10', 'J', 'Q', 'K'] as const) {
        expect(engine.runningCount([card(r)], OMEGA_II)).toBe(-2);
      }
      expect(engine.runningCount([card('A')], OMEGA_II)).toBe(0);
    });

    it('diverges from Hi-Lo on the level-2 ranks', () => {
      const cards = seq('4', '5', '6'); // Omega II +6, Hi-Lo +3
      expect(engine.runningCount(cards, OMEGA_II)).toBe(6);
      expect(engine.runningCount(cards, HI_LO)).toBe(3);
    });

    it('full 52-card deck sums to 0 (balanced)', () => {
      const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const deck: Card[] = [];
      for (const r of ranks) {
        for (let i = 0; i < 4; i++) deck.push(card(r));
      }
      expect(engine.runningCount(deck, OMEGA_II)).toBe(0);
    });
  });

  describe('Wong Halves running count (fractional)', () => {
    it('counts 2 and 7 as +0.5, 5 as +1.5, 9 as -0.5', () => {
      expect(engine.runningCount([card('2')], WONG_HALVES)).toBe(0.5);
      expect(engine.runningCount([card('7')], WONG_HALVES)).toBe(0.5);
      expect(engine.runningCount([card('5')], WONG_HALVES)).toBe(1.5);
      expect(engine.runningCount([card('9')], WONG_HALVES)).toBe(-0.5);
    });

    it('sums fractional per-rank values over a sequence', () => {
      // 2(+0.5) 5(+1.5) 9(-0.5) 10(-1) => +0.5
      expect(engine.runningCount(seq('2', '5', '9', '10'), WONG_HALVES)).toBe(0.5);
    });

    it('lands on a whole number when halves cancel', () => {
      // 2(+0.5) 7(+0.5) => +1
      expect(engine.runningCount(seq('2', '7'), WONG_HALVES)).toBe(1);
    });

    it('diverges from Hi-Lo on the fractional ranks', () => {
      // The 5 is +1.5 under Wong Halves but +1 under Hi-Lo; the 2 is +0.5 vs +1.
      const cards = seq('5', '2'); // Wong Halves +2.0, Hi-Lo +2 (they coincide here)
      expect(engine.runningCount(cards, WONG_HALVES)).toBe(2);
      // A single card makes the per-rank divergence explicit.
      expect(engine.runningCount([card('5')], WONG_HALVES)).toBe(1.5);
      expect(engine.runningCount([card('5')], HI_LO)).toBe(1);
      expect(engine.runningCount([card('2')], WONG_HALVES)).toBe(0.5);
      expect(engine.runningCount([card('2')], HI_LO)).toBe(1);
    });

    it('full 52-card deck sums to 0 (balanced)', () => {
      const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const deck: Card[] = [];
      for (const r of ranks) {
        for (let i = 0; i < 4; i++) deck.push(card(r));
      }
      expect(engine.runningCount(deck, WONG_HALVES)).toBe(0);
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

    it('marks a correct half-point running-count answer as correct (Wong Halves)', () => {
      const cards = seq('2', '6'); // +0.5 + 1 = +1.5
      const result = engine.evaluate(cards, 1.5, WONG_HALVES);
      expect(result.correctRunningCount).toBe(1.5);
      expect(result.userRunningCount).toBe(1.5);
      expect(result.isCorrect).toBe(true);
    });

    it('rejects an integer answer when the true running count is fractional (Wong Halves)', () => {
      const cards = seq('2', '6'); // +1.5
      const result = engine.evaluate(cards, 2, WONG_HALVES);
      expect(result.correctRunningCount).toBe(1.5);
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

    it('derives the true count from a level-2 running count (Omega II, balanced)', () => {
      // 4(+2) 5(+2) 6(+2) => running +6; over 2 decks => true count 3
      const cards = seq('4', '5', '6');
      const result = engine.evaluateTrueCount(cards, 3, 2, OMEGA_II);
      expect(result.correctRunningCount).toBe(6);
      expect(result.correctTrueCount).toBe(3);
      expect(result.isCorrect).toBe(true);
    });

    it('derives an integer true count from a fractional running count (Wong Halves)', () => {
      // 5(+1.5) 5(+1.5) 4(+1) 3(+1) => running +5; over 2 decks => trunc(2.5) = 2
      const cards = seq('5', '5', '4', '3');
      const result = engine.evaluateTrueCount(cards, 2, 2, WONG_HALVES);
      expect(result.correctRunningCount).toBe(5);
      expect(result.correctTrueCount).toBe(2);
      expect(result.isCorrect).toBe(true);
    });

    it('truncates a fractional running count toward zero for the true count (Wong Halves)', () => {
      // 5(+1.5) 5(+1.5) 2(+0.5) => running +3.5; over 1 deck => trunc(3.5) = 3
      const cards = seq('5', '5', '2');
      const result = engine.evaluateTrueCount(cards, 3, 1, WONG_HALVES);
      expect(result.correctRunningCount).toBe(3.5);
      expect(result.correctTrueCount).toBe(3);
      expect(result.isCorrect).toBe(true);
    });

    it('defaults priorRunningCount to 0 (classic single-round behavior)', () => {
      const cards = seq('2', '3', '4', '5', '6'); // +5
      const result = engine.evaluateTrueCount(cards, 2, 2, HI_LO);
      expect(result.priorRunningCount).toBe(0);
      expect(result.correctRunningCount).toBe(5);
    });

    it('folds priorRunningCount into the running count for a persistent shoe', () => {
      // Prior +4 carried over; this round 2(+1) 3(+1) => +2; total +6 over 2 decks => 3.
      const cards = seq('2', '3');
      const result = engine.evaluateTrueCount(cards, 3, 2, HI_LO, 4);
      expect(result.priorRunningCount).toBe(4);
      expect(result.correctRunningCount).toBe(6);
      expect(result.correctTrueCount).toBe(3);
      expect(result.isCorrect).toBe(true);
    });
  });

  describe('scoreDeckEstimate()', () => {
    it('accepts an exact match', () => {
      expect(engine.scoreDeckEstimate(5, 5)).toBe(true);
    });

    it('accepts an estimate at the ±0.5 boundary', () => {
      expect(engine.scoreDeckEstimate(5, 5.5)).toBe(true);
      expect(engine.scoreDeckEstimate(6, 5.5)).toBe(true);
    });

    it('rejects an estimate outside the ±0.5 band', () => {
      expect(engine.scoreDeckEstimate(5, 5.51)).toBe(false);
      expect(engine.scoreDeckEstimate(4, 5)).toBe(false);
    });

    it('tolerates floating-point decks-remaining values (cards / 52)', () => {
      const actual = 260 / 52; // exactly 5, but exercises the division path
      expect(engine.scoreDeckEstimate(5, actual)).toBe(true);
      const messy = 290 / 52; // ≈ 5.5769
      expect(engine.scoreDeckEstimate(5.5, messy)).toBe(true);
      expect(engine.scoreDeckEstimate(5, messy)).toBe(false);
    });

    it('honors a custom tolerance band', () => {
      expect(engine.scoreDeckEstimate(5, 5.2, 0.25)).toBe(true);
      expect(engine.scoreDeckEstimate(5, 5.4, 0.25)).toBe(false);
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
      const v = engine.validateSettings(rcSettings({ numberOfCards: MAX_CARDS_PER_DRILL }));
      expect(v.valid).toBe(true);
    });

    it('rejects card counts above MAX_CARDS_PER_DRILL', () => {
      const v = engine.validateSettings(rcSettings({ numberOfCards: MAX_CARDS_PER_DRILL + 1 }));
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
      const v = engine.validateSettings(tcSettings({ decksRemaining: Number.POSITIVE_INFINITY }));
      expect(v.valid).toBe(false);
    });

    it('classic true-count mode ignores shoe config (bad decks/penetration are fine)', () => {
      const v = engine.validateSettings(tcSettings({ numberOfDecks: 3, penetration: 2 }));
      expect(v.valid).toBe(true);
    });

    it('accepts valid live-shoe settings', () => {
      const v = engine.validateSettings(liveSettings());
      expect(v.valid).toBe(true);
      expect(v.errors).toEqual([]);
    });

    it('live-shoe mode ignores decksRemaining (the live shoe supplies it)', () => {
      const v = engine.validateSettings(liveSettings({ decksRemaining: 0 }));
      expect(v.valid).toBe(true);
    });

    it('live-shoe mode rejects a deck count outside 1/2/6/8', () => {
      const v = engine.validateSettings(liveSettings({ numberOfDecks: 4 }));
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes('Number of decks'))).toBe(true);
    });

    it('live-shoe mode accepts each supported deck count', () => {
      for (const decks of [1, 2, 6, 8]) {
        const v = engine.validateSettings(liveSettings({ numberOfDecks: decks }));
        expect(v.valid).toBe(true);
      }
    });

    it('live-shoe mode rejects penetration below 50%', () => {
      const v = engine.validateSettings(liveSettings({ penetration: 0.4 }));
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes('Penetration'))).toBe(true);
    });

    it('live-shoe mode rejects penetration above 90%', () => {
      const v = engine.validateSettings(liveSettings({ penetration: 0.95 }));
      expect(v.valid).toBe(false);
    });

    it('live-shoe mode accepts the 50% and 90% boundaries', () => {
      expect(engine.validateSettings(liveSettings({ penetration: 0.5 })).valid).toBe(true);
      expect(engine.validateSettings(liveSettings({ penetration: 0.9 })).valid).toBe(true);
    });

    it('live-shoe mode rejects a card count larger than the shoe', () => {
      // 1-deck shoe holds 52 cards; asking for 60 cannot be dealt without replacement.
      const v = engine.validateSettings(liveSettings({ numberOfDecks: 1, numberOfCards: 60 }));
      expect(v.valid).toBe(false);
      expect(v.errors.some((e) => e.includes('shoe size'))).toBe(true);
    });

    it('live-shoe mode accepts a card count up to exactly the shoe size', () => {
      const v = engine.validateSettings(liveSettings({ numberOfDecks: 1, numberOfCards: 52 }));
      expect(v.valid).toBe(true);
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

  describe('isValidDecimalAnswer()', () => {
    it('accepts integers and half-point decimals, signed or not', () => {
      expect(engine.isValidDecimalAnswer('0')).toBe(true);
      expect(engine.isValidDecimalAnswer('5')).toBe(true);
      expect(engine.isValidDecimalAnswer('-5')).toBe(true);
      expect(engine.isValidDecimalAnswer('2.5')).toBe(true);
      expect(engine.isValidDecimalAnswer('-0.5')).toBe(true);
      expect(engine.isValidDecimalAnswer('  1.5  ')).toBe(true);
    });

    it('rejects empty, non-numeric, and malformed input', () => {
      expect(engine.isValidDecimalAnswer('')).toBe(false);
      expect(engine.isValidDecimalAnswer('abc')).toBe(false);
      expect(engine.isValidDecimalAnswer('+')).toBe(false);
      expect(engine.isValidDecimalAnswer('--3')).toBe(false);
      expect(engine.isValidDecimalAnswer('.5')).toBe(false);
      expect(engine.isValidDecimalAnswer('2.')).toBe(false);
      expect(engine.isValidDecimalAnswer('1.2.3')).toBe(false);
    });
  });

  describe('isFractionalSystem()', () => {
    it('is true for Wong Halves (half-point values)', () => {
      expect(engine.isFractionalSystem(WONG_HALVES)).toBe(true);
    });

    it('is false for the integer systems (Hi-Lo, KO, Omega II)', () => {
      expect(engine.isFractionalSystem(HI_LO)).toBe(false);
      expect(engine.isFractionalSystem(KO)).toBe(false);
      expect(engine.isFractionalSystem(OMEGA_II)).toBe(false);
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
