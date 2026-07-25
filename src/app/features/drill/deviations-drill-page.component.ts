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
import { RANDOM_SOURCE } from '../../core/services/random-source';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { FlowActionsComponent } from '../../shared/flow-actions.component';
import { FlowDoneComponent } from '../../shared/flow-done.component';
import { FlowTopbarComponent } from '../../shared/flow-topbar.component';
import { DrillSession } from './drill-session';
import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';
import {
  handQuestion,
  legalActionsFor,
  nextSessionTarget,
  pickWeakSpot,
  scenarioFromRef,
} from './drill-hand';
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
      <!-- Grading shows as color and position on the action grid, which
           announces as nothing. This node stays mounted across every phase so
           the region is already live when its text changes. -->
      <p class="sr-only" role="status">{{ verdict() }}</p>

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
          [weakSpots]="weakSpots()"
          [cleared]="clearedSpots()"
          (again)="oneMoreRound()"
          (review)="reviewMisses()"
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
  // Injected, not Math.random, so a ?seed= session is reproducible end to end.
  private readonly random = inject(RANDOM_SOURCE);

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

  protected readonly weakSpots = computed(() => {
    this.missTally.state();
    return this.missTally.weakSpots('deviations');
  });

  protected readonly weakSpot = computed(() => this.weakSpots()[0] ?? null);

  protected readonly clearedSpots = computed(() => {
    this.missTally.state();
    return this.missTally.clearedSpots('deviations');
  });

  protected readonly verdict = computed(() => {
    const result = this.result();
    if (result === null) return '';
    const expected = ACTION_LABELS[result.expectedAction];
    if (result.correct) return `Correct: ${expected}.`;
    return `Incorrect. Correct: ${expected}. ${result.explanation}`;
  });

  // A review round drills only the weak list; an ordinary round mixes it in.
  private readonly reviewing = signal(false);

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
    this.startRound(false);
  }

  // "Drill my misses": the same round, but every hand comes from the weak
  // list (falling back to fresh hands once it empties mid-round).
  protected reviewMisses(): void {
    if (this.missTally.weakSpotFor('deviations') === null) return;
    this.startRound(true);
  }

  private startRound(reviewing: boolean): void {
    if (this.phase() !== 'done') return;
    this.reviewing.set(reviewing);
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
    this.dealNext(this.nextScenario());
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
      const base = scenarioFromRef(weak.ref, this.random);
      return { ...base, trueCount: this.pickTrueCount() };
    }
    return this.generateScenario();
  }

  // Every later hand: weighted toward the scenarios being missed, so a
  // weakness gets repetition inside the session that surfaced it. A review
  // round draws from the weak list every time. This applies in both practice
  // modes — a weak spot recorded in deviation-only mode is itself a deviation
  // scenario, and hand one has always been drawn this way.
  private nextScenario(): DeviationScenario {
    const share = this.reviewing() ? 1 : undefined;
    const weak = pickWeakSpot(this.weakSpots(), this.random, share);
    if (weak) {
      const base = scenarioFromRef(weak.ref, this.random);
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
      const rule = pickDeviationRule(prefs.ruleSet, this.random);
      const { player, dealerUpcard } = generateScenarioForDeviationRule({
        rule,
        random: this.random,
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
    return MIN_RANDOM_TRUE_COUNT + Math.floor(this.random() * span);
  }

  private pickTrueCountForRule(rule: DeviationRule): number {
    const prefs = this.prefs.prefs();
    if (prefs.deviations.trueCountSource === 'manual') {
      return prefs.deviations.manualTrueCount;
    }
    return pickTrueCountForDeviationRule(
      rule,
      this.random,
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
    // Ignore OS key auto-repeat: a held answer key would otherwise grade and
    // then immediately continue past the miss explanation before it can be read.
    if (event.repeat) return;
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
