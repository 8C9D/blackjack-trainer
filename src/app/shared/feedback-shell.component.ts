import { Component, input, output } from '@angular/core';

// Shared verdict-card shell used by both the Basic Strategy and Deviations
// feedback panels. Trainer-specific details (the <dl> body, optional
// candidate banner, etc.) come in via content projection so the shell only
// owns the chrome: outer card, correct/incorrect colouring, verdict text,
// and the "Deal next hand" button.
@Component({
  selector: 'app-feedback-shell',
  template: `
    <section
      class="feedback"
      [class.feedback--correct]="correct()"
      [class.feedback--incorrect]="!correct()"
      aria-live="polite"
    >
      <p class="feedback__verdict">
        {{ correct() ? 'Correct.' : 'Incorrect.' }}
      </p>
      <ng-content />
      <button
        type="button"
        class="feedback__next"
        [disabled]="nextDisabled()"
        (click)="next.emit()"
      >
        Deal next hand [Enter]
      </button>
    </section>
  `,
  styleUrl: './feedback-shell.component.scss',
})
export class FeedbackShellComponent {
  readonly correct = input.required<boolean>();
  readonly nextDisabled = input<boolean>(false);
  readonly next = output<void>();
}
