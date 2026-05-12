import { Component, HostListener, computed, inject, signal } from '@angular/core';

import { isAce, type Card } from '../../core/models/card.model';
import type {
  DeviationDecision,
  DeviationRule,
} from '../../core/models/deviation.model';
import {
  ACTION_LABELS,
  DEFAULT_ENGINE_OPTIONS,
  type Action,
  type EngineOptions,
  type RuleSet,
} from '../../core/models/strategy.model';
import {
  BasicStrategyEngineService,
  type EngineInput,
} from '../../core/services/basic-strategy-engine.service';
import {
  CardGeneratorService,
  type Scenario,
} from '../../core/services/card-generator.service';
import { DeviationEngineService } from '../../core/services/deviation-engine.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { StatsPanelComponent } from '../../shared/stats-panel.component';
import { ActionButtonsComponent } from '../basic-strategy/action-buttons.component';
import { BlackjackTableComponent } from '../basic-strategy/blackjack-table.component';
import {
  DeviationFeedbackPanelComponent,
  type DeviationTrainerResult,
} from './deviation-feedback-panel.component';
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

const KEYBOARD_BINDINGS: Readonly<Record<string, Action>> = {
  h: 'H',
  s: 'S',
  d: 'D',
  p: 'P',
  r: 'SUR',
  i: 'INS',
};

export interface DeviationScenario extends Scenario {
  readonly trueCount: number;
  // True when this scenario was generated to match an encoded deviation
  // rule (deviation-only practice mode). The feedback panel surfaces a
  // small "Deviation candidate hand" note when this is set.
  readonly generatedAsDeviationCandidate?: boolean;
}

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
        <p class="page__subtitle">
          Practice Hi-Lo deviations on top of basic strategy.
        </p>
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

      <app-blackjack-table
        [player]="scenario().player"
        [dealerUpcard]="scenario().dealerUpcard"
      />

      <section class="true-count" aria-label="Practice true count">
        <span class="true-count__label">Practice true count</span>
        <span class="true-count__value">{{ formattedTrueCount() }}</span>
      </section>

      <app-action-buttons
        [disabled]="result() !== null"
        (action)="answer($event)"
      />

      <app-deviation-feedback-panel
        [result]="result()"
        [nextDisabled]="!canDealNextHand()"
        (next)="nextHand()"
      />

      <app-stats-panel
        [stats]="statsService.stats()"
        (reset)="statsService.reset()"
      />
    </div>
  `,
  styleUrl: './deviations-page.component.scss',
})
export class DeviationsPageComponent {
  private readonly basicStrategy = inject(BasicStrategyEngineService);
  private readonly deviationEngine = inject(DeviationEngineService);
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

  protected readonly formattedTrueCount = computed(() => {
    const tc = this.scenario().trueCount;
    return tc > 0 ? `+${tc}` : String(tc);
  });

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
    const s = this.scenario();
    const evaluation = this.evaluate(s, action);
    this.result.set(evaluation);
    this.statsService.recordAttempt(evaluation.correct);
  }

  protected nextHand(): void {
    if (!this.canDealNextHand()) return;
    this.scenario.set(this.generateScenario());
    this.result.set(null);
  }

  private evaluate(
    scenario: DeviationScenario,
    userAction: Action,
  ): DeviationTrainerResult {
    const engineInput: EngineInput = {
      player: scenario.player,
      dealerUpcard: scenario.dealerUpcard,
      ruleSet: this.ruleSet(),
      options: this.options(),
    };
    const playing = this.deviationEngine.resolveDeviationDecision(
      engineInput,
      scenario.trueCount,
    );
    const handDescription = this.basicStrategy.decide(engineInput).handDescription;
    const dealerAce = isAce(scenario.dealerUpcard);
    // Only consult the insurance overlay when the dealer shows an Ace. For
    // non-Ace upcards there is no insurance offer.
    const insurance: DeviationDecision | null = dealerAce
      ? this.deviationEngine.resolveInsuranceDecision(scenario.trueCount, this.ruleSet())
      : null;
    const isDeviationCandidate = scenario.generatedAsDeviationCandidate === true;

    if (insurance && insurance.deviationApplied) {
      // Insurance is offered before the playing decision and dominates when
      // the threshold is met. Expected action is INS regardless of the hand.
      const matchedRule = insurance.matchedRule;
      const expectedAction: Action = 'INS';
      const correct = userAction === expectedAction;
      return {
        userAction,
        expectedAction,
        basicAction: playing.basicAction,
        trueCount: scenario.trueCount,
        handDescription,
        deviationApplied: true,
        matchedRule,
        source: 'insurance',
        correct,
        isDeviationCandidate,
        explanation: correct
          ? `Take insurance: dealer shows an Ace and the true count is ${formatTC(scenario.trueCount)} (≥ +3 makes insurance +EV).`
          : `Take insurance: dealer shows an Ace and the true count is ${formatTC(scenario.trueCount)} (≥ +3 makes insurance +EV). You picked ${ACTION_LABELS[userAction]}.`,
      };
    }

    const expectedAction = playing.finalAction;
    const correct = userAction === expectedAction;
    return {
      userAction,
      expectedAction,
      basicAction: playing.basicAction,
      trueCount: scenario.trueCount,
      handDescription,
      deviationApplied: playing.deviationApplied,
      matchedRule: playing.matchedRule,
      source: 'playing',
      correct,
      isDeviationCandidate,
      explanation: explainPlaying({
        dealerAce,
        userAction,
        playing,
        trueCount: scenario.trueCount,
      }),
    };
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    if (event.key === 'Enter') {
      if (this.result() !== null && this.canDealNextHand()) {
        event.preventDefault();
        this.nextHand();
      }
      return;
    }
    const action = KEYBOARD_BINDINGS[event.key.toLowerCase()];
    if (action) {
      event.preventDefault();
      this.answer(action);
    }
  }
}

function formatTC(tc: number): string {
  return tc > 0 ? `+${tc}` : String(tc);
}

function explainPlaying(args: {
  dealerAce: boolean;
  userAction: Action;
  playing: DeviationDecision;
  trueCount: number;
}): string {
  const { dealerAce, userAction, playing, trueCount } = args;
  const tcLabel = formatTC(trueCount);

  // Distinguish a misplaced Insurance click — the user reached for INS but
  // the insurance overlay didn't fire (either dealer isn't showing an Ace, or
  // dealer Ace but TC below +3).
  if (userAction === 'INS') {
    if (!dealerAce) {
      return `Insurance is only offered when the dealer shows an Ace. Play the hand: ${ACTION_LABELS[playing.finalAction]}.`;
    }
    return `Decline insurance — true count ${tcLabel} is below the +3 threshold. Play the hand: ${ACTION_LABELS[playing.finalAction]}.`;
  }

  if (playing.deviationApplied && playing.matchedRule) {
    return `Hi-Lo deviation: ${playing.matchedRule.source}. At TC ${tcLabel}, play ${ACTION_LABELS[playing.finalAction]} instead of basic ${ACTION_LABELS[playing.basicAction]}.`;
  }

  if (playing.matchedRule) {
    // Rule exists but threshold not met — surface it as a learning hint.
    return `No deviation at TC ${tcLabel}; basic strategy plays ${ACTION_LABELS[playing.finalAction]}. (A deviation for this hand exists but only fires at a different count.)`;
  }

  return `No deviation for this hand; basic strategy plays ${ACTION_LABELS[playing.finalAction]}.`;
}
