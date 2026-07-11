import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import type { StreakDot } from '../core/services/practice-history.service';
import { StreakDotsComponent } from './streak-dots.component';

function dot(partial: Partial<StreakDot> & { date: string }): StreakDot {
  return { hands: 0, met: false, isToday: false, ...partial };
}

const SIX_DAY_RUN: StreakDot[] = [
  dot({ date: '2026-07-04', met: true }),
  dot({ date: '2026-07-05', met: true }),
  dot({ date: '2026-07-06', met: true }),
  dot({ date: '2026-07-07', met: true }),
  dot({ date: '2026-07-08', met: true }),
  dot({ date: '2026-07-09', met: true }),
  dot({ date: '2026-07-10', isToday: true }),
];

@Component({
  imports: [StreakDotsComponent],
  template: `<app-streak-dots [dots]="dots()" [streak]="streak()" />`,
})
class HostComponent {
  readonly dots = signal<readonly StreakDot[]>(SIX_DAY_RUN);
  readonly streak = signal(6);
}

function create(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('StreakDotsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('renders one dot per day with met and today modifiers', () => {
    const { fixture } = create();
    const dots = fixture.nativeElement.querySelectorAll('.dots__dot');
    expect(dots).toHaveLength(7);
    expect(dots[0].classList.contains('dots__dot--met')).toBe(true);
    expect(dots[6].classList.contains('dots__dot--today')).toBe(true);
    expect(dots[6].classList.contains('dots__dot--met')).toBe(false);
  });

  it('labels the streak', () => {
    const { fixture } = create();
    expect(fixture.nativeElement.querySelector('.dots__label').textContent).toBe('6-day streak');
  });

  it('shows a neutral label with no streak', () => {
    const { fixture, host } = create();
    host.streak.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dots__label').textContent).toBe('No streak yet');
  });
});
