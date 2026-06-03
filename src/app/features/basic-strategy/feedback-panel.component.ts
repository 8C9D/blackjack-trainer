import { Component, input, output } from '@angular/core';

import { FeedbackShellComponent } from '../../shared/feedback-shell.component';
import { ACTION_LABELS, type EvaluationResult } from '../../core/models/strategy.model';

@Component({
  selector: 'app-feedback-panel',
  imports: [FeedbackShellComponent],
  template: `
    @if (result(); as r) {
      <app-feedback-shell [correct]="r.correct" (next)="next.emit()">
        <dl class="feedback__details">
          <dt>Hand</dt>
          <dd>{{ r.handDescription }}</dd>
          <dt>Correct action</dt>
          <dd>{{ labelFor(r) }}</dd>
          <dt>Why</dt>
          <dd>{{ r.reason }}</dd>
        </dl>
      </app-feedback-shell>
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
