import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { BackupService } from '../../core/services/backup.service';
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

  it('turns playing hands out off and back on', () => {
    const { fixture, prefs } = createPage();
    expect(prefs.prefs().playHandsOut).toBe(true);
    labelledControl(fixture, 'Play hands out').click();
    expect(prefs.prefs().playHandsOut).toBe(false);
    labelledControl(fixture, 'Play hands out').click();
    expect(prefs.prefs().playHandsOut).toBe(true);
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
      TestBed.inject(PracticeHistoryService).recordHand(true);
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

  // The system picker lives two sections down under Card counting, so the cost
  // it carries for the Deviations trainer is stated where that trainer is set up.
  describe('deviation index advisory', () => {
    const advisory = (fixture: ComponentFixture<SettingsPageComponent>) =>
      fixture.nativeElement.querySelector('.settings__advisory') as HTMLElement | null;

    it('is absent on the Hi-Lo default', () => {
      const { fixture } = createPage();
      expect(advisory(fixture)).toBeNull();
    });

    it('appears, naming the system, as soon as another one is picked', () => {
      const { fixture, prefs } = createPage();
      prefs.updateCounting({ systemId: 'omega-ii' });
      fixture.detectChanges();
      expect(advisory(fixture)!.textContent).toContain('Omega II');
      expect(advisory(fixture)!.textContent).toContain('Hi-Lo');
    });

    it('clears again when the system goes back to Hi-Lo', () => {
      const { fixture, prefs } = createPage();
      prefs.updateCounting({ systemId: 'omega-ii' });
      fixture.detectChanges();
      prefs.updateCounting({ systemId: 'hi-lo' });
      fixture.detectChanges();
      expect(advisory(fixture)).toBeNull();
    });
  });

  // localStorage is the web build's only persistence, so the backup pair is
  // the whole answer to a cleared browser or a second device.
  describe('backup', () => {
    const button = (fixture: ComponentFixture<SettingsPageComponent>, label: string) => {
      const el = [...fixture.nativeElement.querySelectorAll('button')].find(
        (b) => (b as HTMLElement).textContent!.trim() === label,
      ) as HTMLButtonElement | undefined;
      if (!el) throw new Error(`No button "${label}"`);
      return el;
    };
    const status = (fixture: ComponentFixture<SettingsPageComponent>) =>
      fixture.nativeElement.querySelector(
        '[role="status"].settings__warning',
      ) as HTMLElement | null;

    it('names the file it saved', () => {
      const download = vi
        .spyOn(TestBed.inject(BackupService), 'download')
        .mockReturnValue('b.json');
      const { fixture } = createPage();

      button(fixture, 'Export backup').click();
      fixture.detectChanges();

      expect(download).toHaveBeenCalledOnce();
      expect(status(fixture)!.textContent).toContain('b.json');
    });

    it('shows a recoverable status when the browser refuses the download', () => {
      vi.spyOn(TestBed.inject(BackupService), 'download').mockImplementation(() => {
        throw new Error('downloads blocked');
      });
      const { fixture } = createPage();

      button(fixture, 'Export backup').click();
      fixture.detectChanges();

      expect(status(fixture)!.textContent).toContain('could not be saved');
    });

    it('opens the file dialog from the Restore button, not from the input itself', () => {
      const { fixture } = createPage();
      const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
      const click = vi.spyOn(input, 'click').mockImplementation(() => {});

      button(fixture, 'Restore from backup').click();

      expect(click).toHaveBeenCalledOnce();
      // Out of the tab order (the visible button is the control) but still
      // named, so it is not an anonymous input in the accessibility tree.
      expect(input.getAttribute('tabindex')).toBe('-1');
      expect(input.getAttribute('aria-label')).toBe('Backup file');
    });

    it('restores the chosen file', async () => {
      const restore = vi
        .spyOn(TestBed.inject(BackupService), 'restore')
        .mockReturnValue({ ok: true });
      const { fixture } = createPage();
      const c = fixture.componentInstance as unknown as {
        onBackupFileChosen(e: Event): Promise<void>;
      };
      const file = new File(['{"app":"blackjack-trainer"}'], 'b.json');

      await c.onBackupFileChosen({
        target: { files: [file], value: 'b.json' },
      } as unknown as Event);

      expect(restore).toHaveBeenCalledWith('{"app":"blackjack-trainer"}');
    });

    it('clears the file input so the same backup can be selected again', async () => {
      vi.spyOn(TestBed.inject(BackupService), 'restore').mockReturnValue({ ok: true });
      const { fixture } = createPage();
      const c = fixture.componentInstance as unknown as {
        onBackupFileChosen(e: Event): Promise<void>;
      };
      const target = {
        files: [new File(['{}'], 'b.json')],
        value: 'C:\\fakepath\\b.json',
      };

      await c.onBackupFileChosen({ target } as unknown as Event);

      expect(target.value).toBe('');
    });

    it('reports a file-read failure without attempting a restore', async () => {
      const restore = vi.spyOn(TestBed.inject(BackupService), 'restore');
      const { fixture } = createPage();
      const c = fixture.componentInstance as unknown as {
        onBackupFileChosen(e: Event): Promise<void>;
      };
      const target = {
        files: [{ text: vi.fn().mockRejectedValue(new Error('read refused')) }],
        value: 'b.json',
      };

      await c.onBackupFileChosen({ target } as unknown as Event);
      fixture.detectChanges();

      expect(target.value).toBe('');
      expect(restore).not.toHaveBeenCalled();
      expect(status(fixture)!.textContent).toContain('could not be read');
    });

    it('shows why a bad file was refused', async () => {
      vi.spyOn(TestBed.inject(BackupService), 'restore').mockReturnValue({
        ok: false,
        error: 'That file is not JSON.',
      });
      const { fixture } = createPage();
      const c = fixture.componentInstance as unknown as {
        onBackupFileChosen(e: Event): Promise<void>;
      };

      await c.onBackupFileChosen({
        target: { files: [new File(['nope'], 'b.json')], value: '' },
      } as unknown as Event);
      fixture.detectChanges();

      expect(status(fixture)!.textContent).toContain('not JSON');
    });

    it('does nothing when the file dialog is dismissed', async () => {
      const restore = vi.spyOn(TestBed.inject(BackupService), 'restore');
      const { fixture } = createPage();
      const c = fixture.componentInstance as unknown as {
        onBackupFileChosen(e: Event): Promise<void>;
      };

      await c.onBackupFileChosen({ target: { files: [], value: '' } } as unknown as Event);

      expect(restore).not.toHaveBeenCalled();
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

  // This screen picks among 58 counting systems and prints the tags of none of
  // them; the chart's count tab is where they are.
  it('opens the chart on the count tab from the system picker', () => {
    const { fixture } = createPage();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    (fixture.nativeElement.querySelector('.settings__tags-link') as HTMLButtonElement).click();

    expect(navigate).toHaveBeenCalledWith(['/chart'], { queryParams: { tab: 'count' } });
  });
});
