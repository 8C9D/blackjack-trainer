import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { CountAnswerFormComponent } from './count-answer-form.component';

function setInput(fixture: ComponentFixture<CountAnswerFormComponent>, value: string): void {
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function getSubmit(fixture: ComponentFixture<CountAnswerFormComponent>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement;
}

function submitForm(fixture: ComponentFixture<CountAnswerFormComponent>): void {
  const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}

describe('CountAnswerFormComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CountAnswerFormComponent],
    });
  });

  it('defaults to the running-count prompt label', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('running count');
    expect(fixture.nativeElement.textContent).not.toContain('true count');
  });

  it('renders the true-count prompt label when mode is true-count', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.componentRef.setInput('mode', 'true-count');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('true count');
  });

  it('disables Submit when input is empty', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('disables Submit for decimal input', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    setInput(fixture, '1.5');
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('disables Submit for non-numeric input', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    setInput(fixture, 'abc');
    expect(getSubmit(fixture).disabled).toBe(true);
  });

  it('enables Submit for a positive integer', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    setInput(fixture, '5');
    expect(getSubmit(fixture).disabled).toBe(false);
  });

  it('enables Submit for a negative integer', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    setInput(fixture, '-7');
    expect(getSubmit(fixture).disabled).toBe(false);
  });

  it('enables Submit for zero', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    setInput(fixture, '0');
    expect(getSubmit(fixture).disabled).toBe(false);
  });

  it('emits the parsed integer on submit', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    let received: number | undefined;
    fixture.componentInstance.answer.subscribe((n) => {
      received = n;
    });
    setInput(fixture, '-7');
    submitForm(fixture);
    expect(received).toBe(-7);
  });

  it('does not emit on submit when input is invalid', () => {
    const fixture = TestBed.createComponent(CountAnswerFormComponent);
    fixture.detectChanges();
    let received: number | undefined;
    fixture.componentInstance.answer.subscribe((n) => {
      received = n;
    });
    setInput(fixture, '1.5');
    submitForm(fixture);
    expect(received).toBeUndefined();
  });

  describe('fractional answers (allowFractions)', () => {
    it('enables Submit for a half-point decimal when fractions are allowed', () => {
      const fixture = TestBed.createComponent(CountAnswerFormComponent);
      fixture.componentRef.setInput('allowFractions', true);
      fixture.detectChanges();
      setInput(fixture, '2.5');
      expect(getSubmit(fixture).disabled).toBe(false);
    });

    it('enables Submit for a negative half-point decimal when fractions are allowed', () => {
      const fixture = TestBed.createComponent(CountAnswerFormComponent);
      fixture.componentRef.setInput('allowFractions', true);
      fixture.detectChanges();
      setInput(fixture, '-0.5');
      expect(getSubmit(fixture).disabled).toBe(false);
    });

    it('still rejects non-numeric input when fractions are allowed', () => {
      const fixture = TestBed.createComponent(CountAnswerFormComponent);
      fixture.componentRef.setInput('allowFractions', true);
      fixture.detectChanges();
      setInput(fixture, 'abc');
      expect(getSubmit(fixture).disabled).toBe(true);
    });

    it('emits the parsed fractional number on submit', () => {
      const fixture = TestBed.createComponent(CountAnswerFormComponent);
      fixture.componentRef.setInput('allowFractions', true);
      fixture.detectChanges();
      let received: number | undefined;
      fixture.componentInstance.answer.subscribe((n) => {
        received = n;
      });
      setInput(fixture, '2.5');
      submitForm(fixture);
      expect(received).toBe(2.5);
    });

    it('shows the fractional-input note only when fractions are allowed', () => {
      const fixture = TestBed.createComponent(CountAnswerFormComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.answer__note')).toBeNull();
      fixture.componentRef.setInput('allowFractions', true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.answer__note')).not.toBeNull();
    });
  });
});
