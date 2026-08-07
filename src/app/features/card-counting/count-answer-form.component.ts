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
  ChangeDetectionStrategy,
} from '@angular/core';

import { MAX_BET_UNITS, MIN_BET_UNITS } from '../../core/models/bet-ramp.model';
import { asksTrueCount, type DrillMode } from '../../core/models/card-counting.model';
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
          [attr.min]="question() === 'bet' ? minUnits : null"
          [attr.max]="question() === 'bet' ? maxUnits : null"
          [attr.inputmode]="allowFractions() ? 'decimal' : 'numeric'"
          [value]="raw()"
          (input)="onInput($event)"
        />
      </label>
      @if (question() === 'bet') {
        <p class="answer__note">
          In units of your bet spread, not chips — the spread itself is on the Settings screen.
        </p>
      } @else if (allowFractions()) {
        <p class="answer__note">
          This system uses fractional values — enter halves like <code>2.5</code> or
          <code>-0.5</code>.
        </p>
      }
      <button type="submit" class="answer__submit" [disabled]="!canSubmit()">
        Submit <span class="accent-hint">[Enter]</span>
      </button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './count-answer-form.component.scss',
})
export class CountAnswerFormComponent {
  private readonly engine = inject(CountingEngineService);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly mode = input<DrillMode>('running-count');
  // The bet-spread drill asks twice: the count first, then the bet it is for.
  // One form serves both — same input, focus, and Enter-to-submit — with the
  // question and the accepted range switched here.
  readonly question = input<'count' | 'bet'>('count');
  // Fractional systems (e.g. Wong Halves) produce half-point running counts, so
  // the answer input must accept decimals. The page sets this for running-count
  // drills of a fractional system; it stays false otherwise (integer-only).
  readonly allowFractions = input(false);
  readonly answer = output<number>();

  protected readonly minUnits = MIN_BET_UNITS;
  protected readonly maxUnits = MAX_BET_UNITS;

  protected readonly raw = signal('');
  protected readonly canSubmit = computed(() => {
    const raw = this.raw();
    if (this.question() === 'bet') {
      return this.engine.isValidIntegerAnswer(raw) && this.inUnitRange(Number(raw.trim()));
    }
    return this.allowFractions()
      ? this.engine.isValidDecimalAnswer(raw)
      : this.engine.isValidIntegerAnswer(raw);
  });
  protected readonly promptLabel = computed(() => {
    if (this.question() === 'bet') return 'How many units do you bet?';
    return asksTrueCount(this.mode()) ? 'What is the true count?' : 'What is the running count?';
  });

  constructor() {
    afterNextRender(() => {
      this.inputRef().nativeElement.focus();
    });
  }

  private inUnitRange(units: number): boolean {
    return units >= MIN_BET_UNITS && units <= MAX_BET_UNITS;
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
