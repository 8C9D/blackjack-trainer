import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { SettingsPageComponent } from './settings-page.component';

function createPage(): {
  fixture: ComponentFixture<SettingsPageComponent>;
  prefs: FlowPrefsService;
} {
  const fixture = TestBed.createComponent(SettingsPageComponent);
  fixture.detectChanges();
  return { fixture, prefs: TestBed.inject(FlowPrefsService) };
}

function input(
  fixture: ComponentFixture<SettingsPageComponent>,
  selector: string,
): HTMLInputElement {
  const el = fixture.nativeElement.querySelector(selector) as HTMLInputElement | null;
  if (!el) throw new Error(`No input for "${selector}"`);
  return el;
}

function labelledControl(
  fixture: ComponentFixture<SettingsPageComponent>,
  labelText: string,
): HTMLInputElement {
  const labels = Array.from(fixture.nativeElement.querySelectorAll('label')) as HTMLLabelElement[];
  const label = labels.find((l) => l.textContent!.includes(labelText));
  if (!label) throw new Error(`No label containing "${labelText}"`);
  return label.querySelector('input')!;
}

function setNumber(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

describe('SettingsPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [provideRouter([])],
    });
  });

  it('edits the daily goal with clamping', () => {
    const { fixture, prefs } = createPage();
    setNumber(input(fixture, '.settings__goal'), '30');
    expect(prefs.prefs().dailyGoal).toBe(30);
    setNumber(input(fixture, '.settings__goal'), '0');
    expect(prefs.prefs().dailyGoal).toBe(1);
  });

  it('edits the theme, offering system alongside both explicit choices', () => {
    const { fixture, prefs } = createPage();
    expect(prefs.prefs().theme).toBe('system');

    labelledControl(fixture, 'Light').click();
    expect(prefs.prefs().theme).toBe('light');

    labelledControl(fixture, 'Dark').click();
    expect(prefs.prefs().theme).toBe('dark');

    labelledControl(fixture, 'Match system').click();
    expect(prefs.prefs().theme).toBe('system');
  });

  it('edits the shared table rules', () => {
    const { fixture, prefs } = createPage();
    labelledControl(fixture, 'H17').click();
    expect(prefs.prefs().ruleSet).toBe('H17');
    labelledControl(fixture, 'Double After Split').click();
    labelledControl(fixture, 'Late Surrender').click();
    expect(prefs.prefs().options).toEqual({ doubleAfterSplit: true, lateSurrender: true });
    labelledControl(fixture, 'Double After Split').click();
    expect(prefs.prefs().options.doubleAfterSplit).toBe(false);
  });

  it('edits the deviations practice mode and true-count source', () => {
    const { fixture, prefs } = createPage();
    labelledControl(fixture, 'Deviation-only').click();
    expect(prefs.prefs().deviations.practiceMode).toBe('deviation-only');

    labelledControl(fixture, 'Manual true count').click();
    fixture.detectChanges();
    expect(prefs.prefs().deviations.trueCountSource).toBe('manual');

    setNumber(input(fixture, '.settings__manual-tc'), '4');
    expect(prefs.prefs().deviations.manualTrueCount).toBe(4);
  });

  it('rejects out-of-range manual true counts, keeping the stored value', () => {
    const { fixture, prefs } = createPage();
    labelledControl(fixture, 'Manual true count').click();
    fixture.detectChanges();
    setNumber(input(fixture, '.settings__manual-tc'), '4');
    setNumber(input(fixture, '.settings__manual-tc'), '99');
    expect(prefs.prefs().deviations.manualTrueCount).toBe(4);
    expect(input(fixture, '.settings__manual-tc').value).toBe('4');
  });

  it('hosts the card counting settings bound to prefs', () => {
    const { fixture, prefs } = createPage();
    const system = fixture.nativeElement.querySelector('.settings__system') as HTMLSelectElement;
    expect(system.value).toBe('hi-lo');

    setNumber(labelledControl(fixture, 'Number of cards') as HTMLInputElement, '40');
    // counting-settings emits on input events.
    labelledControl(fixture, 'Number of cards').dispatchEvent(new Event('input'));
    expect(prefs.prefs().counting.numberOfCards).toBe(40);
  });

  it('coerces true-count mode back to running count for unbalanced systems', () => {
    const { fixture, prefs } = createPage();
    prefs.updateCounting({ mode: 'true-count' });
    fixture.detectChanges();

    const system = fixture.nativeElement.querySelector('.settings__system') as HTMLSelectElement;
    system.value = 'ko';
    system.dispatchEvent(new Event('change'));

    expect(prefs.prefs().counting.systemId).toBe('ko');
    expect(prefs.prefs().counting.mode).toBe('running-count');
  });

  it('Escape and the back button return home', () => {
    const { fixture } = createPage();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.settings__back') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/']);

    (fixture.componentInstance as unknown as { onKeyDown(e: KeyboardEvent): void }).onKeyDown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
