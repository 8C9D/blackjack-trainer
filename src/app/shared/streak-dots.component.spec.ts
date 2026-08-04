import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import type { StreakDot } from '../core/services/practice-history.service';
import { StreakDotsComponent } from './streak-dots.component';

function dot(partial: Partial<StreakDot> & { date: string }): StreakDot {
  return { hands: 0, met: false, isToday: false, accuracy: null, ...partial };
}

const SIX_DAY_RUN: StreakDot[] = [
  dot({ date: '2026-07-04', hands: 20, met: true }),
  dot({ date: '2026-07-05', hands: 20, met: true }),
  dot({ date: '2026-07-06', hands: 20, met: true }),
  dot({ date: '2026-07-07', hands: 20, met: true }),
  dot({ date: '2026-07-08', hands: 20, met: true }),
  dot({ date: '2026-07-09', hands: 20, met: true }),
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

  it("describes each day's volume and goal state, including today", () => {
    const { fixture } = create();
    const graphic = fixture.nativeElement.querySelector('.dots') as HTMLElement;
    const label = graphic.getAttribute('aria-label')!;
    expect(label).toContain('6-day streak. Last 7 days:');
    expect(label).toContain('2026-07-04: 20 hands, goal met');
    expect(label).toContain('2026-07-10 (today): 0 hands, goal not met');
  });

  it('uses singular grammar for a one-hand day', () => {
    const { fixture, host } = create();
    host.dots.set([dot({ date: '2026-07-10', hands: 1, isToday: true })]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dots').getAttribute('aria-label')).toContain(
      '1 hand, goal not met',
    );
  });

  it('hides the duplicate visible caption from the accessibility tree', () => {
    const { fixture } = create();
    expect(fixture.nativeElement.querySelector('.dots__label').getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('shows a neutral label with no streak', () => {
    const { fixture, host } = create();
    host.streak.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dots__label').textContent).toBe('No streak yet');
  });
});
