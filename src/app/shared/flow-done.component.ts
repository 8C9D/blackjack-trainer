import {
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';

import { shouldIgnoreKeyboardEvent } from '../core/keyboard';
import type { WeakSpot } from '../core/services/miss-tally.service';
import { GoalRingComponent } from './goal-ring.component';

// How many cleared scenarios are named before the line collapses to a count.
const CLEARED_SHOWN = 3;

// Session-end screen (peak-end rule): the completed ring and the session's
// best numbers, the queued weakness as something you can act on now, the
// week's cleared scenarios, a primary "One more round", and an
// always-first-class "Done for today". Never a confirmation dialog, never
// guilt copy.
@Component({
  selector: 'app-flow-done',
  imports: [GoalRingComponent],
  template: `
    <section #root class="done" tabindex="-1" aria-label="Session complete">
      <app-goal-ring [value]="hands()" [goal]="target()" [label]="ringLabel()" />
      <p class="done__peak">
        Best streak: <b>{{ bestStreak() }}</b>
        @if (accuracy() !== null) {
          · {{ accuracy() }}% today
        }
      </p>
      @if (weakSpot(); as w) {
        <button type="button" class="done__next" (click)="review.emit()">
          Drill my misses: <b>{{ w.label }}</b>
          <small> missed {{ w.misses }} of {{ w.attempts }} this week{{ othersLabel() }} </small>
          <kbd class="kcap">R</kbd>
        </button>
      }
      @if (clearedLabel(); as cleared) {
        <p class="done__cleared">
          Cleared: <b>{{ cleared }}</b>
        </p>
      }
      <button type="button" class="done__again" (click)="again.emit()">
        One more round <kbd class="kcap kcap--on-accent">⏎</kbd>
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
  // Every outstanding weak spot, worst first — `weakSpot` is its head. Only
  // the count is shown; the list is what a review round would draw from.
  readonly weakSpots = input<readonly WeakSpot[]>([]);
  // Scenarios missed this week and since cleared.
  readonly cleared = input<readonly WeakSpot[]>([]);
  readonly again = output<void>();
  readonly review = output<void>();
  readonly exit = output<void>();

  protected readonly ringLabel = computed(() => (this.goalMet() ? 'goal met' : 'hands today'));

  protected readonly othersLabel = computed(() => {
    const others = Math.max(0, this.weakSpots().length - 1);
    if (others === 0) return '';
    return ` · +${others} more`;
  });

  // "16 vs 10 · A,7 vs 9 · +2 more", or '' when nothing was cleared.
  protected readonly clearedLabel = computed(() => {
    const cleared = this.cleared();
    if (cleared.length === 0) return '';
    const shown = cleared.slice(0, CLEARED_SHOWN).map((spot) => spot.label);
    const rest = cleared.length - shown.length;
    return rest > 0 ? `${shown.join(' · ')} · +${rest} more` : shown.join(' · ');
  });

  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  constructor() {
    // This screen replaces the whole drill, so whatever had focus (an action
    // button) is gone by the time it renders. Take focus onto the section so
    // the session summary is announced and Tab resumes from here — not on the
    // primary button, whose Enter would then collide with the shortcut below.
    afterNextRender(() => this.root().nativeElement.focus());
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.again.emit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.exit.emit();
    } else if (event.key.toLowerCase() === 'r' && this.weakSpot() !== null) {
      event.preventDefault();
      this.review.emit();
    }
  }
}
