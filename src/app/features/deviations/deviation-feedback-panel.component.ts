import { Component, input, output } from '@angular/core';

import { FeedbackShellComponent } from '../../shared/feedback-shell.component';
import type { DeviationRule, DeviationTrainerResult } from '../../core/models/deviation.model';
import { ACTION_LABELS, type Action } from '../../core/models/strategy.model';
import { formatTrueCount } from '../../core/services/deviation-evaluator.service';

@Component({
  selector: 'app-deviation-feedback-panel',
  imports: [FeedbackShellComponent],
  template: `
    @if (result(); as r) {
      <app-feedback-shell
        [correct]="r.correct"
        [nextDisabled]="nextDisabled()"
        (next)="next.emit()"
      >
        @if (r.isDeviationCandidate) {
          <p class="feedback__candidate">Deviation candidate hand.</p>
        }
        <dl class="feedback__details">
          <dt>Hand</dt>
          <dd>{{ r.handDescription }}</dd>
          <dt>True count</dt>
          <dd>{{ formatTrueCount(r.trueCount) }}</dd>
          <dt>Your action</dt>
          <dd>{{ labelFor(r.userAction) }}</dd>
          <dt>Correct action</dt>
          <dd>{{ labelFor(r.expectedAction) }}</dd>
          <dt>Basic strategy</dt>
          <dd>{{ labelFor(r.basicAction) }}</dd>
          <dt>Deviation applied</dt>
          <dd>{{ r.deviationApplied ? 'Yes' : 'No' }}</dd>
          @if (r.matchedRule; as rule) {
            <dt>Matched rule</dt>
            <dd>
              {{ rule.playerHandLabel }} vs {{ rule.dealerUpcard }} —
              {{ labelFor(rule.deviationAction) }} when
              {{ formatThreshold(rule) }}
            </dd>
          }
          <dt>Why</dt>
          <dd>{{ r.explanation }}</dd>
        </dl>
      </app-feedback-shell>
    }
  `,
  styleUrl: './deviation-feedback-panel.component.scss',
})
export class DeviationFeedbackPanelComponent {
  readonly result = input<DeviationTrainerResult | null>(null);
  readonly nextDisabled = input<boolean>(false);
  readonly next = output<void>();

  protected labelFor(action: Action): string {
    return ACTION_LABELS[action];
  }

  // Exposed as a field (not a method) so the template can bind the shared
  // formatter imported above instead of re-implementing it locally.
  protected readonly formatTrueCount = formatTrueCount;

  protected formatThreshold(rule: DeviationRule): string {
    switch (rule.direction) {
      case 'at-or-above':
        return `TC ≥ ${this.formatTrueCount(rule.index)}`;
      case 'at-or-below':
        return `TC ≤ ${this.formatTrueCount(rule.index)}`;
      case 'positive':
        return 'TC > 0';
      case 'negative':
        return 'TC < 0';
    }
  }
}
