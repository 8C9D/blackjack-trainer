import { Component, computed, input, output } from '@angular/core';

import type { SessionStats } from '../core/services/stats-store';

@Component({
  selector: 'app-stats-panel',
  template: `
    <section class="stats" aria-label="Session statistics">
      <div class="stats__cells">
        <div><strong>Attempts</strong>: {{ stats().attempts }}</div>
        <div><strong>Correct</strong>: {{ stats().correct }}</div>
        <div><strong>Accuracy</strong>: {{ accuracyDisplay() }}</div>
        <div><strong>Streak</strong>: {{ stats().streak }}</div>
        <div><strong>Longest streak</strong>: {{ stats().longestStreak }}</div>
      </div>
      <button
        type="button"
        class="stats__reset"
        [disabled]="stats().attempts === 0"
        (click)="reset.emit()"
      >
        Reset stats
      </button>
    </section>
  `,
  styleUrl: './stats-panel.component.scss',
})
export class StatsPanelComponent {
  readonly stats = input.required<SessionStats>();
  readonly reset = output<void>();

  protected readonly accuracyDisplay = computed(() => {
    const s = this.stats();
    if (s.attempts === 0) return '—';
    return `${Math.round((s.correct / s.attempts) * 100)}%`;
  });
}
