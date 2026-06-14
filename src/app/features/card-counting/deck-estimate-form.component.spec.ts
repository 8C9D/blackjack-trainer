import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { DeckEstimateFormComponent } from './deck-estimate-form.component';

function setInput(fixture: ComponentFixture<DeckEstimateFormComponent>, value: string): void {
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function getSubmit(fixture: ComponentFixture<DeckEstimateFormComponent>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement;
}

function submitForm(fixture: ComponentFixture<DeckEstimateFormComponent>): void {
  const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

describe('DeckEstimateFormComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DeckEstimateFormComponent],
    });
  });

  it('prompts for the decks remaining', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('How many decks remain?');
  });

  it('renders a half-deck stepper input', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('step')).toBe('0.5');
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });

  it('disables Submit when input is empty', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('enables Submit for a positive whole number', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    setInput(fixture, '5');
    expect(getSubmit(fixture).disabled).toBe(false);
  });

  it('enables Submit for a positive half-deck value', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    setInput(fixture, '2.5');
    expect(getSubmit(fixture).disabled).toBe(false);
  });

  it('disables Submit for zero (no decks remaining is not a valid estimate)', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    setInput(fixture, '0');
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('disables Submit for a negative value', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    setInput(fixture, '-1');
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('disables Submit for non-numeric input', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    setInput(fixture, 'abc');
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('emits the parsed estimate on submit', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    let received: number | undefined;
    fixture.componentInstance.estimate.subscribe((n) => {
      received = n;
    });
    setInput(fixture, '4.5');
    submitForm(fixture);
    expect(received).toBe(4.5);
  });

  it('does not emit on submit when the input is invalid', () => {
    const fixture = TestBed.createComponent(DeckEstimateFormComponent);
    fixture.detectChanges();
    let received: number | undefined;
    fixture.componentInstance.estimate.subscribe((n) => {
      received = n;
    });
    setInput(fixture, '0');
    submitForm(fixture);
    expect(received).toBeUndefined();
  });
});
