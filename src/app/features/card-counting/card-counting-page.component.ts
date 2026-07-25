import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { Card } from '../../core/models/card.model';
import type {
  CountingDrillResult,
  CountingDrillSettings,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { type Shoe } from '../../core/models/shoe.model';
import { minCardsForSpots } from '../../core/models/showdown.model';
import { COUNTING_SYSTEMS, HI_LO } from '../../data/counting-systems';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { DeckEstimationStatsService } from '../../core/services/deck-estimation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { ShoeService } from '../../core/services/shoe.service';
import { TrueCountStatsService } from '../../core/services/true-count-stats.service';
import { FlowDoneComponent } from '../../shared/flow-done.component';
import { FlowTopbarComponent } from '../../shared/flow-topbar.component';
import { DrillSession } from '../drill/drill-session';
import { nextSessionTarget } from '../drill/drill-hand';
import { CardStreamComponent } from './card-stream.component';
import { CountAnswerFormComponent } from './count-answer-form.component';
import { CountFeedbackPanelComponent } from './count-feedback-panel.component';
import { DeckEstimateFormComponent } from './deck-estimate-form.component';
import { ShowdownComponent } from './showdown.component';

// The counting drill's internal mechanics are unchanged from the pre-Flow
// trainer; 'done' is the Flow session end. 'estimating' is the live-shoe-only
// step where the player guesses the decks remaining before giving the true
// count. 'showdown' is the optional post-count hand vs the dealer off the
// same live shoe.
type DrillState =
  | 'idle'
  | 'streaming'
  | 'estimating'
  | 'answering'
  | 'feedback'
  | 'showdown'
  | 'done';

// The Card Counting trainer in the Flow shell: thin session top bar, one
// primary start action, graded reps counting toward the daily goal, and no
// on-screen configuration (drill settings live on the Settings screen).
@Component({
  selector: 'app-card-counting-page',
  imports: [
    RouterLink,
    FlowTopbarComponent,
    FlowDoneComponent,
    CardStreamComponent,
    DeckEstimateFormComponent,
    CountAnswerFormComponent,
    CountFeedbackPanelComponent,
    ShowdownComponent,
  ],
  template: `
    <main class="count">
      @if (state() !== 'done') {
        <app-flow-topbar
          name="Card Counting"
          [count]="handsToday()"
          [target]="target()"
          [streak]="session.streak()"
          (exit)="exitToHome()"
        />

        <div class="count__stage">
          @if (reshuffleNotice() && state() !== 'idle') {
            <p class="count__reshuffle" role="status">
              Shoe reshuffled at the cut card — running count reset to 0.
            </p>
          }

          @if (state() === 'idle') {
            <div class="count__idle">
              <!-- h2: the top bar's trainer name is this screen's h1. -->
              <h2 class="count__system">{{ system().name }}</h2>
              <p class="count__desc">{{ system().description }}</p>
              @if (isValid()) {
                <button type="button" class="count__start" (click)="start()">
                  Start counting <kbd class="kcap">⏎</kbd>
                </button>
              } @else {
                <p class="count__invalid" role="alert">
                  The drill settings need attention before this drill can start.
                </p>
                <a class="count__fix" routerLink="/settings">Open Settings</a>
              }
            </div>
          }

          @if (state() === 'streaming') {
            <app-card-stream
              [currentCard]="currentCard()"
              [currentIndex]="currentIndex()"
              [totalCards]="cards().length"
              [showProgress]="true"
            />
          }

          @if (state() === 'estimating') {
            <app-deck-estimate-form (estimate)="onEstimate($event)" />
          }

          @if (state() === 'answering') {
            <app-count-answer-form
              [mode]="settings().mode"
              [allowFractions]="fractionalAnswers()"
              (answer)="onAnswer($event)"
            />
          }

          @if (state() === 'feedback' && result(); as r) {
            <app-count-feedback-panel [result]="r" [system]="system()" (next)="runAgain()" />
            @if (liveShoeTrueCount() && showdownAvailable()) {
              <div class="count__showdown-cta">
                <button type="button" class="count__showdown-button" (click)="enterShowdown()">
                  {{
                    showdownSpots() > 1
                      ? 'Play ' + showdownSpots() + ' hands vs the dealer'
                      : 'Play a hand vs the dealer'
                  }}
                </button>
              </div>
            }
          }

          @if (state() === 'showdown') {
            <app-showdown
              [shoe]="shoe!"
              [ruleSet]="ruleSet()"
              [spots]="showdownSpots()"
              (exit)="exitShowdown($event)"
            />
          }
        </div>
      } @else {
        <app-flow-done
          [hands]="handsToday()"
          [target]="target()"
          [goalMet]="goalMet()"
          [bestStreak]="session.bestStreak()"
          [accuracy]="session.accuracy()"
          (again)="oneMoreRound()"
          (exit)="exitToHome()"
        />
      }
    </main>
  `,
  styleUrl: './card-counting-page.component.scss',
})
export class CardCountingPageComponent {
  private readonly cardGenerator = inject(CardGeneratorService);
  private readonly shoeService = inject(ShoeService);
  private readonly engine = inject(CountingEngineService);
  private readonly prefs = inject(FlowPrefsService);
  private readonly history = inject(PracticeHistoryService);
  private readonly router = inject(Router);
  // statsService is the running-count store; trueCountStatsService is the
  // true-count store; deckEstimationStatsService tracks live-shoe decks-
  // remaining accuracy. All three persist under their pre-Flow keys.
  protected readonly statsService = inject(CardCountingStatsService);
  protected readonly trueCountStatsService = inject(TrueCountStatsService);
  protected readonly deckEstimationStatsService = inject(DeckEstimationStatsService);

  protected readonly session = new DrillSession();

  protected readonly state = signal<DrillState>('idle');
  protected readonly target = signal(0);
  protected readonly cards = signal<readonly Card[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly result = signal<CountingDrillResult | null>(null);

  // Drill configuration comes from the Settings screen via prefs; the page
  // itself hosts none of it.
  protected readonly settings = computed<CountingDrillSettings>(() => {
    const {
      systemId: _systemId,
      showdownSpots: _showdownSpots,
      ...settings
    } = this.prefs.prefs().counting;
    return settings;
  });

  // Boxes the post-count showdown deals to, from the Settings screen.
  protected readonly showdownSpots = computed(() => this.prefs.prefs().counting.showdownSpots);

  protected readonly system = computed<CountingSystem>(
    () => COUNTING_SYSTEMS.find((s) => s.id === this.prefs.prefs().counting.systemId) ?? HI_LO,
  );

  // Dealer rule for the optional post-count showdown, from the shared table
  // rules.
  protected readonly ruleSet = computed(() => this.prefs.prefs().ruleSet);

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly goalMet = computed(() => this.handsToday() >= this.prefs.prefs().dailyGoal);

  // Fractional systems (Wong Halves) produce half-point running counts, so
  // the answer form must accept decimal input. True counts are always whole
  // numbers (Math.trunc), so this only applies in running-count mode.
  protected readonly fractionalAnswers = computed(
    () => this.settings().mode === 'running-count' && this.engine.isFractionalSystem(this.system()),
  );

  // True when the drill is a balanced-system true-count drill reading a live,
  // depleting shoe (as opposed to the classic preset).
  protected readonly liveShoeTrueCount = computed(
    () =>
      this.settings().mode === 'true-count' &&
      this.settings().trueCountSource === 'live-shoe' &&
      this.system().balanced,
  );

  protected readonly currentCard = computed<Card | null>(() => {
    const list = this.cards();
    const i = this.currentIndex();
    return i >= 0 && i < list.length ? list[i] : null;
  });

  protected readonly isValid = computed(() => this.engine.validateSettings(this.settings()).valid);
  protected readonly isDrillActive = computed(
    () =>
      this.state() === 'streaming' || this.state() === 'estimating' || this.state() === 'answering',
  );

  // Live-shoe state. `shoe` persists across rounds until the cut card; the
  // running count and decks remaining carry over and deplete with it. It is
  // also the card source for the post-count showdown.
  protected shoe: Shoe | null = null;
  // The shoe's build configuration, so a settings change between rounds
  // (decks, penetration, or counting system) discards the stale shoe.
  private shoeConfig: { numberOfDecks: number; penetration: number; systemId: string } | null =
    null;
  // Running count accumulated over earlier rounds of the current shoe (reset
  // to 0 on each reshuffle). It is the prior added to the next round's cards.
  protected readonly shoeRunningCount = signal(0);
  // Actual decks remaining at the moment the player estimates (post-deal); the
  // true count is graded against this, and the estimate scored against it.
  protected readonly actualDecksRemaining = signal(0);
  // The player's decks-remaining estimate for the current round, or null
  // before they submit one.
  protected readonly deckEstimate = signal<number | null>(null);
  // True for the round that began with an at-cut-card reshuffle (drives the
  // visible notice).
  protected readonly reshuffleNotice = signal(false);

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.prefs.setLastTrainer('card-counting');
    this.target.set(nextSessionTarget(this.handsToday(), this.prefs.prefs().dailyGoal));
    // Cancel any pending advance if the page unmounts mid-drill.
    inject(DestroyRef).onDestroy(() => this.clearAdvance());
  }

  protected start(): void {
    // Ignore start while a drill is mid-flight. The UI hides Start outside
    // 'idle' / 'feedback', but the keyboard listener and programmatic
    // callers route through here too — this keeps the method safe.
    if (this.isDrillActive()) return;
    if (!this.isValid()) return;
    const seq = this.liveShoeTrueCount()
      ? this.dealLiveShoeRound()
      : this.cardGenerator.generateSequence(this.settings().numberOfCards);
    this.cards.set(seq);
    this.currentIndex.set(0);
    this.result.set(null);
    this.deckEstimate.set(null);
    this.state.set('streaming');
    this.scheduleAdvance();
  }

  // After feedback: another rep, or the Done moment once the session target
  // is reached.
  protected runAgain(): void {
    if (this.state() !== 'feedback') return;
    if (this.handsToday() >= this.target()) {
      this.state.set('done');
      return;
    }
    this.start();
  }

  protected oneMoreRound(): void {
    if (this.state() !== 'done') return;
    this.session.reset();
    this.target.set(nextSessionTarget(this.handsToday(), this.prefs.prefs().dailyGoal));
    this.state.set('idle');
    this.start();
  }

  protected exitToHome(): void {
    void this.router.navigate(['/']);
  }

  // Reshuffle if needed, then deal one round off the persistent shoe. Records
  // the actual decks remaining (post-deal) for grading and the live readout.
  private dealLiveShoeRound(): readonly Card[] {
    const s = this.settings();
    this.ensureShoeForRound();
    const round = this.shoe!.deal(s.numberOfCards);
    this.actualDecksRemaining.set(this.shoe!.decksRemaining);
    return round;
  }

  // Build a fresh shoe when there is none, when its configuration is stale,
  // when the cut card has surfaced, or when the current shoe can't serve a
  // full round. A reshuffle resets the carried running count to 0 and raises
  // the visible notice.
  private ensureShoeForRound(): void {
    const s = this.settings();
    const systemId = this.system().id;
    const configStale =
      !this.shoeConfig ||
      this.shoeConfig.numberOfDecks !== s.numberOfDecks ||
      this.shoeConfig.penetration !== s.penetration ||
      this.shoeConfig.systemId !== systemId;
    const needsFresh =
      !this.shoe ||
      configStale ||
      this.shoe.needsReshuffle ||
      this.shoe.cardsRemaining < s.numberOfCards;
    if (needsFresh) {
      // A stale-config rebuild is a silent reconfiguration, not an at-cut-card
      // reshuffle — only the latter warrants the notice.
      const replacing = this.shoe !== null && !configStale;
      this.shoe = this.shoeService.create(s.numberOfDecks, s.penetration);
      this.shoeConfig = { numberOfDecks: s.numberOfDecks, penetration: s.penetration, systemId };
      this.shoeRunningCount.set(0);
      this.reshuffleNotice.set(replacing);
    } else {
      this.reshuffleNotice.set(false);
    }
  }

  // Live-shoe only: capture the decks-remaining estimate, then move on to the
  // true-count question. The estimate is scored at answer time against the
  // actual decks remaining.
  protected onEstimate(decks: number): void {
    if (this.state() !== 'estimating') return;
    this.deckEstimate.set(decks);
    this.state.set('answering');
  }

  protected onAnswer(userCount: number): void {
    if (this.state() !== 'answering') return;
    const s = this.settings();
    let isCorrect: boolean;
    if (s.mode === 'true-count') {
      if (this.liveShoeTrueCount()) {
        isCorrect = this.answerLiveShoe(userCount);
      } else {
        const evaluated = this.engine.evaluateTrueCount(
          this.cards(),
          userCount,
          s.decksRemaining,
          this.system(),
        );
        this.result.set(evaluated);
        this.trueCountStatsService.recordAttempt(evaluated.isCorrect);
        isCorrect = evaluated.isCorrect;
      }
    } else {
      const evaluated = this.engine.evaluate(this.cards(), userCount, this.system());
      this.result.set(evaluated);
      this.statsService.recordAttempt(evaluated.isCorrect);
      isCorrect = evaluated.isCorrect;
    }
    // Every graded rep is one hand toward the daily goal.
    this.history.recordHand();
    this.session.record(isCorrect);
    this.state.set('feedback');
  }

  // Grade a live-shoe true-count answer against the shoe's actual decks
  // remaining, folding in the running count carried from earlier rounds.
  // Scores the deck estimate against actual (±0.5 band) as a separate stat,
  // then carries the cumulative running count forward for the next round.
  private answerLiveShoe(userTrueCount: number): boolean {
    const prior = this.shoeRunningCount();
    const decks = this.actualDecksRemaining();
    const evaluated = this.engine.evaluateTrueCount(
      this.cards(),
      userTrueCount,
      decks,
      this.system(),
      prior,
    );
    const estimate = this.deckEstimate();
    const withinBand = estimate !== null && this.engine.scoreDeckEstimate(estimate, decks);
    this.result.set({
      ...evaluated,
      deckEstimate: estimate ?? undefined,
      deckEstimateWithinBand: estimate !== null ? withinBand : undefined,
    });
    this.trueCountStatsService.recordAttempt(evaluated.isCorrect);
    if (estimate !== null) {
      this.deckEstimationStatsService.recordAttempt(withinBand);
    }
    // Carry the cumulative running count into the next round of this shoe.
    this.shoeRunningCount.set(evaluated.correctRunningCount);
    return evaluated.isCorrect;
  }

  // Whether a post-count showdown can be offered: a live shoe exists with
  // enough cards to deal an opening round to every configured box. (`shoe` is
  // mutated in place, so this is a method, re-read each change-detection pass
  // rather than a memoized computed.)
  protected showdownAvailable(): boolean {
    return this.shoe !== null && this.shoe.cardsRemaining >= minCardsForSpots(this.showdownSpots());
  }

  // Enter the showdown off the persistent live shoe after a true-count round.
  protected enterShowdown(): void {
    if (this.state() !== 'feedback') return;
    if (!this.liveShoeTrueCount() || !this.showdownAvailable()) return;
    this.state.set('showdown');
  }

  // Return to the count-drill feedback; the shoe keeps whatever depletion the
  // showdown caused, so the next round reshuffles if it has crossed the cut.
  // The showdown's dealt cards really left the shoe, so fold their running-count
  // value into the carried count: otherwise the next round's numerator (carried
  // count, missing these cards) and denominator (decks remaining, already
  // reduced by them) disagree, and a trainee who counted the visible showdown
  // cards is graded wrong. A reshuffle next round resets the count to 0 anyway.
  protected exitShowdown(showdownCards: readonly Card[]): void {
    if (this.state() !== 'showdown') return;
    if (showdownCards.length > 0) {
      const delta = this.engine.runningCount(showdownCards, this.system());
      this.shoeRunningCount.update((rc) => rc + delta);
    }
    this.state.set('feedback');
  }

  private scheduleAdvance(): void {
    this.clearAdvance();
    this.timeoutId = setTimeout(() => {
      const next = this.currentIndex() + 1;
      if (next >= this.cards().length) {
        // Live-shoe true-count drills ask for the decks-remaining estimate
        // first.
        this.state.set(this.liveShoeTrueCount() ? 'estimating' : 'answering');
        this.timeoutId = null;
        return;
      }
      this.currentIndex.set(next);
      this.scheduleAdvance();
    }, this.settings().millisecondsBetweenCards);
  }

  private clearAdvance(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // Enter starts a drill from idle or continues after feedback; Escape exits
  // to home (the Done screen owns its own keys). The answer forms handle
  // their own Enter via native form submit, so 'answering'/'estimating' are
  // skipped here to avoid double-firing.
  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    const state = this.state();
    if (state === 'done') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.exitToHome();
      return;
    }
    if (event.key !== 'Enter') return;
    if (state === 'idle' && this.isValid()) {
      event.preventDefault();
      this.start();
    } else if (state === 'feedback') {
      event.preventDefault();
      this.runAgain();
    }
  }
}
