import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { actionForKey, shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { Scenario } from '../../core/models/card.model';
import {
  ACTION_LABELS,
  type Action,
  type EvaluationResult,
} from '../../core/models/strategy.model';
import { BasicStrategyEngineService } from '../../core/services/basic-strategy-engine.service';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
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

// The drill loop's only states. A correct answer flashes in place and
// auto-advances; a miss is the loop's only pause; 'done' is the session end.
type DrillPhase = 'question' | 'flash' | 'miss' | 'done';

@Component({
  selector: 'app-basic-strategy-drill-page',
  imports: [FlowTopbarComponent, FlowStageComponent, FlowActionsComponent, FlowDoneComponent],
  template: `
    <div class="drill">
      @if (phase() !== 'done') {
        <app-flow-topbar
          name="Basic Strategy"
          [count]="handsToday()"
          [target]="target()"
          [streak]="session.streak()"
          (exit)="exitToHome()"
        />

        <app-flow-stage [player]="scenario().player" [dealer]="scenario().dealerUpcard">
          @if (phase() === 'miss' && result(); as r) {
            <p class="drill__rule">
              <b>Correct: {{ labelFor(r.action) }}.</b> {{ r.reason }}
            </p>
          } @else {
            <p class="drill__question">
              @if (question().prefix) {
                {{ question().prefix }}
              }
              <b>{{ question().value }}</b> vs <b>{{ question().dealer }}</b>
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
export class BasicStrategyDrillPageComponent {
  private readonly engine = inject(BasicStrategyEngineService);
  private readonly generator = inject(CardGeneratorService);
  private readonly stats = inject(BasicStrategyStatsService);
  private readonly prefs = inject(FlowPrefsService);
  private readonly history = inject(PracticeHistoryService);
  private readonly missTally = inject(MissTallyService);
  private readonly router = inject(Router);
  private readonly advanceDelayMs = inject(FLOW_ADVANCE_DELAY_MS);

  protected readonly session = new DrillSession();

  protected readonly phase = signal<DrillPhase>('question');
  protected readonly scenario = signal<Scenario>(this.firstScenario());
  protected readonly result = signal<EvaluationResult | null>(null);
  protected readonly target = signal(0);

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly question = computed(() =>
    handQuestion(this.scenario().player, this.scenario().dealerUpcard),
  );

  protected readonly legalActions = computed(() =>
    legalActionsFor(
      this.scenario().player,
      this.scenario().dealerUpcard,
      this.prefs.prefs().options,
    ),
  );

  protected readonly picked = computed<Action | null>(() => this.result()?.userAction ?? null);
  protected readonly correctAction = computed<Action | null>(() => this.result()?.action ?? null);
  protected readonly goalMet = computed(() => this.handsToday() >= this.prefs.prefs().dailyGoal);

  protected readonly weakSpot = computed(() => {
    this.missTally.state();
    return this.missTally.weakSpotFor('basic-strategy');
  });

  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  // Swallows the click that graded the miss so it doesn't also continue.
  private suppressNextContinueClick = false;

  constructor() {
    this.prefs.setLastTrainer('basic-strategy');
    this.target.set(nextSessionTarget(this.handsToday(), this.prefs.prefs().dailyGoal));
    inject(DestroyRef).onDestroy(() => this.clearAdvance());
  }

  protected answer(action: Action): void {
    if (this.phase() !== 'question') return;
    if (!this.legalActions().includes(action)) return;
    const result = this.engine.evaluate(
      {
        player: this.scenario().player,
        dealerUpcard: this.scenario().dealerUpcard,
        ruleSet: this.prefs.prefs().ruleSet,
        options: this.prefs.prefs().options,
      },
      action,
    );
    this.result.set(result);
    this.stats.recordAttempt(result.correct);
    this.history.recordHand();
    this.missTally.record(
      'basic-strategy',
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

  // Leaving the miss: tap anywhere / press any key.
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
    this.dealNext(this.generator.generate());
  }

  private dealNext(scenario: Scenario): void {
    this.scenario.set(scenario);
    this.result.set(null);
    this.phase.set('question');
  }

  // Sessions open on the current weak spot when one exists — the Done
  // screen's "Drill next" is a promise the next round keeps.
  private firstScenario(): Scenario {
    const weak = this.missTally.weakSpotFor('basic-strategy');
    if (weak) return scenarioFromRef(weak.ref, Math.random);
    return this.generator.generate();
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
