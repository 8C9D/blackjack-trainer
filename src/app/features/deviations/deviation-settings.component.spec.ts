import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { EngineOptions, RuleSet } from '../../core/models/strategy.model';
import {
  DeviationSettingsComponent,
  MAX_MANUAL_TRUE_COUNT,
  MIN_MANUAL_TRUE_COUNT,
  parseManualTrueCount,
  type DeviationPracticeMode,
  type TrueCountSource,
} from './deviation-settings.component';

function createSettings(
  overrides: Partial<{
    ruleSet: RuleSet;
    options: EngineOptions;
    trueCountSource: TrueCountSource;
    manualTrueCount: number | null;
    practiceMode: DeviationPracticeMode;
  }> = {},
): ComponentFixture<DeviationSettingsComponent> {
  const fixture = TestBed.createComponent(DeviationSettingsComponent);
  const ref = fixture.componentRef;
  ref.setInput('ruleSet', overrides.ruleSet ?? 'S17');
  ref.setInput('options', overrides.options ?? { doubleAfterSplit: false, lateSurrender: false });
  ref.setInput('trueCountSource', overrides.trueCountSource ?? 'random');
  ref.setInput(
    'manualTrueCount',
    overrides.manualTrueCount === undefined ? 0 : overrides.manualTrueCount,
  );
  ref.setInput('practiceMode', overrides.practiceMode ?? 'all-hands');
  fixture.detectChanges();
  return fixture;
}

describe('DeviationSettingsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DeviationSettingsComponent],
    });
  });

  describe('rule set and table options (existing)', () => {
    it('renders S17 and H17 radios', () => {
      const fixture = createSettings();
      const radios = fixture.nativeElement.querySelectorAll(
        'input[type=radio][name=deviation-ruleSet]',
      );
      expect(radios.length).toBe(2);
    });

    it('emits ruleSetChange when a rule set radio is selected', () => {
      const fixture = createSettings({ ruleSet: 'S17' });
      let received: RuleSet | undefined;
      fixture.componentInstance.ruleSetChange.subscribe((r) => {
        received = r;
      });
      const h17 = Array.from(
        fixture.nativeElement.querySelectorAll('input[type=radio][name=deviation-ruleSet]'),
      ).find((r) => !(r as HTMLInputElement).checked) as HTMLInputElement;
      h17.checked = true;
      h17.dispatchEvent(new Event('change'));
      expect(received).toBe('H17');
    });

    it('emits optionsChange when a checkbox toggles', () => {
      const fixture = createSettings();
      let received: EngineOptions | undefined;
      fixture.componentInstance.optionsChange.subscribe((o) => {
        received = o;
      });
      const checkboxes = fixture.nativeElement.querySelectorAll(
        'input[type=checkbox]',
      ) as NodeListOf<HTMLInputElement>;
      checkboxes[0].dispatchEvent(new Event('change'));
      expect(received?.doubleAfterSplit).toBe(true);
    });
  });

  describe('true count source controls', () => {
    it('renders both true-count-source radios', () => {
      const fixture = createSettings();
      const radios = fixture.nativeElement.querySelectorAll(
        'input[type=radio][name=deviation-tcSource]',
      ) as NodeListOf<HTMLInputElement>;
      expect(radios.length).toBe(2);
      const values = Array.from(radios).map((r) => r.value);
      expect(values).toEqual(['random', 'manual']);
    });

    it('marks the active true-count-source radio as checked', () => {
      const fixture = createSettings({ trueCountSource: 'manual' });
      const random = fixture.nativeElement.querySelector(
        'input[type=radio][name=deviation-tcSource][value="random"]',
      ) as HTMLInputElement;
      const manual = fixture.nativeElement.querySelector(
        'input[type=radio][name=deviation-tcSource][value="manual"]',
      ) as HTMLInputElement;
      expect(random.checked).toBe(false);
      expect(manual.checked).toBe(true);
    });

    it('emits trueCountSourceChange when a source radio is selected', () => {
      const fixture = createSettings({ trueCountSource: 'random' });
      let received: TrueCountSource | undefined;
      fixture.componentInstance.trueCountSourceChange.subscribe((s) => {
        received = s;
      });
      const manual = fixture.nativeElement.querySelector(
        'input[type=radio][name=deviation-tcSource][value="manual"]',
      ) as HTMLInputElement;
      manual.checked = true;
      manual.dispatchEvent(new Event('change'));
      expect(received).toBe('manual');
    });
  });

  describe('manual true count input', () => {
    it('does not render the manual input in random mode', () => {
      const fixture = createSettings({ trueCountSource: 'random' });
      expect(fixture.nativeElement.querySelector('.deviation-settings__manual-input')).toBeNull();
    });

    it('renders the manual input in manual mode', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: 0,
      });
      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('0');
    });

    it('reflects the parent manualTrueCount as the initial value', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: 5,
      });
      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      expect(input.value).toBe('5');
    });

    it('emits manualTrueCountChange with the parsed integer for valid input', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: 0,
      });
      const received: (number | null)[] = [];
      fixture.componentInstance.manualTrueCountChange.subscribe((n) => {
        received.push(n);
      });
      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      input.value = '3';
      input.dispatchEvent(new Event('input'));
      expect(received).toEqual([3]);

      input.value = '-4';
      input.dispatchEvent(new Event('input'));
      expect(received).toEqual([3, -4]);
    });

    it('emits null for an empty or non-integer input', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: 0,
      });
      const received: (number | null)[] = [];
      fixture.componentInstance.manualTrueCountChange.subscribe((n) => {
        received.push(n);
      });
      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      expect(received[received.length - 1]).toBeNull();
    });

    it('emits null for an out-of-range input', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: 0,
      });
      const received: (number | null)[] = [];
      fixture.componentInstance.manualTrueCountChange.subscribe((n) => {
        received.push(n);
      });
      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      input.value = String(MAX_MANUAL_TRUE_COUNT + 1);
      input.dispatchEvent(new Event('input'));
      expect(received[received.length - 1]).toBeNull();
    });

    it('shows an error message and aria-invalid when manualTrueCount is null', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: null,
      });
      const error = fixture.nativeElement.querySelector(
        '.deviation-settings__error',
      ) as HTMLElement | null;
      expect(error).not.toBeNull();
      expect(error!.textContent).toContain(String(MIN_MANUAL_TRUE_COUNT));
      expect(error!.textContent).toContain(String(MAX_MANUAL_TRUE_COUNT));

      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('keeps the user-typed value visible even when it is invalid', () => {
      const fixture = createSettings({
        trueCountSource: 'manual',
        manualTrueCount: 0,
      });
      const input = fixture.nativeElement.querySelector(
        '.deviation-settings__manual-input',
      ) as HTMLInputElement;
      // Simulate the page reacting to the invalid emit by setting input to null.
      input.value = '99';
      input.dispatchEvent(new Event('input'));
      fixture.componentRef.setInput('manualTrueCount', null);
      fixture.detectChanges();
      expect(input.value).toBe('99');
    });
  });

  describe('practice mode controls', () => {
    it('renders both practice-mode radios', () => {
      const fixture = createSettings();
      const radios = fixture.nativeElement.querySelectorAll(
        'input[type=radio][name=deviation-practiceMode]',
      ) as NodeListOf<HTMLInputElement>;
      expect(radios.length).toBe(2);
      const values = Array.from(radios).map((r) => r.value);
      expect(values).toEqual(['all-hands', 'deviation-only']);
    });

    it('marks the active practice-mode radio as checked', () => {
      const fixture = createSettings({ practiceMode: 'deviation-only' });
      const all = fixture.nativeElement.querySelector(
        'input[type=radio][name=deviation-practiceMode][value="all-hands"]',
      ) as HTMLInputElement;
      const dev = fixture.nativeElement.querySelector(
        'input[type=radio][name=deviation-practiceMode][value="deviation-only"]',
      ) as HTMLInputElement;
      expect(all.checked).toBe(false);
      expect(dev.checked).toBe(true);
    });

    it('emits practiceModeChange when a mode radio is selected', () => {
      const fixture = createSettings({ practiceMode: 'all-hands' });
      let received: DeviationPracticeMode | undefined;
      fixture.componentInstance.practiceModeChange.subscribe((m) => {
        received = m;
      });
      const dev = fixture.nativeElement.querySelector(
        'input[type=radio][name=deviation-practiceMode][value="deviation-only"]',
      ) as HTMLInputElement;
      dev.checked = true;
      dev.dispatchEvent(new Event('change'));
      expect(received).toBe('deviation-only');
    });

    it('renders the help text describing what deviation-only means', () => {
      const fixture = createSettings();
      const help = fixture.nativeElement.querySelector(
        '#deviation-practice-mode-help',
      ) as HTMLElement | null;
      expect(help).not.toBeNull();
      expect(help!.textContent).toContain('Deviation-only');
      expect(help!.textContent).toContain('encoded deviation rule');
    });
  });

  describe('parseManualTrueCount', () => {
    it('returns the integer for valid input', () => {
      expect(parseManualTrueCount('0')).toBe(0);
      expect(parseManualTrueCount('5')).toBe(5);
      expect(parseManualTrueCount('-3')).toBe(-3);
      expect(parseManualTrueCount(' 7 ')).toBe(7);
      expect(parseManualTrueCount(String(MIN_MANUAL_TRUE_COUNT))).toBe(MIN_MANUAL_TRUE_COUNT);
      expect(parseManualTrueCount(String(MAX_MANUAL_TRUE_COUNT))).toBe(MAX_MANUAL_TRUE_COUNT);
    });

    it('returns null for invalid input', () => {
      expect(parseManualTrueCount('')).toBeNull();
      expect(parseManualTrueCount('abc')).toBeNull();
      expect(parseManualTrueCount('1.5')).toBeNull();
      expect(parseManualTrueCount('--1')).toBeNull();
      expect(parseManualTrueCount(String(MIN_MANUAL_TRUE_COUNT - 1))).toBeNull();
      expect(parseManualTrueCount(String(MAX_MANUAL_TRUE_COUNT + 1))).toBeNull();
    });
  });
});
