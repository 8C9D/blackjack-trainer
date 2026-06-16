import { Component, input, output } from '@angular/core';

import { ACTION_KEY_HINTS } from '../core/keyboard';
import { ACTION_LABELS, type Action } from '../core/models/strategy.model';

@Component({
  selector: 'app-action-buttons',
  template: `
    <section class="actions" aria-label="Player actions">
      @for (a of actions(); track a) {
        <button
          type="button"
          class="actions__button"
          [disabled]="disabled()"
          (click)="action.emit(a)"
        >
          {{ labelFor(a) }}
          <span class="actions__hint">[{{ keyHintFor(a) }}]</span>
        </button>
      }
    </section>
  `,
  styleUrl: './action-buttons.component.scss',
})
export class ActionButtonsComponent {
  readonly disabled = input(false);
  // Which actions to render, in order. Defaults to the full set; the showdown
  // trainer passes a hit/stand-only subset.
  readonly actions = input<readonly Action[]>(['H', 'S', 'D', 'P', 'SUR', 'INS']);
  readonly action = output<Action>();

  protected labelFor(a: Action): string {
    return ACTION_LABELS[a];
  }

  protected keyHintFor(a: Action): string {
    return ACTION_KEY_HINTS[a];
  }
}
