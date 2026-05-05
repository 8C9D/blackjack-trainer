import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-counting-settings',
  template: `
    <fieldset class="settings" [disabled]="disabled()">
      <legend>Drill settings</legend>
      <div class="settings__fields">
        <label class="settings__field">
          <span>Number of cards</span>
          <input
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            [value]="numberOfCards()"
            (input)="onNumberOfCardsInput($event)"
          />
        </label>
        <label class="settings__field">
          <span>Time between cards (ms)</span>
          <input
            type="number"
            min="100"
            step="100"
            inputmode="numeric"
            [value]="millisecondsBetweenCards()"
            (input)="onMsInput($event)"
          />
        </label>
      </div>
      @if (errors().length > 0) {
        <ul class="settings__errors" role="alert">
          @for (err of errors(); track err) {
            <li>{{ err }}</li>
          }
        </ul>
      }
    </fieldset>
  `,
  styleUrl: './counting-settings.component.scss',
})
export class CountingSettingsComponent {
  readonly numberOfCards = input.required<number>();
  readonly millisecondsBetweenCards = input.required<number>();
  readonly errors = input<readonly string[]>([]);
  readonly disabled = input(false);

  readonly numberOfCardsChange = output<number>();
  readonly millisecondsBetweenCardsChange = output<number>();

  protected onNumberOfCardsInput(event: Event): void {
    this.numberOfCardsChange.emit((event.target as HTMLInputElement).valueAsNumber);
  }

  protected onMsInput(event: Event): void {
    this.millisecondsBetweenCardsChange.emit((event.target as HTMLInputElement).valueAsNumber);
  }
}
