import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { actionForKey, shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import {
  deviationIndexNote,
  type DeviationRule,
  type DeviationScenario,
  type DeviationTrainerResult,
} from '../../core/models/deviation.model';
import { countingSystemById } from '../../data/counting-systems';
import { ACTION_LABELS, type Action } from '../../core/models/strategy.model';
import { handTotal } from '../../core/models/hand.model';
import type { Card } from '../../core/models/card.model';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import {
  DeviationEvaluatorService,
  formatTrueCount,
} from '../../core/services/deviation-evaluator.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import {
  MissTallyService,
  scenarioRefFor,
  type WeakSpot,
} from '../../core/services/miss-tally.service';
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
import {
  generateScenarioForDeviationRule,
  pickDeviationRule,
  pickTrueCountForDeviationRule,
} from './scenario-generators';

// Inclusive range for random true-count generation. Wide enough to exercise
// both negative- and positive-side deviations from the BJA chart.
export const MIN_RANDOM_TRUE_COUNT = -5;
export const MAX_RANDOM_TRUE_COUNT = 8;

// 'over' holds the beat where a played-out hand ends on its own (bust, or 21).
type DrillPhase = 'question' | 'flash' | 'miss' | 'over' | 'done';

// The Deviations trainer in the Flow loop: identical to the Basic Strategy
// drill except that the true count joins the question line and grading goes
// through the deviation evaluator (insurance/surrender overlays included).
// Practice mode and true-count source moved to the Settings screen.
@Component({
  selector: 'app-deviations-drill-page',
  imports: [FlowTopbarComponent, FlowStageComponent, FlowActionsComponent, FlowDoneComponent],
  template: `
    <main class="drill">
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

        @if (indexNote(); as note) {
          <p class="drill__advisory" role="note">{{ note }}</p>
        }

        <app-flow-stage [player]="hand()" [dealer]="scenario().dealerUpcard">
          @if (phase() === 'miss' && result(); as r) {
            <p class="drill__rule">
              <b>Correct: {{ labelFor(r.expectedAction) }}.</b> {{ r.explanation }}
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
  // The hand as it stands: the deal's two cards, plus every card a correct hit
  // has drawn since. The scenario keeps the opening deal, which is what a weak
  // spot is filed against and what the next hand resets to.
  protected readonly hand = signal<readonly Card[]>(this.scenario().player);
  protected readonly result = signal<DeviationTrainerResult | null>(null);
  protected readonly target = signal(0);

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly question = computed(() =>
    handQuestion(this.hand(), this.scenario().dealerUpcard),
  );

  // Why the played-out hand stopped asking: a hit that busted, or one that
  // reached 21 and left nothing to decide.
  protected readonly handOver = computed(() => {
    const total = handTotal(this.hand());
    return total > 21 ? `Bust — ${total}.` : `${total} — nothing left to decide.`;
  });

  protected readonly trueCountLabel = computed(() => formatTrueCount(this.scenario().trueCount));

  // The counts this drill grades against are Hi-Lo. A trainee who has picked
  // another system in Settings would otherwise drill Hi-Lo indices against a
  // count that never produces those numbers, and nothing on screen would say so.
  protected readonly indexNote = computed(() =>
    deviationIndexNote(countingSystemById(this.prefs.prefs().counting.systemId)),
  );

  // Surrender stays answerable regardless of the Late Surrender rule: the
  // deviation surrender overlay can expect SUR either way.
  protected readonly legalActions = computed(() =>
    legalActionsFor(this.hand(), this.scenario().dealerUpcard, this.prefs.prefs().options, true),
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
    if (this.phase() === 'over') return this.handOver();
    const result = this.result();
    if (result === null) return '';
    const expected = ACTION_LABELS[result.expectedAction];
    if (result.correct) return `Correct: ${expected}.`;
    return `Incorrect. Correct: ${expected}. ${result.explanation}`;
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
    this.prefs.setLastTrainer('deviations');
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
    //
    // The count goes in with the miss: here it is half the question, and a hand
    // re-dealt at a fresh count is a different one.
    if (cards.length === 2) {
      this.missTally.record(
        'deviations',
        scenarioRefFor(this.scenario().player, this.scenario().dealerUpcard),
        result.correct,
        this.scenario().trueCount,
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

  // The opening question takes every action on the table and the insurance
  // overlay with it. Every question after it is a playing decision on a hand
  // more than two cards deep, where an index still applies — it is written
  // against a total — but doubling, splitting and surrender are gone.
  private gradeDecision(cards: readonly Card[], action: Action): DeviationTrainerResult {
    const prefs = this.prefs.prefs();
    if (cards.length === 2) {
      return this.evaluator.evaluate(this.scenario(), action, prefs.ruleSet, prefs.options);
    }
    return this.evaluator.evaluatePlay(
      {
        player: cards,
        dealerUpcard: this.scenario().dealerUpcard,
        trueCount: this.scenario().trueCount,
        ruleSet: prefs.ruleSet,
        options: prefs.options,
      },
      action,
    );
  }

  // A hit is the one correct answer that leaves another decision behind it, so
  // it draws the next card and asks again — at the same count, which is the
  // scenario's given rather than a live shoe's.
  private afterCorrect(action: Action): void {
    if (!this.prefs.prefs().playHandsOut || action !== 'H') {
      this.advance();
      return;
    }
    const grown = [...this.hand(), this.cardGenerator.generateCard()];
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
    this.hand.set(scenario.player);
    this.result.set(null);
    this.phase.set('question');
    this.askedAt = Date.now();
  }

  // Sessions open on the current weak spot when one exists.
  private firstScenario(): DeviationScenario {
    const weak = this.missTally.weakSpotFor('deviations');
    if (weak) {
      const base = scenarioFromRef(weak.ref, this.random);
      return { ...base, trueCount: this.trueCountForWeakSpot(weak) };
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
      return { ...base, trueCount: this.trueCountForWeakSpot(weak) };
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

  // A weak spot comes back at a count it was actually missed at. The hand alone
  // is not the question here: 16 vs 10 is a stand at +2 and a hit at −1, so a
  // re-deal at a fresh count can ask the side the trainee already had right —
  // and three of those would clear the spot without teaching anything.
  // A manually pinned count still wins: that is the trainee saying which
  // threshold they are drilling.
  private trueCountForWeakSpot(weak: WeakSpot): number {
    if (this.prefs.prefs().deviations.trueCountSource === 'manual') return this.pickTrueCount();
    const counts = weak.missedCounts;
    // Empty for a spot recorded before the counts were kept: a fresh count is
    // what that scenario has always come back at.
    if (counts.length === 0) return this.pickTrueCount();
    return counts[Math.min(counts.length - 1, Math.floor(this.random() * counts.length))];
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
