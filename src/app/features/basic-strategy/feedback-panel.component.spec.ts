import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ACTION_LABELS, type EvaluationResult } from '../../core/models/strategy.model';
import { FeedbackPanelComponent } from './feedback-panel.component';

function evaluation(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    action: 'S',
    source: 'hard',
    handDescription: 'Hard 16',
    reason: 'Hard 16 vs dealer 10 under S17: stand.',
    userAction: 'S',
    correct: true,
    ...overrides,
  };
}

function createPanel(result: EvaluationResult | null): ComponentFixture<FeedbackPanelComponent> {
  const fixture = TestBed.createComponent(FeedbackPanelComponent);
  fixture.componentRef.setInput('result', result);
  fixture.detectChanges();
  return fixture;
}

function feedbackSection(fixture: ComponentFixture<FeedbackPanelComponent>): HTMLElement | null {
  return fixture.nativeElement.querySelector('.feedback');
}

describe('FeedbackPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FeedbackPanelComponent],
    });
  });

  it('creates without a result and renders nothing (neutral state)', () => {
    const fixture = createPanel(null);
    expect(fixture.componentInstance).toBeTruthy();
    expect(feedbackSection(fixture)).toBeNull();
    expect((fixture.nativeElement.textContent ?? '').trim()).toBe('');
  });

  it('renders the shared feedback shell once a result is provided (smoke)', () => {
    const fixture = createPanel(evaluation());
    expect(feedbackSection(fixture)).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.feedback__next')).not.toBeNull();
  });

  it('shows the "Correct." verdict and correct styling for a correct answer', () => {
    const fixture = createPanel(evaluation({ correct: true }));
    expect(feedbackSection(fixture)!.classList.contains('feedback--correct')).toBe(true);
    expect(fixture.nativeElement.querySelector('.feedback__verdict')!.textContent).toContain(
      'Correct.',
    );
  });

  it('shows the "Incorrect." verdict and incorrect styling for a wrong answer', () => {
    const fixture = createPanel(evaluation({ correct: false }));
    expect(feedbackSection(fixture)!.classList.contains('feedback--incorrect')).toBe(true);
    expect(fixture.nativeElement.querySelector('.feedback__verdict')!.textContent).toContain(
      'Incorrect.',
    );
  });

  it('lists the hand, the correct action and the reason under stable term labels', () => {
    const fixture = createPanel(
      evaluation({
        action: 'D',
        handDescription: 'Soft 18 (A, 7)',
        reason: 'Soft 18 (A, 7) vs dealer 3 under S17: double.',
      }),
    );
    const details = fixture.nativeElement.querySelector('.feedback__details') as HTMLElement;
    const terms = Array.from(details.querySelectorAll('dt')).map((dt) =>
      (dt as HTMLElement).textContent?.trim(),
    );
    expect(terms).toEqual(['Hand', 'Correct action', 'Why']);

    const text = details.textContent ?? '';
    expect(text).toContain('Soft 18 (A, 7)');
    expect(text).toContain('vs dealer 3 under S17: double.');
  });

  it('translates the correct-action code into its human label', () => {
    // The default reason ("…stand.") does not contain "Surrender", so finding
    // it proves the panel rendered the ACTION_LABELS translation, not the code.
    const fixture = createPanel(evaluation({ action: 'SUR' }));
    expect(fixture.nativeElement.textContent).toContain(ACTION_LABELS['SUR']);
  });

  it('emits next when the deal-next button is clicked', () => {
    const fixture = createPanel(evaluation());
    let emitted = 0;
    fixture.componentInstance.next.subscribe(() => (emitted += 1));
    (fixture.nativeElement.querySelector('.feedback__next') as HTMLButtonElement).click();
    expect(emitted).toBe(1);
  });

  it('clears its rendered content when the result is reset to null', () => {
    const fixture = createPanel(evaluation());
    expect(feedbackSection(fixture)).not.toBeNull();
    fixture.componentRef.setInput('result', null);
    fixture.detectChanges();
    expect(feedbackSection(fixture)).toBeNull();
  });
});
