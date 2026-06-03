import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ACTION_LABELS } from '../../core/models/strategy.model';
import type { DeviationRule, DeviationTrainerResult } from '../../core/models/deviation.model';
import { DeviationFeedbackPanelComponent } from './deviation-feedback-panel.component';

// Representative basic-strategy-fallback result: the common trainer outcome
// where the true count does not reach any deviation index, so the expected
// play is just basic strategy and no rule matched. Deviation-specific cases
// (a matched rule, a candidate hand) override the relevant fields.
function result(overrides: Partial<DeviationTrainerResult> = {}): DeviationTrainerResult {
  return {
    userAction: 'H',
    expectedAction: 'H',
    basicAction: 'H',
    trueCount: 1,
    handDescription: 'Hard 16 vs 10',
    deviationApplied: false,
    source: 'playing',
    correct: true,
    explanation: 'TC +1 is below the index; play basic strategy: hit.',
    ...overrides,
  };
}

function rule(overrides: Partial<DeviationRule> = {}): DeviationRule {
  return {
    ruleSet: 'S17',
    category: 'hard',
    playerHand: '16',
    playerHandLabel: 'Hard 16',
    dealerUpcard: '10',
    index: 0,
    direction: 'at-or-above',
    basicAction: 'H',
    deviationAction: 'S',
    source: 'Illustrious 18 #1',
    ...overrides,
  };
}

function createPanel(
  value: DeviationTrainerResult | null,
  nextDisabled = false,
): ComponentFixture<DeviationFeedbackPanelComponent> {
  const fixture = TestBed.createComponent(DeviationFeedbackPanelComponent);
  fixture.componentRef.setInput('result', value);
  fixture.componentRef.setInput('nextDisabled', nextDisabled);
  fixture.detectChanges();
  return fixture;
}

function feedbackSection(
  fixture: ComponentFixture<DeviationFeedbackPanelComponent>,
): HTMLElement | null {
  return fixture.nativeElement.querySelector('.feedback');
}

// Pairs each <dt> term label with its sibling <dd> value by document order so
// assertions can reference stable labels instead of positional markup.
function detailsMap(
  fixture: ComponentFixture<DeviationFeedbackPanelComponent>,
): Record<string, string> {
  const dl = fixture.nativeElement.querySelector('.feedback__details') as HTMLElement;
  const terms = Array.from(dl.querySelectorAll('dt'));
  const values = Array.from(dl.querySelectorAll('dd'));
  const map: Record<string, string> = {};
  terms.forEach((dt, i) => {
    map[(dt as HTMLElement).textContent!.trim()] = (
      (values[i] as HTMLElement | undefined)?.textContent ?? ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  });
  return map;
}

function termLabels(fixture: ComponentFixture<DeviationFeedbackPanelComponent>): string[] {
  const dl = fixture.nativeElement.querySelector('.feedback__details') as HTMLElement;
  return Array.from(dl.querySelectorAll('dt')).map((dt) => (dt as HTMLElement).textContent!.trim());
}

describe('DeviationFeedbackPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DeviationFeedbackPanelComponent],
    });
  });

  it('creates without a result and renders nothing (neutral state)', () => {
    const fixture = createPanel(null);
    expect(fixture.componentInstance).toBeTruthy();
    expect(feedbackSection(fixture)).toBeNull();
    expect((fixture.nativeElement.textContent ?? '').trim()).toBe('');
  });

  it('renders the shared feedback shell once a result is provided (smoke)', () => {
    const fixture = createPanel(result());
    expect(feedbackSection(fixture)).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.feedback__next')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.feedback__details')).not.toBeNull();
  });

  it('shows the "Correct." verdict and correct styling for a correct answer', () => {
    const fixture = createPanel(result({ correct: true }));
    expect(feedbackSection(fixture)!.classList.contains('feedback--correct')).toBe(true);
    expect(fixture.nativeElement.querySelector('.feedback__verdict')!.textContent).toContain(
      'Correct.',
    );
  });

  it('shows the "Incorrect." verdict and incorrect styling for a wrong answer', () => {
    const fixture = createPanel(result({ correct: false }));
    expect(feedbackSection(fixture)!.classList.contains('feedback--incorrect')).toBe(true);
    expect(fixture.nativeElement.querySelector('.feedback__verdict')!.textContent).toContain(
      'Incorrect.',
    );
  });

  it('surfaces the shell verdict as a polite live region', () => {
    const fixture = createPanel(result());
    expect(feedbackSection(fixture)!.getAttribute('aria-live')).toBe('polite');
  });

  it('lists the hand details under stable term labels (no matched rule)', () => {
    const fixture = createPanel(result());
    expect(termLabels(fixture)).toEqual([
      'Hand',
      'True count',
      'Your action',
      'Correct action',
      'Basic strategy',
      'Deviation applied',
      'Why',
    ]);
  });

  it('renders the hand description and explanation rationale', () => {
    const fixture = createPanel(
      result({
        handDescription: 'Pair of 10s vs 6',
        explanation: 'At TC +5 you split 10s vs 6 (Illustrious 18).',
      }),
    );
    const map = detailsMap(fixture);
    expect(map['Hand']).toBe('Pair of 10s vs 6');
    expect(map['Why']).toBe('At TC +5 you split 10s vs 6 (Illustrious 18).');
  });

  it('translates the chosen, correct and basic-strategy action codes to labels', () => {
    const fixture = createPanel(result({ userAction: 'H', expectedAction: 'S', basicAction: 'D' }));
    const map = detailsMap(fixture);
    expect(map['Your action']).toBe(ACTION_LABELS['H']);
    expect(map['Correct action']).toBe(ACTION_LABELS['S']);
    expect(map['Basic strategy']).toBe(ACTION_LABELS['D']);
  });

  it('formats the true count with a sign for positive, zero and negative counts', () => {
    expect(detailsMap(createPanel(result({ trueCount: 3 })))['True count']).toBe('+3');
    expect(detailsMap(createPanel(result({ trueCount: 0 })))['True count']).toBe('0');
    expect(detailsMap(createPanel(result({ trueCount: -2 })))['True count']).toBe('-2');
  });

  it('reports the basic-strategy fallback path with "Deviation applied: No"', () => {
    const fixture = createPanel(result({ deviationApplied: false }));
    const map = detailsMap(fixture);
    expect(map['Deviation applied']).toBe('No');
    expect(termLabels(fixture)).not.toContain('Matched rule');
  });

  it('reports an applied deviation and renders the matched rule summary', () => {
    const fixture = createPanel(
      result({
        deviationApplied: true,
        expectedAction: 'S',
        matchedRule: rule({
          playerHandLabel: 'Hard 16',
          dealerUpcard: '10',
          deviationAction: 'S',
          direction: 'at-or-above',
          index: 0,
        }),
      }),
    );
    const map = detailsMap(fixture);
    expect(map['Deviation applied']).toBe('Yes');
    expect(termLabels(fixture)).toContain('Matched rule');
    expect(map['Matched rule']).toContain('Hard 16 vs 10');
    expect(map['Matched rule']).toContain(ACTION_LABELS['S']);
  });

  it('renders each deviation threshold direction in human-readable form', () => {
    const cases: Array<[Partial<DeviationRule>, string]> = [
      [{ direction: 'at-or-above', index: 4 }, 'TC ≥ +4'],
      [{ direction: 'at-or-below', index: -1 }, 'TC ≤ -1'],
      [{ direction: 'positive' }, 'TC > 0'],
      [{ direction: 'negative' }, 'TC < 0'],
    ];
    for (const [ruleOverrides, threshold] of cases) {
      const fixture = createPanel(
        result({ deviationApplied: true, matchedRule: rule(ruleOverrides) }),
      );
      expect(detailsMap(fixture)['Matched rule']).toContain(threshold);
    }
  });

  it('shows the candidate banner only when the hand is a deviation candidate', () => {
    const candidate = '.feedback__candidate';
    expect(createPanel(result()).nativeElement.querySelector(candidate)).toBeNull();

    const flagged = createPanel(result({ isDeviationCandidate: true }));
    const banner = flagged.nativeElement.querySelector(candidate) as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Deviation candidate hand.');
  });

  it('forwards nextDisabled to the deal-next button', () => {
    const enabled = createPanel(result(), false);
    expect(
      (enabled.nativeElement.querySelector('.feedback__next') as HTMLButtonElement).disabled,
    ).toBe(false);

    const disabled = createPanel(result(), true);
    expect(
      (disabled.nativeElement.querySelector('.feedback__next') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('emits next when the deal-next button is clicked', () => {
    const fixture = createPanel(result());
    let emitted = 0;
    fixture.componentInstance.next.subscribe(() => (emitted += 1));
    (fixture.nativeElement.querySelector('.feedback__next') as HTMLButtonElement).click();
    expect(emitted).toBe(1);
  });

  it('clears its rendered content when the result is reset to null', () => {
    const fixture = createPanel(result());
    expect(feedbackSection(fixture)).not.toBeNull();
    fixture.componentRef.setInput('result', null);
    fixture.detectChanges();
    expect(feedbackSection(fixture)).toBeNull();
  });
});
