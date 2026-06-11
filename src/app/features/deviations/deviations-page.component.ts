import { Component, HostListener, computed, inject, signal } from '@angular/core';

import { handleTrainerKeydown } from '../../core/keyboard';
import type {
  DeviationRule,
  DeviationScenario,
  DeviationTrainerResult,
} from '../../core/models/deviation.model';
import {
  DEFAULT_ENGINE_OPTIONS,
  type Action,
  type EngineOptions,
  type RuleSet,
} from '../../core/models/strategy.model';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import {
  DeviationEvaluatorService,
  formatTrueCount,
} from '../../core/services/deviation-evaluator.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { ActionButtonsComponent } from '../../shared/action-buttons.component';
import { BlackjackTableComponent } from '../../shared/blackjack-table.component';
import { StatsPanelComponent } from '../../shared/stats-panel.component';
import { DeviationFeedbackPanelComponent } from './deviation-feedback-panel.component';
import {
  DeviationSettingsComponent,
  type DeviationPracticeMode,
  type TrueCountSource,
} from './deviation-settings.component';
import {
  generateScenarioForDeviationRule,
  pickDeviationRule,
  pickTrueCountForDeviationRule,
} from './scenario-generators';

// Inclusive range used for random true-count generation. Wide enough to
// exercise both negative- and positive-side deviations from the BJA chart.
export const MIN_RANDOM_TRUE_COUNT = -5;
export const MAX_RANDOM_TRUE_COUNT = 8;

@Component({
  selector: 'app-deviations-page',
  imports: [
    DeviationSettingsComponent,
    BlackjackTableComponent,
    ActionButtonsComponent,
    DeviationFeedbackPanelComponent,
    StatsPanelComponent,
  ],
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Blackjack Deviations Trainer</h1>
        <p class="page__subtitle">Practice Hi-Lo deviations on top of basic strategy.</p>
      </header>

      <app-deviation-settings
        [ruleSet]="ruleSet()"
        [options]="options()"
        [trueCountSource]="trueCountSource()"
        [manualTrueCount]="manualTrueCount()"
        [practiceMode]="practiceMode()"
        (ruleSetChange)="ruleSet.set($event)"
        (optionsChange)="options.set($event)"
        (trueCountSourceChange)="setTrueCountSource($event)"
        (manualTrueCountChange)="manualTrueCount.set($event)"
        (practiceModeChange)="practiceMode.set($event)"
      />

      <app-blackjack-table [player]="scenario().player" [dealerUpcard]="scenario().dealerUpcard" />

      <section class="true-count" aria-label="Practice true count">
        <span class="true-count__label">Practice true count</span>
        <span class="true-count__value">{{ formattedTrueCount() }}</span>
      </section>

      <app-action-buttons [disabled]="result() !== null" (action)="answer($event)" />

      <app-deviation-feedback-panel
        [result]="result()"
        [nextDisabled]="!canDealNextHand()"
        (next)="nextHand()"
      />

      <app-stats-panel [stats]="statsService.stats()" (reset)="statsService.reset()" />
    </div>
  `,
  styleUrl: './deviations-page.component.scss',
})
export class DeviationsPageComponent {
  private readonly evaluator = inject(DeviationEvaluatorService);
  private readonly cardGenerator = inject(CardGeneratorService);
  protected readonly statsService = inject(DeviationStatsService);

  protected readonly ruleSet = signal<RuleSet>('S17');
  protected readonly options = signal<EngineOptions>(DEFAULT_ENGINE_OPTIONS);
  protected readonly trueCountSource = signal<TrueCountSource>('random');
  // `null` represents an invalid user input (out of range, empty, non-integer).
  // The page gates next-hand generation on this being non-null in manual mode.
  protected readonly manualTrueCount = signal<number | null>(0);
  protected readonly practiceMode = signal<DeviationPracticeMode>('all-hands');
  protected readonly scenario = signal<DeviationScenario>(this.generateScenario());
  protected readonly result = signal<DeviationTrainerResult | null>(null);

  protected readonly formattedTrueCount = computed(() =>
    formatTrueCount(this.scenario().trueCount),
  );

  protected readonly canDealNextHand = computed(() => {
    if (this.trueCountSource() === 'random') return true;
    return this.manualTrueCount() !== null;
  });

  // Switching to manual with no current value (null from a previous invalid
  // edit) resets to 0; otherwise the prior manual value is preserved.
  protected setTrueCountSource(source: TrueCountSource): void {
    if (source === this.trueCountSource()) return;
    this.trueCountSource.set(source);
    if (source === 'manual' && this.manualTrueCount() === null) {
      this.manualTrueCount.set(0);
    }
  }

  protected answer(action: Action): void {
    if (this.result() !== null) return;
    const evaluation = this.evaluator.evaluate(
      this.scenario(),
      action,
      this.ruleSet(),
      this.options(),
    );
    this.result.set(evaluation);
    this.statsService.recordAttempt(evaluation.correct);
  }

  protected nextHand(): void {
    if (!this.canDealNextHand()) return;
    this.scenario.set(this.generateScenario());
    this.result.set(null);
  }

  // Generates the next scenario. In 'all-hands' mode the player hand and
  // dealer upcard are drawn independently and the true count comes from
  // `pickTrueCount`. In 'deviation-only' mode the scenario is built around
  // a randomly chosen encoded deviation rule for the current rule set; the
  // true count is biased toward the rule's threshold (50% met / 50% unmet)
  // so the user still has to decide whether the deviation applies.
  private generateScenario(): DeviationScenario {
    if (this.practiceMode() === 'deviation-only') {
      const rule = pickDeviationRule(this.ruleSet(), Math.random);
      const { player, dealerUpcard } = generateScenarioForDeviationRule({
        rule,
        random: Math.random,
      });
      return {
        player,
        dealerUpcard,
        trueCount: this.pickTrueCountForRule(rule),
        generatedAsDeviationCandidate: true,
      };
    }
    const base = this.cardGenerator.generate();
    return { ...base, trueCount: this.pickTrueCount() };
  }

  private pickTrueCount(): number {
    if (this.trueCountSource() === 'manual') {
      const v = this.manualTrueCount();
      // canDealNextHand prevents callers from reaching here with a null
      // manual value; the fallback is a defensive default rather than a
      // user-visible path.
      return v ?? 0;
    }
    return this.randomTrueCount();
  }

  private pickTrueCountForRule(rule: DeviationRule): number {
    if (this.trueCountSource() === 'manual') {
      return this.manualTrueCount() ?? 0;
    }
    return pickTrueCountForDeviationRule(
      rule,
      Math.random,
      MIN_RANDOM_TRUE_COUNT,
      MAX_RANDOM_TRUE_COUNT,
    );
  }

  private randomTrueCount(): number {
    const span = MAX_RANDOM_TRUE_COUNT - MIN_RANDOM_TRUE_COUNT + 1;
    return MIN_RANDOM_TRUE_COUNT + Math.floor(Math.random() * span);
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    handleTrainerKeydown(event, {
      canNext: () => this.result() !== null && this.canDealNextHand(),
      onNext: () => this.nextHand(),
      onAction: (action) => this.answer(action),
    });
  }
}
