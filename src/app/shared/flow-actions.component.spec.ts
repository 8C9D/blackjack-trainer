import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import type { Action } from '../core/models/strategy.model';
import { FLOW_ACTION_ORDER, FlowActionsComponent } from './flow-actions.component';

@Component({
  imports: [FlowActionsComponent],
  template: `<app-flow-actions
    [legal]="legal()"
    [picked]="picked()"
    [correct]="correct()"
    (action)="answers.push($event)"
  />`,
})
class HostComponent {
  readonly legal = signal<readonly Action[]>(['H', 'S', 'D', 'SUR']);
  readonly picked = signal<Action | null>(null);
  readonly correct = signal<Action | null>(null);
  readonly answers: Action[] = [];
}

function create(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

function buttons(fixture: ComponentFixture<HostComponent>): HTMLButtonElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.acts__btn'));
}

function buttonFor(fixture: ComponentFixture<HostComponent>, label: string): HTMLButtonElement {
  const found = buttons(fixture).find((b) => b.textContent!.includes(label));
  if (!found) throw new Error(`No action button labelled "${label}"`);
  return found;
}

describe('FlowActionsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('always renders all six actions in the fixed order', () => {
    const { fixture } = create();
    const labels = buttons(fixture).map(
      (b) => (b.querySelector('.acts__label') as HTMLElement).textContent,
    );
    expect(labels).toEqual(['Hit', 'Stand', 'Double', 'Split', 'Surrender', 'Insurance']);
    expect(FLOW_ACTION_ORDER).toEqual(['H', 'S', 'D', 'P', 'SUR', 'INS']);
  });

  it('disables and marks illegal actions (poka-yoke)', () => {
    const { fixture } = create();
    const split = buttonFor(fixture, 'Split');
    const insurance = buttonFor(fixture, 'Insurance');
    expect(split.disabled).toBe(true);
    expect(split.classList.contains('acts__btn--off')).toBe(true);
    expect(insurance.disabled).toBe(true);
    expect(buttonFor(fixture, 'Hit').disabled).toBe(false);
  });

  it('emits legal actions and swallows clicks on illegal ones', () => {
    const { fixture, host } = create();
    buttonFor(fixture, 'Hit').click();
    buttonFor(fixture, 'Split').click();
    expect(host.answers).toEqual(['H']);
  });

  it('flashes the pressed button green on a correct answer', () => {
    const { fixture, host } = create();
    host.picked.set('D');
    host.correct.set('D');
    fixture.detectChanges();
    const double = buttonFor(fixture, 'Double');
    expect(double.classList.contains('acts__btn--correct')).toBe(true);
    expect(double.classList.contains('acts__btn--picked')).toBe(false);
    expect(double.textContent).not.toContain('correct');
  });

  it('grades a miss in place: pick red, correct green, others dim', () => {
    const { fixture, host } = create();
    host.picked.set('H');
    host.correct.set('D');
    fixture.detectChanges();

    const hit = buttonFor(fixture, 'Hit');
    const double = buttonFor(fixture, 'Double');
    const stand = buttonFor(fixture, 'Stand');
    expect(hit.classList.contains('acts__btn--picked')).toBe(true);
    expect(hit.textContent).toContain('your pick');
    expect(double.classList.contains('acts__btn--correct')).toBe(true);
    expect(double.textContent).toContain('correct');
    expect(stand.classList.contains('acts__btn--dim')).toBe(true);
  });

  it('locks all buttons while graded', () => {
    const { fixture, host } = create();
    host.picked.set('H');
    host.correct.set('D');
    fixture.detectChanges();
    expect(buttons(fixture).every((b) => b.disabled)).toBe(true);
    buttonFor(fixture, 'Stand').click();
    expect(host.answers).toEqual([]);
  });
});
