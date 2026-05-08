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
          step="1"
          inputmode="numeric"
          [value]="raw()"
          (input)="onInput($event)"
        />
      </label>
      <button
        type="submit"
        class="answer__submit"
        [disabled]="!canSubmit()"
      >Submit <span class="answer__hint">[Enter]</span></button>
    </form>
  `,
  styleUrl: './count-answer-form.component.scss',
})
export class CountAnswerFormComponent {
  private readonly engine = inject(CountingEngineService);
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');

  readonly mode = input<DrillMode>('running-count');
  readonly answer = output<number>();

  protected readonly raw = signal('');
  protected readonly canSubmit = computed(() => this.engine.isValidIntegerAnswer(this.raw()));
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
    this.answer.emit(parseInt(this.raw().trim(), 10));
  }
}
