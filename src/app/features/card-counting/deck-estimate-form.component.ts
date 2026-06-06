import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { CountingEngineService } from '../../core/services/counting-engine.service';

// Prompts the player for the decks remaining after the card stream, before they
// give the true count (live-shoe true-count mode). Half-deck stepper; estimates
// within ±0.5 of the actual decks remaining count as good (scored on the page).
@Component({
  selector: 'app-deck-estimate-form',
  template: `
    <form class="estimate" (submit)="onSubmit($event)">
      <label class="estimate__label">
        <span>How many decks remain?</span>
        <input
          #input
          type="number"
          min="0"
          step="0.5"
          inputmode="decimal"
          [value]="raw()"
          (input)="onInput($event)"
        />
      </label>
      <p class="estimate__note">
        Estimate to the nearest half-deck — within <code>±0.5</code> counts as good.
      </p>
      <button type="submit" class="estimate__submit" [disabled]="!canSubmit()">
        Submit estimate <span class="estimate__hint">[Enter]</span>
      </button>
    </form>
  `,
  styleUrl: './deck-estimate-form.component.scss',
})
export class DeckEstimateFormComponent {
  private readonly engine = inject(CountingEngineService);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly estimate = output<number>();

  protected readonly raw = signal('');
  // A valid decimal greater than zero — decks remaining is always positive.
  protected readonly canSubmit = computed(
    () => this.engine.isValidDecimalAnswer(this.raw()) && Number(this.raw().trim()) > 0,
  );

  constructor() {
    afterNextRender(() => {
      this.inputRef().nativeElement.focus();
    });
  }

  protected onInput(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) return;
    this.estimate.emit(Number(this.raw().trim()));
  }
}
