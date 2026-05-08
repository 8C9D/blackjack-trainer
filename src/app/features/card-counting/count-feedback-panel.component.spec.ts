import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank } from '../../core/models/card.model';
import type {
  CountingDrillResult,
  RunningCountDrillResult,
  TrueCountDrillResult,
} from '../../core/models/card-counting.model';
import { HI_LO } from '../../data/counting-systems';
import { CountFeedbackPanelComponent } from './count-feedback-panel.component';

const card = (rank: Rank): Card => ({ rank, suit: 'spades' });
const seq = (...ranks: Rank[]): Card[] => ranks.map(card);

function makeRunningCountResult(
  overrides: Partial<RunningCountDrillResult> = {},
): RunningCountDrillResult {
  return {
    mode: 'running-count',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: 5,
    userRunningCount: 5,
    isCorrect: true,
    ...overrides,
  };
}

function makeTrueCountResult(
  overrides: Partial<TrueCountDrillResult> = {},
): TrueCountDrillResult {
  return {
    mode: 'true-count',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: 6,
    decksRemaining: 2,
    correctTrueCount: 3,
    userTrueCount: 3,
    isCorrect: true,
    ...overrides,
  };
}

function createPanel(
  result: CountingDrillResult,
): ComponentFixture<CountFeedbackPanelComponent> {
  const fixture = TestBed.createComponent(CountFeedbackPanelComponent);
  fixture.componentRef.setInput('result', result);
  fixture.componentRef.setInput('system', HI_LO);
  fixture.detectChanges();
  return fixture;
}

describe('CountFeedbackPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CountFeedbackPanelComponent],
    });
  });

  describe('running-count mode', () => {
    it('renders Correct verdict and user/correct running counts', () => {
      const fixture = createPanel(
        makeRunningCountResult({ userRunningCount: 5, correctRunningCount: 5 }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Correct');
      expect(text).toContain('Your count');
      expect(text).toContain('Correct count');
    });

    it('renders Incorrect verdict on a wrong answer', () => {
      const fixture = createPanel(
        makeRunningCountResult({ userRunningCount: 4, correctRunningCount: 5, isCorrect: false }),
      );
      expect(fixture.nativeElement.textContent).toContain('Incorrect');
    });

    it('does not render the true-count formula line', () => {
      const fixture = createPanel(makeRunningCountResult());
      expect(fixture.nativeElement.querySelector('.feedback__formula')).toBeNull();
    });

    it('renders the card-by-card breakdown when toggled open', () => {
      const fixture = createPanel(makeRunningCountResult());
      const toggle = fixture.nativeElement.querySelector(
        '.feedback__toggle',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const cells = fixture.nativeElement.querySelectorAll('.feedback__cell');
      expect(cells.length).toBe(5);
    });
  });

  describe('true-count mode', () => {
    it('renders the true-count fields', () => {
      const fixture = createPanel(
        makeTrueCountResult({
          userTrueCount: 3,
          correctTrueCount: 3,
          correctRunningCount: 6,
          decksRemaining: 2,
        }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('Your true count');
      expect(text).toContain('Correct true count');
      expect(text).toContain('Running count');
      expect(text).toContain('Decks remaining');
    });

    it('renders the running count value used and the decks remaining value', () => {
      const fixture = createPanel(
        makeTrueCountResult({ correctRunningCount: 6, decksRemaining: 2 }),
      );
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('6');
      expect(text).toContain('2');
    });

    it('renders the formula line', () => {
      const fixture = createPanel(
        makeTrueCountResult({
          correctRunningCount: 6,
          decksRemaining: 2,
          correctTrueCount: 3,
        }),
      );
      const formula = fixture.nativeElement.querySelector('.feedback__formula');
      expect(formula).not.toBeNull();
      const text = formula!.textContent ?? '';
      expect(text).toContain('6');
      expect(text).toContain('2');
      expect(text).toContain('3');
      expect(text).toContain('decks');
    });

    it('does not render the running-count "Your count" label', () => {
      const fixture = createPanel(makeTrueCountResult());
      const dts = Array.from(
        fixture.nativeElement.querySelectorAll('.feedback__details dt'),
      ).map((el) => (el as HTMLElement).textContent?.trim());
      expect(dts).not.toContain('Your count');
      expect(dts).not.toContain('Correct count');
    });

    it('renders the card-by-card breakdown when toggled open', () => {
      const fixture = createPanel(
        makeTrueCountResult({ cards: seq('A', 'K', 'Q') }),
      );
      const toggle = fixture.nativeElement.querySelector(
        '.feedback__toggle',
      ) as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const cells = fixture.nativeElement.querySelectorAll('.feedback__cell');
      expect(cells.length).toBe(3);
    });

    it('renders Incorrect verdict on a wrong answer', () => {
      const fixture = createPanel(
        makeTrueCountResult({ userTrueCount: 2, correctTrueCount: 3, isCorrect: false }),
      );
      expect(fixture.nativeElement.textContent).toContain('Incorrect');
    });
  });
});
