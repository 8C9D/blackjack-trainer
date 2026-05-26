import { Component, computed, input, output, signal } from '@angular/core';

import { RuleControlsComponent } from '../../shared/rule-controls.component';
import type {
  EngineOptions,
  RuleSet,
} from '../../core/models/strategy.model';

export type TrueCountSource = 'random' | 'manual';

// 'all-hands' preserves the v4 behavior (uniformly-random hand + dealer
// upcard). 'deviation-only' generates hands matching an encoded deviation
// rule so the user practices chart cells where deviations are relevant.
export type DeviationPracticeMode = 'all-hands' | 'deviation-only';

// Inclusive validation range for the manual true-count input. Wide enough to
// cover any plausible deviation threshold (the BJA charts top out at +6) while
// still rejecting obvious garbage like 999.
export const MIN_MANUAL_TRUE_COUNT = -20;
export const MAX_MANUAL_TRUE_COUNT = 20;

@Component({
  selector: 'app-deviation-settings',
  imports: [RuleControlsComponent],
  template: `
    <section class="deviation-settings" aria-label="Deviation trainer settings">
      <app-rule-controls
        name="deviation-ruleSet"
        [ruleSet]="ruleSet()"
        [options]="options()"
        (ruleSetChange)="ruleSetChange.emit($event)"
        (optionsChange)="optionsChange.emit($event)"
      />

      <fieldset class="deviation-settings__group">
        <legend>Practice mode</legend>
        <label>
          <input
            type="radio"
            name="deviation-practiceMode"
            value="all-hands"
            [checked]="practiceMode() === 'all-hands'"
            (change)="practiceModeChange.emit('all-hands')"
          />
          All hands
        </label>
        <label>
          <input
            type="radio"
            name="deviation-practiceMode"
            value="deviation-only"
            [checked]="practiceMode() === 'deviation-only'"
            (change)="practiceModeChange.emit('deviation-only')"
          />
          Deviation-only
        </label>
        <p
          id="deviation-practice-mode-help"
          class="deviation-settings__help"
        >
          Deviation-only generates hands that have an encoded deviation rule.
          The true count may or may not trigger the deviation.
        </p>
      </fieldset>

      <fieldset class="deviation-settings__group deviation-settings__group--tc">
        <legend>True count source</legend>
        <label>
          <input
            type="radio"
            name="deviation-tcSource"
            value="random"
            [checked]="trueCountSource() === 'random'"
            (change)="trueCountSourceChange.emit('random')"
          />
          Random true count
        </label>
        <label>
          <input
            type="radio"
            name="deviation-tcSource"
            value="manual"
            [checked]="trueCountSource() === 'manual'"
            (change)="trueCountSourceChange.emit('manual')"
          />
          Manual true count
        </label>

        @if (trueCountSource() === 'manual') {
          <label class="deviation-settings__manual">
            <span class="deviation-settings__manual-label">True count</span>
            <input
              class="deviation-settings__manual-input"
              type="number"
              [min]="MIN"
              [max]="MAX"
              step="1"
              inputmode="numeric"
              [value]="displayInput()"
              (input)="onManualInput($event)"
              [attr.aria-invalid]="manualTrueCount() === null ? 'true' : null"
              aria-describedby="deviation-manual-tc-help"
            />
          </label>
          @if (manualTrueCount() === null) {
            <p
              id="deviation-manual-tc-help"
              class="deviation-settings__error"
              role="alert"
            >
              Enter an integer between {{ MIN }} and {{ MAX }}.
            </p>
          }
        }
      </fieldset>
    </section>
  `,
  styleUrl: './deviation-settings.component.scss',
})
export class DeviationSettingsComponent {
  protected readonly MIN = MIN_MANUAL_TRUE_COUNT;
  protected readonly MAX = MAX_MANUAL_TRUE_COUNT;

  readonly ruleSet = input.required<RuleSet>();
  readonly options = input.required<EngineOptions>();
  readonly trueCountSource = input.required<TrueCountSource>();
  readonly manualTrueCount = input.required<number | null>();
  readonly practiceMode = input.required<DeviationPracticeMode>();

  readonly ruleSetChange = output<RuleSet>();
  readonly optionsChange = output<EngineOptions>();
  readonly trueCountSourceChange = output<TrueCountSource>();
  readonly manualTrueCountChange = output<number | null>();
  readonly practiceModeChange = output<DeviationPracticeMode>();

  // `null` means "not yet typed since the manual input mounted" → fall back to
  // displaying the parent's `manualTrueCount`. Once the user types anything,
  // we hold that raw text so an invalid value (e.g. "21" or "abc") stays
  // visible even though we emit `null` upward.
  private readonly rawInput = signal<string | null>(null);

  protected readonly displayInput = computed(() => {
    const raw = this.rawInput();
    if (raw !== null) return raw;
    const v = this.manualTrueCount();
    return v === null ? '' : String(v);
  });

  protected onManualInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.rawInput.set(raw);
    this.manualTrueCountChange.emit(parseManualTrueCount(raw));
  }
}

// Exported for tests. Returns the parsed integer when `raw` is an integer in
// [MIN_MANUAL_TRUE_COUNT, MAX_MANUAL_TRUE_COUNT]; otherwise returns null
// (empty, non-integer, decimal, out of range, etc.).
export function parseManualTrueCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_MANUAL_TRUE_COUNT || n > MAX_MANUAL_TRUE_COUNT) return null;
  return n;
}
