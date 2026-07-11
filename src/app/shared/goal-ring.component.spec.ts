import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { GoalRingComponent } from './goal-ring.component';

@Component({
  imports: [GoalRingComponent],
  template: `<app-goal-ring [value]="value()" [goal]="goal()" [label]="label()" />`,
})
class HostComponent {
  readonly value = signal(14);
  readonly goal = signal(20);
  readonly label = signal('hands today');
}

function create(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

function ring(fixture: ComponentFixture<HostComponent>): HTMLElement {
  return fixture.nativeElement.querySelector('.ring') as HTMLElement;
}

describe('GoalRingComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('renders the count and label', () => {
    const { fixture } = create();
    expect(ring(fixture).textContent).toContain('14/20');
    expect(ring(fixture).textContent).toContain('hands today');
  });

  it('fills proportionally to progress', () => {
    const { fixture } = create();
    // 14/20 of 360deg = 252deg.
    expect(ring(fixture).style.getPropertyValue('--ring-fill')).toBe('252deg');
  });

  it('is not met below the goal, met (and capped) at or above it', () => {
    const { fixture, host } = create();
    expect(ring(fixture).classList.contains('ring--met')).toBe(false);

    host.value.set(27);
    fixture.detectChanges();
    expect(ring(fixture).classList.contains('ring--met')).toBe(true);
    expect(ring(fixture).style.getPropertyValue('--ring-fill')).toBe('360deg');
    expect(ring(fixture).textContent).toContain('27/20');
  });

  it('exposes an accessible summary', () => {
    const { fixture } = create();
    expect(ring(fixture).getAttribute('aria-label')).toBe('14 of 20 hands today');
  });
});
