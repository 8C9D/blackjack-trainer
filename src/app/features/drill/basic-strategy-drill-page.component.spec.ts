import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import type { Card, Rank, Scenario, Suit } from '../../core/models/card.model';
import type { Action, EvaluationResult } from '../../core/models/strategy.model';
import { BASIC_STRATEGY_STATS_KEY } from '../../core/services/basic-strategy-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { MissTallyService } from '../../core/services/miss-tally.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { BasicStrategyDrillPageComponent } from './basic-strategy-drill-page.component';
import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';

const ADVANCE_MS = 50;

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (c1: Rank, c2: Rank, up: Rank): Scenario => ({
  player: [card(c1), card(c2, 'hearts')],
  dealerUpcard: card(up, 'clubs'),
});

// Hard 7 (3+4) vs 6 always hits under S17 — "H" is correct, "S" is wrong.
const HIT_SCENARIO = scenarioOf('3', '4', '6');

// The page exposes its signals/methods as `protected`; at runtime they are
// plain properties. This mirror lets the tests drive them directly, matching
// the approach of the pre-Flow page specs.
type Internals = {
  scenario: { (): Scenario; set(v: Scenario): void };
  result: { (): EvaluationResult | null };
  phase: { (): 'question' | 'flash' | 'miss' | 'done' };
  target: { (): number };
  handsToday: () => number;
  legalActions: () => readonly Action[];
  answer(action: Action): void;
  onKeyDown(event: KeyboardEvent): void;
  onHostClick(): void;
};

function asInternals(c: BasicStrategyDrillPageComponent): Internals {
  return c as unknown as Internals;
}

function createPage(): {
  fixture: ComponentFixture<BasicStrategyDrillPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(BasicStrategyDrillPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

function actionButton(
  fixture: ComponentFixture<BasicStrategyDrillPageComponent>,
  label: string,
): HTMLButtonElement {
  const found = Array.from(fixture.nativeElement.querySelectorAll('.acts__btn')).find((b) =>
    ((b as HTMLElement).querySelector('.acts__label')?.textContent ?? '').includes(label),
  );
  if (!found) throw new Error(`No action button labelled "${label}"`);
  return found as HTMLButtonElement;
}

function key(c: Internals, k: string): void {
  c.onKeyDown(new KeyboardEvent('keydown', { key: k }));
}

describe('BasicStrategyDrillPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BasicStrategyDrillPageComponent],
      providers: [provideRouter([]), { provide: FLOW_ADVANCE_DELAY_MS, useValue: ADVANCE_MS }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('session setup', () => {
    it('records itself as the last trainer for Continue', () => {
      createPage();
      expect(TestBed.inject(FlowPrefsService).prefs().lastTrainer).toBe('basic-strategy');
    });

    it('targets the daily goal and shows the topbar counter', () => {
      const { fixture, c } = createPage();
      expect(c.target()).toBe(20);
      expect(
        (fixture.nativeElement.querySelector('.topbar__count') as HTMLElement).textContent,
      ).toBe('0/20');
    });

    it('opens on the recorded weak spot when one exists', () => {
      TestBed.inject(MissTallyService).record(
        'basic-strategy',
        { kind: 'hard', hand: '16', dealer: '10' },
        false,
      );
      const { fixture, c } = createPage();
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hard 16 vs 10');
      expect(c.phase()).toBe('question');
    });
  });

  describe('question line', () => {
    it('computes the hand for the user', () => {
      const { fixture, c } = createPage();
      c.scenario.set(scenarioOf('A', '7', 'Q'));
      fixture.detectChanges();
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Soft 18 vs 10');
    });
  });

  describe('correct answer — grade in place, auto-advance', () => {
    it('flashes the pressed button green and locks input', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      fixture.detectChanges();

      actionButton(fixture, 'Hit').click();
      fixture.detectChanges();

      expect(c.phase()).toBe('flash');
      expect(actionButton(fixture, 'Hit').classList.contains('acts__btn--correct')).toBe(true);
      // No feedback panel anywhere — the grade lands on the button.
      expect(fixture.nativeElement.querySelector('.drill__rule')).toBeNull();
    });

    it('auto-advances to a new hand after the delay with zero extra taps', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      fixture.detectChanges();

      c.answer('H');
      expect(c.phase()).toBe('flash');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();

      expect(c.phase()).toBe('question');
      expect(c.result()).toBeNull();
      expect(c.handsToday()).toBe(1);
    });

    it('ignores further answers while flashing', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      c.answer('S');
      expect(c.handsToday()).toBe(1);
    });
  });

  describe('miss — the only pause in the loop', () => {
    it('shows the rule in place of the question and waits', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      fixture.detectChanges();

      actionButton(fixture, 'Stand').click();
      fixture.detectChanges();

      expect(c.phase()).toBe('miss');
      const rule = fixture.nativeElement.querySelector('.drill__rule') as HTMLElement;
      expect(rule.textContent).toContain('Correct: Hit.');
      expect(rule.textContent).toContain('Hard 7 vs dealer 6 under S17: hit.');
      expect(fixture.nativeElement.querySelector('.drill__question')).toBeNull();
      expect(actionButton(fixture, 'Stand').classList.contains('acts__btn--picked')).toBe(true);
      expect(actionButton(fixture, 'Hit').classList.contains('acts__btn--correct')).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(c.phase()).toBe('miss');
    });

    it('continues on any key', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('S');
      expect(c.phase()).toBe('miss');
      key(c, 'x');
      expect(c.phase()).toBe('question');
      expect(c.result()).toBeNull();
    });

    it('continues on a tap anywhere, but not on the tap that graded the miss', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      fixture.detectChanges();

      // The grading click bubbles to the host after answer() runs, and is
      // swallowed instead of continuing.
      actionButton(fixture, 'Stand').click();
      expect(c.phase()).toBe('miss');

      // The next tap continues.
      c.onHostClick();
      expect(c.phase()).toBe('question');
    });

    it('a key-graded miss continues on the very next tap', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      key(c, 's');
      expect(c.phase()).toBe('miss');
      c.onHostClick();
      expect(c.phase()).toBe('question');
    });
  });

  describe('poka-yoke', () => {
    it('disables illegal actions and keeps their hotkeys dead', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO); // non-pair, no ace up, LS off
      fixture.detectChanges();

      expect(c.legalActions()).toEqual(['H', 'S', 'D']);
      expect(actionButton(fixture, 'Split').disabled).toBe(true);
      expect(actionButton(fixture, 'Insurance').disabled).toBe(true);
      expect(actionButton(fixture, 'Surrender').disabled).toBe(true);

      key(c, 'p');
      key(c, 'i');
      key(c, 'r');
      expect(c.phase()).toBe('question');
      expect(c.handsToday()).toBe(0);
    });

    it('offers surrender once the Late Surrender rule is on', () => {
      TestBed.inject(FlowPrefsService).setOptions({
        doubleAfterSplit: false,
        lateSurrender: true,
      });
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      expect(c.legalActions()).toContain('SUR');
    });

    it('offers insurance against a dealer ace and grades it via the engine', () => {
      const { c } = createPage();
      c.scenario.set(scenarioOf('3', '4', 'A'));
      expect(c.legalActions()).toContain('INS');
      c.answer('INS');
      expect(c.phase()).toBe('miss');
      expect(c.result()!.reason).toContain('never takes insurance');
    });
  });

  describe('recording', () => {
    it('feeds the legacy stats store, the practice history, and the miss tally', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');

      const stats = JSON.parse(localStorage.getItem(BASIC_STRATEGY_STATS_KEY)!);
      expect(stats.attempts).toBe(1);
      expect(stats.correct).toBe(1);
      expect(TestBed.inject(PracticeHistoryService).handsToday()).toBe(1);
      // A correct answer alone yields no weak spot.
      expect(TestBed.inject(MissTallyService).weakSpotFor('basic-strategy')).toBeNull();

      vi.advanceTimersByTime(ADVANCE_MS);
      c.scenario.set(HIT_SCENARIO);
      c.answer('S');
      expect(TestBed.inject(MissTallyService).weakSpotFor('basic-strategy')).toEqual(
        expect.objectContaining({ label: '7 vs 6', misses: 1, attempts: 2 }),
      );
    });
  });

  describe('session end (Done)', () => {
    function drillToTarget(
      fixture: ComponentFixture<BasicStrategyDrillPageComponent>,
      c: Internals,
      hands: number,
    ): void {
      for (let i = 0; i < hands; i++) {
        c.scenario.set(HIT_SCENARIO);
        c.answer('H');
        vi.advanceTimersByTime(ADVANCE_MS);
      }
      fixture.detectChanges();
    }

    it('shows the Done screen when the session target is reached', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(3);
      const { fixture, c } = createPage();
      expect(c.target()).toBe(3);

      drillToTarget(fixture, c, 3);

      expect(c.phase()).toBe('done');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-flow-done')).not.toBeNull();
      expect(el.querySelector('.ring')!.textContent).toContain('3/3');
      expect(el.querySelector('.ring')!.textContent).toContain('goal met');
      expect(el.querySelector('.done__peak')!.textContent).toContain('Best streak: 3');
      expect(el.querySelector('.done__peak')!.textContent).toContain('100% today');
      // The drill chrome is gone.
      expect(el.querySelector('app-flow-topbar')).toBeNull();
    });

    it('reaches Done through a final miss after the continue tap', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('S');
      expect(c.phase()).toBe('miss');
      key(c, ' ');
      fixture.detectChanges();
      expect(c.phase()).toBe('done');
    });

    it('"One more round" starts a fresh round targeting one more goal', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(2);
      const { fixture, c } = createPage();
      drillToTarget(fixture, c, 2);
      expect(c.phase()).toBe('done');

      (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(c.phase()).toBe('question');
      expect(c.target()).toBe(4);
      expect(
        (fixture.nativeElement.querySelector('.topbar__count') as HTMLElement).textContent,
      ).toBe('2/4');
    });
  });

  describe('exit', () => {
    it('Escape leaves for home without confirmation', () => {
      const { c } = createPage();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      key(c, 'Escape');
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('the topbar ✕ leaves too', () => {
      const { fixture } = createPage();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (fixture.nativeElement.querySelector('.topbar__exit') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
