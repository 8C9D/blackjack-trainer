import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { FlowTopbarComponent } from './flow-topbar.component';

@Component({
  imports: [FlowTopbarComponent],
  template: `<app-flow-topbar
    [name]="name()"
    [count]="count()"
    [target]="target()"
    [streak]="streak()"
    (exit)="exits = exits + 1"
  />`,
})
class HostComponent {
  readonly name = signal('Basic Strategy');
  readonly count = signal(15);
  readonly target = signal(20);
  readonly streak = signal(6);
  exits = 0;
}

function create(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('FlowTopbarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
  });

  it('shows the counter, name, and streak chip', () => {
    const { fixture } = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.topbar__count')!.textContent).toBe('15/20');
    expect(el.querySelector('.topbar__name')!.textContent).toBe('Basic Strategy');
    expect(el.querySelector('.topbar__streak')!.textContent!.trim()).toBe('streak 6');
  });

  // The trainer name is the drill screen's only heading. Phones hide it
  // visually (see the stylesheet), which is why it must not be hidden by a
  // structure that would also drop it from the accessibility tree.
  it('renders the trainer name as the page heading', () => {
    const { fixture } = create();
    const heading = fixture.nativeElement.querySelector('h1.topbar__name') as HTMLElement | null;
    expect(heading?.textContent).toBe('Basic Strategy');
  });

  it('fills the progress bar proportionally and caps at 100%', () => {
    const { fixture, host } = create();
    const fill = () =>
      (fixture.nativeElement.querySelector('.topbar__fill') as HTMLElement).style.width;
    expect(fill()).toBe('75%');
    host.count.set(23);
    fixture.detectChanges();
    expect(fill()).toBe('100%');
  });

  it('hides the streak chip for runs shorter than two', () => {
    const { fixture, host } = create();
    host.streak.set(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.topbar__streak')).toBeNull();
  });

  it('emits exit on the ✕ button', () => {
    const { fixture, host } = create();
    (fixture.nativeElement.querySelector('.topbar__exit') as HTMLButtonElement).click();
    expect(host.exits).toBe(1);
  });
});
