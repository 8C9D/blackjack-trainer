import { Component, input, output } from '@angular/core';

import { ACTION_KEY_HINTS } from '../../core/keyboard';
import {
  ACTION_LABELS,
  type Action,
} from '../../core/models/strategy.model';

@Component({
  selector: 'app-action-buttons',
  template: `
    <section class="actions" aria-label="Player actions">
      @for (a of order; track a) {
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
  readonly action = output<Action>();

  protected readonly order: readonly Action[] = ['H', 'S', 'D', 'P', 'SUR', 'INS'];

  protected labelFor(a: Action): string {
    return ACTION_LABELS[a];
  }

  protected keyHintFor(a: Action): string {
    return ACTION_KEY_HINTS[a];
  }
}
