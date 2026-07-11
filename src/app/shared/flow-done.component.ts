import { Component, HostListener, computed, input, output } from '@angular/core';

import { shouldIgnoreKeyboardEvent } from '../core/keyboard';
import type { WeakSpot } from '../core/services/miss-tally.service';
import { GoalRingComponent } from './goal-ring.component';

// Session-end screen (peak-end rule): the completed ring and the session's
// best numbers, one queued weakness for next time, a primary "One more
// round", and an always-first-class "Done for today". Never a confirmation
// dialog, never guilt copy.
@Component({
  selector: 'app-flow-done',
  imports: [GoalRingComponent],
  template: `
    <section class="done" aria-label="Session complete">
      <app-goal-ring [value]="hands()" [goal]="target()" [label]="ringLabel()" />
      <p class="done__peak">
        Best streak: <b>{{ bestStreak() }}</b>
        @if (accuracy() !== null) {
          · {{ accuracy() }}% today
        }
      </p>
      @if (weakSpot(); as w) {
        <p class="done__next">
          Drill next: <b>{{ w.label }}</b>
          <small>missed {{ w.misses }} of {{ w.attempts }} this week</small>
        </p>
      }
      <button type="button" class="done__again" (click)="again.emit()">
        One more round <kbd class="kcap">⏎</kbd>
      </button>
      <button type="button" class="done__exit" (click)="exit.emit()">
        <kbd class="kcap">esc</kbd> Done for today
      </button>
    </section>
  `,
  styleUrl: './flow-done.component.scss',
})
export class FlowDoneComponent {
  readonly hands = input.required<number>();
  readonly target = input.required<number>();
  readonly goalMet = input<boolean>(true);
  // Best correct-streak of the session just finished.
  readonly bestStreak = input.required<number>();
  // Session accuracy percentage (0–100), or null when nothing was answered.
  readonly accuracy = input.required<number | null>();
  readonly weakSpot = input<WeakSpot | null>(null);
  readonly again = output<void>();
  readonly exit = output<void>();

  protected readonly ringLabel = computed(() => (this.goalMet() ? 'goal met' : 'hands today'));

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.again.emit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.exit.emit();
    }
  }
}
