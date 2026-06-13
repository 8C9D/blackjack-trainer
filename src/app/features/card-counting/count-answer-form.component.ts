import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { DrillMode } from '../../core/models/card-counting.model';
import { CountingEngineService } from '../../core/services/counting-engine.service';

@Component({
  selector: 'app-count-answer-form',
  template: `
    <form class="answer" (submit)="onSubmit($event)">
      <label class="answer__label">
        <span>{{ promptLabel() }}</span>
        <input
          #input
          type="number"
          [attr.step]="allowFractions() ? '0.5' : '1'"
          [attr.inputmode]="allowFractions() ? 'decimal' : 'numeric'"
          [value]="raw()"
          (input)="onInput($event)"
        />
      </label>
      @if (allowFractions()) {
        <p class="answer__note">
          This system uses fractional values — enter halves like <code>2.5</code> or
          <code>-0.5</code>.
        </p>
      }
      <button type="submit" class="answer__submit" [disabled]="!canSubmit()">
        Submit <span class="answer__hint">[Enter]</span>
      </button>
    </form>
  `,
  styleUrl: './count-answer-form.component.scss',
})
export class CountAnswerFormComponent {
  private readonly engine = inject(CountingEngineService);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly mode = input<DrillMode>('running-count');
  // Fractional systems (e.g. Wong Halves) produce half-point running counts, so
  // the answer input must accept decimals. The page sets this for running-count
  // drills of a fractional system; it stays false otherwise (integer-only).
  readonly allowFractions = input(false);
  readonly answer = output<number>();

  protected readonly raw = signal('');
  protected readonly canSubmit = computed(() =>
    this.allowFractions()
      ? this.engine.isValidDecimalAnswer(this.raw())
      : this.engine.isValidIntegerAnswer(this.raw()),
  );
  protected readonly promptLabel = computed(() =>
    this.mode() === 'true-count' ? 'What is the true count?' : 'What is the running count?',
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
    // Number() (not parseInt) so fractional answers like 2.5 keep their decimal
    // part; canSubmit has already validated the format.
    this.answer.emit(Number(this.raw().trim()));
  }
}
