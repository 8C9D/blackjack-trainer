import { Component, computed, input, output, ChangeDetectionStrategy } from '@angular/core';

import { ACTION_KEY_HINTS } from '../core/keyboard';
import { ACTION_LABELS, type Action } from '../core/models/strategy.model';

// The six actions in their permanent order — never rearranged or hidden, so
// position (and its hotkey) can live in muscle memory.
export const FLOW_ACTION_ORDER: readonly Action[] = ['H', 'S', 'D', 'P', 'SUR', 'INS'];

// Fixed six-action answer grid with grade-in-place feedback. States:
//   - answering: legal actions enabled; illegal ones visibly off and inert.
//   - graded (correct() set): buttons lock; the correct action glows green,
//     a wrong pick turns red where the finger/eyes already are, the rest dim.
// A correct answer passes picked === correct, so the flash lands on the
// button that was just pressed.
@Component({
  selector: 'app-flow-actions',
  template: `
    <div class="acts" role="group" aria-label="Player actions">
      @for (a of order; track a) {
        <button
          type="button"
          class="acts__btn"
          [class.acts__btn--off]="!isLegal(a)"
          [class.acts__btn--picked]="isWrongPick(a)"
          [class.acts__btn--correct]="isCorrect(a)"
          [class.acts__btn--dim]="isDim(a)"
          [disabled]="graded() || !isLegal(a)"
          (click)="action.emit(a)"
        >
          <span class="acts__label">{{ labelFor(a) }}</span>
          @if (isWrongPick(a)) {
            <small class="acts__note">your pick</small>
          } @else if (isCorrect(a) && picked() !== correct()) {
            <small class="acts__note">correct</small>
          } @else {
            <kbd class="kcap">{{ keyFor(a) }}</kbd>
          }
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './flow-actions.component.scss',
})
export class FlowActionsComponent {
  // Actions answerable for the current hand (poka-yoke: the rest are off).
  readonly legal = input.required<readonly Action[]>();
  // The user's answer for the graded hand, null while answering.
  readonly picked = input<Action | null>(null);
  // The engine's correct action for the graded hand, null while answering.
  readonly correct = input<Action | null>(null);
  readonly action = output<Action>();

  protected readonly order = FLOW_ACTION_ORDER;

  protected readonly graded = computed(() => this.correct() !== null);

  protected isLegal(a: Action): boolean {
    return this.legal().includes(a);
  }

  protected isCorrect(a: Action): boolean {
    return this.correct() === a;
  }

  protected isWrongPick(a: Action): boolean {
    return this.picked() === a && this.correct() !== a;
  }

  protected isDim(a: Action): boolean {
    return this.graded() && !this.isCorrect(a) && !this.isWrongPick(a);
  }

  protected labelFor(a: Action): string {
    return ACTION_LABELS[a];
  }

  protected keyFor(a: Action): string {
    return ACTION_KEY_HINTS[a];
  }
}
