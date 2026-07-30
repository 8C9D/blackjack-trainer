import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Card, Rank } from '../../core/models/card.model';
import type {
  CountingDrillResult,
  KeyCountDrillResult,
  RunningCountDrillResult,
  TrueCountDrillResult,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { HI_LO, KO } from '../../data/counting-systems';
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

function makeTrueCountResult(overrides: Partial<TrueCountDrillResult> = {}): TrueCountDrillResult {
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

// A six-deck KO round: prior −6 plus 2..6 (+5) → −5, below the −4 key count,
// correctly called "no advantage". Overrides carve out the variants.
function makeKeyCountResult(overrides: Partial<KeyCountDrillResult> = {}): KeyCountDrillResult {
  return {
    mode: 'key-count',
    cards: seq('2', '3', '4', '5', '6'),
    correctRunningCount: -5,
    userRunningCount: -5,
    countCorrect: true,
    priorRunningCount: -10,
    irc: -20,
    keyCount: -4,
    pivot: 4,
    insuranceCount: 3,
    hasAdvantage: false,
    userSaidAdvantage: false,
    advantageCorrect: true,
    isCorrect: true,
    ...overrides,
  };
}

function createPanel(
  result: CountingDrillResult,
  system: CountingSystem = HI_LO,
): ComponentFixture<CountFeedbackPanelComponent> {
  const fixture = TestBed.createComponent(CountFeedbackPanelComponent);
  fixture.componentRef.setInput('result', result);
  fixture.componentRef.setInput('system', system);
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
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
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
      const dts = Array.from(fixture.nativeElement.querySelectorAll('.feedback__details dt')).map(
        (el) => (el as HTMLElement).textContent?.trim(),
      );
      expect(dts).not.toContain('Your count');
      expect(dts).not.toContain('Correct count');
    });

    it('renders the card-by-card breakdown when toggled open', () => {
      const fixture = createPanel(makeTrueCountResult({ cards: seq('A', 'K', 'Q') }));
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
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

  describe('key-count mode', () => {
    it('renders the counts, the key count, and the advantage verdict', () => {
      const fixture = createPanel(makeKeyCountResult(), KO);
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Correct!');
      expect(text).toContain('Key count');
      expect(text).toContain('-4');
      expect(text).toContain('No — you said no');
    });

    it('explains the threshold and cites the IRC and pivot', () => {
      const fixture = createPanel(makeKeyCountResult(), KO);
      const formula = fixture.nativeElement.querySelector('.feedback__formula') as HTMLElement;
      expect(formula.textContent).toContain('below the key count');
      expect(formula.textContent).toContain('-20');
      expect(formula.textContent).toContain('+4');
    });

    it('flags the insurance trigger only at or above the insurance count', () => {
      const below = createPanel(makeKeyCountResult(), KO);
      expect(below.nativeElement.textContent).not.toContain('insurance');
      const above = createPanel(
        makeKeyCountResult({
          correctRunningCount: 3,
          userRunningCount: 3,
          hasAdvantage: true,
          userSaidAdvantage: true,
        }),
        KO,
      );
      expect(above.nativeElement.textContent).toContain('take insurance');
    });

    it('renders Incorrect when the advantage call is wrong even with a right count', () => {
      const fixture = createPanel(
        makeKeyCountResult({
          userSaidAdvantage: true,
          advantageCorrect: false,
          isCorrect: false,
        }),
        KO,
      );
      expect(fixture.nativeElement.textContent).toContain('Incorrect');
      expect(fixture.nativeElement.textContent).toContain('you said yes');
    });

    it('starts the breakdown running total from the carried (IRC-seeded) prior', () => {
      const fixture = createPanel(
        makeKeyCountResult({ cards: seq('2', '3'), priorRunningCount: -20 }),
        KO,
      );
      const toggle = fixture.nativeElement.querySelector('.feedback__toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      const totals = Array.from(
        fixture.nativeElement.querySelectorAll('.feedback__running'),
      ) as HTMLElement[];
      expect(totals.map((t) => t.textContent?.trim())).toEqual(['→ -19', '→ -18']);
    });
  });
});
