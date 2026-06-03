import { BasicStrategyEngineService, type EngineInput } from './basic-strategy-engine.service';
import type { Card, Rank, Suit } from '../models/card.model';
import type { EngineOptions, RuleSet } from '../models/strategy.model';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const baseOptions: EngineOptions = {
  doubleAfterSplit: false,
  lateSurrender: false,
};

const scenario = (
  c1: Rank,
  c2: Rank,
  up: Rank,
  ruleSet: RuleSet = 'S17',
  options: Partial<EngineOptions> = {},
): EngineInput => ({
  player: [card(c1), card(c2)],
  dealerUpcard: card(up),
  ruleSet,
  options: { ...baseOptions, ...options },
});

describe('BasicStrategyEngineService', () => {
  let engine: BasicStrategyEngineService;
  beforeEach(() => {
    engine = new BasicStrategyEngineService();
  });

  // ─── Insurance ─────────────────────────────────────────────────────────
  describe('Insurance', () => {
    it('is always incorrect, regardless of hand', () => {
      const samples = [
        scenario('A', 'A', 'A'),
        scenario('10', '10', 'A'),
        scenario('5', '6', '5'),
        scenario('8', '8', 'A', 'H17'),
        scenario('K', 'Q', '2'),
      ];
      for (const sc of samples) {
        const r = engine.evaluate(sc, 'INS');
        expect(r.correct).toBe(false);
        expect(r.source).toBe('insurance');
      }
    });

    it('exposes the actual correct action when user selected Insurance', () => {
      const r = engine.evaluate(scenario('10', '6', '5'), 'INS');
      // S17 hard 16 vs 5 → Stand.
      expect(r.action).toBe('S');
    });
  });

  // ─── Hard total lookup ─────────────────────────────────────────────────
  describe('Hard total lookup', () => {
    it('Hard 11 vs 10 → Double (both rule sets)', () => {
      expect(engine.decide(scenario('7', '4', '10', 'S17')).action).toBe('D');
      expect(engine.decide(scenario('7', '4', '10', 'H17')).action).toBe('D');
    });

    it('Hard 12 vs 4 → Stand', () => {
      const r = engine.decide(scenario('7', '5', '4'));
      expect(r.action).toBe('S');
      expect(r.handDescription).toBe('Hard 12');
    });

    it('Hard 16 vs 10 with no Late Surrender → Hit', () => {
      const r = engine.decide(scenario('10', '6', '10'));
      expect(r.action).toBe('H');
      expect(r.source).toBe('hard');
    });

    it('Hard 8 vs 6 → Hit (low totals all hit)', () => {
      expect(engine.decide(scenario('3', '5', '6')).action).toBe('H');
    });

    it('Hard 4 (from 2,2 pair fall-through with no DAS) → Hit', () => {
      const r = engine.decide(scenario('2', '2', '8'));
      // S17 pair 2,2 vs 8 = N → falls through to hard 4 → always Hit.
      expect(r.action).toBe('H');
      expect(r.handDescription).toBe('Hard 4');
    });
  });

  // ─── Soft total lookup ─────────────────────────────────────────────────
  describe('Soft total lookup', () => {
    it('Soft 18 (A,7) vs 3 in S17 → Double', () => {
      const r = engine.decide(scenario('A', '7', '3', 'S17'));
      expect(r.action).toBe('D');
      expect(r.handDescription).toBe('Soft 18 (A, 7)');
    });

    it('Soft 17 (A,6) vs 7 → Hit', () => {
      expect(engine.decide(scenario('A', '6', '7')).action).toBe('H');
    });

    it('Soft 20 (A,9) vs 6 → Stand', () => {
      expect(engine.decide(scenario('A', '9', '6')).action).toBe('S');
    });

    it('A first or second card order does not affect lookup', () => {
      expect(engine.decide(scenario('A', '7', '3', 'S17')).action).toBe('D');
      expect(engine.decide(scenario('7', 'A', '3', 'S17')).action).toBe('D');
    });
  });

  // ─── Pair splitting lookup ─────────────────────────────────────────────
  describe('Pair splitting', () => {
    it('Pair of 8s vs 10 → Split', () => {
      const r = engine.decide(scenario('8', '8', '10'));
      expect(r.action).toBe('P');
      expect(r.source).toBe('pair');
    });

    it('Pair of Aces vs 10 → Split', () => {
      expect(engine.decide(scenario('A', 'A', '10')).action).toBe('P');
    });

    it('Pair of 5s vs 6 → Double (resolves as hard 10, never splits)', () => {
      const r = engine.decide(scenario('5', '5', '6'));
      expect(r.action).toBe('D');
      expect(r.source).toBe('hard');
    });

    it('Pair of 10s vs 5 → Stand (resolves as hard 20)', () => {
      const r = engine.decide(scenario('10', '10', '5'));
      expect(r.action).toBe('S');
      expect(r.source).toBe('hard');
    });

    it('Pair of 9s vs 7 → Stand (chart says Do Not Split → falls through to hard 18)', () => {
      const r = engine.decide(scenario('9', '9', '7'));
      expect(r.action).toBe('S');
      expect(r.source).toBe('hard');
    });
  });

  // ─── Late Surrender ───────────────────────────────────────────────────
  describe('Late Surrender toggle', () => {
    it('Hard 16 vs 10 in S17: SUR when LS enabled, H when disabled', () => {
      expect(engine.decide(scenario('10', '6', '10', 'S17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '6', '10', 'S17', { lateSurrender: false })).action).toBe(
        'H',
      );
    });

    it('Hard 15 vs 10 in S17: SUR when LS enabled, H when disabled', () => {
      expect(engine.decide(scenario('10', '5', '10', 'S17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '5', '10', 'S17', { lateSurrender: false })).action).toBe(
        'H',
      );
    });

    it('Hard 17 vs A in H17: SUR when LS enabled, S when disabled', () => {
      expect(engine.decide(scenario('10', '7', 'A', 'H17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '7', 'A', 'H17', { lateSurrender: false })).action).toBe(
        'S',
      );
    });

    it('Pair 8,8 vs A in H17: SUR when LS enabled, Split when disabled', () => {
      expect(engine.decide(scenario('8', '8', 'A', 'H17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('8', '8', 'A', 'H17', { lateSurrender: false })).action).toBe(
        'P',
      );
    });
  });

  // ─── Double After Split ───────────────────────────────────────────────
  describe('Double After Split toggle (Y/N pair cells)', () => {
    it('2,2 vs 2 in S17 with DAS → Split', () => {
      expect(engine.decide(scenario('2', '2', '2', 'S17', { doubleAfterSplit: true })).action).toBe(
        'P',
      );
    });

    it('2,2 vs 2 in S17 without DAS → falls through to hard total (Hit)', () => {
      const r = engine.decide(scenario('2', '2', '2', 'S17', { doubleAfterSplit: false }));
      expect(r.action).toBe('H');
      expect(r.source).toBe('hard');
    });

    it('4,4 vs 5 with DAS → Split; without DAS → falls through to hard 8 (Hit)', () => {
      expect(engine.decide(scenario('4', '4', '5', 'S17', { doubleAfterSplit: true })).action).toBe(
        'P',
      );
      expect(
        engine.decide(scenario('4', '4', '5', 'S17', { doubleAfterSplit: false })).action,
      ).toBe('H');
    });

    it('6,6 vs 2 with DAS → Split; without DAS → hard 12 (Hit vs 2)', () => {
      expect(engine.decide(scenario('6', '6', '2', 'S17', { doubleAfterSplit: true })).action).toBe(
        'P',
      );
      expect(
        engine.decide(scenario('6', '6', '2', 'S17', { doubleAfterSplit: false })).action,
      ).toBe('H');
    });
  });

  // ─── Face card normalization ──────────────────────────────────────────
  describe('Face card normalization', () => {
    it('J in player hand counts as 10 for hard total', () => {
      const r = engine.decide(scenario('J', '6', '5'));
      expect(r.handDescription).toBe('Hard 16');
    });

    it('Q dealer upcard normalizes to 10', () => {
      const r = engine.decide(scenario('10', '6', 'Q'));
      // Effectively hard 16 vs 10 in S17 with no LS → Hit
      expect(r.action).toBe('H');
    });

    it('K+Q is a pair of ten-value cards (chart row "10")', () => {
      const r = engine.decide(scenario('K', 'Q', '5'));
      // Pair 10 chart row is N everywhere → hard 20 → Stand.
      expect(r.action).toBe('S');
      expect(r.handDescription).toBe('Hard 20');
    });

    it('10+J also treated as ten-pair fall-through', () => {
      expect(engine.decide(scenario('10', 'J', '5')).action).toBe('S');
    });
  });

  // ─── H17 vs S17 differences ───────────────────────────────────────────
  describe('H17 vs S17 chart differences', () => {
    it('Hard 11 vs A: D in H17, H in S17', () => {
      expect(engine.decide(scenario('7', '4', 'A', 'H17')).action).toBe('D');
      expect(engine.decide(scenario('7', '4', 'A', 'S17')).action).toBe('H');
    });

    it('Hard 15 vs A: SUR in H17 (with LS), H in S17', () => {
      expect(engine.decide(scenario('10', '5', 'A', 'H17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '5', 'A', 'S17', { lateSurrender: true })).action).toBe(
        'H',
      );
    });

    it('Hard 16 vs A: SUR in both rule sets when LS enabled; H when LS disabled', () => {
      // Per BJA 2024 S17/H17 charts, the LS overlay includes 16 v A in
      // both rule sets. Without LS, 16 v A reverts to Hit per the hard chart.
      expect(engine.decide(scenario('10', '6', 'A', 'H17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '6', 'A', 'S17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '6', 'A', 'H17', { lateSurrender: false })).action).toBe(
        'H',
      );
      expect(engine.decide(scenario('10', '6', 'A', 'S17', { lateSurrender: false })).action).toBe(
        'H',
      );
    });

    it('Hard 17 vs A: SUR_S in H17 (with LS), S in S17', () => {
      expect(engine.decide(scenario('10', '7', 'A', 'H17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('10', '7', 'A', 'S17', { lateSurrender: true })).action).toBe(
        'S',
      );
    });

    it('Soft A,7 vs 2: Double in H17, Stand in S17', () => {
      expect(engine.decide(scenario('A', '7', '2', 'H17')).action).toBe('D');
      expect(engine.decide(scenario('A', '7', '2', 'S17')).action).toBe('S');
    });

    it('Soft A,8 vs 6: Double in H17, Stand in S17', () => {
      expect(engine.decide(scenario('A', '8', '6', 'H17')).action).toBe('D');
      expect(engine.decide(scenario('A', '8', '6', 'S17')).action).toBe('S');
    });

    it('Pair 8,8 vs A in H17 with LS: SUR; in S17: Split', () => {
      expect(engine.decide(scenario('8', '8', 'A', 'H17', { lateSurrender: true })).action).toBe(
        'SUR',
      );
      expect(engine.decide(scenario('8', '8', 'A', 'S17', { lateSurrender: true })).action).toBe(
        'P',
      );
    });
  });

  // ─── Blackjack ────────────────────────────────────────────────────────
  describe('Blackjack', () => {
    it('A+10 returns Stand with "Blackjack" description', () => {
      const r = engine.decide(scenario('A', '10', '5'));
      expect(r.action).toBe('S');
      expect(r.handDescription).toContain('Blackjack');
    });

    it('A+K (face) also recognized as Blackjack', () => {
      const r = engine.decide(scenario('A', 'K', '5'));
      expect(r.action).toBe('S');
      expect(r.handDescription).toContain('Blackjack');
    });
  });

  // ─── evaluate() correctness ───────────────────────────────────────────
  describe('evaluate()', () => {
    it('marks user action correct when matching engine decision', () => {
      const sc = scenario('10', '6', '5'); // hard 16 vs 5 → Stand
      const r = engine.evaluate(sc, 'S');
      expect(r.correct).toBe(true);
      expect(r.action).toBe('S');
    });

    it('marks user action incorrect and surfaces the correct action', () => {
      const sc = scenario('10', '6', '5');
      const r = engine.evaluate(sc, 'H');
      expect(r.correct).toBe(false);
      expect(r.action).toBe('S');
    });
  });
});
