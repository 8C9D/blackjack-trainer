import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import type {
  EngineOptions,
  RuleSet,
} from '../../core/models/strategy.model';
import {
  DeviationsPageComponent,
  MAX_RANDOM_TRUE_COUNT,
  MIN_RANDOM_TRUE_COUNT,
  type DeviationScenario,
} from './deviations-page.component';
import type { DeviationTrainerResult } from './deviation-feedback-panel.component';
import type { TrueCountSource } from './deviation-settings.component';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (
  c1: Rank,
  c2: Rank,
  up: Rank,
  trueCount: number,
): DeviationScenario => ({
  player: [card(c1), card(c2)],
  dealerUpcard: card(up),
  trueCount,
});

type StatsLike = {
  stats(): { attempts: number; correct: number; streak: number; longestStreak: number };
  reset(): void;
};

type Internals = {
  ruleSet: { (): RuleSet; set(v: RuleSet): void };
  options: { (): EngineOptions; set(v: EngineOptions): void };
  scenario: { (): DeviationScenario; set(v: DeviationScenario): void };
  result: { (): DeviationTrainerResult | null; set(v: DeviationTrainerResult | null): void };
  trueCountSource: { (): TrueCountSource; set(v: TrueCountSource): void };
  manualTrueCount: { (): number | null; set(v: number | null): void };
  canDealNextHand: () => boolean;
  setTrueCountSource(source: TrueCountSource): void;
  answer(action: 'H' | 'S' | 'D' | 'P' | 'SUR' | 'INS'): void;
  nextHand(): void;
  statsService: StatsLike;
};

function asInternals(c: DeviationsPageComponent): Internals {
  return c as unknown as Internals;
}

function createPage(): {
  fixture: ComponentFixture<DeviationsPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(DeviationsPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

describe('DeviationsPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [DeviationsPageComponent],
      providers: [provideRouter([])],
    });
  });

  describe('initial render', () => {
    it('renders the settings, table, true count, action buttons, and stats panel', () => {
      const { fixture } = createPage();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-deviation-settings')).not.toBeNull();
      expect(el.querySelector('app-blackjack-table')).not.toBeNull();
      expect(el.querySelector('.true-count')).not.toBeNull();
      expect(el.querySelector('app-action-buttons')).not.toBeNull();
      expect(el.querySelector('app-stats-panel')).not.toBeNull();
    });

    it('renders the feedback panel only after an answer is submitted', () => {
      const { fixture, c } = createPage();
      const el = fixture.nativeElement as HTMLElement;
      // No <section.feedback> yet (the panel renders nothing without a result).
      expect(el.querySelector('app-deviation-feedback-panel .feedback')).toBeNull();

      c.scenario.set(scenarioOf('10', '6', '10', 0));
      c.answer('S');
      fixture.detectChanges();
      expect(el.querySelector('app-deviation-feedback-panel .feedback')).not.toBeNull();
    });

    it('exposes a formatted true count in the table area', () => {
      const { fixture, c } = createPage();
      c.scenario.set(scenarioOf('5', '4', '6', 3));
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.true-count__value')?.textContent?.trim()).toBe('+3');

      c.scenario.set(scenarioOf('5', '4', '6', -2));
      fixture.detectChanges();
      expect(el.querySelector('.true-count__value')?.textContent?.trim()).toBe('-2');
    });
  });

  describe('answer evaluation — no-deviation hand', () => {
    it('returns basic strategy as the expected action when no deviation applies', () => {
      const { c } = createPage();
      // Hard 7 vs 6 always hits and has no deviation entry.
      c.scenario.set(scenarioOf('3', '4', '6', 5));
      c.answer('H');
      const r = c.result()!;
      expect(r.correct).toBe(true);
      expect(r.expectedAction).toBe('H');
      expect(r.basicAction).toBe('H');
      expect(r.deviationApplied).toBe(false);
      expect(r.source).toBe('playing');
    });

    it('marks the user wrong when they pick something other than the basic action', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('3', '4', '6', 5));
      c.answer('S');
      const r = c.result()!;
      expect(r.correct).toBe(false);
      expect(r.userAction).toBe('S');
      expect(r.expectedAction).toBe('H');
    });
  });

  describe('answer evaluation — deviation threshold met', () => {
    it('applies 16 v 10 stand @ 0+ deviation', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('10', '6', '10', 0));
      c.answer('S');
      const r = c.result()!;
      expect(r.correct).toBe(true);
      expect(r.basicAction).toBe('H');
      expect(r.expectedAction).toBe('S');
      expect(r.deviationApplied).toBe(true);
      expect(r.matchedRule?.category).toBe('hard');
    });

    it('marks the user wrong when they play basic instead of the deviation', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('10', '6', '10', 0));
      c.answer('H');
      const r = c.result()!;
      expect(r.correct).toBe(false);
      expect(r.basicAction).toBe('H');
      expect(r.expectedAction).toBe('S');
      expect(r.deviationApplied).toBe(true);
    });
  });

  describe('answer evaluation — deviation threshold not met', () => {
    it('returns basic strategy when the rule exists but TC is below threshold', () => {
      const { c } = createPage();
      // 15 v 10 fires at +4; at +3 the rule is not triggered.
      c.scenario.set(scenarioOf('10', '5', '10', 3));
      c.answer('H');
      const r = c.result()!;
      expect(r.correct).toBe(true);
      expect(r.basicAction).toBe('H');
      expect(r.expectedAction).toBe('H');
      expect(r.deviationApplied).toBe(false);
      // The candidate rule is still surfaced so the panel can hint at it.
      expect(r.matchedRule?.deviationAction).toBe('S');
    });
  });

  describe('rule-set selection affects evaluation', () => {
    it('S17 11 v A at TC +1 deviates to Double, H17 stays at basic Double', () => {
      const { c } = createPage();
      c.ruleSet.set('S17');
      c.scenario.set(scenarioOf('7', '4', 'A', 1));
      c.answer('D');
      const s17 = c.result()!;
      expect(s17.correct).toBe(true);
      expect(s17.basicAction).toBe('H');
      expect(s17.expectedAction).toBe('D');
      expect(s17.deviationApplied).toBe(true);

      c.nextHand();
      c.ruleSet.set('H17');
      c.scenario.set(scenarioOf('7', '4', 'A', 1));
      c.answer('D');
      const h17 = c.result()!;
      expect(h17.correct).toBe(true);
      // H17 basic strategy already doubles 11 v A; no deviation needed.
      expect(h17.basicAction).toBe('D');
      expect(h17.expectedAction).toBe('D');
      expect(h17.deviationApplied).toBe(false);
    });
  });

  describe('insurance handling', () => {
    it('dealer Ace at TC +3 — Insurance is correct', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('10', '6', 'A', 3));
      c.answer('INS');
      const r = c.result()!;
      expect(r.correct).toBe(true);
      expect(r.source).toBe('insurance');
      expect(r.expectedAction).toBe('INS');
      expect(r.matchedRule?.category).toBe('insurance');
    });

    it('dealer Ace below TC +3 — Insurance is incorrect; expected is the playing action', () => {
      const { c } = createPage();
      // Hard 16 v A: S17 basic strategy hits (no LS); no Ace deviation.
      c.scenario.set(scenarioOf('10', '6', 'A', 2));
      c.answer('INS');
      const r = c.result()!;
      expect(r.correct).toBe(false);
      expect(r.source).toBe('playing');
      expect(r.expectedAction).toBe('H');
      expect(r.userAction).toBe('INS');
      expect(r.explanation).toContain('Decline insurance');
    });

    it('dealer is not an Ace — Insurance is always incorrect', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('10', '6', '10', 5));
      c.answer('INS');
      const r = c.result()!;
      expect(r.correct).toBe(false);
      expect(r.source).toBe('playing');
      expect(r.expectedAction).toBe('S'); // 16 v 10 stand @ 0+ deviation
      expect(r.userAction).toBe('INS');
      expect(r.explanation).toContain('Insurance is only offered when the dealer shows an Ace');
    });
  });

  describe('stats wiring', () => {
    it('records one attempt per answer', () => {
      const { c } = createPage();
      expect(c.statsService.stats().attempts).toBe(0);
      c.scenario.set(scenarioOf('3', '4', '6', 5));
      c.answer('H');
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.statsService.stats().correct).toBe(1);
    });

    it('tracks a streak of correct answers and resets on a wrong one', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('3', '4', '6', 0));
      c.answer('H'); // correct
      c.nextHand();
      c.scenario.set(scenarioOf('10', '6', '10', 0));
      c.answer('S'); // correct deviation
      c.nextHand();
      c.scenario.set(scenarioOf('10', '6', '10', 0));
      c.answer('H'); // wrong (didn't take deviation)
      const s = c.statsService.stats();
      expect(s.attempts).toBe(3);
      expect(s.correct).toBe(2);
      expect(s.streak).toBe(0);
      expect(s.longestStreak).toBe(2);
    });

    it('ignores additional answers while a result is on screen', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('3', '4', '6', 0));
      c.answer('H');
      const first = c.result();
      c.answer('S');
      expect(c.result()).toBe(first);
      expect(c.statsService.stats().attempts).toBe(1);
    });

    it('nextHand() clears the result and re-rolls the scenario', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('3', '4', '6', 0));
      c.answer('H');
      expect(c.result()).not.toBeNull();
      c.nextHand();
      expect(c.result()).toBeNull();
    });
  });

  describe('true count display', () => {
    it('uses a clearer "Practice true count" label, not just "True count"', () => {
      const { fixture } = createPage();
      const label = (fixture.nativeElement as HTMLElement).querySelector(
        '.true-count__label',
      );
      expect(label?.textContent?.trim()).toBe('Practice true count');
    });
  });

  describe('true count source (default: random)', () => {
    it('defaults to random source', () => {
      const { c } = createPage();
      expect(c.trueCountSource()).toBe('random');
    });

    it('generates true counts within the random range on each nextHand', () => {
      const { c } = createPage();
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) {
        c.nextHand();
        const tc = c.scenario().trueCount;
        expect(tc).toBeGreaterThanOrEqual(MIN_RANDOM_TRUE_COUNT);
        expect(tc).toBeLessThanOrEqual(MAX_RANDOM_TRUE_COUNT);
        seen.add(tc);
      }
      // Over 200 draws we expect at least a couple of distinct values; this
      // guards against a degenerate generator that always returns the same
      // number.
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  describe('true count source: manual', () => {
    it('generated scenarios use the manual true count', () => {
      const { c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(7);
      c.nextHand();
      expect(c.scenario().trueCount).toBe(7);
    });

    it('keeps the same manual true count across consecutive nextHand calls', () => {
      const { c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(-3);
      for (let i = 0; i < 25; i++) {
        c.nextHand();
        expect(c.scenario().trueCount).toBe(-3);
      }
    });

    it('uses the manual true count for evaluation (16 v 10 deviation at TC 0)', () => {
      const { c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(0);
      c.scenario.set(scenarioOf('10', '6', '10', 0));
      c.answer('S');
      const r = c.result()!;
      expect(r.correct).toBe(true);
      expect(r.expectedAction).toBe('S');
      expect(r.deviationApplied).toBe(true);
    });

    it('insurance at dealer Ace and TC +3 still works in manual mode', () => {
      const { c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(3);
      c.scenario.set(scenarioOf('10', '6', 'A', 3));
      c.answer('INS');
      const r = c.result()!;
      expect(r.correct).toBe(true);
      expect(r.source).toBe('insurance');
    });

    it('renders the manual-source value in the display', () => {
      const { fixture, c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(4);
      c.nextHand();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.true-count__value')?.textContent?.trim()).toBe('+4');
    });

    it('switching to manual with a null value resets it to 0', () => {
      const { c } = createPage();
      c.manualTrueCount.set(null);
      c.setTrueCountSource('manual');
      expect(c.manualTrueCount()).toBe(0);
    });

    it('switching to manual preserves a previously valid value', () => {
      const { c } = createPage();
      c.manualTrueCount.set(6);
      c.setTrueCountSource('manual');
      expect(c.manualTrueCount()).toBe(6);
    });

    it('switching back to random resumes random TC generation', () => {
      const { c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(8);
      c.nextHand();
      expect(c.scenario().trueCount).toBe(8);

      c.setTrueCountSource('random');
      // Over many draws under random mode, at least one TC should differ
      // from the previously fixed manual value of 8.
      let sawDifferent = false;
      for (let i = 0; i < 200; i++) {
        c.nextHand();
        const tc = c.scenario().trueCount;
        expect(tc).toBeGreaterThanOrEqual(MIN_RANDOM_TRUE_COUNT);
        expect(tc).toBeLessThanOrEqual(MAX_RANDOM_TRUE_COUNT);
        if (tc !== 8) sawDifferent = true;
      }
      expect(sawDifferent).toBe(true);
    });
  });

  describe('manual-mode invalid value gating', () => {
    it('blocks nextHand while manual TC is null', () => {
      const { c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(2);
      c.nextHand();
      const blocked = c.scenario();

      c.manualTrueCount.set(null);
      expect(c.canDealNextHand()).toBe(false);
      c.nextHand();
      // Scenario is unchanged because nextHand short-circuited.
      expect(c.scenario()).toBe(blocked);
    });

    it('disables the feedback panel "Deal next hand" button when manual TC is null', () => {
      const { fixture, c } = createPage();
      c.setTrueCountSource('manual');
      c.manualTrueCount.set(0);
      c.scenario.set(scenarioOf('3', '4', '6', 0));
      c.answer('H');
      c.manualTrueCount.set(null);
      fixture.detectChanges();
      const btn = (fixture.nativeElement as HTMLElement).querySelector(
        '.feedback__next',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('canDealNextHand is true in random mode regardless of manual TC value', () => {
      const { c } = createPage();
      c.manualTrueCount.set(null);
      expect(c.trueCountSource()).toBe('random');
      expect(c.canDealNextHand()).toBe(true);
    });
  });
});
