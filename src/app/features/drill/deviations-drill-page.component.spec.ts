import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Card, Rank, Suit } from '../../core/models/card.model';
import type { DeviationScenario, DeviationTrainerResult } from '../../core/models/deviation.model';
import type { Action } from '../../core/models/strategy.model';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { MissTallyService } from '../../core/services/miss-tally.service';
import { DeviationsDrillPageComponent } from './deviations-drill-page.component';
import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';

const ADVANCE_MS = 50;

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (c1: Rank, c2: Rank, up: Rank, trueCount: number): DeviationScenario => ({
  player: [card(c1), card(c2, 'hearts')],
  dealerUpcard: card(up, 'clubs'),
  trueCount,
});

// S17 fixtures (defaults: LS off, DAS off):
//   Hard 16 (K+6) vs 10 stands at TC >= 0 (Illustrious 18), hits below.
const SIXTEEN_V_TEN_TC0 = scenarioOf('K', '6', 'Q', 0);
const SIXTEEN_V_TEN_TC_NEG = scenarioOf('K', '6', 'Q', -2);
//   Hard 16 (K+6) vs 8 surrenders at TC >= +4 — via the surrender overlay,
//   which fires regardless of the Late Surrender table rule.
const SIXTEEN_V_EIGHT_TC4 = scenarioOf('K', '6', '8', 4);
//   Dealer ace: insurance becomes correct at TC >= +3.
const INSURANCE_TC3 = scenarioOf('3', '4', 'A', 3);
const NO_INSURANCE_TC0 = scenarioOf('3', '4', 'A', 0);

type Internals = {
  scenario: { (): DeviationScenario; set(v: DeviationScenario): void };
  result: { (): DeviationTrainerResult | null };
  phase: { (): 'question' | 'flash' | 'miss' | 'done' };
  target: { (): number };
  handsToday: () => number;
  legalActions: () => readonly Action[];
  answer(action: Action): void;
  onKeyDown(event: KeyboardEvent): void;
};

function asInternals(c: DeviationsDrillPageComponent): Internals {
  return c as unknown as Internals;
}

function createPage(): {
  fixture: ComponentFixture<DeviationsDrillPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(DeviationsDrillPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

describe('DeviationsDrillPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [DeviationsDrillPageComponent],
      providers: [provideRouter([]), { provide: FLOW_ADVANCE_DELAY_MS, useValue: ADVANCE_MS }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records itself as the last trainer for Continue', () => {
    createPage();
    expect(TestBed.inject(FlowPrefsService).prefs().lastTrainer).toBe('deviations');
  });

  it('joins the true count to the question line', () => {
    const { fixture, c } = createPage();
    c.scenario.set(scenarioOf('K', '6', 'Q', 4));
    fixture.detectChanges();
    const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
    expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hard 16 vs 10 · TC +4');
  });

  describe('deviation grading', () => {
    it('grades the deviation as correct when the threshold is met', () => {
      const { c } = createPage();
      c.scenario.set(SIXTEEN_V_TEN_TC0);
      c.answer('S');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.deviationApplied).toBe(true);
      expect(c.phase()).toBe('flash');
    });

    it('grades basic strategy as correct below the threshold', () => {
      const { c } = createPage();
      c.scenario.set(SIXTEEN_V_TEN_TC_NEG);
      c.answer('S');
      expect(c.result()!.correct).toBe(false);
      expect(c.result()!.expectedAction).toBe('H');
      expect(c.phase()).toBe('miss');
    });

    it('shows the deviation explanation in place of the question on a miss', () => {
      const { fixture, c } = createPage();
      c.scenario.set(SIXTEEN_V_TEN_TC0);
      fixture.detectChanges();
      c.answer('H');
      fixture.detectChanges();
      const rule = fixture.nativeElement.querySelector('.drill__rule') as HTMLElement;
      expect(rule.textContent).toContain('Correct: Stand.');
      expect(rule.textContent).toContain('16 v 10 stand @ 0+');
      expect(fixture.nativeElement.querySelector('.drill__question')).toBeNull();
    });
  });

  describe('poka-yoke with deviation overlays', () => {
    it('keeps surrender answerable with Late Surrender off, because the overlay can expect it', () => {
      const { c } = createPage();
      c.scenario.set(SIXTEEN_V_EIGHT_TC4);
      expect(c.legalActions()).toContain('SUR');
      c.answer('SUR');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.expectedAction).toBe('SUR');
    });

    it('offers insurance only against an ace and grades it by true count', () => {
      const { c } = createPage();
      c.scenario.set(SIXTEEN_V_TEN_TC0);
      expect(c.legalActions()).not.toContain('INS');

      c.scenario.set(INSURANCE_TC3);
      expect(c.legalActions()).toContain('INS');
      c.answer('INS');
      expect(c.result()!.correct).toBe(true);
      expect(c.result()!.source).toBe('insurance');
    });

    it('declining insurance below +3 is the correct play', () => {
      const { c } = createPage();
      c.scenario.set(NO_INSURANCE_TC0);
      c.answer('INS');
      expect(c.result()!.correct).toBe(false);
      expect(c.result()!.explanation).toContain('Decline insurance');
    });

    it('keeps hotkeys for illegal actions dead', () => {
      const { c } = createPage();
      c.scenario.set(SIXTEEN_V_TEN_TC0); // no ace up, non-pair
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'i' }));
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'p' }));
      expect(c.phase()).toBe('question');
      expect(c.handsToday()).toBe(0);
    });
  });

  describe('recording and session lifecycle', () => {
    it('tallies misses under the deviations trainer', () => {
      const { c } = createPage();
      c.scenario.set(SIXTEEN_V_TEN_TC0);
      c.answer('H');
      const weak = TestBed.inject(MissTallyService).weakSpotFor('deviations');
      expect(weak).toEqual(expect.objectContaining({ label: '16 vs 10', misses: 1 }));
      expect(TestBed.inject(MissTallyService).weakSpotFor('basic-strategy')).toBeNull();
    });

    it('reaches Done at the session target and offers one more round', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(2);
      const { fixture, c } = createPage();
      for (let i = 0; i < 2; i++) {
        c.scenario.set(SIXTEEN_V_TEN_TC0);
        c.answer('S');
        vi.advanceTimersByTime(ADVANCE_MS);
      }
      fixture.detectChanges();
      expect(c.phase()).toBe('done');
      expect(fixture.nativeElement.querySelector('app-flow-done')).not.toBeNull();

      (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
      expect(c.phase()).toBe('question');
      expect(c.target()).toBe(4);
    });
  });

  describe('scenario generation from prefs', () => {
    it('uses the manual true count when configured', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.updateDeviations({ trueCountSource: 'manual', manualTrueCount: 5 });
      const { c } = createPage();
      expect(c.scenario().trueCount).toBe(5);
      // Advance through a hand — the next deal keeps the manual count.
      c.answer(c.scenario().trueCount === 5 ? 'H' : 'S'); // any legal action
      vi.advanceTimersByTime(ADVANCE_MS);
      if (c.phase() === 'miss') {
        c.onKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
      }
      expect(c.scenario().trueCount).toBe(5);
    });

    it('marks deviation-only scenarios as candidates', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.updateDeviations({ practiceMode: 'deviation-only' });
      const { c } = createPage();
      expect(c.scenario().generatedAsDeviationCandidate).toBe(true);
    });
  });
});
