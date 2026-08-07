import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { BetRamp } from '../../core/models/bet-ramp.model';
import {
  DECKS_REMAINING_PRESETS,
  type CountingDrillSettings,
  type DrillMode,
  type TrueCountSource,
} from '../../core/models/card-counting.model';
import { PENETRATION_PRESETS, SHOE_DECK_OPTIONS } from '../../core/models/shoe.model';
import type { RuleSet } from '../../core/models/strategy.model';
import { deviationIndexNote } from '../../core/models/deviation.model';
import { COUNTING_SYSTEMS, countingSystemById } from '../../data/counting-systems';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { modeAllowedFor } from '../../core/models/counting-system.model';
import {
  FlowPrefsService,
  MAX_DAILY_GOAL,
  MAX_MANUAL_TRUE_COUNT,
  MIN_DAILY_GOAL,
  MIN_MANUAL_TRUE_COUNT,
  type DeviationPracticeMode,
  type DeviationTrueCountSource,
  type ThemePref,
} from '../../core/services/flow-prefs.service';
import { BackupService } from '../../core/services/backup.service';
import { CHART_TAB_QUERY_PARAM } from '../chart/chart-page.component';
import { PracticeDataService } from '../../core/services/practice-data.service';
import { CountingSettingsComponent } from '../card-counting/counting-settings.component';

export const THEME_OPTIONS: readonly { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Match system' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

// The one home for every pre-made decision: daily goal, table rules, and the
// per-trainer drill configuration. Drill screens never show any of this.
@Component({
  selector: 'app-settings-page',
  imports: [CountingSettingsComponent],
  template: `
    <main class="settings">
      <header class="settings__header">
        <button type="button" class="settings__back" (click)="goHome()">
          ← Back <kbd class="kcap">esc</kbd>
        </button>
        <h1 class="settings__title">Settings</h1>
      </header>

      <section class="settings__group" aria-label="Daily goal">
        <h2 class="settings__heading">Daily goal</h2>
        <label class="settings__field">
          <span>Hands per day</span>
          <input
            class="settings__goal"
            type="number"
            [min]="MIN_GOAL"
            [max]="MAX_GOAL"
            step="1"
            inputmode="numeric"
            [value]="prefs().dailyGoal"
            (change)="onGoalChange($event)"
          />
        </label>
      </section>

      <section class="settings__group" aria-label="Appearance">
        <h2 class="settings__heading">Appearance</h2>
        @for (option of themeOptions; track option.value) {
          <label>
            <input
              type="radio"
              name="theme"
              [checked]="prefs().theme === option.value"
              (change)="setTheme(option.value)"
            />
            {{ option.label }}
          </label>
        }
      </section>

      <section class="settings__group" aria-label="Table rules">
        <h2 class="settings__heading">Table rules</h2>
        <label>
          <input
            type="radio"
            name="ruleSet"
            [checked]="prefs().ruleSet === 'S17'"
            (change)="setRuleSet('S17')"
          />
          S17 — dealer stands on soft 17
        </label>
        <label>
          <input
            type="radio"
            name="ruleSet"
            [checked]="prefs().ruleSet === 'H17'"
            (change)="setRuleSet('H17')"
          />
          H17 — dealer hits on soft 17
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="prefs().options.doubleAfterSplit"
            (change)="toggleOption('doubleAfterSplit')"
          />
          Double After Split (DAS)
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="prefs().options.lateSurrender"
            (change)="toggleOption('lateSurrender')"
          />
          Late Surrender
        </label>
      </section>

      <section class="settings__group" aria-label="Drills">
        <h2 class="settings__heading">Drills</h2>
        <label>
          <input type="checkbox" [checked]="prefs().playHandsOut" (change)="togglePlayHandsOut()" />
          Play hands out (a correct hit or split is followed through)
        </label>
        <p class="settings__hint">
          Off, Basic Strategy and Deviations ask the opening decision and deal a fresh hand. On, a
          hit is followed by the card it draws and the decision that follows — where doubling,
          splitting and surrender are already gone, and a deviation index still applies because it
          is written against a total. A split is followed through too: each half is dealt a second
          card and played in turn, re-splitting up to four hands, with split aces taking one card
          each. A hand out of a split cannot surrender or insure, and doubles only under DAS.
        </p>
      </section>

      <section class="settings__group" aria-label="Deviations trainer">
        <h2 class="settings__heading">Deviations</h2>
        @if (indexNote(); as note) {
          <p class="settings__advisory" role="note">{{ note }}</p>
        }
        <label>
          <input
            type="radio"
            name="practiceMode"
            [checked]="prefs().deviations.practiceMode === 'all-hands'"
            (change)="setPracticeMode('all-hands')"
          />
          All hands
        </label>
        <label>
          <input
            type="radio"
            name="practiceMode"
            [checked]="prefs().deviations.practiceMode === 'deviation-only'"
            (change)="setPracticeMode('deviation-only')"
          />
          Deviation-only (every hand has an encoded deviation rule)
        </label>
        <label>
          <input
            type="radio"
            name="tcSource"
            [checked]="prefs().deviations.trueCountSource === 'random'"
            (change)="setTrueCountSource('random')"
          />
          Random true count
        </label>
        <label>
          <input
            type="radio"
            name="tcSource"
            [checked]="prefs().deviations.trueCountSource === 'manual'"
            (change)="setTrueCountSource('manual')"
          />
          Manual true count
        </label>
        @if (prefs().deviations.trueCountSource === 'manual') {
          <label class="settings__field">
            <span>Practice true count</span>
            <input
              class="settings__manual-tc"
              type="number"
              [min]="MIN_TC"
              [max]="MAX_TC"
              step="1"
              inputmode="numeric"
              [value]="prefs().deviations.manualTrueCount"
              (change)="onManualTrueCountChange($event)"
            />
          </label>
        }
      </section>

      <section class="settings__group" aria-label="Card counting trainer">
        <h2 class="settings__heading">Card counting</h2>
        <app-counting-settings
          [systems]="systems"
          [systemId]="prefs().counting.systemId"
          [trueCountAvailable]="trueCountAvailable()"
          [keyCountAvailable]="keyCountAvailable()"
          [mode]="prefs().counting.mode"
          [numberOfCards]="prefs().counting.numberOfCards"
          [millisecondsBetweenCards]="prefs().counting.millisecondsBetweenCards"
          [decksRemaining]="prefs().counting.decksRemaining"
          [decksRemainingPresets]="decksRemainingPresets"
          [trueCountSource]="prefs().counting.trueCountSource"
          [numberOfDecks]="prefs().counting.numberOfDecks"
          [penetration]="prefs().counting.penetration"
          [deckOptions]="deckOptions"
          [penetrationPresets]="penetrationPresets"
          [liveDecksRemaining]="prefs().counting.numberOfDecks"
          [showdownSpots]="prefs().counting.showdownSpots"
          [showdownBetting]="prefs().counting.showdownBetting"
          [showdownCountCheck]="prefs().counting.showdownCountCheck"
          [betRamp]="prefs().counting.betRamp"
          [errors]="countingErrors()"
          (showTags)="openTags()"
          (systemChange)="onSystemChange($event)"
          (modeChange)="updateCounting({ mode: $event })"
          (numberOfCardsChange)="updateCounting({ numberOfCards: $event })"
          (millisecondsBetweenCardsChange)="updateCounting({ millisecondsBetweenCards: $event })"
          (decksRemainingChange)="updateCounting({ decksRemaining: $event })"
          (trueCountSourceChange)="updateCounting({ trueCountSource: $event })"
          (numberOfDecksChange)="updateCounting({ numberOfDecks: $event })"
          (penetrationChange)="updateCounting({ penetration: $event })"
          (showdownSpotsChange)="updateCounting({ showdownSpots: $event })"
          (showdownBettingChange)="updateCounting({ showdownBetting: $event })"
          (showdownCountCheckChange)="updateCounting({ showdownCountCheck: $event })"
          (betRampChange)="updateCounting({ betRamp: $event })"
        />
      </section>

      <section class="settings__group" aria-label="Practice data">
        <h2 class="settings__heading">Practice data</h2>
        <p class="settings__hint">
          Everything you have practised lives in this browser only. Keep a backup if you clear site
          data, use private browsing, or want your progress on another device.
        </p>
        <div class="settings__row">
          <button type="button" class="settings__cancel" (click)="exportBackup()">
            Export backup
          </button>
          <button type="button" class="settings__cancel" (click)="pickBackupFile()">
            Restore from backup
          </button>
        </div>
        <!-- Off screen and out of the tab order — the button above is the
             control. Named rather than aria-hidden, so a screen reader
             browsing the section finds a usable file input rather than an
             anonymous one. -->
        <input
          #backupFile
          class="sr-only"
          type="file"
          accept="application/json,.json"
          tabindex="-1"
          aria-label="Backup file"
          (change)="onBackupFileChosen($event)"
        />
        @if (backupStatus(); as status) {
          <p class="settings__warning" role="status">{{ status }}</p>
        }
        <!-- Two steps, no dialog: the confirm replaces the button in place. -->
        @if (confirmingReset()) {
          <p class="settings__warning" role="status">
            This clears every drill's stats, the practice history and streak, your weak spots, and
            the showdown record and chips. Your settings stay as they are.
          </p>
          <div class="settings__row">
            <button type="button" class="settings__danger" (click)="resetPracticeData()">
              Reset everything
            </button>
            <button type="button" class="settings__cancel" (click)="cancelReset()">Cancel</button>
          </div>
        } @else {
          <button type="button" class="settings__cancel" (click)="askReset()">
            Reset practice data
          </button>
          @if (resetDone()) {
            <p class="settings__warning" role="status">Practice data cleared.</p>
          }
        }
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent {
  private readonly prefsService = inject(FlowPrefsService);
  private readonly countingEngine = inject(CountingEngineService);
  private readonly practiceData = inject(PracticeDataService);
  private readonly backup = inject(BackupService);
  private readonly router = inject(Router);

  protected readonly confirmingReset = signal(false);
  protected readonly resetDone = signal(false);
  protected readonly backupStatus = signal<string | null>(null);
  private readonly backupFile = viewChild.required<ElementRef<HTMLInputElement>>('backupFile');

  protected readonly MIN_GOAL = MIN_DAILY_GOAL;
  protected readonly MAX_GOAL = MAX_DAILY_GOAL;
  protected readonly MIN_TC = MIN_MANUAL_TRUE_COUNT;
  protected readonly MAX_TC = MAX_MANUAL_TRUE_COUNT;

  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly systems = COUNTING_SYSTEMS;
  protected readonly decksRemainingPresets = DECKS_REMAINING_PRESETS;
  protected readonly deckOptions = SHOE_DECK_OPTIONS;
  protected readonly penetrationPresets = PENETRATION_PRESETS;

  protected readonly prefs = this.prefsService.prefs;

  protected readonly trueCountAvailable = computed(() => this.selectedSystem()?.balanced ?? false);

  protected readonly keyCountAvailable = computed(
    () => this.selectedSystem()?.keyCounts !== undefined,
  );

  protected readonly countingErrors = computed(
    () => this.countingEngine.validateSettings(this.countingSettings()).errors,
  );

  private readonly selectedSystem = computed(() =>
    this.systems.find((s) => s.id === this.prefs().counting.systemId),
  );

  // Shown in the Deviations section rather than beside the system picker: the
  // picker is a card-counting choice, and this is what it costs the trainer
  // two sections down.
  protected readonly indexNote = computed(() =>
    deviationIndexNote(countingSystemById(this.prefs().counting.systemId)),
  );

  private readonly countingSettings = computed<CountingDrillSettings>(() => {
    const { systemId: _systemId, ...settings } = this.prefs().counting;
    return settings;
  });

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  // The chart's count tab, where the selected system's tags are printed. This
  // screen picks among 58 systems and, until the tab existed, printed the tags
  // of none of them.
  protected openTags(): void {
    void this.router.navigate(['/chart'], {
      queryParams: { [CHART_TAB_QUERY_PARAM]: 'count' },
    });
  }

  protected askReset(): void {
    this.resetDone.set(false);
    this.confirmingReset.set(true);
  }

  protected cancelReset(): void {
    this.confirmingReset.set(false);
  }

  protected resetPracticeData(): void {
    this.practiceData.reset();
    this.confirmingReset.set(false);
    this.resetDone.set(true);
  }

  protected exportBackup(): void {
    try {
      this.backupStatus.set(`Saved ${this.backup.download()}.`);
    } catch {
      this.backupStatus.set('The backup could not be saved. Please try again.');
    }
  }

  protected pickBackupFile(): void {
    this.backupStatus.set(null);
    this.backupFile().nativeElement.click();
  }

  protected async onBackupFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clearing the value lets the same file be chosen twice running; without
    // it the second pick fires no change event.
    input.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.backupStatus.set('That file could not be read.');
      return;
    }
    const result = this.backup.restore(text);
    // On success the page is already reloading, so there is no state to show.
    if (!result.ok) this.backupStatus.set(result.error);
  }

  protected onGoalChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.valueAsNumber;
    if (Number.isFinite(value)) {
      this.prefsService.setDailyGoal(value);
    } else {
      // Blank / non-numeric: re-sync the field to the stored goal so it never
      // sits empty and out of sync (mirrors onManualTrueCountChange).
      input.value = String(this.prefs().dailyGoal);
    }
  }

  protected setTheme(theme: ThemePref): void {
    this.prefsService.setTheme(theme);
  }

  protected setRuleSet(ruleSet: RuleSet): void {
    this.prefsService.setRuleSet(ruleSet);
  }

  protected toggleOption(key: 'doubleAfterSplit' | 'lateSurrender'): void {
    const options = this.prefs().options;
    this.prefsService.setOptions({ ...options, [key]: !options[key] });
  }

  protected togglePlayHandsOut(): void {
    this.prefsService.setPlayHandsOut(!this.prefs().playHandsOut);
  }

  protected setPracticeMode(mode: DeviationPracticeMode): void {
    this.prefsService.updateDeviations({ practiceMode: mode });
  }

  protected setTrueCountSource(source: DeviationTrueCountSource): void {
    this.prefsService.updateDeviations({ trueCountSource: source });
  }

  // Integers in [-20, 20] persist; anything else leaves the stored value
  // alone (the input re-renders back to it).
  protected onManualTrueCountChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.valueAsNumber;
    if (Number.isInteger(value) && value >= this.MIN_TC && value <= this.MAX_TC) {
      this.prefsService.updateDeviations({ manualTrueCount: value });
    } else {
      input.value = String(this.prefs().deviations.manualTrueCount);
    }
  }

  protected onSystemChange(id: string): void {
    this.prefsService.updateCounting({ systemId: id });
    // True count needs a balanced system; key count needs a published
    // schedule. Coerce a mode the new system cannot host back to running
    // count so the drill never starts in an impossible configuration.
    const system = this.systems.find((s) => s.id === id);
    if (system && !modeAllowedFor(system, this.prefs().counting.mode)) {
      this.prefsService.updateCounting({ mode: 'running-count' });
    }
  }

  protected updateCounting(
    partial: Partial<{
      mode: DrillMode;
      numberOfCards: number;
      millisecondsBetweenCards: number;
      decksRemaining: number;
      trueCountSource: TrueCountSource;
      numberOfDecks: number;
      penetration: number;
      showdownSpots: number;
      showdownBetting: boolean;
      showdownCountCheck: boolean;
      betRamp: BetRamp;
    }>,
  ): void {
    this.prefsService.updateCounting(partial);
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.goHome();
    }
  }
}
