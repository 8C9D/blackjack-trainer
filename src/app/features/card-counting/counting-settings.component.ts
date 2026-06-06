import { Component, input, output } from '@angular/core';

import type { DrillMode, TrueCountSource } from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';

@Component({
  selector: 'app-counting-settings',
  template: `
    <fieldset class="settings" [disabled]="disabled()">
      <legend>Drill settings</legend>
      <label class="settings__field settings__field--system">
        <span>Counting system</span>
        <select class="settings__system" [value]="systemId()" (change)="onSystemChange($event)">
          @for (sys of systems(); track sys.id) {
            <option [value]="sys.id" [selected]="sys.id === systemId()">{{ sys.name }}</option>
          }
        </select>
      </label>
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
            [disabled]="!trueCountAvailable()"
            (change)="onModeChange('true-count')"
          />
          <span>True count</span>
        </label>
      </div>
      @if (!trueCountAvailable()) {
        <p class="settings__note">
          True count is only trained for balanced systems. This system is unbalanced, so only
          running count is available.
        </p>
      }
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
        @if (mode() === 'true-count' && trueCountSource() === 'classic') {
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
        @if (mode() === 'true-count' && trueCountSource() === 'live-shoe') {
          <label class="settings__field">
            <span>Number of decks</span>
            <select
              class="settings__decks"
              [value]="numberOfDecks()"
              (change)="onDecksChange($event)"
            >
              @for (d of deckOptions(); track d) {
                <option [value]="d" [selected]="d === numberOfDecks()">{{ d }}</option>
              }
            </select>
          </label>
          <label class="settings__field">
            <span>Penetration</span>
            <select
              class="settings__penetration"
              [value]="penetration()"
              (change)="onPenetrationChange($event)"
            >
              @for (p of penetrationPresets(); track p) {
                <option [value]="p" [selected]="p === penetration()">{{ formatPercent(p) }}</option>
              }
            </select>
          </label>
        }
      </div>
      @if (mode() === 'true-count') {
        <div class="settings__source" role="radiogroup" aria-label="True-count decks source">
          <label class="settings__mode">
            <input
              type="radio"
              name="tc-source"
              value="live-shoe"
              [checked]="trueCountSource() === 'live-shoe'"
              (change)="onSourceChange('live-shoe')"
            />
            <span>Live shoe</span>
          </label>
          <label class="settings__mode">
            <input
              type="radio"
              name="tc-source"
              value="classic"
              [checked]="trueCountSource() === 'classic'"
              (change)="onSourceChange('classic')"
            />
            <span>Classic (preset decks)</span>
          </label>
        </div>
        @if (trueCountSource() === 'live-shoe') {
          <p class="settings__readout">
            Decks remaining (live): <strong>{{ formatDecks(liveDecksRemaining()) }}</strong>
          </p>
        }
      }
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
  readonly systems = input.required<readonly CountingSystem[]>();
  readonly systemId = input.required<string>();
  readonly trueCountAvailable = input(true);
  readonly mode = input.required<DrillMode>();
  readonly numberOfCards = input.required<number>();
  readonly millisecondsBetweenCards = input.required<number>();
  readonly decksRemaining = input.required<number>();
  readonly decksRemainingPresets = input.required<readonly number[]>();
  // Live-shoe true-count configuration.
  readonly trueCountSource = input<TrueCountSource>('live-shoe');
  readonly numberOfDecks = input.required<number>();
  readonly penetration = input.required<number>();
  readonly deckOptions = input.required<readonly number[]>();
  readonly penetrationPresets = input.required<readonly number[]>();
  readonly liveDecksRemaining = input.required<number>();
  readonly errors = input<readonly string[]>([]);
  readonly disabled = input(false);

  readonly systemChange = output<string>();
  readonly modeChange = output<DrillMode>();
  readonly numberOfCardsChange = output<number>();
  readonly millisecondsBetweenCardsChange = output<number>();
  readonly decksRemainingChange = output<number>();
  readonly trueCountSourceChange = output<TrueCountSource>();
  readonly numberOfDecksChange = output<number>();
  readonly penetrationChange = output<number>();

  protected onSystemChange(event: Event): void {
    this.systemChange.emit((event.target as HTMLSelectElement).value);
  }

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

  protected onSourceChange(source: TrueCountSource): void {
    this.trueCountSourceChange.emit(source);
  }

  protected onDecksChange(event: Event): void {
    this.numberOfDecksChange.emit(Number((event.target as HTMLSelectElement).value));
  }

  protected onPenetrationChange(event: Event): void {
    this.penetrationChange.emit(Number((event.target as HTMLSelectElement).value));
  }

  // Half-deck presets render as e.g. "0.5"; whole decks render as e.g. "1".
  protected formatPreset(preset: number): string {
    return Number.isInteger(preset) ? String(preset) : preset.toFixed(1);
  }

  // Penetration fraction (0.75) → "75%".
  protected formatPercent(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
  }

  // Live decks-remaining readout: whole decks as "5", otherwise up to two
  // decimals with trailing zeros trimmed (e.g. 5.6153… → "5.62", 2.5 → "2.5").
  protected formatDecks(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
}
