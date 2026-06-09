import type { Card, Rank, Suit } from '../models/card.model';
import type { DeviationRule } from '../models/deviation.model';
import type { EngineOptions, RuleSet } from '../models/strategy.model';
import { BasicStrategyEngineService, type EngineInput } from './basic-strategy-engine.service';
import {
  DeviationEngineService,
  classifyForDeviation,
  deviationsFor,
} from './deviation-engine.service';

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

// Synthetic rules used for direction tests — keep these isolated from the
// real chart data so threshold semantics can be tested without coupling to
// any specific charted index.
const synthetic = (overrides: Partial<DeviationRule>): DeviationRule => ({
  ruleSet: 'S17',
  category: 'hard',
  playerHand: '99',
  playerHandLabel: 'Hard 99',
  dealerUpcard: '5',
  index: 0,
  direction: 'at-or-above',
  basicAction: 'H',
  deviationAction: 'S',
  source: 'synthetic',
  ...overrides,
});

describe('DeviationEngineService', () => {
  let engine: DeviationEngineService;
  beforeEach(() => {
    engine = new DeviationEngineService(new BasicStrategyEngineService());
  });

  // ─── Threshold direction semantics ────────────────────────────────────
  describe('isDeviationThresholdMet — direction semantics', () => {
    it('at-or-above: met when TC >= index', () => {
      const rule = synthetic({ direction: 'at-or-above', index: 3 });
      expect(engine.isDeviationThresholdMet(rule, 2)).toBe(false);
      expect(engine.isDeviationThresholdMet(rule, 3)).toBe(true);
      expect(engine.isDeviationThresholdMet(rule, 4)).toBe(true);
    });

    it('at-or-below: met when TC <= index', () => {
      const rule = synthetic({ direction: 'at-or-below', index: -1 });
      expect(engine.isDeviationThresholdMet(rule, 0)).toBe(false);
      expect(engine.isDeviationThresholdMet(rule, -1)).toBe(true);
      expect(engine.isDeviationThresholdMet(rule, -2)).toBe(true);
    });

    it('positive: met when TC > 0 (strict, ignores index)', () => {
      const rule = synthetic({ direction: 'positive', index: 0 });
      expect(engine.isDeviationThresholdMet(rule, 0)).toBe(false);
      expect(engine.isDeviationThresholdMet(rule, 1)).toBe(true);
      expect(engine.isDeviationThresholdMet(rule, -1)).toBe(false);
    });

    it('negative: met when TC < 0 (strict, ignores index)', () => {
      const rule = synthetic({ direction: 'negative', index: 0 });
      expect(engine.isDeviationThresholdMet(rule, 0)).toBe(false);
      expect(engine.isDeviationThresholdMet(rule, -1)).toBe(true);
      expect(engine.isDeviationThresholdMet(rule, 1)).toBe(false);
    });
  });

  // ─── findDeviationRule lookup ─────────────────────────────────────────
  describe('findDeviationRule', () => {
    it('returns the matching rule when one exists', () => {
      const rule = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'hard',
        playerHand: '16',
        dealerUpcard: '10',
      });
      expect(rule?.deviationAction).toBe('S');
      expect(rule?.index).toBe(0);
    });

    it('returns undefined when no rule matches the upcard', () => {
      const rule = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'hard',
        playerHand: '16',
        dealerUpcard: '7',
      });
      expect(rule).toBeUndefined();
    });

    it('returns undefined when no rule matches the hand', () => {
      const rule = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'hard',
        playerHand: '5',
        dealerUpcard: '10',
      });
      expect(rule).toBeUndefined();
    });

    it('respects category — surrender deviations live in their own category', () => {
      // 16 v 8 has a surrender deviation but no regular hard-deviation rule.
      expect(
        engine.findDeviationRule({
          ruleSet: 'S17',
          category: 'hard',
          playerHand: '16',
          dealerUpcard: '8',
        }),
      ).toBeUndefined();
      const surrenderRule = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'surrender',
        playerHand: '16',
        dealerUpcard: '8',
      });
      expect(surrenderRule?.deviationAction).toBe('SUR');
      expect(surrenderRule?.index).toBe(4);
    });
  });

  // ─── resolveDeviationDecision: no match path ──────────────────────────
  describe('resolveDeviationDecision — no matching rule', () => {
    it('hand with no deviation returns basic strategy unchanged at any TC', () => {
      // Hard 7 vs 6: always Hit, no deviation rule.
      for (const tc of [-10, -3, 0, 3, 10]) {
        const decision = engine.resolveDeviationDecision(scenario('3', '4', '6'), tc);
        expect(decision.basicAction).toBe('H');
        expect(decision.finalAction).toBe('H');
        expect(decision.deviationApplied).toBe(false);
        expect(decision.trueCount).toBe(tc);
      }
    });
  });

  // ─── resolveDeviationDecision: threshold edge cases ───────────────────
  describe('resolveDeviationDecision — threshold edges', () => {
    it('16 v 10 below 0 — basic strategy stands (no deviation applied)', () => {
      // basic action for 16 v 10 (no LS) is Hit.
      const decision = engine.resolveDeviationDecision(scenario('10', '6', '10'), -1);
      expect(decision.basicAction).toBe('H');
      expect(decision.finalAction).toBe('H');
      expect(decision.deviationApplied).toBe(false);
      // Candidate rule should still be surfaced for UI hints.
      expect(decision.matchedRule?.deviationAction).toBe('S');
    });

    it('16 v 10 at TC 0 — deviation kicks in (boundary inclusive)', () => {
      const decision = engine.resolveDeviationDecision(scenario('10', '6', '10'), 0);
      expect(decision.basicAction).toBe('H');
      expect(decision.finalAction).toBe('S');
      expect(decision.deviationApplied).toBe(true);
      expect(decision.matchedRule?.source).toContain('16 v 10');
    });

    it('16 v 10 well above threshold also applies deviation', () => {
      const decision = engine.resolveDeviationDecision(scenario('10', '6', '10'), 5);
      expect(decision.finalAction).toBe('S');
      expect(decision.deviationApplied).toBe(true);
    });

    it('15 v 10 — applies only at TC >= +4', () => {
      const at3 = engine.resolveDeviationDecision(scenario('10', '5', '10'), 3);
      expect(at3.finalAction).toBe('H');
      expect(at3.deviationApplied).toBe(false);

      const at4 = engine.resolveDeviationDecision(scenario('10', '5', '10'), 4);
      expect(at4.finalAction).toBe('S');
      expect(at4.deviationApplied).toBe(true);
    });

    it('12 v 3 — stand at +2 (at-or-above boundary)', () => {
      const at1 = engine.resolveDeviationDecision(scenario('7', '5', '3'), 1);
      expect(at1.finalAction).toBe('H');
      const at2 = engine.resolveDeviationDecision(scenario('7', '5', '3'), 2);
      expect(at2.finalAction).toBe('S');
      expect(at2.deviationApplied).toBe(true);
    });

    it('12 v 2 — stand at +3', () => {
      const at2 = engine.resolveDeviationDecision(scenario('7', '5', '2'), 2);
      expect(at2.finalAction).toBe('H');
      const at3 = engine.resolveDeviationDecision(scenario('7', '5', '2'), 3);
      expect(at3.finalAction).toBe('S');
    });

    it('12 v 4 — at-or-below 0 (negative-side deviation)', () => {
      // Basic strategy stands 12 v 4. At TC <= 0 the deviation says hit.
      const at1 = engine.resolveDeviationDecision(scenario('7', '5', '4'), 1);
      expect(at1.basicAction).toBe('S');
      expect(at1.finalAction).toBe('S');

      const at0 = engine.resolveDeviationDecision(scenario('7', '5', '4'), 0);
      expect(at0.finalAction).toBe('H');
      expect(at0.deviationApplied).toBe(true);

      const atNegOne = engine.resolveDeviationDecision(scenario('7', '5', '4'), -1);
      expect(atNegOne.finalAction).toBe('H');
    });

    it('13 v 2 — hit at TC <= -1', () => {
      const at0 = engine.resolveDeviationDecision(scenario('8', '5', '2'), 0);
      expect(at0.finalAction).toBe('S');
      const atNeg1 = engine.resolveDeviationDecision(scenario('8', '5', '2'), -1);
      expect(atNeg1.finalAction).toBe('H');
      expect(atNeg1.deviationApplied).toBe(true);
    });
  });

  // ─── Known common deviations called out by the brief ───────────────────
  describe('common deviations called out by the brief', () => {
    it('16 v 10 at 0+ — deviate to Stand', () => {
      const decision = engine.resolveDeviationDecision(scenario('10', '6', '10'), 0);
      expect(decision.finalAction).toBe('S');
    });

    it('15 v 10 at +4 — deviate to Stand', () => {
      const decision = engine.resolveDeviationDecision(scenario('10', '5', '10'), 4);
      expect(decision.finalAction).toBe('S');
    });

    it('10 v A at +4 — deviate to Double (S17 hits 10 v A in BS)', () => {
      const below = engine.resolveDeviationDecision(scenario('7', '3', 'A', 'S17'), 3);
      expect(below.basicAction).toBe('H');
      expect(below.finalAction).toBe('H');
      const above = engine.resolveDeviationDecision(scenario('7', '3', 'A', 'S17'), 4);
      expect(above.finalAction).toBe('D');
      expect(above.deviationApplied).toBe(true);
    });

    it('insurance at +3 — applies (insurance path)', () => {
      const below = engine.resolveInsuranceDecision(2, 'S17');
      expect(below.finalAction).toBe('H'); // decline
      expect(below.deviationApplied).toBe(false);
      const at = engine.resolveInsuranceDecision(3, 'S17');
      expect(at.finalAction).toBe('INS');
      expect(at.deviationApplied).toBe(true);
      expect(at.matchedRule?.category).toBe('insurance');
    });

    it('insurance at +3 — also applies under H17', () => {
      const at = engine.resolveInsuranceDecision(3, 'H17');
      expect(at.finalAction).toBe('INS');
      expect(at.deviationApplied).toBe(true);
    });
  });

  // ─── H17 vs S17 chart divergence ──────────────────────────────────────
  describe('H17 vs S17 differences', () => {
    it('11 v A double @ +1 is encoded in S17 but not H17', () => {
      const s17 = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'hard',
        playerHand: '11',
        dealerUpcard: 'A',
      });
      const h17 = engine.findDeviationRule({
        ruleSet: 'H17',
        category: 'hard',
        playerHand: '11',
        dealerUpcard: 'A',
      });
      expect(s17?.deviationAction).toBe('D');
      expect(h17).toBeUndefined(); // BS already doubles 11 v A in H17
    });

    it('S17 11 v A at +1 — basic Hit becomes Double', () => {
      const above = engine.resolveDeviationDecision(scenario('7', '4', 'A', 'S17'), 1);
      expect(above.basicAction).toBe('H');
      expect(above.finalAction).toBe('D');
      expect(above.deviationApplied).toBe(true);
    });

    it('H17 11 v A at +1 — already doubles via BS (no deviation applied)', () => {
      const decision = engine.resolveDeviationDecision(scenario('7', '4', 'A', 'H17'), 1);
      expect(decision.basicAction).toBe('D');
      expect(decision.finalAction).toBe('D');
      expect(decision.deviationApplied).toBe(false);
    });

    it('S17 and H17 share Illustrious 18 entries (16 v 10 stand @ 0+)', () => {
      const s17 = engine.resolveDeviationDecision(scenario('10', '6', '10', 'S17'), 0);
      const h17 = engine.resolveDeviationDecision(scenario('10', '6', '10', 'H17'), 0);
      expect(s17.finalAction).toBe('S');
      expect(h17.finalAction).toBe('S');
    });

    it('10 v A: S17 deviates at +4, H17 deviates at +3', () => {
      const s17 = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'hard',
        playerHand: '10',
        dealerUpcard: 'A',
      });
      const h17 = engine.findDeviationRule({
        ruleSet: 'H17',
        category: 'hard',
        playerHand: '10',
        dealerUpcard: 'A',
      });
      expect(s17?.index).toBe(4);
      expect(h17?.index).toBe(3);
      // At TC=+3, only H17 deviates.
      const s17At3 = engine.resolveDeviationDecision(scenario('7', '3', 'A', 'S17'), 3);
      const h17At3 = engine.resolveDeviationDecision(scenario('7', '3', 'A', 'H17'), 3);
      expect(s17At3.finalAction).toBe('H');
      expect(h17At3.finalAction).toBe('D');
    });

    it('16 v A stand @ +3 is H17-only (S17 chart has no deviation)', () => {
      expect(
        engine.findDeviationRule({
          ruleSet: 'S17',
          category: 'hard',
          playerHand: '16',
          dealerUpcard: 'A',
        }),
      ).toBeUndefined();
      const h17 = engine.findDeviationRule({
        ruleSet: 'H17',
        category: 'hard',
        playerHand: '16',
        dealerUpcard: 'A',
      });
      expect(h17?.index).toBe(3);
      expect(h17?.deviationAction).toBe('S');
    });

    it('15 v A stand @ +5 is H17-only (S17 chart has no deviation)', () => {
      expect(
        engine.findDeviationRule({
          ruleSet: 'S17',
          category: 'hard',
          playerHand: '15',
          dealerUpcard: 'A',
        }),
      ).toBeUndefined();
      const h17 = engine.findDeviationRule({
        ruleSet: 'H17',
        category: 'hard',
        playerHand: '15',
        dealerUpcard: 'A',
      });
      expect(h17?.index).toBe(5);
      expect(h17?.deviationAction).toBe('S');
    });

    it('A,8 v 6 — S17 upgrades to D at +1, H17 downgrades Ds → S at 0-', () => {
      const s17 = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'soft',
        playerHand: '19',
        dealerUpcard: '6',
      });
      const h17 = engine.findDeviationRule({
        ruleSet: 'H17',
        category: 'soft',
        playerHand: '19',
        dealerUpcard: '6',
      });
      expect(s17?.deviationAction).toBe('D');
      expect(s17?.index).toBe(1);
      expect(s17?.direction).toBe('at-or-above');
      expect(h17?.deviationAction).toBe('S');
      expect(h17?.index).toBe(0);
      expect(h17?.direction).toBe('at-or-below');
    });
  });

  // ─── Surrender overlay ────────────────────────────────────────────────
  describe('surrender overlay (BJA Late Surrender chart)', () => {
    it('16 v 8 surrender @ +4 — Hit below threshold, SUR at/above', () => {
      const below = engine.resolveDeviationDecision(scenario('10', '6', '8'), 3);
      expect(below.basicAction).toBe('H');
      expect(below.finalAction).toBe('H');
      expect(below.deviationApplied).toBe(false);

      const at = engine.resolveDeviationDecision(scenario('10', '6', '8'), 4);
      expect(at.finalAction).toBe('SUR');
      expect(at.deviationApplied).toBe(true);
      expect(at.matchedRule?.category).toBe('surrender');
    });

    it('15 v 9 surrender @ +2', () => {
      const below = engine.resolveDeviationDecision(scenario('10', '5', '9'), 1);
      expect(below.finalAction).toBe('H');
      const at = engine.resolveDeviationDecision(scenario('10', '5', '9'), 2);
      expect(at.finalAction).toBe('SUR');
    });

    it('15 v A surrender @ +2 (S17)', () => {
      const below = engine.resolveDeviationDecision(scenario('10', '5', 'A', 'S17'), 1);
      expect(below.finalAction).toBe('H');
      const at = engine.resolveDeviationDecision(scenario('10', '5', 'A', 'S17'), 2);
      expect(at.finalAction).toBe('SUR');
    });

    it('15 v A surrender @ -1+ (H17) — applies at TC >= -1', () => {
      const at = engine.resolveDeviationDecision(scenario('10', '5', 'A', 'H17'), -1);
      expect(at.finalAction).toBe('SUR');
      expect(at.matchedRule?.category).toBe('surrender');
      const below = engine.resolveDeviationDecision(scenario('10', '5', 'A', 'H17'), -2);
      expect(below.finalAction).toBe('H');
    });

    it('16 v 9 surrender @ -1- — applies at TC <= -1 (negative-direction rule)', () => {
      const at = engine.resolveDeviationDecision(scenario('10', '6', '9'), -1);
      expect(at.finalAction).toBe('SUR');
      expect(at.matchedRule?.category).toBe('surrender');
      // Above the threshold, the hard-stand deviation at +4 still applies.
      const above = engine.resolveDeviationDecision(scenario('10', '6', '9'), 4);
      expect(above.finalAction).toBe('S');
    });
  });

  // ─── Surrender precedence over natural-category deviations ────────────
  // Engine ordering check: when basic strategy itself already returns SUR
  // (LS enabled + a SUR_* chart cell), a same-hand hard/soft/pair deviation
  // must not downgrade the play. With LS off, the natural deviation still
  // applies because basic returns H, not SUR.
  describe('surrender precedence over hard/soft/pair deviations', () => {
    it('LS on: 16 v 10 basic SUR is not overridden by hard 16 v 10 stand @ 0+', () => {
      const decision = engine.resolveDeviationDecision(
        scenario('10', '6', '10', 'S17', { lateSurrender: true }),
        0,
      );
      expect(decision.basicAction).toBe('SUR');
      expect(decision.finalAction).toBe('SUR');
      expect(decision.deviationApplied).toBe(false);
    });

    it('LS on: 16 v 10 SUR holds across the full positive TC range', () => {
      for (const tc of [0, 1, 4, 10]) {
        const decision = engine.resolveDeviationDecision(
          scenario('10', '6', '10', 'S17', { lateSurrender: true }),
          tc,
        );
        expect(decision.finalAction).toBe('SUR');
        expect(decision.deviationApplied).toBe(false);
      }
    });

    it('LS off: 16 v 10 at TC 0+ still applies the hard stand deviation', () => {
      const decision = engine.resolveDeviationDecision(
        scenario('10', '6', '10', 'S17', { lateSurrender: false }),
        0,
      );
      expect(decision.basicAction).toBe('H');
      expect(decision.finalAction).toBe('S');
      expect(decision.deviationApplied).toBe(true);
      expect(decision.matchedRule?.category).toBe('hard');
    });

    it('LS on H17: 16 v 9 basic SUR is not overridden by hard 16 v 9 stand @ +4', () => {
      // Without the precedence guard, +4 would flip SUR → S via the hard rule.
      const decision = engine.resolveDeviationDecision(
        scenario('10', '6', '9', 'H17', { lateSurrender: true }),
        4,
      );
      expect(decision.basicAction).toBe('SUR');
      expect(decision.finalAction).toBe('SUR');
      expect(decision.deviationApplied).toBe(false);
    });

    it('LS off H17: 16 v 9 at TC +4 still applies hard stand deviation', () => {
      const decision = engine.resolveDeviationDecision(
        scenario('10', '6', '9', 'H17', { lateSurrender: false }),
        4,
      );
      expect(decision.basicAction).toBe('H');
      expect(decision.finalAction).toBe('S');
      expect(decision.deviationApplied).toBe(true);
    });

    it('LS on H17: 8,8 v A basic SUR is not overridden by pair lookup', () => {
      // Pair 8,8 vs A in H17 is SUR_Y (SUR with LS; Split without).
      const decision = engine.resolveDeviationDecision(
        scenario('8', '8', 'A', 'H17', { lateSurrender: true }),
        5,
      );
      expect(decision.basicAction).toBe('SUR');
      expect(decision.finalAction).toBe('SUR');
      expect(decision.deviationApplied).toBe(false);
    });
  });

  // ─── Surrender-deviation threshold behaviour ──────────────────────────
  // Distinct from the precedence block above: these verify that surrender
  // deviations themselves apply iff the threshold is met, independent of
  // any natural deviation on the same hand.
  describe('surrender deviation rules — threshold gating', () => {
    it('applies a surrender deviation when its threshold is met', () => {
      // 15 v 9 SUR @ +2 (no natural deviation on 15 v 9).
      const at = engine.resolveDeviationDecision(scenario('10', '5', '9', 'S17'), 2);
      expect(at.finalAction).toBe('SUR');
      expect(at.deviationApplied).toBe(true);
      expect(at.matchedRule?.category).toBe('surrender');
    });

    it('does not apply a surrender deviation when its threshold is unmet', () => {
      // Same cell, below threshold — basic Hit prevails.
      const below = engine.resolveDeviationDecision(scenario('10', '5', '9', 'S17'), 1);
      expect(below.basicAction).toBe('H');
      expect(below.finalAction).toBe('H');
      expect(below.deviationApplied).toBe(false);
    });

    it('applies a surrender deviation even when a hard deviation also matches', () => {
      // 16 v 9 with LS off: at TC = -1 the surrender rule (at-or-below -1)
      // applies; at TC = +4 only the hard stand rule (at-or-above +4) applies.
      // Demonstrates both rules coexist and are gated by their own thresholds.
      const surrendered = engine.resolveDeviationDecision(
        scenario('10', '6', '9', 'S17', { lateSurrender: false }),
        -1,
      );
      expect(surrendered.finalAction).toBe('SUR');
      expect(surrendered.matchedRule?.category).toBe('surrender');

      const stood = engine.resolveDeviationDecision(
        scenario('10', '6', '9', 'S17', { lateSurrender: false }),
        4,
      );
      expect(stood.finalAction).toBe('S');
      expect(stood.matchedRule?.category).toBe('hard');
    });
  });

  // ─── Non-surrender hands still get natural deviations ─────────────────
  // Sanity: the surrender-precedence guard must not regress normal
  // deviation application on hands whose basic action is not SUR.
  describe('non-surrender hands still apply natural deviations', () => {
    it('hard 12 v 3 at +2 — basic H becomes S via hard deviation', () => {
      const decision = engine.resolveDeviationDecision(scenario('7', '5', '3', 'S17'), 2);
      expect(decision.basicAction).toBe('H');
      expect(decision.finalAction).toBe('S');
      expect(decision.deviationApplied).toBe(true);
      expect(decision.matchedRule?.category).toBe('hard');
    });

    it('soft A,8 v 4 at +3 — basic S becomes D via soft deviation', () => {
      const decision = engine.resolveDeviationDecision(scenario('A', '8', '4', 'S17'), 3);
      expect(decision.basicAction).toBe('S');
      expect(decision.finalAction).toBe('D');
      expect(decision.deviationApplied).toBe(true);
      expect(decision.matchedRule?.category).toBe('soft');
    });

    it('pair 10,10 v 6 at +4 — basic S becomes P via pair deviation', () => {
      const decision = engine.resolveDeviationDecision(scenario('10', '10', '6', 'S17'), 4);
      expect(decision.basicAction).toBe('S');
      expect(decision.finalAction).toBe('P');
      expect(decision.deviationApplied).toBe(true);
      expect(decision.matchedRule?.category).toBe('pair');
    });
  });

  // ─── Pair deviation ───────────────────────────────────────────────────
  describe('pair deviations', () => {
    it('10,10 v 6 split @ +4 — basic Stand becomes Split', () => {
      const below = engine.resolveDeviationDecision(scenario('10', '10', '6'), 3);
      expect(below.basicAction).toBe('S');
      expect(below.finalAction).toBe('S');
      const at = engine.resolveDeviationDecision(scenario('10', '10', '6'), 4);
      expect(at.finalAction).toBe('P');
      expect(at.deviationApplied).toBe(true);
    });

    it('10,10 v 5 split @ +5', () => {
      const below = engine.resolveDeviationDecision(scenario('10', '10', '5'), 4);
      expect(below.finalAction).toBe('S');
      const at = engine.resolveDeviationDecision(scenario('10', '10', '5'), 5);
      expect(at.finalAction).toBe('P');
    });

    it('ten-value pair lookup normalizes faces (K,Q vs 6)', () => {
      const decision = engine.resolveDeviationDecision(scenario('K', 'Q', '6'), 4);
      expect(decision.finalAction).toBe('P');
      expect(decision.deviationApplied).toBe(true);
    });

    it('10,10 v 4 split @ +6 — only kicks in at very high count', () => {
      const below = engine.resolveDeviationDecision(scenario('10', '10', '4'), 5);
      expect(below.finalAction).toBe('S');
      const at = engine.resolveDeviationDecision(scenario('10', '10', '4'), 6);
      expect(at.finalAction).toBe('P');
      expect(at.deviationApplied).toBe(true);
    });
  });

  // ─── Soft deviations (BJA soft-totals overlay) ────────────────────────
  describe('soft deviations', () => {
    it('A,8 v 4 — Ds at +3 (basic S becomes D)', () => {
      const below = engine.resolveDeviationDecision(scenario('A', '8', '4'), 2);
      expect(below.basicAction).toBe('S');
      expect(below.finalAction).toBe('S');
      const at = engine.resolveDeviationDecision(scenario('A', '8', '4'), 3);
      expect(at.basicAction).toBe('S');
      expect(at.finalAction).toBe('D');
      expect(at.deviationApplied).toBe(true);
    });

    it('A,8 v 5 — Ds at +1', () => {
      const below = engine.resolveDeviationDecision(scenario('A', '8', '5'), 0);
      expect(below.finalAction).toBe('S');
      const at = engine.resolveDeviationDecision(scenario('A', '8', '5'), 1);
      expect(at.finalAction).toBe('D');
    });

    it('S17 A,8 v 6 — Ds at +1 (upgrade S → D)', () => {
      const below = engine.resolveDeviationDecision(scenario('A', '8', '6', 'S17'), 0);
      expect(below.basicAction).toBe('S');
      expect(below.finalAction).toBe('S');
      const at = engine.resolveDeviationDecision(scenario('A', '8', '6', 'S17'), 1);
      expect(at.finalAction).toBe('D');
    });

    it('H17 A,8 v 6 — basic Ds (D) downgrades to S at TC <= 0', () => {
      // H17 basic strategy for A,8 v 6 is Ds, which collapses to D for
      // two-card hands. At TC <= 0 the BJA chart reverts to plain Stand.
      const at = engine.resolveDeviationDecision(scenario('A', '8', '6', 'H17'), 0);
      expect(at.basicAction).toBe('D');
      expect(at.finalAction).toBe('S');
      expect(at.deviationApplied).toBe(true);

      const above = engine.resolveDeviationDecision(scenario('A', '8', '6', 'H17'), 1);
      expect(above.basicAction).toBe('D');
      expect(above.finalAction).toBe('D');
      expect(above.deviationApplied).toBe(false);
    });

    it('A,6 v 2 — D at +1 (basic H becomes D)', () => {
      const below = engine.resolveDeviationDecision(scenario('A', '6', '2'), 0);
      expect(below.basicAction).toBe('H');
      expect(below.finalAction).toBe('H');
      const at = engine.resolveDeviationDecision(scenario('A', '6', '2'), 1);
      expect(at.finalAction).toBe('D');
    });
  });

  // ─── Additional hard deviations introduced from the BJA chart ─────────
  describe('hard deviations beyond the original Illustrious 18 entries', () => {
    it('8 v 6 double @ +2 (basic H becomes D)', () => {
      const below = engine.resolveDeviationDecision(scenario('5', '3', '6'), 1);
      expect(below.basicAction).toBe('H');
      expect(below.finalAction).toBe('H');
      const at = engine.resolveDeviationDecision(scenario('5', '3', '6'), 2);
      expect(at.finalAction).toBe('D');
      expect(at.deviationApplied).toBe(true);
    });

    it('16 v 9 stand @ +4 (BJA chart index; not the +5 some references publish)', () => {
      const rule = engine.findDeviationRule({
        ruleSet: 'S17',
        category: 'hard',
        playerHand: '16',
        dealerUpcard: '9',
      });
      expect(rule?.index).toBe(4);
      expect(rule?.deviationAction).toBe('S');
    });
  });

  // ─── classifyForDeviation helper ──────────────────────────────────────
  describe('classifyForDeviation', () => {
    it('classifies pair of 8s as pair', () => {
      expect(classifyForDeviation([card('8'), card('8')])).toEqual({
        category: 'pair',
        playerHand: '8',
      });
    });

    it('classifies A,7 as soft 18', () => {
      expect(classifyForDeviation([card('A'), card('7')])).toEqual({
        category: 'soft',
        playerHand: '18',
      });
    });

    it('A first or second does not change soft classification', () => {
      expect(classifyForDeviation([card('7'), card('A')])).toEqual({
        category: 'soft',
        playerHand: '18',
      });
    });

    it('classifies 10,6 as hard 16', () => {
      expect(classifyForDeviation([card('10'), card('6')])).toEqual({
        category: 'hard',
        playerHand: '16',
      });
    });

    it('classifies face+face as pair of 10s, not hard 20', () => {
      expect(classifyForDeviation([card('K'), card('Q')])).toEqual({
        category: 'pair',
        playerHand: '10',
      });
    });
  });

  // ─── Insurance path ───────────────────────────────────────────────────
  describe('resolveInsuranceDecision', () => {
    it('reports the matched rule even when threshold is not met', () => {
      const decision = engine.resolveInsuranceDecision(0, 'S17');
      expect(decision.deviationApplied).toBe(false);
      expect(decision.matchedRule?.category).toBe('insurance');
      expect(decision.trueCount).toBe(0);
    });
  });
});

// ─── Data sanity check: rule sets are independent ─────────────────────
describe('deviation data', () => {
  it('H17 and S17 tables are distinct arrays', () => {
    expect(deviationsFor('H17')).not.toBe(deviationsFor('S17'));
  });

  it('every H17 rule has ruleSet=H17', () => {
    for (const rule of deviationsFor('H17')) {
      expect(rule.ruleSet).toBe('H17');
    }
  });

  it('every S17 rule has ruleSet=S17', () => {
    for (const rule of deviationsFor('S17')) {
      expect(rule.ruleSet).toBe('S17');
    }
  });

  it('S17 contains an "11 v A" hard deviation; H17 does not', () => {
    const s17Has11vA = deviationsFor('S17').some(
      (r) => r.category === 'hard' && r.playerHand === '11' && r.dealerUpcard === 'A',
    );
    const h17Has11vA = deviationsFor('H17').some(
      (r) => r.category === 'hard' && r.playerHand === '11' && r.dealerUpcard === 'A',
    );
    expect(s17Has11vA).toBe(true);
    expect(h17Has11vA).toBe(false);
  });

  it('both rule sets include an insurance rule keyed to dealer A at +3', () => {
    for (const ruleSet of ['H17', 'S17'] as const) {
      const ins = deviationsFor(ruleSet).find((r) => r.category === 'insurance');
      expect(ins).toBeDefined();
      expect(ins?.dealerUpcard).toBe('A');
      expect(ins?.index).toBe(3);
      expect(ins?.deviationAction).toBe('INS');
    }
  });

  it('uses INS only on the single insurance rule the engine looks up', () => {
    // resolveInsuranceDecision() looks up exactly
    //   { category: 'insurance', playerHand: 'insurance', dealerUpcard: 'A' }.
    // The INS action must therefore stay exclusive to that one rule: if it
    // leaked onto a playing-decision rule the trainer would tell the user to
    // take insurance on an ordinary hand, and if the insurance rule were keyed
    // differently the overlay lookup would silently miss it.
    for (const ruleSet of ['H17', 'S17'] as const) {
      const insRules = deviationsFor(ruleSet).filter((r) => r.deviationAction === 'INS');
      expect(insRules.length, `${ruleSet} INS rule count`).toBe(1);
      expect(insRules[0].category).toBe('insurance');
      expect(insRules[0].playerHand).toBe('insurance');
      expect(insRules[0].dealerUpcard).toBe('A');
    }
  });

  it('has no duplicate (category, playerHand, dealerUpcard) lookup keys', () => {
    // findDeviationRule() resolves a cell with Array.prototype.find, which
    // returns the FIRST match. A duplicated lookup triple would silently
    // shadow the later rule — its threshold/action would never apply — so a
    // copy/paste slip between these two hand-transcribed charts could go
    // unnoticed. Guard the structural invariant the engine relies on.
    for (const ruleSet of ['H17', 'S17'] as const) {
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const r of deviationsFor(ruleSet)) {
        const key = `${r.category}|${r.playerHand}|${r.dealerUpcard}`;
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
      }
      expect(duplicates, `${ruleSet} duplicate lookup keys`).toEqual([]);
    }
  });

  // Guards against the previous (uncommitted) encoding that included rules
  // from Schlesinger's wider Illustrious 18 / Fab 4 which are not on the
  // BJA chart. If these reappear, the data is no longer chart-faithful.
  it.each([
    ['12', '5'],
    ['12', '6'],
    ['13', '3'],
  ] as const)('does not encode hard %s v %s (BJA chart omits this cell)', (hand, up) => {
    for (const ruleSet of ['H17', 'S17'] as const) {
      const rule = deviationsFor(ruleSet).find(
        (r) => r.category === 'hard' && r.playerHand === hand && r.dealerUpcard === up,
      );
      expect(rule).toBeUndefined();
    }
  });

  it('does not encode 14 v 10 surrender (BJA chart omits this cell)', () => {
    for (const ruleSet of ['H17', 'S17'] as const) {
      const rule = deviationsFor(ruleSet).find(
        (r) => r.category === 'surrender' && r.playerHand === '14' && r.dealerUpcard === '10',
      );
      expect(rule).toBeUndefined();
    }
  });

  it('H17 has additional 16 v A and 15 v A hard deviations that S17 lacks', () => {
    for (const up of ['A'] as const) {
      for (const hand of ['16', '15'] as const) {
        const s17 = deviationsFor('S17').find(
          (r) => r.category === 'hard' && r.playerHand === hand && r.dealerUpcard === up,
        );
        const h17 = deviationsFor('H17').find(
          (r) => r.category === 'hard' && r.playerHand === hand && r.dealerUpcard === up,
        );
        expect(s17).toBeUndefined();
        expect(h17).toBeDefined();
      }
    }
  });
});
