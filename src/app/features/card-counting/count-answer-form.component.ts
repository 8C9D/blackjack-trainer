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

@Component({
  selector: 'app-count-answer-form',
  template: `
    <form class="answer" (submit)="onSubmit($event)">
      <label class="answer__label">
        <span>What is the running count?</span>
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

  readonly answer = output<number>();

  protected readonly raw = signal('');
  protected readonly canSubmit = computed(() => this.engine.isValidIntegerAnswer(this.raw()));

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
