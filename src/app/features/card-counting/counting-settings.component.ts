import { Component, input, output } from '@angular/core';

import type { DrillMode } from '../../core/models/card-counting.model';

@Component({
  selector: 'app-counting-settings',
  template: `
    <fieldset class="settings" [disabled]="disabled()">
      <legend>Drill settings</legend>
      <div class="settings__modes" role="radiogroup" aria-label="Drill mode">
        <label class="settings__mode">
          <input
            type="radio"
            name="drill-mode"
            value="running-count"
            [checked]="mode() === 'running-count'"
            (change)="onModeChange('running-count')"
          />
          <span>Running count</span>
        </label>
        <label class="settings__mode">
          <input
            type="radio"
            name="drill-mode"
            value="true-count"
            [checked]="mode() === 'true-count'"
            (change)="onModeChange('true-count')"
          />
          <span>True count</span>
        </label>
      </div>
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
        @if (mode() === 'true-count') {
          <label class="settings__field">
            <span>Decks remaining</span>
            <select
              class="settings__decks-remaining"
              [value]="decksRemaining()"
              (change)="onDecksRemainingChange($event)"
            >
              @for (preset of decksRemainingPresets(); track preset) {
                <option [value]="preset" [selected]="preset === decksRemaining()">
                  {{ formatPreset(preset) }}
                </option>
              }
            </select>
          </label>
        }
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
  readonly mode = input.required<DrillMode>();
  readonly numberOfCards = input.required<number>();
  readonly millisecondsBetweenCards = input.required<number>();
  readonly decksRemaining = input.required<number>();
  readonly decksRemainingPresets = input.required<readonly number[]>();
  readonly errors = input<readonly string[]>([]);
  readonly disabled = input(false);

  readonly modeChange = output<DrillMode>();
  readonly numberOfCardsChange = output<number>();
  readonly millisecondsBetweenCardsChange = output<number>();
  readonly decksRemainingChange = output<number>();

  protected onModeChange(mode: DrillMode): void {
    this.modeChange.emit(mode);
  }

  protected onNumberOfCardsInput(event: Event): void {
    this.numberOfCardsChange.emit((event.target as HTMLInputElement).valueAsNumber);
  }

  protected onMsInput(event: Event): void {
    this.millisecondsBetweenCardsChange.emit((event.target as HTMLInputElement).valueAsNumber);
  }

  protected onDecksRemainingChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    this.decksRemainingChange.emit(Number(raw));
  }

  // Half-deck presets render as e.g. "0.5"; whole decks render as e.g. "1".
  protected formatPreset(preset: number): string {
    return Number.isInteger(preset) ? String(preset) : preset.toFixed(1);
  }
}
