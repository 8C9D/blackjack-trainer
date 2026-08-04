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
    const el = ring(fixture);
    expect(el.getAttribute('role')).toBe('progressbar');
    expect(el.getAttribute('aria-label')).toBe('14 of 20 hands today');
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuenow')).toBe('14');
    expect(el.getAttribute('aria-valuemax')).toBe('20');
  });

  it('keeps ARIA progress values inside the range after the visible count exceeds the goal', () => {
    const { fixture, host } = create();
    host.value.set(27);
    fixture.detectChanges();
    expect(ring(fixture).getAttribute('aria-valuenow')).toBe('20');
    expect(ring(fixture).textContent).toContain('27/20');
  });

  it('clamps a defensive negative value without emitting a negative gradient or ARIA value', () => {
    const { fixture, host } = create();
    host.value.set(-2);
    fixture.detectChanges();
    expect(ring(fixture).style.getPropertyValue('--ring-fill')).toBe('0deg');
    expect(ring(fixture).getAttribute('aria-valuenow')).toBe('0');
  });

  it('keeps semantic progress valid when a caller supplies a non-positive goal', () => {
    const { fixture, host } = create();
    host.goal.set(0);
    fixture.detectChanges();
    expect(ring(fixture).style.getPropertyValue('--ring-fill')).toBe('360deg');
    expect(ring(fixture).getAttribute('aria-valuemax')).toBe('1');
    expect(ring(fixture).getAttribute('aria-valuenow')).toBe('1');
  });
});
