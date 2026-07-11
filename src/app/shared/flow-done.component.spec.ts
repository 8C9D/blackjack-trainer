import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import type { WeakSpot } from '../core/services/miss-tally.service';
import { FlowDoneComponent } from './flow-done.component';

const WEAK: WeakSpot = {
  ref: { kind: 'hard', hand: '16', dealer: '10' },
  label: '16 vs 10',
  misses: 3,
  attempts: 7,
};

@Component({
  imports: [FlowDoneComponent],
  template: `<app-flow-done
    [hands]="hands()"
    [target]="target()"
    [goalMet]="goalMet()"
    [bestStreak]="bestStreak()"
    [accuracy]="accuracy()"
    [weakSpot]="weakSpot()"
    (again)="agains = agains + 1"
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
  agains = 0;
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
    expect(el.querySelector('.done__next')!.textContent).toContain('Drill next: 16 vs 10');
    expect(el.querySelector('.done__next')!.textContent).toContain('missed 3 of 7 this week');
  });

  it('omits the weakness card when there is none', () => {
    const { fixture, host } = create();
    host.weakSpot.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.done__next')).toBeNull();
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

  it('ignores keys with modifiers held', () => {
    const { host } = create();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    expect(host.agains).toBe(0);
  });
});
