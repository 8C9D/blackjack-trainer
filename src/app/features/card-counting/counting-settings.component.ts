import { Component, computed, input, output } from '@angular/core';

import {
  BET_RAMP_BAND_LABELS,
  DEFAULT_BET_RAMP,
  MAX_BET_UNITS,
  MIN_BET_UNITS,
  rampShrinks,
  type BetRamp,
} from '../../core/models/bet-ramp.model';
import {
  DRILL_MODES,
  DRILL_MODE_LABELS,
  usesLiveShoe,
  type DrillMode,
  type TrueCountSource,
} from '../../core/models/card-counting.model';
import { metricsParts, type CountingSystem } from '../../core/models/counting-system.model';
import { SHOWDOWN_SPOT_OPTIONS, clampSpots } from '../../core/models/showdown.model';

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
      <!-- Which system to count is the most consequential setting here, and the
           tags alone say nothing about what each one is for. These three do. -->
      <p class="settings__metrics">
        @for (part of metrics(); track part.label) {
          <span class="settings__metric">{{ part.label }} {{ part.value }}</span>
        }
      </p>
      <p class="settings__metrics-note">
        What this system's tags are good at: sizing the bet, indexing a playing decision, and
        calling insurance — the three things drilled here. Published figures for the tags alone, not
        a verdict on the system: a count you keep accurately beats a stronger one you do not.
      </p>
      <div class="settings__modes" role="radiogroup" aria-label="Drill mode">
        @for (option of modeOptions; track option.mode) {
          <label class="settings__mode">
            <input
              type="radio"
              name="drill-mode"
              [value]="option.mode"
              [checked]="mode() === option.mode"
              [disabled]="!modeAvailable(option.mode)"
              (change)="onModeChange(option.mode)"
            />
            <span>{{ option.label }}</span>
          </label>
        }
      </div>
      @if (mode() === 'deck-speed') {
        <p class="settings__note">
          A shuffled deck with one card burned: you flip the other 51 at your own pace, against a
          stopwatch, then give the count. The length and pacing settings do not apply — the deck is
          the deck, and the speed is what is being measured.
        </p>
      }
      @if (!trueCountAvailable()) {
        @if (keyCountAvailable()) {
          <p class="settings__note">
            This system is unbalanced, so there is no true count. Its published schedule is drilled
            instead: the shoe starts at the IRC and you call whether the running count has reached
            the key count.
          </p>
        } @else {
          <p class="settings__note">
            True count is only trained for balanced systems. This system is unbalanced, so only
            running count is available.
          </p>
        }
      }
      <div class="settings__fields">
        @if (mode() !== 'deck-speed') {
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
        }
        @if (
          (mode() === 'true-count' || mode() === 'bet-spread') && trueCountSource() === 'classic'
        ) {
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
        @if (usesLiveShoe()) {
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
      @if (mode() === 'bet-spread') {
        <div class="settings__ramp" role="group" aria-label="Bet spread">
          <p class="settings__note">
            The drill asks for the true count, then the bet it is for, graded against this spread —
            your own ramp, in units, not a table this app picked for you.
          </p>
          <div class="settings__ramp-bands">
            @for (band of rampBands(); track band.label) {
              <label class="settings__ramp-band">
                <span>{{ band.label }}</span>
                <input
                  type="number"
                  [min]="minUnits"
                  [max]="maxUnits"
                  step="1"
                  inputmode="numeric"
                  [value]="band.units"
                  (input)="onRampInput(band.index, $event)"
                />
              </label>
            }
          </div>
          @if (rampShrinks()) {
            <p class="settings__note settings__note--warn">
              This spread bets less at a higher count than at a lower one. That is allowed, but it
              is usually a typo.
            </p>
          }
        </div>
      }
      @if (mode() === 'true-count' || mode() === 'bet-spread') {
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
      }
      @if (usesLiveShoe()) {
        <p class="settings__readout">
          Decks remaining (live): <strong>{{ formatDecks(liveDecksRemaining()) }}</strong>
        </p>
        <label class="settings__field">
          <span>Showdown hands</span>
          <select
            class="settings__spots"
            [value]="showdownSpots()"
            (change)="onShowdownSpotsChange($event)"
          >
            @for (s of spotOptions; track s) {
              <option [value]="s" [selected]="s === showdownSpots()">{{ s }}</option>
            }
          </select>
        </label>
        <label class="settings__check">
          <input
            type="checkbox"
            [checked]="showdownBetting()"
            (change)="onShowdownBettingChange($event)"
          />
          <span>Bet sizing (bankroll)</span>
        </label>
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
  // Key-count mode needs a published IRC/key-count schedule (KO only).
  readonly keyCountAvailable = input(false);
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
  // The player's bet spread, edited here and graded against by the bet-spread
  // drill.
  readonly betRamp = input<BetRamp>(DEFAULT_BET_RAMP);
  // Boxes the post-count showdown deals to. Only reachable from the live-shoe
  // true-count path, which is the only place the showdown is offered.
  readonly showdownSpots = input(1);
  // Bet sizing: each showdown round opens on a bet, settled against a bankroll.
  readonly showdownBetting = input(false);
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
  readonly showdownSpotsChange = output<number>();
  readonly showdownBettingChange = output<boolean>();
  readonly betRampChange = output<BetRamp>();

  protected readonly spotOptions = SHOWDOWN_SPOT_OPTIONS;
  protected readonly modeOptions = DRILL_MODES.map((mode) => ({
    mode,
    label: DRILL_MODE_LABELS[mode],
  }));

  // True count — and the bet spread built on it — needs a balanced system; the
  // key-count drill a published schedule. Running count and deck speed suit any
  // system, so they are never disabled.
  protected modeAvailable(mode: DrillMode): boolean {
    if (mode === 'true-count' || mode === 'bet-spread') return this.trueCountAvailable();
    if (mode === 'key-count') return this.keyCountAvailable();
    return true;
  }
  protected readonly minUnits = MIN_BET_UNITS;
  protected readonly maxUnits = MAX_BET_UNITS;

  protected readonly rampBands = computed(() =>
    this.betRamp().map((units, index) => ({
      index,
      units,
      label: BET_RAMP_BAND_LABELS[index],
    })),
  );

  // Advisory only: a spread that shrinks as the count rises is legal but almost
  // always a typo, so it is a note rather than a validation error.
  protected readonly rampShrinks = computed(() => rampShrinks(this.betRamp()));

  // Drives the deck/penetration fields, the live readout, and the showdown
  // settings.
  protected readonly usesLiveShoe = computed(() =>
    usesLiveShoe(this.mode(), this.trueCountSource()),
  );

  // The selected system's published correlations. Falls back to the first
  // system if the id somehow names none, the same way the picker would.
  protected readonly metrics = computed(() => {
    const selected = this.systems().find((s) => s.id === this.systemId()) ?? this.systems()[0];
    return selected ? metricsParts(selected) : [];
  });

  protected onSystemChange(event: Event): void {
    this.systemChange.emit((event.target as HTMLSelectElement).value);
  }

  protected onModeChange(mode: DrillMode): void {
    this.modeChange.emit(mode);
  }

  protected onNumberOfCardsInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!Number.isFinite(input.valueAsNumber)) {
      input.value = String(this.numberOfCards());
      return;
    }
    this.numberOfCardsChange.emit(input.valueAsNumber);
  }

  protected onMsInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!Number.isFinite(input.valueAsNumber)) {
      input.value = String(this.millisecondsBetweenCards());
      return;
    }
    this.millisecondsBetweenCardsChange.emit(input.valueAsNumber);
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

  protected onShowdownSpotsChange(event: Event): void {
    this.showdownSpotsChange.emit(clampSpots(Number((event.target as HTMLSelectElement).value)));
  }

  // Emits the whole ramp with one band replaced; an empty or non-numeric input
  // leaves the band alone rather than writing NaN into prefs.
  protected onRampInput(index: number, event: Event): void {
    const units = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(units)) return;
    const next = this.betRamp().map((current, i) => (i === index ? Math.trunc(units) : current));
    this.betRampChange.emit(next);
  }

  protected onShowdownBettingChange(event: Event): void {
    this.showdownBettingChange.emit((event.target as HTMLInputElement).checked);
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
