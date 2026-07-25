import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import type { WeakSpot } from '../core/services/miss-tally.service';
import { FlowDoneComponent } from './flow-done.component';

const WEAK: WeakSpot = {
  ref: { kind: 'hard', hand: '16', dealer: '10' },
  label: '16 vs 10',
  misses: 3,
  attempts: 7,
  streak: 0,
};

const spot = (label: string, streak: number, misses = 1): WeakSpot => ({
  ref: { kind: 'hard', hand: label, dealer: '10' },
  label,
  misses,
  attempts: misses + streak,
  streak,
});

@Component({
  imports: [FlowDoneComponent],
  template: `<app-flow-done
    [hands]="hands()"
    [target]="target()"
    [goalMet]="goalMet()"
    [bestStreak]="bestStreak()"
    [accuracy]="accuracy()"
    [weakSpot]="weakSpot()"
    [weakSpots]="weakSpots()"
    [cleared]="cleared()"
    (again)="agains = agains + 1"
    (review)="reviews = reviews + 1"
    (exit)="exits = exits + 1"
  />`,
})
class HostComponent {
  readonly hands = signal(20);
  readonly target = signal(20);
  readonly goalMet = signal(true);
  readonly bestStreak = signal(11);
  readonly accuracy = signal<number | null>(90);
  readonly weakSpot = signal<WeakSpot | null>(WEAK);
  readonly weakSpots = signal<readonly WeakSpot[]>([WEAK]);
  readonly cleared = signal<readonly WeakSpot[]>([]);
  agains = 0;
  reviews = 0;
  exits = 0;
}

function create(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('FlowDoneComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('shows the completed ring, session peaks, and the weakness card', () => {
    const { fixture } = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.ring')!.textContent).toContain('20/20');
    expect(el.querySelector('.ring')!.textContent).toContain('goal met');
    expect(el.querySelector('.done__peak')!.textContent).toContain('Best streak: 11');
    expect(el.querySelector('.done__peak')!.textContent).toContain('90% today');
    expect(el.querySelector('.done__next')!.textContent).toContain('Drill my misses: 16 vs 10');
    expect(el.querySelector('.done__next')!.textContent).toContain('missed 3 of 7 this week');
  });

  it('omits the weakness card when there is none', () => {
    const { fixture, host } = create();
    host.weakSpot.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.done__next')).toBeNull();
  });

  // The queued weakness is the promise; making it clickable is what lets the
  // next round keep it immediately instead of only by chance.
  it('starts a review round from the weakness card and from R', () => {
    const { fixture, host } = create();
    (fixture.nativeElement.querySelector('.done__next') as HTMLButtonElement).click();
    expect(host.reviews).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(host.reviews).toBe(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R' }));
    expect(host.reviews).toBe(3);
  });

  it('leaves R dead when there is nothing to review', () => {
    const { fixture, host } = create();
    host.weakSpot.set(null);
    host.weakSpots.set([]);
    fixture.detectChanges();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(host.reviews).toBe(0);
  });

  it('counts the other outstanding weak spots without naming them', () => {
    const { fixture, host } = create();
    host.weakSpots.set([WEAK, spot('15', 0), spot('12', 0)]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.done__next')!.textContent).toContain('+2 more');
  });

  it('names what was cleared this week, collapsing a long list', () => {
    const { fixture, host } = create();
    expect(fixture.nativeElement.querySelector('.done__cleared')).toBeNull();

    host.cleared.set([spot('16', 3), spot('15', 3), spot('12', 3), spot('11', 4), spot('10', 5)]);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.done__cleared')!.textContent!;
    // Ordering is the caller's; the component shows three and counts the rest.
    expect(text).toContain('Cleared:');
    expect(text).toContain('16 · 15 · 12');
    expect(text).toContain('+2 more');
  });

  it('emits again on the primary button and Enter', () => {
    const { fixture, host } = create();
    (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
    expect(host.agains).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(host.agains).toBe(2);
  });

  it('emits exit on the quiet button and Escape — never a confirmation', () => {
    const { fixture, host } = create();
    (fixture.nativeElement.querySelector('.done__exit') as HTMLButtonElement).click();
    expect(host.exits).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.exits).toBe(2);
  });

  // The screen replaces the whole drill, so the action button that had focus
  // is gone by the time it renders; without this, focus falls back to <body>
  // and the summary is never announced.
  it('takes focus when it appears', () => {
    const { fixture } = create();
    const section = fixture.nativeElement.querySelector('.done') as HTMLElement;
    expect(section.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(section);
  });

  it('ignores keys with modifiers held', () => {
    const { host } = create();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    expect(host.agains).toBe(0);
  });
});
