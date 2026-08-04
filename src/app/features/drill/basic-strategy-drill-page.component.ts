import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { actionForKey, shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { Card, Scenario } from '../../core/models/card.model';
import { handTotal } from '../../core/models/hand.model';
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
import { RANDOM_SOURCE } from '../../core/services/random-source';
import {
  PracticeHistoryService,
  plausibleDecisionMs,
} from '../../core/services/practice-history.service';
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

// The drill loop's only states. A correct answer flashes in place and
// auto-advances; a miss is the loop's only pause; 'over' holds the beat where a
// played-out hand ends on its own (bust, or 21); 'done' is the session end.
type DrillPhase = 'question' | 'flash' | 'miss' | 'over' | 'done';

@Component({
  selector: 'app-basic-strategy-drill-page',
  imports: [FlowTopbarComponent, FlowStageComponent, FlowActionsComponent, FlowDoneComponent],
  template: `
    <main class="drill">
      <!-- Grading shows as color and position on the action grid, which
           announces as nothing. This node stays mounted across every phase so
           the region is already live when its text changes. -->
      <p class="sr-only" role="status">{{ verdict() }}</p>

      @if (phase() !== 'done') {
        <app-flow-topbar
          name="Basic Strategy"
          [count]="handsToday()"
          [target]="target()"
          [streak]="session.streak()"
          (exit)="exitToHome()"
        />

        <app-flow-stage [player]="hand()" [dealer]="scenario().dealerUpcard">
          @if (phase() === 'miss' && result(); as r) {
            <p class="drill__rule">
              <b>Correct: {{ labelFor(r.action) }}.</b> {{ r.reason }}
            </p>
          } @else if (phase() === 'over') {
            <p class="drill__rule">
              <b>{{ handOver() }}</b>
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
          [medianSeconds]="session.medianSeconds()"
          [weakSpot]="weakSpot()"
          [weakSpots]="weakSpots()"
          [cleared]="clearedSpots()"
          (again)="oneMoreRound()"
          (review)="reviewMisses()"
          (exit)="exitToHome()"
        />
      }
    </main>
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
  // Injected, not Math.random, so a ?seed= session is reproducible end to end.
  private readonly random = inject(RANDOM_SOURCE);

  protected readonly session = new DrillSession();

  protected readonly phase = signal<DrillPhase>('question');
  protected readonly scenario = signal<Scenario>(this.firstScenario());
  // The hand as it stands: the deal's two cards, plus every card a correct hit
  // has drawn since. The scenario keeps the opening deal, which is what a weak
  // spot is filed against and what the next hand resets to.
  protected readonly hand = signal<readonly Card[]>(this.scenario().player);
  protected readonly result = signal<EvaluationResult | null>(null);
  protected readonly target = signal(0);

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly question = computed(() =>
    handQuestion(this.hand(), this.scenario().dealerUpcard),
  );

  protected readonly legalActions = computed(() =>
    legalActionsFor(this.hand(), this.scenario().dealerUpcard, this.prefs.prefs().options),
  );

  // Why the played-out hand stopped asking: a hit that busted, or one that
  // reached 21 and left nothing to decide.
  protected readonly handOver = computed(() => {
    const total = handTotal(this.hand());
    return total > 21 ? `Bust — ${total}.` : `${total} — nothing left to decide.`;
  });

  protected readonly picked = computed<Action | null>(() => this.result()?.userAction ?? null);
  protected readonly correctAction = computed<Action | null>(() => this.result()?.action ?? null);
  protected readonly goalMet = computed(() => this.handsToday() >= this.prefs.prefs().dailyGoal);

  protected readonly weakSpots = computed(() => {
    this.missTally.state();
    return this.missTally.weakSpots('basic-strategy');
  });

  protected readonly weakSpot = computed(() => this.weakSpots()[0] ?? null);

  protected readonly clearedSpots = computed(() => {
    this.missTally.state();
    return this.missTally.clearedSpots('basic-strategy');
  });

  protected readonly verdict = computed(() => {
    if (this.phase() === 'over') return this.handOver();
    const result = this.result();
    if (result === null) return '';
    const correctAction = ACTION_LABELS[result.action];
    if (result.correct) return `Correct: ${correctAction}.`;
    return `Incorrect. Correct: ${correctAction}. ${result.reason}`;
  });

  // A review round drills only the weak list; an ordinary round mixes it in.
  private readonly reviewing = signal(false);

  // When the question on screen was put up. A decision's own clock: the app
  // grades whether the answer was right and has never said how long it took,
  // which at a table is half of whether you can play.
  private askedAt = Date.now();

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
    const cards = this.hand();
    const result = this.gradeDecision(cards, action);
    this.result.set(result);
    const elapsedMs = plausibleDecisionMs(Date.now() - this.askedAt) ?? undefined;
    this.stats.recordAttempt(result.correct);
    this.history.recordHand(result.correct, elapsedMs);
    // Only the opening decision has a weak spot to file under: a `ScenarioRef`
    // names a two-card hand, and re-dealing a three-card 16 as a two-card one
    // would ask a different question (that one can double).
    if (cards.length === 2) {
      this.missTally.record(
        'basic-strategy',
        scenarioRefFor(this.scenario().player, this.scenario().dealerUpcard),
        result.correct,
      );
    }
    this.session.record(result.correct, elapsedMs);

    if (result.correct) {
      this.phase.set('flash');
      this.advanceTimer = setTimeout(() => {
        this.advanceTimer = null;
        this.afterCorrect(action);
      }, this.advanceDelayMs);
    } else {
      this.phase.set('miss');
      this.suppressNextContinueClick = true;
    }
  }

  // The opening question is `decide`: two cards, every action on the table.
  // Every question after it is `decidePlay` — the hand is deeper than two cards,
  // so doubling, splitting and surrender are gone as a matter of the rules.
  private gradeDecision(cards: readonly Card[], action: Action): EvaluationResult {
    const dealerUpcard = this.scenario().dealerUpcard;
    const ruleSet = this.prefs.prefs().ruleSet;
    const options = this.prefs.prefs().options;
    if (cards.length === 2) {
      const player: readonly [Card, Card] = [cards[0], cards[1]];
      return this.engine.evaluate({ player, dealerUpcard, ruleSet, options }, action);
    }
    return this.engine.evaluatePlay(
      {
        player: cards,
        dealerUpcard,
        ruleSet,
        options,
        canDouble: false,
        canSplit: false,
        canSurrender: false,
      },
      action,
    );
  }

  // A hit is the one correct answer that leaves another decision behind it, so
  // it draws the next card and asks again. Every other action ends the hand,
  // exactly as it would at a table.
  private afterCorrect(action: Action): void {
    if (!this.prefs.prefs().playHandsOut || action !== 'H') {
      this.advance();
      return;
    }
    const grown = [...this.hand(), this.generator.generateCard()];
    this.hand.set(grown);
    // Busting, or reaching 21, ends the hand with nothing left to ask. Hold the
    // card that did it on screen — that is the answer to the hit — then move on.
    if (handTotal(grown) >= 21) {
      this.phase.set('over');
      this.advanceTimer = setTimeout(() => {
        this.advanceTimer = null;
        this.advance();
      }, this.advanceDelayMs * 2);
      return;
    }
    this.result.set(null);
    this.phase.set('question');
    this.askedAt = Date.now();
  }

  // Leaving the miss: tap anywhere / press any key.
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
    if (this.missTally.weakSpotFor('basic-strategy') === null) return;
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

  private dealNext(scenario: Scenario): void {
    this.scenario.set(scenario);
    this.hand.set(scenario.player);
    this.result.set(null);
    this.phase.set('question');
    this.askedAt = Date.now();
  }

  // Sessions open on the current weak spot when one exists — the Done
  // screen's queued weakness is a promise the next round keeps.
  private firstScenario(): Scenario {
    const weak = this.missTally.weakSpotFor('basic-strategy');
    if (weak) return scenarioFromRef(weak.ref, this.random);
    return this.generator.generate();
  }

  // Every later hand: weighted toward the scenarios being missed, so a
  // weakness gets repetition inside the session that surfaced it. A review
  // round draws from the weak list every time.
  private nextScenario(): Scenario {
    const share = this.reviewing() ? 1 : undefined;
    const weak = pickWeakSpot(this.weakSpots(), this.random, share);
    if (weak) return scenarioFromRef(weak.ref, this.random);
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
    // Ignore OS key auto-repeat: a held answer key would otherwise fire the
    // grade and then immediately continue past the miss explanation — the
    // drill's only teaching pause — before it can be read.
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
