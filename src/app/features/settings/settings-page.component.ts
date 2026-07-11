import { Component, HostListener, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import {
  DECKS_REMAINING_PRESETS,
  type CountingDrillSettings,
  type DrillMode,
  type TrueCountSource,
} from '../../core/models/card-counting.model';
import { PENETRATION_PRESETS, SHOE_DECK_OPTIONS } from '../../core/models/shoe.model';
import type { RuleSet } from '../../core/models/strategy.model';
import { COUNTING_SYSTEMS } from '../../data/counting-systems';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import {
  FlowPrefsService,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  type DeviationPracticeMode,
  type DeviationTrueCountSource,
} from '../../core/services/flow-prefs.service';
import { CountingSettingsComponent } from '../card-counting/counting-settings.component';

// Manual practice-true-count bounds (the BJA charts top out around +6; ±20
// rejects obvious garbage while covering any plausible drill).
export const MIN_MANUAL_TRUE_COUNT = -20;
export const MAX_MANUAL_TRUE_COUNT = 20;

// The one home for every pre-made decision: daily goal, table rules, and the
// per-trainer drill configuration. Drill screens never show any of this.
@Component({
  selector: 'app-settings-page',
  imports: [CountingSettingsComponent],
  template: `
    <div class="settings">
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

      <section class="settings__group" aria-label="Deviations trainer">
        <h2 class="settings__heading">Deviations</h2>
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
          [errors]="countingErrors()"
          (systemChange)="onSystemChange($event)"
          (modeChange)="updateCounting({ mode: $event })"
          (numberOfCardsChange)="updateCounting({ numberOfCards: $event })"
          (millisecondsBetweenCardsChange)="updateCounting({ millisecondsBetweenCards: $event })"
          (decksRemainingChange)="updateCounting({ decksRemaining: $event })"
          (trueCountSourceChange)="updateCounting({ trueCountSource: $event })"
          (numberOfDecksChange)="updateCounting({ numberOfDecks: $event })"
          (penetrationChange)="updateCounting({ penetration: $event })"
        />
      </section>
    </div>
  `,
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent {
  private readonly prefsService = inject(FlowPrefsService);
  private readonly countingEngine = inject(CountingEngineService);
  private readonly router = inject(Router);

  protected readonly MIN_GOAL = MIN_DAILY_GOAL;
  protected readonly MAX_GOAL = MAX_DAILY_GOAL;
  protected readonly MIN_TC = MIN_MANUAL_TRUE_COUNT;
  protected readonly MAX_TC = MAX_MANUAL_TRUE_COUNT;

  protected readonly systems = COUNTING_SYSTEMS;
  protected readonly decksRemainingPresets = DECKS_REMAINING_PRESETS;
  protected readonly deckOptions = SHOE_DECK_OPTIONS;
  protected readonly penetrationPresets = PENETRATION_PRESETS;

  protected readonly prefs = this.prefsService.prefs;

  protected readonly trueCountAvailable = computed(() => this.selectedSystem()?.balanced ?? false);

  protected readonly countingErrors = computed(
    () => this.countingEngine.validateSettings(this.countingSettings()).errors,
  );

  private readonly selectedSystem = computed(() =>
    this.systems.find((s) => s.id === this.prefs().counting.systemId),
  );

  private readonly countingSettings = computed<CountingDrillSettings>(() => {
    const { systemId: _systemId, ...settings } = this.prefs().counting;
    return settings;
  });

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected onGoalChange(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) this.prefsService.setDailyGoal(value);
  }

  protected setRuleSet(ruleSet: RuleSet): void {
    this.prefsService.setRuleSet(ruleSet);
  }

  protected toggleOption(key: 'doubleAfterSplit' | 'lateSurrender'): void {
    const options = this.prefs().options;
    this.prefsService.setOptions({ ...options, [key]: !options[key] });
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
    // Unbalanced systems are running-count-only; coerce a stale true-count
    // mode back so the drill never starts in an impossible configuration.
    const system = this.systems.find((s) => s.id === id);
    if (system && !system.balanced && this.prefs().counting.mode === 'true-count') {
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
