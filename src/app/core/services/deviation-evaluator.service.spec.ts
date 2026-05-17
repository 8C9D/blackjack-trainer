import { TestBed } from '@angular/core/testing';

import type { Card, Rank, Suit } from '../models/card.model';
import type { DeviationScenario } from '../models/deviation.model';
import {
  DEFAULT_ENGINE_OPTIONS,
  type EngineOptions,
  type RuleSet,
} from '../models/strategy.model';
import {
  DeviationEvaluatorService,
  explainPlaying,
  formatTrueCount,
} from './deviation-evaluator.service';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (
  c1: Rank,
  c2: Rank,
  up: Rank,
  trueCount: number,
  extra: Partial<DeviationScenario> = {},
): DeviationScenario => ({
  player: [card(c1), card(c2)],
  dealerUpcard: card(up),
  trueCount,
  ...extra,
});

describe('formatTrueCount', () => {
  it("prefixes positive counts with '+'", () => {
    expect(formatTrueCount(1)).toBe('+1');
    expect(formatTrueCount(7)).toBe('+7');
  });

  it('returns zero and negative counts as plain strings', () => {
    expect(formatTrueCount(0)).toBe('0');
    expect(formatTrueCount(-3)).toBe('-3');
  });
});

describe('DeviationEvaluatorService', () => {
  let evaluator: DeviationEvaluatorService;
  const ruleSet: RuleSet = 'S17';
  const options: EngineOptions = DEFAULT_ENGINE_OPTIONS;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    evaluator = TestBed.inject(DeviationEvaluatorService);
  });

  describe('no deviation in play', () => {
    it('returns basic strategy as the expected action when no deviation applies', () => {
      // Hard 7 vs 6 always hits and has no deviation entry.
      const r = evaluator.evaluate(scenarioOf('3', '4', '6', 5), 'H', ruleSet, options);
      expect(r.correct).toBe(true);
      expect(r.expectedAction).toBe('H');
      expect(r.basicAction).toBe('H');
      expect(r.deviationApplied).toBe(false);
      expect(r.source).toBe('playing');
    });

    it('marks the user wrong when they pick something other than the basic action', () => {
      const r = evaluator.evaluate(scenarioOf('3', '4', '6', 5), 'S', ruleSet, options);
      expect(r.correct).toBe(false);
      expect(r.userAction).toBe('S');
      expect(r.expectedAction).toBe('H');
    });
  });

  describe('playing deviation threshold met', () => {
    it('applies the 16 v 10 stand @ 0+ deviation', () => {
      const r = evaluator.evaluate(scenarioOf('10', '6', '10', 0), 'S', ruleSet, options);
      expect(r.correct).toBe(true);
      expect(r.basicAction).toBe('H');
      expect(r.expectedAction).toBe('S');
      expect(r.deviationApplied).toBe(true);
      expect(r.matchedRule?.category).toBe('hard');
      expect(r.source).toBe('playing');
      expect(r.explanation).toContain('Hi-Lo deviation');
      expect(r.explanation).toContain('TC 0');
    });

    it('marks the user wrong when they play basic instead of the deviation', () => {
      const r = evaluator.evaluate(scenarioOf('10', '6', '10', 0), 'H', ruleSet, options);
      expect(r.correct).toBe(false);
      expect(r.basicAction).toBe('H');
      expect(r.expectedAction).toBe('S');
      expect(r.deviationApplied).toBe(true);
    });
  });

  describe('playing deviation threshold unmet', () => {
    it('returns basic strategy but surfaces the candidate rule', () => {
      // 15 v 10 fires at +4; at +3 the rule is unmet.
      const r = evaluator.evaluate(scenarioOf('10', '5', '10', 3), 'H', ruleSet, options);
      expect(r.correct).toBe(true);
      expect(r.basicAction).toBe('H');
      expect(r.expectedAction).toBe('H');
      expect(r.deviationApplied).toBe(false);
      expect(r.matchedRule?.deviationAction).toBe('S');
      expect(r.explanation).toContain('No deviation at TC +3');
      expect(r.explanation).toContain('only fires at a different count');
    });
  });

  describe('insurance overlay', () => {
    it('dealer Ace at TC +3 — Insurance is correct', () => {
      const r = evaluator.evaluate(scenarioOf('10', '6', 'A', 3), 'INS', ruleSet, options);
      expect(r.correct).toBe(true);
      expect(r.source).toBe('insurance');
      expect(r.expectedAction).toBe('INS');
      expect(r.matchedRule?.category).toBe('insurance');
      expect(r.explanation).toContain('Take insurance');
      expect(r.explanation).toContain('+3');
    });

    it('dealer Ace below TC +3 — Insurance is incorrect; expected is the playing action', () => {
      // Hard 16 v A: S17 basic strategy hits (no LS); no Ace deviation.
      const r = evaluator.evaluate(scenarioOf('10', '6', 'A', 2), 'INS', ruleSet, options);
      expect(r.correct).toBe(false);
      expect(r.source).toBe('playing');
      expect(r.expectedAction).toBe('H');
      expect(r.userAction).toBe('INS');
      expect(r.explanation).toContain('Decline insurance');
      expect(r.explanation).toContain('+2');
    });

    it('dealer is not an Ace — Insurance is always incorrect', () => {
      const r = evaluator.evaluate(scenarioOf('10', '6', '10', 5), 'INS', ruleSet, options);
      expect(r.correct).toBe(false);
      expect(r.source).toBe('playing');
      expect(r.expectedAction).toBe('S'); // 16 v 10 stand @ 0+ deviation
      expect(r.userAction).toBe('INS');
      expect(r.explanation).toContain('Insurance is only offered when the dealer shows an Ace');
    });
  });

  describe('rule-set selection', () => {
    it('S17 11 v A at +1 deviates to Double; H17 already doubles via basic strategy', () => {
      const s17 = evaluator.evaluate(scenarioOf('7', '4', 'A', 1), 'D', 'S17', options);
      expect(s17.correct).toBe(true);
      expect(s17.basicAction).toBe('H');
      expect(s17.expectedAction).toBe('D');
      expect(s17.deviationApplied).toBe(true);

      const h17 = evaluator.evaluate(scenarioOf('7', '4', 'A', 1), 'D', 'H17', options);
      expect(h17.correct).toBe(true);
      expect(h17.basicAction).toBe('D');
      expect(h17.expectedAction).toBe('D');
      expect(h17.deviationApplied).toBe(false);
    });
  });

  describe('candidate flag propagation', () => {
    it('forwards generatedAsDeviationCandidate=true onto the result', () => {
      const r = evaluator.evaluate(
        scenarioOf('10', '6', '10', 0, { generatedAsDeviationCandidate: true }),
        'S',
        ruleSet,
        options,
      );
      expect(r.isDeviationCandidate).toBe(true);
    });

    it('defaults isDeviationCandidate to false when the flag is absent', () => {
      const r = evaluator.evaluate(scenarioOf('3', '4', '6', 0), 'H', ruleSet, options);
      expect(r.isDeviationCandidate).toBe(false);
    });
  });

  describe('hand description', () => {
    it('uses the basic-strategy hand description verbatim', () => {
      const r = evaluator.evaluate(scenarioOf('A', '7', '6', 0), 'S', ruleSet, options);
      expect(r.handDescription).toBe('Soft 18 (A, 7)');
    });
  });
});

describe('explainPlaying', () => {
  // These tests pin the exact wording the feedback panel renders so future
  // tweaks to the explanation strings are intentional.

  const noRulePlaying = {
    basicAction: 'H' as const,
    finalAction: 'H' as const,
    deviationApplied: false,
    matchedRule: undefined,
    trueCount: 2,
  };

  it('misplaced INS on a non-Ace upcard explains the upcard rule', () => {
    expect(
      explainPlaying({
        dealerAce: false,
        userAction: 'INS',
        playing: noRulePlaying,
        trueCount: 2,
      }),
    ).toBe('Insurance is only offered when the dealer shows an Ace. Play the hand: Hit.');
  });

  it('misplaced INS on a dealer Ace below threshold explains the +3 rule', () => {
    expect(
      explainPlaying({
        dealerAce: true,
        userAction: 'INS',
        playing: noRulePlaying,
        trueCount: 2,
      }),
    ).toBe('Decline insurance — true count +2 is below the +3 threshold. Play the hand: Hit.');
  });

  it('plain basic-strategy answer with no rule says no deviation exists', () => {
    expect(
      explainPlaying({
        dealerAce: false,
        userAction: 'H',
        playing: noRulePlaying,
        trueCount: -1,
      }),
    ).toBe('No deviation for this hand; basic strategy plays Hit.');
  });
});
