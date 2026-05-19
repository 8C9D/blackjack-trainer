import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { DECKS_REMAINING_PRESETS, type DrillMode } from '../../core/models/card-counting.model';
import { CountingSettingsComponent } from './counting-settings.component';

function createSettings(
  overrides: Partial<{
    mode: DrillMode;
    numberOfCards: number;
    millisecondsBetweenCards: number;
    decksRemaining: number;
    errors: readonly string[];
    disabled: boolean;
  }> = {},
): ComponentFixture<CountingSettingsComponent> {
  const fixture = TestBed.createComponent(CountingSettingsComponent);
  const ref = fixture.componentRef;
  ref.setInput('mode', overrides.mode ?? 'running-count');
  ref.setInput('numberOfCards', overrides.numberOfCards ?? 20);
  ref.setInput('millisecondsBetweenCards', overrides.millisecondsBetweenCards ?? 500);
  ref.setInput('decksRemaining', overrides.decksRemaining ?? 1);
  ref.setInput('decksRemainingPresets', DECKS_REMAINING_PRESETS);
  if (overrides.errors !== undefined) ref.setInput('errors', overrides.errors);
  if (overrides.disabled !== undefined) ref.setInput('disabled', overrides.disabled);
  fixture.detectChanges();
  return fixture;
}

describe('CountingSettingsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CountingSettingsComponent],
    });
  });

  it('renders both mode radios', () => {
    const fixture = createSettings();
    const radios = fixture.nativeElement.querySelectorAll('input[type=radio][name=drill-mode]');
    expect(radios.length).toBe(2);
    const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
    expect(values).toEqual(['running-count', 'true-count']);
  });

  it('marks the active mode radio as checked', () => {
    const fixture = createSettings({ mode: 'true-count' });
    const rc = fixture.nativeElement.querySelector(
      'input[type=radio][value="running-count"]',
    ) as HTMLInputElement;
    const tc = fixture.nativeElement.querySelector(
      'input[type=radio][value="true-count"]',
    ) as HTMLInputElement;
    expect(rc.checked).toBe(false);
    expect(tc.checked).toBe(true);
  });

  it('emits modeChange when a radio is selected', () => {
    const fixture = createSettings({ mode: 'running-count' });
    let received: DrillMode | undefined;
    fixture.componentInstance.modeChange.subscribe((m) => {
      received = m;
    });
    const tc = fixture.nativeElement.querySelector(
      'input[type=radio][value="true-count"]',
    ) as HTMLInputElement;
    tc.checked = true;
    tc.dispatchEvent(new Event('change'));
    expect(received).toBe('true-count');
  });

  it('hides the decks-remaining select in running-count mode', () => {
    const fixture = createSettings({ mode: 'running-count' });
    expect(fixture.nativeElement.querySelector('.settings__decks-remaining')).toBeNull();
  });

  it('shows the decks-remaining select in true-count mode', () => {
    const fixture = createSettings({ mode: 'true-count' });
    const select = fixture.nativeElement.querySelector(
      '.settings__decks-remaining',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
  });

  it('populates the decks-remaining select from DECKS_REMAINING_PRESETS', () => {
    const fixture = createSettings({ mode: 'true-count' });
    const options = fixture.nativeElement.querySelectorAll('.settings__decks-remaining option');
    expect(options.length).toBe(DECKS_REMAINING_PRESETS.length);
    const values = Array.from(options).map((o) => Number((o as HTMLOptionElement).value));
    expect(values).toEqual([...DECKS_REMAINING_PRESETS]);
  });

  it('marks the current decksRemaining option as selected', () => {
    const fixture = createSettings({ mode: 'true-count', decksRemaining: 2 });
    const select = fixture.nativeElement.querySelector(
      '.settings__decks-remaining',
    ) as HTMLSelectElement;
    expect(Number(select.value)).toBe(2);
  });

  it('emits decksRemainingChange as a number when the select changes', () => {
    const fixture = createSettings({ mode: 'true-count', decksRemaining: 1 });
    let received: number | undefined;
    fixture.componentInstance.decksRemainingChange.subscribe((n) => {
      received = n;
    });
    const select = fixture.nativeElement.querySelector(
      '.settings__decks-remaining',
    ) as HTMLSelectElement;
    select.value = '2.5';
    select.dispatchEvent(new Event('change'));
    expect(received).toBe(2.5);
  });

  it('renders validation errors when provided', () => {
    const fixture = createSettings({ errors: ['Something is wrong'] });
    const errors = fixture.nativeElement.querySelector('.settings__errors');
    expect(errors).not.toBeNull();
    expect(errors!.textContent).toContain('Something is wrong');
  });

  it('disables the fieldset when disabled is true', () => {
    const fixture = createSettings({ disabled: true });
    const fieldset = fixture.nativeElement.querySelector(
      'fieldset.settings',
    ) as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
  });
});
