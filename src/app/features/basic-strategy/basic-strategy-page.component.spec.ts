import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank, Scenario, Suit } from '../../core/models/card.model';
import type { Action, EvaluationResult } from '../../core/models/strategy.model';
import type { SessionStats } from '../../core/services/stats-store';
import { BasicStrategyPageComponent } from './basic-strategy-page.component';

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (c1: Rank, c2: Rank, up: Rank): Scenario => ({
  player: [card(c1), card(c2)],
  dealerUpcard: card(up),
});

// Deterministic basic-strategy fixtures (S17 default ruleset):
//   Hard 7 (3+4) vs 6 always hits — so "H" is correct, "S" is wrong.
const HIT_SCENARIO = scenarioOf('3', '4', '6');

// The page exposes its signals/methods as `protected`; at runtime they are
// plain properties. This mirror lets the tests drive them directly, matching
// the approach in the deviations-page spec.
type Internals = {
  scenario: { (): Scenario; set(v: Scenario): void };
  result: { (): EvaluationResult | null; set(v: EvaluationResult | null): void };
  statsService: { stats(): SessionStats; reset(): void };
  answer(action: Action): void;
  nextHand(): void;
  onKeyDown(event: KeyboardEvent): void;
};

function asInternals(c: BasicStrategyPageComponent): Internals {
  return c as unknown as Internals;
}

function createPage(): {
  fixture: ComponentFixture<BasicStrategyPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(BasicStrategyPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

function actionButton(
  fixture: ComponentFixture<BasicStrategyPageComponent>,
  label: string,
): HTMLButtonElement {
  const found = Array.from(fixture.nativeElement.querySelectorAll('.actions__button')).find((b) =>
    ((b as HTMLElement).textContent ?? '').includes(label),
  );
  if (!found) throw new Error(`No action button labelled "${label}"`);
  return found as HTMLButtonElement;
}

describe('BasicStrategyPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [BasicStrategyPageComponent],
    });
  });

  describe('initial render', () => {
    it('renders the page heading (smoke)', () => {
      const { fixture } = createPage();
      const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement;
      expect(h1.textContent).toContain('Blackjack Basic Strategy Trainer');
    });

    it('wires up the rule controls, table, action buttons and stats panel', () => {
      const { fixture } = createPage();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-rule-controls')).not.toBeNull();
      expect(el.querySelector('app-blackjack-table')).not.toBeNull();
      expect(el.querySelector('app-action-buttons')).not.toBeNull();
      expect(el.querySelector('app-stats-panel')).not.toBeNull();
    });

    it('renders the feedback panel only after an answer is submitted', () => {
      const { fixture, c } = createPage();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-feedback-panel .feedback')).toBeNull();

      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      fixture.detectChanges();
      expect(el.querySelector('app-feedback-panel .feedback')).not.toBeNull();
    });

    it('enables the action buttons until a hand is graded, then disables them', () => {
      const { fixture, c } = createPage();
      expect(actionButton(fixture, 'Hit').disabled).toBe(false);

      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      fixture.detectChanges();
      expect(actionButton(fixture, 'Hit').disabled).toBe(true);
    });
  });

  describe('answering a hand', () => {
    it('grades a correct action through the engine and shows feedback (button click)', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      fixture.detectChanges();

      actionButton(fixture, 'Hit').click();
      fixture.detectChanges();

      const r = c.result();
      expect(r).not.toBeNull();
      expect(r!.userAction).toBe('H');
      expect(r!.correct).toBe(true);
      expect(fixture.nativeElement.querySelector('app-feedback-panel .feedback')).not.toBeNull();
    });

    it('marks a wrong action incorrect and records the miss', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      fixture.detectChanges();

      actionButton(fixture, 'Stand').click();

      const r = c.result();
      expect(r!.correct).toBe(false);
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.statsService.stats().correct).toBe(0);
    });

    it('records exactly one correct attempt for a correct answer', () => {
      const { c } = createPage();
      expect(c.statsService.stats().attempts).toBe(0);
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.statsService.stats().correct).toBe(1);
    });

    it('ignores a second answer while a result is on screen', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      const first = c.result();
      c.answer('S');
      expect(c.result()).toBe(first);
      expect(c.statsService.stats().attempts).toBe(1);
    });
  });

  describe('dealing the next hand', () => {
    it('nextHand() clears the result and re-enables the buttons', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      expect(c.result()).not.toBeNull();

      c.nextHand();
      fixture.detectChanges();
      expect(c.result()).toBeNull();
      expect(actionButton(fixture, 'Hit').disabled).toBe(false);
    });
  });

  describe('stats panel wiring', () => {
    it('reset button clears the recorded stats', () => {
      const { fixture, c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      fixture.detectChanges();
      expect(c.statsService.stats().attempts).toBe(1);

      const reset = fixture.nativeElement.querySelector('.stats__reset') as HTMLButtonElement;
      expect(reset.disabled).toBe(false);
      reset.click();
      expect(c.statsService.stats().attempts).toBe(0);
    });
  });

  describe('keyboard shortcuts', () => {
    it('answers the hand when an action hotkey is pressed', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'h' }));
      const r = c.result();
      expect(r).not.toBeNull();
      expect(r!.userAction).toBe('H');
    });

    it('deals the next hand when Enter is pressed on a graded hand', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.answer('H');
      expect(c.result()).not.toBeNull();
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(c.result()).toBeNull();
    });

    it('ignores an action hotkey pressed with a modifier held', () => {
      const { c } = createPage();
      c.scenario.set(HIT_SCENARIO);
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
      expect(c.result()).toBeNull();
    });
  });
});
