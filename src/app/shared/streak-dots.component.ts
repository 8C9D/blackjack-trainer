import { Component, computed, input } from '@angular/core';

import type { StreakDot } from '../core/services/practice-history.service';
import { countOf } from '../core/text';

// Seven-day streak strip: one dot per day (oldest first), filled when that
// day's goal was met; today is outlined in the accent color and fills only
// once its goal lands.
@Component({
  selector: 'app-streak-dots',
  template: `
    <div class="dots" role="img" [attr.aria-label]="historyLabel()">
      @for (dot of dots(); track dot.date) {
        <i
          class="dots__dot"
          [class.dots__dot--met]="dot.met"
          [class.dots__dot--today]="dot.isToday"
        ></i>
      }
    </div>
    <!-- The richer label above includes the same streak phrase; keep the
         visible caption from being announced twice. -->
    <p class="dots__label" aria-hidden="true">{{ streakLabel() }}</p>
  `,
  styleUrl: './streak-dots.component.scss',
})
export class StreakDotsComponent {
  readonly dots = input.required<readonly StreakDot[]>();
  readonly streak = input.required<number>();

  protected readonly streakLabel = computed(() => {
    const n = this.streak();
    if (n === 0) return 'No streak yet';
    return `${n}-day streak`;
  });

  protected readonly historyLabel = computed(() => {
    const days = this.dots()
      .map(
        (dot) =>
          `${dot.date}${dot.isToday ? ' (today)' : ''}: ${countOf(dot.hands, 'hand')}, ${dot.met ? 'goal met' : 'goal not met'}`,
      )
      .join('; ');
    return `${this.streakLabel()}. Last 7 days: ${days}`;
  });
}
