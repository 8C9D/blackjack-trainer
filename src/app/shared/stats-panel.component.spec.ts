import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { SessionStats } from '../core/services/stats-store';
import { StatsPanelComponent } from './stats-panel.component';

const stats = (overrides: Partial<SessionStats> = {}): SessionStats => ({
  attempts: 0,
  correct: 0,
  streak: 0,
  longestStreak: 0,
  ...overrides,
});

function createPanel(
  value: SessionStats,
): ComponentFixture<StatsPanelComponent> {
  const fixture = TestBed.createComponent(StatsPanelComponent);
  fixture.componentRef.setInput('stats', value);
  fixture.detectChanges();
  return fixture;
}

// Returns the whitespace-normalized text of the stat cell containing `label`.
function cellText(
  fixture: ComponentFixture<StatsPanelComponent>,
  label: string,
): string {
  const cells = Array.from(
    fixture.nativeElement.querySelectorAll('.stats__cells div'),
  ) as HTMLElement[];
  const match = cells.find((c) => c.textContent?.includes(label));
  return (match?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function resetButton(
  fixture: ComponentFixture<StatsPanelComponent>,
): HTMLButtonElement {
  return fixture.nativeElement.querySelector('.stats__reset') as HTMLButtonElement;
}

describe('StatsPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StatsPanelComponent],
    });
  });

  it('renders attempts, correct, streak and longest-streak values from the input (smoke)', () => {
    const fixture = createPanel(
      stats({ attempts: 12, correct: 9, streak: 3, longestStreak: 5 }),
    );
    expect(cellText(fixture, 'Attempts')).toBe('Attempts: 12');
    expect(cellText(fixture, 'Correct')).toBe('Correct: 9');
    // "Streak" (capitalized) matches the streak cell, not "Longest streak".
    expect(cellText(fixture, 'Streak')).toBe('Streak: 3');
    expect(cellText(fixture, 'Longest')).toBe('Longest streak: 5');
  });

  it('shows an em dash for accuracy when there are no attempts', () => {
    const fixture = createPanel(stats());
    expect(cellText(fixture, 'Accuracy')).toBe('Accuracy: —');
  });

  it('shows a whole-number accuracy percentage', () => {
    const fixture = createPanel(stats({ attempts: 4, correct: 3 }));
    expect(cellText(fixture, 'Accuracy')).toBe('Accuracy: 75%');
  });

  it('rounds accuracy to the nearest percent', () => {
    const fixture = createPanel(stats({ attempts: 3, correct: 2 }));
    expect(cellText(fixture, 'Accuracy')).toBe('Accuracy: 67%');
  });

  it('disables the reset button while there are no attempts', () => {
    expect(resetButton(createPanel(stats())).disabled).toBe(true);
  });

  it('enables the reset button once there is at least one attempt', () => {
    expect(resetButton(createPanel(stats({ attempts: 1 }))).disabled).toBe(false);
  });

  it('emits reset when the reset button is clicked', () => {
    const fixture = createPanel(stats({ attempts: 1, correct: 1 }));
    let emitted = 0;
    fixture.componentInstance.reset.subscribe(() => {
      emitted += 1;
    });
    resetButton(fixture).click();
    expect(emitted).toBe(1);
  });
});
