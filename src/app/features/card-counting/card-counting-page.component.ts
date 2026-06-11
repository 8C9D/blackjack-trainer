import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import type { Card } from '../../core/models/card.model';
import {
  DECKS_REMAINING_PRESETS,
  type CountingDrillResult,
  type CountingDrillSettings,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { COUNTING_SYSTEMS, HI_LO } from '../../data/counting-systems';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { TrueCountStatsService } from '../../core/services/true-count-stats.service';
import { StatsPanelComponent } from '../../shared/stats-panel.component';
import { CardStreamComponent } from './card-stream.component';
import { CountAnswerFormComponent } from './count-answer-form.component';
import { CountFeedbackPanelComponent } from './count-feedback-panel.component';
import { CountingSettingsComponent } from './counting-settings.component';

type DrillState = 'idle' | 'streaming' | 'answering' | 'feedback';

@Component({
  selector: 'app-card-counting-page',
  imports: [
    CountingSettingsComponent,
    CardStreamComponent,
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
        [errors]="validationErrors()"
        [disabled]="isDrillActive()"
        (systemChange)="onSystemChange($event)"
        (modeChange)="updateSetting('mode', $event)"
        (numberOfCardsChange)="updateSetting('numberOfCards', $event)"
        (millisecondsBetweenCardsChange)="updateSetting('millisecondsBetweenCards', $event)"
        (decksRemainingChange)="updateSetting('decksRemaining', $event)"
      />

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

      @if (state() === 'answering') {
        <app-count-answer-form [mode]="settings().mode" (answer)="onAnswer($event)" />
      }

      @if (state() === 'feedback' && result(); as r) {
        <app-count-feedback-panel [result]="r" [system]="system()" (next)="start()" />
      }

      <app-stats-panel [stats]="activeStats()" (reset)="resetActiveStats()" />
    </div>
  `,
  styleUrl: './card-counting-page.component.scss',
})
export class CardCountingPageComponent {
  private readonly cardGenerator = inject(CardGeneratorService);
  private readonly engine = inject(CountingEngineService);
  // statsService is the running-count store; trueCountStatsService is the
  // true-count store. They're persisted under separate keys and only the
  // active mode's stats are visible at a time.
  protected readonly statsService = inject(CardCountingStatsService);
  protected readonly trueCountStatsService = inject(TrueCountStatsService);

  protected readonly systems = COUNTING_SYSTEMS;
  protected readonly system = signal<CountingSystem>(HI_LO);
  protected readonly decksRemainingPresets = DECKS_REMAINING_PRESETS;

  // True-count training is only meaningful for balanced systems, where the
  // Hi-Lo-style running ÷ decks conversion holds. Unbalanced systems (KO) are
  // running-count-only; the selector hides true count for them.
  protected readonly trueCountAvailable = computed(() => this.system().balanced);

  protected readonly state = signal<DrillState>('idle');
  protected readonly settings = signal<CountingDrillSettings>({
    mode: 'running-count',
    numberOfCards: 20,
    millisecondsBetweenCards: 1000,
    decksRemaining: 1,
  });
  protected readonly cards = signal<readonly Card[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly result = signal<CountingDrillResult | null>(null);

  protected readonly currentCard = computed<Card | null>(() => {
    const list = this.cards();
    const i = this.currentIndex();
    return i >= 0 && i < list.length ? list[i] : null;
  });

  protected readonly validation = computed(() => this.engine.validateSettings(this.settings()));
  protected readonly validationErrors = computed(() => this.validation().errors);
  protected readonly isValid = computed(() => this.validation().valid);
  protected readonly isDrillActive = computed(
    () => this.state() === 'streaming' || this.state() === 'answering',
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
    const seq = this.cardGenerator.generateSequence(this.settings().numberOfCards);
    this.cards.set(seq);
    this.currentIndex.set(0);
    this.result.set(null);
    this.state.set('streaming');
    this.scheduleAdvance();
  }

  protected onAnswer(userCount: number): void {
    if (this.state() !== 'answering') return;
    const s = this.settings();
    if (s.mode === 'true-count') {
      const evaluated = this.engine.evaluateTrueCount(
        this.cards(),
        userCount,
        s.decksRemaining,
        this.system(),
      );
      this.result.set(evaluated);
      this.trueCountStatsService.recordAttempt(evaluated.isCorrect);
    } else {
      const evaluated = this.engine.evaluate(this.cards(), userCount, this.system());
      this.result.set(evaluated);
      this.statsService.recordAttempt(evaluated.isCorrect);
    }
    this.state.set('feedback');
  }

  // Switch the active counting system. Unbalanced systems (KO) are running-
  // count-only, so if true count was selected we coerce back to running count —
  // the settings UI also hides the true-count option for them.
  protected onSystemChange(id: string): void {
    const next = this.systems.find((s) => s.id === id);
    if (!next) return;
    this.system.set(next);
    if (!next.balanced && this.settings().mode === 'true-count') {
      this.updateSetting('mode', 'running-count');
    }
  }

  protected updateSetting<K extends keyof CountingDrillSettings>(
    key: K,
    value: CountingDrillSettings[K],
  ): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
  }

  protected resetActiveStats(): void {
    if (this.settings().mode === 'true-count') {
      this.trueCountStatsService.reset();
    } else {
      this.statsService.reset();
    }
  }

  private scheduleAdvance(): void {
    this.clearAdvance();
    this.timeoutId = setTimeout(() => {
      const next = this.currentIndex() + 1;
      if (next >= this.cards().length) {
        this.state.set('answering');
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
