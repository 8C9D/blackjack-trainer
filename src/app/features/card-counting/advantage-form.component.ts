import {
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  output,
  viewChild,
} from '@angular/core';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';

// The key-count drill's second question, after the running count: does the
// player have the advantage? Correct is yes exactly when the running count has
// reached the system's key count for this shoe — the threshold itself is not
// shown, because recalling it is the skill being drilled.
@Component({
  selector: 'app-advantage-form',
  template: `
    <div class="advantage" role="group" aria-label="Advantage call">
      <p class="advantage__question">Do you have the advantage?</p>
      <div class="advantage__actions">
        <button #yes type="button" class="advantage__button" (click)="answer.emit(true)">
          Yes <kbd class="kcap kcap--on-accent">Y</kbd>
        </button>
        <button type="button" class="advantage__button" (click)="answer.emit(false)">
          No <kbd class="kcap kcap--on-accent">N</kbd>
        </button>
      </div>
      <p class="advantage__note">Yes when the running count has reached this shoe's key count.</p>
    </div>
  `,
  styleUrl: './advantage-form.component.scss',
})
export class AdvantageFormComponent {
  private readonly yesRef = viewChild.required<ElementRef<HTMLButtonElement>>('yes');

  readonly answer = output<boolean>();

  constructor() {
    afterNextRender(() => {
      this.yesRef().nativeElement.focus();
    });
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    const key = event.key.toLowerCase();
    if (key !== 'y' && key !== 'n') return;
    event.preventDefault();
    this.answer.emit(key === 'y');
  }
}
