import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { FeedbackShellComponent } from './feedback-shell.component';

// Host that projects trainer-specific body markup into the shell so we can
// assert the <ng-content> slot renders between the verdict and the button.
@Component({
  imports: [FeedbackShellComponent],
  template: `
    <app-feedback-shell
      [correct]="correct"
      [nextDisabled]="nextDisabled"
      (next)="nextCount = nextCount + 1"
    >
      <dl class="projected-body">
        <dt>Your move</dt>
        <dd>Hit</dd>
      </dl>
    </app-feedback-shell>
  `,
})
class HostComponent {
  correct = true;
  nextDisabled = false;
  nextCount = 0;
}

function createShell(
  correct: boolean,
  nextDisabled = false,
): ComponentFixture<FeedbackShellComponent> {
  const fixture = TestBed.createComponent(FeedbackShellComponent);
  fixture.componentRef.setInput('correct', correct);
  fixture.componentRef.setInput('nextDisabled', nextDisabled);
  fixture.detectChanges();
  return fixture;
}

function nextButton(fixture: ComponentFixture<FeedbackShellComponent>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('.feedback__next') as HTMLButtonElement;
}

describe('FeedbackShellComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FeedbackShellComponent, HostComponent],
    });
  });

  it('creates and renders a verdict plus a deal-next button (smoke)', () => {
    const fixture = createShell(true);
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.feedback__verdict')).not.toBeNull();
    expect(nextButton(fixture)).not.toBeNull();
  });

  it('renders the "Correct." verdict and correct styling when correct', () => {
    const fixture = createShell(true);
    const section = fixture.nativeElement.querySelector('.feedback') as HTMLElement;
    expect(fixture.nativeElement.querySelector('.feedback__verdict')!.textContent).toContain(
      'Correct.',
    );
    expect(section.classList.contains('feedback--correct')).toBe(true);
    expect(section.classList.contains('feedback--incorrect')).toBe(false);
  });

  it('renders the "Incorrect." verdict and incorrect styling when not correct', () => {
    const fixture = createShell(false);
    const section = fixture.nativeElement.querySelector('.feedback') as HTMLElement;
    expect(fixture.nativeElement.querySelector('.feedback__verdict')!.textContent).toContain(
      'Incorrect.',
    );
    expect(section.classList.contains('feedback--incorrect')).toBe(true);
    expect(section.classList.contains('feedback--correct')).toBe(false);
  });

  it('exposes the verdict as a polite live region for screen readers', () => {
    const fixture = createShell(true);
    const section = fixture.nativeElement.querySelector('.feedback') as HTMLElement;
    expect(section.getAttribute('aria-live')).toBe('polite');
  });

  it('projects trainer-specific body content between the verdict and button', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.projected-body')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Your move');
  });

  it('enables the next button by default and disables it when nextDisabled', () => {
    expect(nextButton(createShell(true, false)).disabled).toBe(false);
    expect(nextButton(createShell(true, true)).disabled).toBe(true);
  });

  it('emits next when the deal-next button is clicked', () => {
    const fixture = createShell(true);
    let emitted = 0;
    fixture.componentInstance.next.subscribe(() => {
      emitted += 1;
    });
    nextButton(fixture).click();
    expect(emitted).toBe(1);
  });
});
