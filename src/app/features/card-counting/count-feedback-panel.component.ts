import { Component, computed, input, output, signal } from '@angular/core';

import type {
  CountingDrillResult,
  RunningCountDrillResult,
  TrueCountDrillResult,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { CardImageComponent } from '../../shared/card-image.component';

interface BreakdownEntry {
  readonly index: number;
  readonly card: RunningCountDrillResult['cards'][number];
  readonly deltaLabel: string;
  readonly runningTotal: number;
}

@Component({
  selector: 'app-count-feedback-panel',
  imports: [CardImageComponent],
  template: `
    <section
      class="feedback"
      [class.feedback--correct]="result().isCorrect"
      [class.feedback--incorrect]="!result().isCorrect"
      role="status"
    >
      <p class="feedback__verdict">
        {{ result().isCorrect ? 'Correct!' : 'Incorrect' }}
      </p>

      @if (runningCountResult(); as rc) {
        <dl class="feedback__details">
          <dt>Your count</dt>
          <dd>{{ rc.userRunningCount }}</dd>
          <dt>Correct count</dt>
          <dd>{{ rc.correctRunningCount }}</dd>
        </dl>
      } @else if (trueCountResult(); as tc) {
        <dl class="feedback__details">
          <dt>Your true count</dt>
          <dd>{{ tc.userTrueCount }}</dd>
          <dt>Correct true count</dt>
          <dd>{{ tc.correctTrueCount }}</dd>
          <dt>Running count</dt>
          <dd>{{ tc.correctRunningCount }}</dd>
          <dt>Decks remaining</dt>
          <dd>{{ tc.decksRemaining }}</dd>
        </dl>
        <p class="feedback__formula">
          Running count {{ tc.correctRunningCount }} ÷ {{ tc.decksRemaining }} decks = true count
          {{ tc.correctTrueCount }}
        </p>
      }

      <button
        type="button"
        class="feedback__toggle"
        [attr.aria-expanded]="showBreakdown()"
        (click)="toggleBreakdown()"
      >
        {{ showBreakdown() ? 'Hide' : 'Show' }} card-by-card breakdown
      </button>

      @if (showBreakdown()) {
        <ol class="feedback__breakdown">
          @for (entry of breakdown(); track entry.index) {
            <li class="feedback__cell">
              <app-card-image [card]="entry.card" />
              <span class="feedback__delta">{{ entry.deltaLabel }}</span>
              <span class="feedback__running">→ {{ entry.runningTotal }}</span>
            </li>
          }
        </ol>
      }

      <button type="button" class="feedback__next" (click)="next.emit()">
        Run again <span class="feedback__hint">[Enter]</span>
      </button>
    </section>
  `,
  styleUrl: './count-feedback-panel.component.scss',
})
export class CountFeedbackPanelComponent {
  readonly result = input.required<CountingDrillResult>();
  readonly system = input.required<CountingSystem>();
  readonly next = output<void>();

  protected readonly showBreakdown = signal(false);

  // Mode-narrowed views so the template can read mode-specific fields without
  // repeated type guards in expressions.
  protected readonly runningCountResult = computed<RunningCountDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'running-count' ? r : null;
  });

  protected readonly trueCountResult = computed<TrueCountDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'true-count' ? r : null;
  });

  protected readonly breakdown = computed<readonly BreakdownEntry[]>(() => {
    const sys = this.system();
    let running = 0;
    return this.result().cards.map((card, index) => {
      const delta = sys.values[card.rank];
      running += delta;
      return {
        index,
        card,
        deltaLabel: delta > 0 ? `+${delta}` : String(delta),
        runningTotal: running,
      };
    });
  });

  protected toggleBreakdown(): void {
    this.showBreakdown.update((v) => !v);
  }
}
