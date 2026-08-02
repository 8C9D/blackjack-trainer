import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { BetSpreadStatsService } from '../../core/services/bet-spread-stats.service';
import { BankrollService } from '../../core/services/bankroll.service';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { MissTallyService } from '../../core/services/miss-tally.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';
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

  it('coerces key-count mode back to running count when leaving KO', () => {
    const { fixture, prefs } = createPage();
    prefs.updateCounting({ systemId: 'ko', mode: 'key-count' });
    fixture.detectChanges();

    const system = fixture.nativeElement.querySelector('.settings__system') as HTMLSelectElement;
    system.value = 'hi-lo';
    system.dispatchEvent(new Event('change'));

    expect(prefs.prefs().counting.systemId).toBe('hi-lo');
    expect(prefs.prefs().counting.mode).toBe('running-count');
  });

  it('keeps key-count mode when switching to KO itself', () => {
    const { fixture, prefs } = createPage();
    prefs.updateCounting({ systemId: 'ko', mode: 'key-count' });
    fixture.detectChanges();

    const system = fixture.nativeElement.querySelector('.settings__system') as HTMLSelectElement;
    system.value = 'ko';
    system.dispatchEvent(new Event('change'));

    expect(prefs.prefs().counting.mode).toBe('key-count');
  });

  describe('resetting practice data', () => {
    function button(
      fixture: ComponentFixture<SettingsPageComponent>,
      label: string,
    ): HTMLButtonElement {
      const el = [...fixture.nativeElement.querySelectorAll('.settings__group button')].find(
        (b) => (b as HTMLElement).textContent!.trim() === label,
      ) as HTMLButtonElement | undefined;
      if (!el) throw new Error(`No button "${label}"`);
      return el;
    }

    function seedPractice(): void {
      TestBed.inject(BasicStrategyStatsService).recordAttempt(true);
      TestBed.inject(PracticeHistoryService).recordHand();
      TestBed.inject(MissTallyService).record(
        'basic-strategy',
        { kind: 'hard', hand: '16', dealer: '10' },
        false,
      );
      TestBed.inject(BetSpreadStatsService).recordAttempt(true);
      TestBed.inject(ShowdownStatsService).record('win');
      TestBed.inject(BankrollService).record(10, -10);
    }

    it('asks before clearing anything', () => {
      const { fixture } = createPage();
      seedPractice();

      button(fixture, 'Reset practice data').click();
      fixture.detectChanges();
      expect(TestBed.inject(BasicStrategyStatsService).stats().attempts).toBe(1);

      button(fixture, 'Cancel').click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.settings__danger')).toBeNull();
      expect(TestBed.inject(BasicStrategyStatsService).stats().attempts).toBe(1);
    });

    it('clears every practice store but leaves the settings alone', () => {
      const { fixture, prefs } = createPage();
      prefs.setDailyGoal(42);
      prefs.setRuleSet('H17');
      seedPractice();

      button(fixture, 'Reset practice data').click();
      fixture.detectChanges();
      button(fixture, 'Reset everything').click();
      fixture.detectChanges();

      expect(TestBed.inject(BasicStrategyStatsService).stats().attempts).toBe(0);
      expect(TestBed.inject(PracticeHistoryService).handsToday()).toBe(0);
      expect(TestBed.inject(MissTallyService).weakSpots('basic-strategy')).toEqual([]);
      expect(TestBed.inject(BetSpreadStatsService).stats().attempts).toBe(0);
      expect(TestBed.inject(ShowdownStatsService).stats().hands).toBe(0);
      expect(TestBed.inject(BankrollService).state().wagered).toBe(0);
      expect(prefs.prefs().dailyGoal).toBe(42);
      expect(prefs.prefs().ruleSet).toBe('H17');
      expect(fixture.nativeElement.querySelector('.settings__warning')!.textContent).toContain(
        'Practice data cleared',
      );
    });
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
