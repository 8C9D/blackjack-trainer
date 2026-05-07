import { Component, computed, input, output, signal } from '@angular/core';

import type { RunningCountDrillResult } from '../../core/models/card-counting.model';
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
      <dl class="feedback__details">
        <dt>Your count</dt>
        <dd>{{ result().userRunningCount }}</dd>
        <dt>Correct count</dt>
        <dd>{{ result().correctRunningCount }}</dd>
      </dl>

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

      <button
        type="button"
        class="feedback__next"
        (click)="next.emit()"
      >Run again <span class="feedback__hint">[Enter]</span></button>
    </section>
  `,
  styleUrl: './count-feedback-panel.component.scss',
})
export class CountFeedbackPanelComponent {
  readonly result = input.required<RunningCountDrillResult>();
  readonly system = input.required<CountingSystem>();
  readonly next = output<void>();

  protected readonly showBreakdown = signal(false);

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
