import { Component, input, output } from '@angular/core';

import {
  ACTION_LABELS,
  type EvaluationResult,
} from '../../core/models/strategy.model';

@Component({
  selector: 'app-feedback-panel',
  template: `
    @if (result(); as r) {
      <section
        class="feedback"
        [class.feedback--correct]="r.correct"
        [class.feedback--incorrect]="!r.correct"
        aria-live="polite"
      >
        <p class="feedback__verdict">
          {{ r.correct ? 'Correct.' : 'Incorrect.' }}
        </p>
        <dl class="feedback__details">
          <dt>Hand</dt>
          <dd>{{ r.handDescription }}</dd>
          <dt>Correct action</dt>
          <dd>{{ labelFor(r) }}</dd>
          <dt>Why</dt>
          <dd>{{ r.reason }}</dd>
        </dl>
        <button type="button" class="feedback__next" (click)="next.emit()">
          Deal next hand [Enter]
        </button>
      </section>
    }
  `,
  styleUrl: './feedback-panel.component.scss',
})
export class FeedbackPanelComponent {
  readonly result = input<EvaluationResult | null>(null);
  readonly next = output<void>();

  protected labelFor(r: EvaluationResult): string {
    return ACTION_LABELS[r.action];
  }
}
