import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  DECKS_REMAINING_PRESETS,
  type DrillMode,
  type TrueCountSource,
} from '../../core/models/card-counting.model';
import { PENETRATION_PRESETS, SHOE_DECK_OPTIONS } from '../../core/models/shoe.model';
import { COUNTING_SYSTEMS } from '../../data/counting-systems';
import { CountingSettingsComponent } from './counting-settings.component';

function createSettings(
  overrides: Partial<{
    systemId: string;
    trueCountAvailable: boolean;
    mode: DrillMode;
    numberOfCards: number;
    millisecondsBetweenCards: number;
    decksRemaining: number;
    trueCountSource: TrueCountSource;
    numberOfDecks: number;
    penetration: number;
    liveDecksRemaining: number;
    errors: readonly string[];
    disabled: boolean;
  }> = {},
): ComponentFixture<CountingSettingsComponent> {
  const fixture = TestBed.createComponent(CountingSettingsComponent);
  const ref = fixture.componentRef;
  ref.setInput('systems', COUNTING_SYSTEMS);
  ref.setInput('systemId', overrides.systemId ?? 'hi-lo');
  if (overrides.trueCountAvailable !== undefined)
    ref.setInput('trueCountAvailable', overrides.trueCountAvailable);
  ref.setInput('mode', overrides.mode ?? 'running-count');
  ref.setInput('numberOfCards', overrides.numberOfCards ?? 20);
  ref.setInput('millisecondsBetweenCards', overrides.millisecondsBetweenCards ?? 500);
  ref.setInput('decksRemaining', overrides.decksRemaining ?? 1);
  ref.setInput('decksRemainingPresets', DECKS_REMAINING_PRESETS);
  ref.setInput('trueCountSource', overrides.trueCountSource ?? 'live-shoe');
  ref.setInput('numberOfDecks', overrides.numberOfDecks ?? 6);
  ref.setInput('penetration', overrides.penetration ?? 0.75);
  ref.setInput('deckOptions', SHOE_DECK_OPTIONS);
  ref.setInput('penetrationPresets', PENETRATION_PRESETS);
  ref.setInput('liveDecksRemaining', overrides.liveDecksRemaining ?? 6);
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

  it('renders a system selector populated from the systems input', () => {
    const fixture = createSettings();
    const select = fixture.nativeElement.querySelector(
      '.settings__system',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    const options = Array.from(select!.querySelectorAll('option')) as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(COUNTING_SYSTEMS.map((s) => s.id));
    expect(options.map((o) => o.textContent?.trim())).toEqual(COUNTING_SYSTEMS.map((s) => s.name));
  });

  it('marks the current systemId option as selected', () => {
    const fixture = createSettings({ systemId: 'ko' });
    const select = fixture.nativeElement.querySelector('.settings__system') as HTMLSelectElement;
    expect(select.value).toBe('ko');
  });

  it('emits systemChange with the chosen id when the selector changes', () => {
    const fixture = createSettings({ systemId: 'hi-lo' });
    let received: string | undefined;
    fixture.componentInstance.systemChange.subscribe((id) => {
      received = id;
    });
    const select = fixture.nativeElement.querySelector('.settings__system') as HTMLSelectElement;
    select.value = 'ko';
    select.dispatchEvent(new Event('change'));
    expect(received).toBe('ko');
  });

  it('enables the true-count radio and hides the note when true count is available', () => {
    const fixture = createSettings({ trueCountAvailable: true });
    const tc = fixture.nativeElement.querySelector(
      'input[type=radio][value="true-count"]',
    ) as HTMLInputElement;
    expect(tc.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.settings__note')).toBeNull();
  });

  it('disables the true-count radio and shows a note when true count is unavailable', () => {
    const fixture = createSettings({ trueCountAvailable: false });
    const tc = fixture.nativeElement.querySelector(
      'input[type=radio][value="true-count"]',
    ) as HTMLInputElement;
    expect(tc.disabled).toBe(true);
    const note = fixture.nativeElement.querySelector('.settings__note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('running count');
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

  it('shows the decks-remaining select in classic true-count mode', () => {
    const fixture = createSettings({ mode: 'true-count', trueCountSource: 'classic' });
    const select = fixture.nativeElement.querySelector(
      '.settings__decks-remaining',
    ) as HTMLSelectElement | null;
    expect(select).not.toBeNull();
  });

  it('populates the decks-remaining select from DECKS_REMAINING_PRESETS', () => {
    const fixture = createSettings({ mode: 'true-count', trueCountSource: 'classic' });
    const options = fixture.nativeElement.querySelectorAll('.settings__decks-remaining option');
    expect(options.length).toBe(DECKS_REMAINING_PRESETS.length);
    const values = Array.from(options).map((o) => Number((o as HTMLOptionElement).value));
    expect(values).toEqual([...DECKS_REMAINING_PRESETS]);
  });

  it('marks the current decksRemaining option as selected', () => {
    const fixture = createSettings({
      mode: 'true-count',
      trueCountSource: 'classic',
      decksRemaining: 2,
    });
    const select = fixture.nativeElement.querySelector(
      '.settings__decks-remaining',
    ) as HTMLSelectElement;
    expect(Number(select.value)).toBe(2);
  });

  it('emits decksRemainingChange as a number when the select changes', () => {
    const fixture = createSettings({
      mode: 'true-count',
      trueCountSource: 'classic',
      decksRemaining: 1,
    });
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

  describe('live-shoe true-count controls', () => {
    it('hides the source toggle in running-count mode', () => {
      const fixture = createSettings({ mode: 'running-count' });
      expect(fixture.nativeElement.querySelector('.settings__source')).toBeNull();
    });

    it('shows the live-shoe / classic source toggle in true-count mode', () => {
      const fixture = createSettings({ mode: 'true-count' });
      const radios = fixture.nativeElement.querySelectorAll('input[type=radio][name=tc-source]');
      expect(radios.length).toBe(2);
      const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
      expect(values).toEqual(['live-shoe', 'classic']);
    });

    it('emits trueCountSourceChange when a source radio is selected', () => {
      const fixture = createSettings({ mode: 'true-count', trueCountSource: 'live-shoe' });
      let received: TrueCountSource | undefined;
      fixture.componentInstance.trueCountSourceChange.subscribe((s) => {
        received = s;
      });
      const classic = fixture.nativeElement.querySelector(
        'input[type=radio][value="classic"]',
      ) as HTMLInputElement;
      classic.checked = true;
      classic.dispatchEvent(new Event('change'));
      expect(received).toBe('classic');
    });

    it('shows decks and penetration selects in live-shoe mode', () => {
      const fixture = createSettings({ mode: 'true-count', trueCountSource: 'live-shoe' });
      expect(fixture.nativeElement.querySelector('.settings__decks')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.settings__penetration')).not.toBeNull();
      // The classic preset select is hidden in live-shoe mode.
      expect(fixture.nativeElement.querySelector('.settings__decks-remaining')).toBeNull();
    });

    it('populates the decks select from SHOE_DECK_OPTIONS', () => {
      const fixture = createSettings({ mode: 'true-count', trueCountSource: 'live-shoe' });
      const options = fixture.nativeElement.querySelectorAll('.settings__decks option');
      const values = Array.from(options).map((o) => Number((o as HTMLOptionElement).value));
      expect(values).toEqual([...SHOE_DECK_OPTIONS]);
    });

    it('emits numberOfDecksChange as a number when the decks select changes', () => {
      const fixture = createSettings({ mode: 'true-count', numberOfDecks: 6 });
      let received: number | undefined;
      fixture.componentInstance.numberOfDecksChange.subscribe((n) => {
        received = n;
      });
      const select = fixture.nativeElement.querySelector('.settings__decks') as HTMLSelectElement;
      select.value = '8';
      select.dispatchEvent(new Event('change'));
      expect(received).toBe(8);
    });

    it('renders penetration options as percentages', () => {
      const fixture = createSettings({ mode: 'true-count', trueCountSource: 'live-shoe' });
      const options = Array.from(
        fixture.nativeElement.querySelectorAll('.settings__penetration option'),
      ) as HTMLOptionElement[];
      expect(options.length).toBe(PENETRATION_PRESETS.length);
      expect(options.map((o) => o.textContent?.trim())).toContain('75%');
    });

    it('emits penetrationChange as a fraction when the penetration select changes', () => {
      const fixture = createSettings({ mode: 'true-count', penetration: 0.75 });
      let received: number | undefined;
      fixture.componentInstance.penetrationChange.subscribe((n) => {
        received = n;
      });
      const select = fixture.nativeElement.querySelector(
        '.settings__penetration',
      ) as HTMLSelectElement;
      select.value = '0.8';
      select.dispatchEvent(new Event('change'));
      expect(received).toBe(0.8);
    });

    it('shows the live decks-remaining readout in live-shoe mode', () => {
      const fixture = createSettings({
        mode: 'true-count',
        trueCountSource: 'live-shoe',
        liveDecksRemaining: 5.5,
      });
      const readout = fixture.nativeElement.querySelector('.settings__readout');
      expect(readout).not.toBeNull();
      expect(readout!.textContent).toContain('5.5');
    });

    it('hides the live readout in classic mode', () => {
      const fixture = createSettings({ mode: 'true-count', trueCountSource: 'classic' });
      expect(fixture.nativeElement.querySelector('.settings__readout')).toBeNull();
    });
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
