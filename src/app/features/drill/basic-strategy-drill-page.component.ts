import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { actionForKey, shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import { isAce, type Card, type Scenario } from '../../core/models/card.model';
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
import {
  MissTallyService,
  scenarioLabel,
  scenarioRefFor,
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
  MAX_SPLIT_HANDS,
  handQuestion,
  isReviewEntry,
  legalActionsFor,
  nextSessionTarget,
  pickWeakSpot,
  pinnedScenarioRef,
  scenarioFromRef,
  splitHandAt,
  type SplitContext,
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

        @if (pinnedLabel(); as label) {
          <p class="drill__advisory" role="note">
            Drilling <b>{{ label }}</b> — every hand this round.
          </p>
        }

        <app-flow-stage
          [player]="hand()"
          [dealer]="scenario().dealerUpcard"
          [handLabel]="handLabel()"
        >
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

  // One hand, every deal: the chart's own entry into this drill. Declared before
  // the opening scenario because that scenario is chosen from it.
  protected readonly pinned = signal(pinnedScenarioRef(inject(ActivatedRoute)));

  protected readonly phase = signal<DrillPhase>('question');
  protected readonly scenario = signal<Scenario>(this.firstScenario());
  // Every hand the deal is holding, in the order they are played: one until a
  // split makes more. A hand waiting behind the one in play holds a single card
  // — its second is dealt when it is reached, as a dealer deals it.
  protected readonly hands = signal<readonly (readonly Card[])[]>([this.scenario().player]);
  protected readonly activeIndex = signal(0);
  // The hand in front of you: the deal's two cards, plus every card a correct
  // hit has drawn since. The scenario keeps the opening deal, which is what a
  // weak spot is filed against and what the next hand resets to.
  protected readonly hand = computed<readonly Card[]>(() => this.hands()[this.activeIndex()] ?? []);
  protected readonly result = signal<EvaluationResult | null>(null);
  protected readonly target = signal(0);

  // Split aces take one card each and stand, so those hands are never asked a
  // question — the rule the showdown's table already plays.
  private readonly splitAces = signal(false);

  // What a split has left the hand in front of you. More than one hand in play
  // means every one of them came out of a split: a split replaces the hand that
  // made it, so there is no unsplit hand left to confuse this with.
  protected readonly splitContext = computed<SplitContext>(() => ({
    fromSplit: this.hands().length > 1,
    canSplitAgain: this.hands().length < MAX_SPLIT_HANDS,
  }));

  protected readonly handLabel = computed(() => {
    const total = this.hands().length;
    if (total < 2) return '';
    return `Hand ${this.activeIndex() + 1} of ${total}`;
  });

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly question = computed(() =>
    handQuestion(this.hand(), this.scenario().dealerUpcard),
  );

  protected readonly legalActions = computed(() =>
    legalActionsFor(
      this.hand(),
      this.scenario().dealerUpcard,
      this.prefs.prefs().options,
      false,
      this.splitContext(),
    ),
  );

  // Why the played-out hand stopped asking: a hit that busted, one that reached
  // 21, or a split ace, which takes its one card and stands.
  protected readonly handOver = computed(() => {
    const cards = this.hand();
    const total = handTotal(cards);
    if (total > 21) return `Bust — ${total}.`;
    if (this.splitAces() && cards.length === 2) return `${total} — split aces take one card.`;
    return `${total} — nothing left to decide.`;
  });

  protected readonly picked = computed<Action | null>(() => this.result()?.userAction ?? null);
  protected readonly correctAction = computed<Action | null>(() => this.result()?.action ?? null);
  protected readonly goalMet = computed(() => this.handsToday() >= this.prefs.prefs().dailyGoal);

  protected readonly weakSpots = computed(() => {
    this.missTally.state();
    return this.missTally.weakSpots('basic-strategy');
  });

  protected readonly weakSpot = computed(() => this.weakSpots()[0] ?? null);

  // A pinned round narrows the practice to one hand, which is worth saying:
  // nothing else on screen distinguishes it from a run of coincidences.
  protected readonly pinnedLabel = computed(() => {
    const ref = this.pinned();
    return ref === null ? null : scenarioLabel(ref);
  });

  protected readonly clearedSpots = computed(() => {
    this.missTally.state();
    return this.missTally.clearedSpots('basic-strategy');
  });

  protected readonly verdict = computed(() => {
    if (this.phase() === 'over') return this.handOver();
    const result = this.result();
    // Between hands of a split the grid and the stage both change with nothing
    // announced, so the hand coming up names itself.
    if (result === null) return this.handLabel();
    const correctAction = ACTION_LABELS[result.action];
    if (result.correct) return `Correct: ${correctAction}.`;
    return `Incorrect. Correct: ${correctAction}. ${result.reason}`;
  });

  // A review round drills only the weak list; an ordinary round mixes it in.
  private readonly reviewing = signal(false);

  // The deal's first decision — the question the drill has always asked, and the
  // only one with a weak spot to file or a clock worth reading. A hit deepens
  // the hand and a split replaces it; either way what follows is a different
  // question from the one the deal put up.
  private readonly atDeal = signal(true);

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
    // Arriving from Progress's weak-spot card, which is the same promise the
    // Done screen's "Drill my misses" makes — the round opens on the weakness
    // (`firstScenario` already does) and every later hand comes from the list.
    if (isReviewEntry(inject(ActivatedRoute))) this.reviewing.set(true);
    inject(DestroyRef).onDestroy(() => this.clearAdvance());
  }

  protected answer(action: Action): void {
    if (this.phase() !== 'question') return;
    if (!this.legalActions().includes(action)) return;
    const cards = this.hand();
    const atDeal = this.atDeal();
    const result = this.gradeDecision(cards, action, atDeal);
    this.result.set(result);
    this.atDeal.set(false);
    // Only the deal's decision is timed, and for the same reason only it is
    // filed as a weak spot: it is the question the drill has always asked. A
    // continued decision offers two buttons and one total where the deal offers
    // six and a pair-or-soft-or-hard lookup, so mixing them would move the
    // week's figure when the trainee turned a setting on rather than when they
    // got faster. A hand out of a split is two cards again but is not the deal:
    // it cannot surrender, cannot insure, and doubles only under DAS.
    const elapsedMs = atDeal
      ? (plausibleDecisionMs(Date.now() - this.askedAt) ?? undefined)
      : undefined;
    this.stats.recordAttempt(result.correct);
    this.history.recordHand(result.correct, elapsedMs);
    // Only the deal's decision has a weak spot to file under: a `ScenarioRef`
    // names the two cards that were dealt, and re-dealing a three-card 16 — or
    // the 11 a split of 8s made — as an opening hand asks a different question.
    if (atDeal) {
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

  // The deal's question is `decide`: two cards, every action on the table.
  // Every question after it is `decidePlay`, told what the table still offers —
  // the engine narrows further on its own, since doubling, splitting and
  // surrender are first-two-card actions whatever the caller passes.
  private gradeDecision(cards: readonly Card[], action: Action, atDeal: boolean): EvaluationResult {
    const dealerUpcard = this.scenario().dealerUpcard;
    const ruleSet = this.prefs.prefs().ruleSet;
    const options = this.prefs.prefs().options;
    if (atDeal) {
      const player: readonly [Card, Card] = [cards[0], cards[1]];
      return this.engine.evaluate({ player, dealerUpcard, ruleSet, options }, action);
    }
    const split = this.splitContext();
    return this.engine.evaluatePlay(
      {
        player: cards,
        dealerUpcard,
        ruleSet,
        options,
        canDouble: !split.fromSplit || options.doubleAfterSplit,
        canSplit: split.canSplitAgain,
        canSurrender: !split.fromSplit,
      },
      action,
    );
  }

  // A hit and a split are the two correct answers that leave another decision
  // behind them: a hit draws the next card and asks again, a split turns one
  // hand into two and asks about each in turn. Stand, double and surrender
  // finish the hand in front of you, exactly as they would at a table.
  private afterCorrect(action: Action): void {
    if (!this.prefs.prefs().playHandsOut) {
      this.advance();
      return;
    }
    if (action === 'H') {
      this.drawToActive();
      return;
    }
    if (action === 'P') {
      this.splitActive();
      return;
    }
    this.finishHand();
  }

  private drawToActive(): void {
    const grown = [...this.hand(), this.generator.generateCard()];
    this.setActiveHand(grown);
    // Busting, or reaching 21, ends the hand with nothing left to ask.
    if (handTotal(grown) >= 21) {
      this.holdThenFinish();
      return;
    }
    this.ask();
  }

  // The two halves each keep one card; the one in play is dealt its second.
  private splitActive(): void {
    this.splitAces.set(isAce(this.hand()[0]));
    this.hands.set(splitHandAt(this.hands(), this.activeIndex()));
    this.dealSecondCard();
  }

  // A hand out of a split arrives holding one card. Deal its second, then ask —
  // unless it is a split ace, which takes that card and stands, or it landed on
  // 21, which leaves nothing to decide either.
  private dealSecondCard(): void {
    const grown = [...this.hand(), this.generator.generateCard()];
    this.setActiveHand(grown);
    if (this.splitAces() || handTotal(grown) >= 21) {
      this.holdThenFinish();
      return;
    }
    this.ask();
  }

  // Hold the card that ended the hand on screen — that is the answer to the
  // decision before it — then move on.
  private holdThenFinish(): void {
    this.phase.set('over');
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.finishHand();
    }, this.advanceDelayMs * 2);
  }

  // The hand in front of you is done. A split leaves others waiting behind it;
  // when none is left, so is the deal.
  private finishHand(): void {
    const next = this.activeIndex() + 1;
    if (next >= this.hands().length) {
      this.advance();
      return;
    }
    this.activeIndex.set(next);
    this.dealSecondCard();
  }

  private setActiveHand(cards: readonly Card[]): void {
    const i = this.activeIndex();
    this.hands.update((hands) => hands.map((hand, j) => (j === i ? cards : hand)));
  }

  private ask(): void {
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
    // The pin belongs to the round the chart started, the same way review mode
    // belongs to the round the Done screen started: another round is ordinary
    // practice unless it is asked for again.
    this.pinned.set(null);
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
    this.hands.set([scenario.player]);
    this.activeIndex.set(0);
    this.splitAces.set(false);
    this.atDeal.set(true);
    this.ask();
  }

  // Sessions open on the current weak spot when one exists — the Done
  // screen's queued weakness is a promise the next round keeps.
  private firstScenario(): Scenario {
    const pinned = this.pinned();
    if (pinned) return scenarioFromRef(pinned, this.random);
    const weak = this.missTally.weakSpotFor('basic-strategy');
    if (weak) return scenarioFromRef(weak.ref, this.random);
    return this.generator.generate();
  }

  // Every later hand: weighted toward the scenarios being missed, so a
  // weakness gets repetition inside the session that surfaced it. A review
  // round draws from the weak list every time.
  private nextScenario(): Scenario {
    const pinned = this.pinned();
    if (pinned) return scenarioFromRef(pinned, this.random);
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
