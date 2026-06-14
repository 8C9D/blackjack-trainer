import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { Card } from '../../core/models/card.model';
import {
  DECKS_REMAINING_PRESETS,
  type CountingDrillResult,
  type CountingDrillSettings,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import {
  DEFAULT_NUMBER_OF_DECKS,
  DEFAULT_PENETRATION,
  PENETRATION_PRESETS,
  SHOE_DECK_OPTIONS,
  type Shoe,
} from '../../core/models/shoe.model';
import { COUNTING_SYSTEMS, HI_LO } from '../../data/counting-systems';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { DeckEstimationStatsService } from '../../core/services/deck-estimation-stats.service';
import { ShoeService } from '../../core/services/shoe.service';
import { TrueCountStatsService } from '../../core/services/true-count-stats.service';
import { StatsPanelComponent } from '../../shared/stats-panel.component';
import { CardStreamComponent } from './card-stream.component';
import { CountAnswerFormComponent } from './count-answer-form.component';
import { CountFeedbackPanelComponent } from './count-feedback-panel.component';
import { CountingSettingsComponent } from './counting-settings.component';
import { DeckEstimateFormComponent } from './deck-estimate-form.component';

// 'estimating' is the live-shoe-only step where the player guesses the decks
// remaining before giving the true count.
type DrillState = 'idle' | 'streaming' | 'estimating' | 'answering' | 'feedback';

@Component({
  selector: 'app-card-counting-page',
  imports: [
    CountingSettingsComponent,
    CardStreamComponent,
    DeckEstimateFormComponent,
    CountAnswerFormComponent,
    CountFeedbackPanelComponent,
    StatsPanelComponent,
  ],
  template: `
    <div class="page">
      <header class="page__header">
        <h1>{{ system().name }} Card Counting Trainer</h1>
        <p class="page__subtitle">{{ system().description }}</p>
      </header>

      <app-counting-settings
        [systems]="systems"
        [systemId]="system().id"
        [trueCountAvailable]="trueCountAvailable()"
        [mode]="settings().mode"
        [numberOfCards]="settings().numberOfCards"
        [millisecondsBetweenCards]="settings().millisecondsBetweenCards"
        [decksRemaining]="settings().decksRemaining"
        [decksRemainingPresets]="decksRemainingPresets"
        [trueCountSource]="settings().trueCountSource"
        [numberOfDecks]="settings().numberOfDecks"
        [penetration]="settings().penetration"
        [deckOptions]="deckOptions"
        [penetrationPresets]="penetrationPresets"
        [liveDecksRemaining]="liveDecksRemaining()"
        [errors]="validationErrors()"
        [disabled]="isDrillActive()"
        (systemChange)="onSystemChange($event)"
        (modeChange)="updateSetting('mode', $event)"
        (numberOfCardsChange)="updateSetting('numberOfCards', $event)"
        (millisecondsBetweenCardsChange)="updateSetting('millisecondsBetweenCards', $event)"
        (decksRemainingChange)="updateSetting('decksRemaining', $event)"
        (trueCountSourceChange)="updateSetting('trueCountSource', $event)"
        (numberOfDecksChange)="updateSetting('numberOfDecks', $event)"
        (penetrationChange)="updateSetting('penetration', $event)"
      />

      @if (reshuffleNotice() && state() !== 'idle') {
        <p class="page__reshuffle" role="status">
          Shoe reshuffled at the cut card — running count reset to 0.
        </p>
      }

      @if (state() === 'idle') {
        <div class="page__start">
          <button
            type="button"
            class="page__start-button"
            [disabled]="!isValid()"
            (click)="start()"
          >
            Start drill <span class="page__hint">[Enter]</span>
          </button>
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
        <app-count-feedback-panel [result]="r" [system]="system()" (next)="start()" />
      }

      @if (liveShoeTrueCount()) {
        <div class="page__stats-group">
          <section class="page__stats-section">
            <h2 class="page__stats-heading">True count</h2>
            <app-stats-panel
              [stats]="trueCountStatsService.stats()"
              (reset)="resetTrueCountStats()"
            />
          </section>
          <section class="page__stats-section">
            <h2 class="page__stats-heading">Deck estimation (within ±0.5)</h2>
            <app-stats-panel
              [stats]="deckEstimationStatsService.stats()"
              (reset)="resetDeckEstimationStats()"
            />
          </section>
        </div>
      } @else {
        <app-stats-panel [stats]="activeStats()" (reset)="resetActiveStats()" />
      }
    </div>
  `,
  styleUrl: './card-counting-page.component.scss',
})
export class CardCountingPageComponent {
  private readonly cardGenerator = inject(CardGeneratorService);
  private readonly shoeService = inject(ShoeService);
  private readonly engine = inject(CountingEngineService);
  // statsService is the running-count store; trueCountStatsService is the
  // true-count store; deckEstimationStatsService tracks live-shoe decks-remaining
  // accuracy. All three are persisted under separate keys.
  protected readonly statsService = inject(CardCountingStatsService);
  protected readonly trueCountStatsService = inject(TrueCountStatsService);
  protected readonly deckEstimationStatsService = inject(DeckEstimationStatsService);

  protected readonly systems = COUNTING_SYSTEMS;
  protected readonly system = signal<CountingSystem>(HI_LO);
  protected readonly decksRemainingPresets = DECKS_REMAINING_PRESETS;
  protected readonly deckOptions = SHOE_DECK_OPTIONS;
  protected readonly penetrationPresets = PENETRATION_PRESETS;

  // True-count training is only meaningful for balanced systems, where the
  // Hi-Lo-style running ÷ decks conversion holds. Unbalanced systems (KO) are
  // running-count-only; the selector hides true count for them.
  protected readonly trueCountAvailable = computed(() => this.system().balanced);

  // Fractional systems (Wong Halves) produce half-point running counts, so the
  // answer form must accept decimal input. True counts are always whole numbers
  // (Math.trunc), so this only applies in running-count mode.
  protected readonly fractionalAnswers = computed(
    () => this.settings().mode === 'running-count' && this.engine.isFractionalSystem(this.system()),
  );

  // True when the drill is a balanced-system true-count drill reading a live,
  // depleting shoe (as opposed to the classic preset). Gates the deck-estimate
  // step, the shoe wiring, and the split stats panels.
  protected readonly liveShoeTrueCount = computed(
    () =>
      this.settings().mode === 'true-count' &&
      this.settings().trueCountSource === 'live-shoe' &&
      this.system().balanced,
  );

  protected readonly state = signal<DrillState>('idle');
  protected readonly settings = signal<CountingDrillSettings>({
    mode: 'running-count',
    numberOfCards: 20,
    millisecondsBetweenCards: 1000,
    decksRemaining: 1,
    trueCountSource: 'live-shoe',
    numberOfDecks: DEFAULT_NUMBER_OF_DECKS,
    penetration: DEFAULT_PENETRATION,
  });
  protected readonly cards = signal<readonly Card[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly result = signal<CountingDrillResult | null>(null);

  // Live-shoe state. `shoe` persists across rounds until the cut card; the
  // running count and decks remaining carry over and deplete with it.
  private shoe: Shoe | null = null;
  // Running count accumulated over earlier rounds of the current shoe (reset to
  // 0 on each reshuffle). It is the prior added to the next round's cards.
  protected readonly shoeRunningCount = signal(0);
  // Actual decks remaining at the moment the player estimates (post-deal); the
  // true count is graded against this, and the estimate scored against it.
  protected readonly actualDecksRemaining = signal(0);
  // The player's decks-remaining estimate for the current round, or null before
  // they submit one.
  protected readonly deckEstimate = signal<number | null>(null);
  // Live decks-remaining readout shown in settings.
  protected readonly liveDecksRemaining = signal<number>(DEFAULT_NUMBER_OF_DECKS);
  // True for the round that began with an at-cut-card reshuffle (drives the
  // visible notice).
  protected readonly reshuffleNotice = signal(false);

  protected readonly currentCard = computed<Card | null>(() => {
    const list = this.cards();
    const i = this.currentIndex();
    return i >= 0 && i < list.length ? list[i] : null;
  });

  protected readonly validation = computed(() => this.engine.validateSettings(this.settings()));
  protected readonly validationErrors = computed(() => this.validation().errors);
  protected readonly isValid = computed(() => this.validation().valid);
  protected readonly isDrillActive = computed(
    () =>
      this.state() === 'streaming' || this.state() === 'estimating' || this.state() === 'answering',
  );

  protected readonly activeStats = computed(() =>
    this.settings().mode === 'true-count'
      ? this.trueCountStatsService.stats()
      : this.statsService.stats(),
  );

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
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

  // Reshuffle if needed, then deal one round off the persistent shoe. Records
  // the actual decks remaining (post-deal) for grading and the live readout.
  private dealLiveShoeRound(): readonly Card[] {
    const s = this.settings();
    this.ensureShoeForRound();
    const round = this.shoe!.deal(s.numberOfCards);
    this.actualDecksRemaining.set(this.shoe!.decksRemaining);
    this.updateLiveReadout();
    return round;
  }

  // Build a fresh shoe when there is none, when the cut card has surfaced, or
  // when the current shoe can't serve a full round. A reshuffle resets the
  // carried running count to 0 and raises the visible notice.
  private ensureShoeForRound(): void {
    const s = this.settings();
    const needsFresh =
      !this.shoe || this.shoe.needsReshuffle || this.shoe.cardsRemaining < s.numberOfCards;
    if (needsFresh) {
      const replacing = this.shoe !== null;
      this.shoe = this.shoeService.create(s.numberOfDecks, s.penetration);
      this.shoeRunningCount.set(0);
      this.reshuffleNotice.set(replacing);
    } else {
      this.reshuffleNotice.set(false);
    }
  }

  // Discard the shoe so the next live-shoe round starts a fresh one. Used when a
  // change (decks, penetration, or system) makes the carried count meaningless.
  private invalidateShoe(): void {
    this.shoe = null;
    this.shoeRunningCount.set(0);
    this.reshuffleNotice.set(false);
    this.updateLiveReadout();
  }

  private updateLiveReadout(): void {
    this.liveDecksRemaining.set(
      this.shoe ? this.shoe.decksRemaining : this.settings().numberOfDecks,
    );
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
    if (s.mode === 'true-count') {
      if (this.liveShoeTrueCount()) {
        this.answerLiveShoe(userCount);
      } else {
        const evaluated = this.engine.evaluateTrueCount(
          this.cards(),
          userCount,
          s.decksRemaining,
          this.system(),
        );
        this.result.set(evaluated);
        this.trueCountStatsService.recordAttempt(evaluated.isCorrect);
      }
    } else {
      const evaluated = this.engine.evaluate(this.cards(), userCount, this.system());
      this.result.set(evaluated);
      this.statsService.recordAttempt(evaluated.isCorrect);
    }
    this.state.set('feedback');
  }

  // Grade a live-shoe true-count answer against the shoe's actual decks
  // remaining, folding in the running count carried from earlier rounds. Scores
  // the deck estimate against actual (±0.5 band) as a separate stat, then
  // carries the cumulative running count forward for the next round.
  private answerLiveShoe(userTrueCount: number): void {
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
  }

  // Switch the active counting system. Unbalanced systems (KO) are running-
  // count-only, so if true count was selected we coerce back to running count —
  // the settings UI also hides the true-count option for them. A different
  // system means a different running count, so the live shoe starts fresh.
  protected onSystemChange(id: string): void {
    const next = this.systems.find((s) => s.id === id);
    if (!next) return;
    this.system.set(next);
    this.invalidateShoe();
    if (!next.balanced && this.settings().mode === 'true-count') {
      this.updateSetting('mode', 'running-count');
    }
  }

  protected updateSetting<K extends keyof CountingDrillSettings>(
    key: K,
    value: CountingDrillSettings[K],
  ): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
    // Changing the shoe's composition or penetration invalidates the current
    // shoe and its carried running count.
    if (key === 'numberOfDecks' || key === 'penetration') {
      this.invalidateShoe();
    }
  }

  protected resetActiveStats(): void {
    if (this.settings().mode === 'true-count') {
      this.trueCountStatsService.reset();
    } else {
      this.statsService.reset();
    }
  }

  protected resetTrueCountStats(): void {
    this.trueCountStatsService.reset();
  }

  protected resetDeckEstimationStats(): void {
    this.deckEstimationStatsService.reset();
  }

  private scheduleAdvance(): void {
    this.clearAdvance();
    this.timeoutId = setTimeout(() => {
      const next = this.currentIndex() + 1;
      if (next >= this.cards().length) {
        // Live-shoe true-count drills ask for the decks-remaining estimate first.
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

  // Enter starts a drill from idle or restarts after feedback. The answer
  // form handles its own Enter via its native form submit, so we skip
  // 'answering' here to avoid double-firing.
  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (this.state() === 'idle' && this.isValid()) {
      event.preventDefault();
      this.start();
    } else if (this.state() === 'feedback') {
      event.preventDefault();
      this.start();
    }
  }
}
