import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { actionForKey, shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type {
  DeviationRule,
  DeviationScenario,
  DeviationTrainerResult,
} from '../../core/models/deviation.model';
import { ACTION_LABELS, type Action } from '../../core/models/strategy.model';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import {
  DeviationEvaluatorService,
  formatTrueCount,
} from '../../core/services/deviation-evaluator.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { MissTallyService, scenarioRefFor } from '../../core/services/miss-tally.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { FlowActionsComponent } from '../../shared/flow-actions.component';
import { FlowDoneComponent } from '../../shared/flow-done.component';
import { FlowTopbarComponent } from '../../shared/flow-topbar.component';
import { DrillSession } from './drill-session';
import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';
import { handQuestion, legalActionsFor, nextSessionTarget, scenarioFromRef } from './drill-hand';
import { FlowStageComponent } from './flow-stage.component';
import {
  generateScenarioForDeviationRule,
  pickDeviationRule,
  pickTrueCountForDeviationRule,
} from './scenario-generators';

// Inclusive range for random true-count generation. Wide enough to exercise
// both negative- and positive-side deviations from the BJA chart.
export const MIN_RANDOM_TRUE_COUNT = -5;
export const MAX_RANDOM_TRUE_COUNT = 8;

type DrillPhase = 'question' | 'flash' | 'miss' | 'done';

// The Deviations trainer in the Flow loop: identical to the Basic Strategy
// drill except that the true count joins the question line and grading goes
// through the deviation evaluator (insurance/surrender overlays included).
// Practice mode and true-count source moved to the Settings screen.
@Component({
  selector: 'app-deviations-drill-page',
  imports: [FlowTopbarComponent, FlowStageComponent, FlowActionsComponent, FlowDoneComponent],
  template: `
    <div class="drill">
      @if (phase() !== 'done') {
        <app-flow-topbar
          name="Deviations"
          [count]="handsToday()"
          [target]="target()"
          [streak]="session.streak()"
          (exit)="exitToHome()"
        />

        <app-flow-stage [player]="scenario().player" [dealer]="scenario().dealerUpcard">
          @if (phase() === 'miss' && result(); as r) {
            <p class="drill__rule">
              <b>Correct: {{ labelFor(r.expectedAction) }}.</b> {{ r.explanation }}
            </p>
          } @else {
            <p class="drill__question">
              @if (question().prefix) {
                {{ question().prefix }}
              }
              <b>{{ question().value }}</b> vs <b>{{ question().dealer }}</b>
              <span class="drill__tc"
                >&nbsp;· TC <b>{{ trueCountLabel() }}</b></span
              >
            </p>
          }
        </app-flow-stage>

        <app-flow-actions
          [legal]="legalActions()"
          [picked]="picked()"
          [correct]="correctAction()"
          (action)="answer($event)"
        />

        <p class="drill__continue" [class.drill__continue--active]="phase() === 'miss'">
          <span class="drill__continue-touch">tap anywhere to continue</span>
          <span class="drill__continue-key">press any key to continue</span>
        </p>
      } @else {
        <app-flow-done
          [hands]="handsToday()"
          [target]="target()"
          [goalMet]="goalMet()"
          [bestStreak]="session.bestStreak()"
          [accuracy]="session.accuracy()"
          [weakSpot]="weakSpot()"
          (again)="oneMoreRound()"
          (exit)="exitToHome()"
        />
      }
    </div>
  `,
  styleUrl: './drill-page.scss',
})
export class DeviationsDrillPageComponent {
  private readonly evaluator = inject(DeviationEvaluatorService);
  private readonly cardGenerator = inject(CardGeneratorService);
  private readonly stats = inject(DeviationStatsService);
  private readonly prefs = inject(FlowPrefsService);
  private readonly history = inject(PracticeHistoryService);
  private readonly missTally = inject(MissTallyService);
  private readonly router = inject(Router);
  private readonly advanceDelayMs = inject(FLOW_ADVANCE_DELAY_MS);

  protected readonly session = new DrillSession();

  protected readonly phase = signal<DrillPhase>('question');
  protected readonly scenario = signal<DeviationScenario>(this.firstScenario());
  protected readonly result = signal<DeviationTrainerResult | null>(null);
  protected readonly target = signal(0);

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly question = computed(() =>
    handQuestion(this.scenario().player, this.scenario().dealerUpcard),
  );

  protected readonly trueCountLabel = computed(() => formatTrueCount(this.scenario().trueCount));

  // Surrender stays answerable regardless of the Late Surrender rule: the
  // deviation surrender overlay can expect SUR either way.
  protected readonly legalActions = computed(() =>
    legalActionsFor(
      this.scenario().player,
      this.scenario().dealerUpcard,
      this.prefs.prefs().options,
      true,
    ),
  );

  protected readonly picked = computed<Action | null>(() => this.result()?.userAction ?? null);
  protected readonly correctAction = computed<Action | null>(
    () => this.result()?.expectedAction ?? null,
  );
  protected readonly goalMet = computed(() => this.handsToday() >= this.prefs.prefs().dailyGoal);

  protected readonly weakSpot = computed(() => {
    this.missTally.state();
    return this.missTally.weakSpotFor('deviations');
  });

  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  // Swallows the click that graded the miss so it doesn't also continue.
  private suppressNextContinueClick = false;

  constructor() {
    this.prefs.setLastTrainer('deviations');
    this.target.set(nextSessionTarget(this.handsToday(), this.prefs.prefs().dailyGoal));
    inject(DestroyRef).onDestroy(() => this.clearAdvance());
  }

  protected answer(action: Action): void {
    if (this.phase() !== 'question') return;
    if (!this.legalActions().includes(action)) return;
    const result = this.evaluator.evaluate(
      this.scenario(),
      action,
      this.prefs.prefs().ruleSet,
      this.prefs.prefs().options,
    );
    this.result.set(result);
    this.stats.recordAttempt(result.correct);
    this.history.recordHand();
    this.missTally.record(
      'deviations',
      scenarioRefFor(this.scenario().player, this.scenario().dealerUpcard),
      result.correct,
    );
    this.session.record(result.correct);

    if (result.correct) {
      this.phase.set('flash');
      this.advanceTimer = setTimeout(() => {
        this.advanceTimer = null;
        this.advance();
      }, this.advanceDelayMs);
    } else {
      this.phase.set('miss');
      this.suppressNextContinueClick = true;
    }
  }

  protected continueFromMiss(): void {
    if (this.phase() !== 'miss') return;
    this.advance();
  }

  protected oneMoreRound(): void {
    if (this.phase() !== 'done') return;
    this.session.reset();
    this.target.set(nextSessionTarget(this.handsToday(), this.prefs.prefs().dailyGoal));
    this.dealNext(this.firstScenario());
  }

  protected exitToHome(): void {
    void this.router.navigate(['/']);
  }

  protected labelFor(action: Action): string {
    return ACTION_LABELS[action];
  }

  private advance(): void {
    if (this.handsToday() >= this.target()) {
      this.result.set(null);
      this.phase.set('done');
      return;
    }
    this.dealNext(this.generateScenario());
  }

  private dealNext(scenario: DeviationScenario): void {
    this.scenario.set(scenario);
    this.result.set(null);
    this.phase.set('question');
  }

  // Sessions open on the current weak spot when one exists.
  private firstScenario(): DeviationScenario {
    const weak = this.missTally.weakSpotFor('deviations');
    if (weak) {
      const base = scenarioFromRef(weak.ref, Math.random);
      return { ...base, trueCount: this.pickTrueCount() };
    }
    return this.generateScenario();
  }

  // Mirrors the pre-Flow trainer: 'all-hands' draws uniformly random hands;
  // 'deviation-only' builds the hand around an encoded deviation rule with a
  // true count biased 50/50 around the rule's threshold.
  private generateScenario(): DeviationScenario {
    const prefs = this.prefs.prefs();
    if (prefs.deviations.practiceMode === 'deviation-only') {
      const rule = pickDeviationRule(prefs.ruleSet, Math.random);
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
    const prefs = this.prefs.prefs();
    if (prefs.deviations.trueCountSource === 'manual') {
      return prefs.deviations.manualTrueCount;
    }
    const span = MAX_RANDOM_TRUE_COUNT - MIN_RANDOM_TRUE_COUNT + 1;
    return MIN_RANDOM_TRUE_COUNT + Math.floor(Math.random() * span);
  }

  private pickTrueCountForRule(rule: DeviationRule): number {
    const prefs = this.prefs.prefs();
    if (prefs.deviations.trueCountSource === 'manual') {
      return prefs.deviations.manualTrueCount;
    }
    return pickTrueCountForDeviationRule(
      rule,
      Math.random,
      MIN_RANDOM_TRUE_COUNT,
      MAX_RANDOM_TRUE_COUNT,
    );
  }

  private clearAdvance(): void {
    if (this.advanceTimer !== null) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    const phase = this.phase();
    // The Done screen owns its own Enter/Esc handling.
    if (phase === 'done') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.exitToHome();
      return;
    }
    if (phase === 'question') {
      const action = actionForKey(event.key);
      // Poka-yoke: hotkeys for illegal actions are dead, not wrong.
      if (action && this.legalActions().includes(action)) {
        event.preventDefault();
        this.answer(action);
        // A key-graded miss has no trailing click to swallow.
        this.suppressNextContinueClick = false;
      }
      return;
    }
    if (phase === 'miss') {
      event.preventDefault();
      this.continueFromMiss();
    }
  }

  // "Tap anywhere to continue" — the whole screen is the miss-recovery
  // target. The click that graded the miss bubbles here too; swallow it.
  @HostListener('click')
  protected onHostClick(): void {
    if (this.phase() !== 'miss') return;
    if (this.suppressNextContinueClick) {
      this.suppressNextContinueClick = false;
      return;
    }
    this.continueFromMiss();
  }
}
