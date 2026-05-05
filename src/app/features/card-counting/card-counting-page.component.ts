import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';

import type { Card } from '../../core/models/card.model';
import type {
  CountingDrillResult,
  CountingDrillSettings,
} from '../../core/models/card-counting.model';
import { HI_LO } from '../../data/counting-systems';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { CountingEngineService } from '../../core/services/counting-engine.service';
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
        <h1>Hi-Lo Card Counting Trainer</h1>
        <p class="page__subtitle">{{ system.description }}</p>
      </header>

      <app-counting-settings
        [numberOfCards]="settings().numberOfCards"
        [millisecondsBetweenCards]="settings().millisecondsBetweenCards"
        [errors]="validationErrors()"
        [disabled]="isDrillActive()"
        (numberOfCardsChange)="updateNumberOfCards($event)"
        (millisecondsBetweenCardsChange)="updateMs($event)"
      />

      @if (state() === 'idle') {
        <div class="page__start">
          <button
            type="button"
            class="page__start-button"
            [disabled]="!isValid()"
            (click)="start()"
          >Start drill <span class="page__hint">[Enter]</span></button>
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
        <app-count-answer-form (answer)="onAnswer($event)" />
      }

      @if (state() === 'feedback' && result(); as r) {
        <app-count-feedback-panel
          [result]="r"
          [system]="system"
          (next)="start()"
        />
      }

      <app-stats-panel
        [stats]="statsService.stats()"
        (reset)="statsService.reset()"
      />
    </div>
  `,
  styleUrl: './card-counting-page.component.scss',
})
export class CardCountingPageComponent {
  private readonly cardGenerator = inject(CardGeneratorService);
  private readonly engine = inject(CountingEngineService);
  protected readonly statsService = inject(CardCountingStatsService);

  protected readonly system = HI_LO;

  protected readonly state = signal<DrillState>('idle');
  protected readonly settings = signal<CountingDrillSettings>({
    numberOfCards: 20,
    millisecondsBetweenCards: 1000,
  });
  protected readonly cards = signal<readonly Card[]>([]);
  protected readonly currentIndex = signal(0);
  protected readonly result = signal<CountingDrillResult | null>(null);

  protected readonly currentCard = computed<Card | null>(() => {
    const list = this.cards();
    const i = this.currentIndex();
    return i >= 0 && i < list.length ? list[i] : null;
  });

  protected readonly validation = computed(() =>
    this.engine.validateSettings(this.settings()),
  );
  protected readonly validationErrors = computed(() => this.validation().errors);
  protected readonly isValid = computed(() => this.validation().valid);
  protected readonly isDrillActive = computed(
    () => this.state() === 'streaming' || this.state() === 'answering',
  );

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Cancel any pending advance if the page unmounts mid-drill.
    inject(DestroyRef).onDestroy(() => this.clearAdvance());
  }

  protected start(): void {
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
    const evaluated = this.engine.evaluate(this.cards(), userCount, this.system);
    this.result.set(evaluated);
    this.state.set('feedback');
    this.statsService.recordAttempt(evaluated.isCorrect);
  }

  protected updateNumberOfCards(n: number): void {
    this.settings.update((s) => ({ ...s, numberOfCards: n }));
  }

  protected updateMs(n: number): void {
    this.settings.update((s) => ({ ...s, millisecondsBetweenCards: n }));
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
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (this.state() === 'idle' && this.isValid()) {
      event.preventDefault();
      this.start();
    } else if (this.state() === 'feedback') {
      event.preventDefault();
      this.start();
    }
  }
}
