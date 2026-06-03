import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { EngineOptions, RuleSet } from '../core/models/strategy.model';
import { RuleControlsComponent } from './rule-controls.component';

function createControls(
  overrides: Partial<{ ruleSet: RuleSet; options: EngineOptions; name: string }> = {},
): ComponentFixture<RuleControlsComponent> {
  const fixture = TestBed.createComponent(RuleControlsComponent);
  const ref = fixture.componentRef;
  ref.setInput('ruleSet', overrides.ruleSet ?? 'S17');
  ref.setInput(
    'options',
    overrides.options ?? { doubleAfterSplit: false, lateSurrender: false },
  );
  if (overrides.name !== undefined) ref.setInput('name', overrides.name);
  fixture.detectChanges();
  return fixture;
}

function radios(
  fixture: ComponentFixture<RuleControlsComponent>,
): HTMLInputElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('input[type=radio]'));
}

function checkboxes(
  fixture: ComponentFixture<RuleControlsComponent>,
): HTMLInputElement[] {
  return Array.from(fixture.nativeElement.querySelectorAll('input[type=checkbox]'));
}

describe('RuleControlsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RuleControlsComponent],
    });
  });

  it('renders S17/H17 radios and the two table-option checkboxes (smoke)', () => {
    const fixture = createControls();
    expect(radios(fixture).length).toBe(2);
    expect(checkboxes(fixture).length).toBe(2);
  });

  it('groups controls under labelled fieldsets and wraps each input in a text label', () => {
    const fixture = createControls();
    const legends = Array.from(
      fixture.nativeElement.querySelectorAll('legend'),
    ).map((l) => (l as HTMLElement).textContent?.trim());
    expect(legends).toEqual(['Dealer rule', 'Table options']);

    for (const control of [...radios(fixture), ...checkboxes(fixture)]) {
      const label = control.closest('label');
      expect(label).not.toBeNull();
      expect(label!.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('marks the active rule-set radio as checked', () => {
    const s17 = createControls({ ruleSet: 'S17' });
    expect(radios(s17)[0].checked).toBe(true);
    expect(radios(s17)[1].checked).toBe(false);

    const h17 = createControls({ ruleSet: 'H17' });
    expect(radios(h17)[0].checked).toBe(false);
    expect(radios(h17)[1].checked).toBe(true);
  });

  it('emits ruleSetChange when the inactive rule-set radio is selected', () => {
    const fixture = createControls({ ruleSet: 'S17' });
    let received: RuleSet | undefined;
    fixture.componentInstance.ruleSetChange.subscribe((r) => {
      received = r;
    });
    radios(fixture)[1].dispatchEvent(new Event('change'));
    expect(received).toBe('H17');
  });

  it('defaults the radio group name to "ruleSet" and accepts a custom name', () => {
    expect(
      createControls().nativeElement.querySelectorAll('input[type=radio][name=ruleSet]').length,
    ).toBe(2);
    expect(
      createControls({ name: 'deviation-ruleSet' }).nativeElement.querySelectorAll(
        'input[type=radio][name=deviation-ruleSet]',
      ).length,
    ).toBe(2);
  });

  it('reflects the option checkboxes from the options input', () => {
    const fixture = createControls({
      options: { doubleAfterSplit: true, lateSurrender: false },
    });
    expect(checkboxes(fixture)[0].checked).toBe(true);
    expect(checkboxes(fixture)[1].checked).toBe(false);
  });

  it('emits optionsChange enabling DAS without disturbing lateSurrender', () => {
    const fixture = createControls({
      options: { doubleAfterSplit: false, lateSurrender: false },
    });
    let received: EngineOptions | undefined;
    fixture.componentInstance.optionsChange.subscribe((o) => {
      received = o;
    });
    checkboxes(fixture)[0].dispatchEvent(new Event('change'));
    expect(received).toEqual({ doubleAfterSplit: true, lateSurrender: false });
  });

  it('emits optionsChange disabling an already-enabled option', () => {
    const fixture = createControls({
      options: { doubleAfterSplit: true, lateSurrender: true },
    });
    let received: EngineOptions | undefined;
    fixture.componentInstance.optionsChange.subscribe((o) => {
      received = o;
    });
    checkboxes(fixture)[1].dispatchEvent(new Event('change'));
    expect(received).toEqual({ doubleAfterSplit: true, lateSurrender: false });
  });
});
