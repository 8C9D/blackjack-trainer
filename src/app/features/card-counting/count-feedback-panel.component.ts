import { Component, computed, input, output, signal } from '@angular/core';

import { BET_RAMP_BAND_LABELS, betRampBandIndex } from '../../core/models/bet-ramp.model';
import {
  DECK_SPEED_BENCHMARK_MS,
  formatDuration,
  type DeckSpeedDrillResult,
} from '../../core/models/deck-speed.model';
import {
  formatSignedCount,
  type BetSpreadDrillResult,
  type CountingDrillResult,
  type KeyCountDrillResult,
  type RunningCountDrillResult,
  type TrueCountDrillResult,
} from '../../core/models/card-counting.model';
import { cardCountValue, type CountingSystem } from '../../core/models/counting-system.model';
import { CardImageComponent } from '../../shared/card-image.component';

interface BreakdownEntry {
  readonly index: number;
  readonly card: RunningCountDrillResult['cards'][number];
  readonly deltaLabel: string;
  readonly runningTotal: number;
}

// Ranks read as words in the burned-card sentence; the pip ranks speak for
// themselves.
const RANK_WORDS: Partial<Record<string, string>> = {
  J: 'jack',
  Q: 'queen',
  K: 'king',
  A: 'ace',
};

interface RampBand {
  readonly label: string;
  readonly units: number;
  readonly active: boolean;
}

@Component({
  selector: 'app-count-feedback-panel',
  imports: [CardImageComponent],
  template: `
    <section
      class="feedback"
      [class.feedback--correct]="result().isCorrect"
      [class.feedback--incorrect]="!result().isCorrect"
      role="status"
    >
      <p class="feedback__verdict">
        {{ result().isCorrect ? 'Correct!' : 'Incorrect' }}
      </p>

      @if (runningCountResult(); as rc) {
        <dl class="feedback__details">
          <dt>Your count</dt>
          <dd>{{ rc.userRunningCount }}</dd>
          <dt>Correct count</dt>
          <dd>{{ rc.correctRunningCount }}</dd>
        </dl>
      } @else if (trueCountResult(); as tc) {
        <dl class="feedback__details">
          <dt>Your true count</dt>
          <dd>{{ tc.userTrueCount }}</dd>
          <dt>Correct true count</dt>
          <dd>{{ tc.correctTrueCount }}</dd>
          <dt>Running count</dt>
          <dd>{{ tc.correctRunningCount }}</dd>
          <dt>Decks remaining</dt>
          <dd>{{ formatDecks(tc.decksRemaining) }}</dd>
          @if (tc.deckEstimate !== undefined) {
            <dt>Your decks estimate</dt>
            <dd>{{ formatDecks(tc.deckEstimate) }}</dd>
            <dt>Estimate within ±0.5</dt>
            <dd>{{ tc.deckEstimateWithinBand ? 'Yes' : 'No' }}</dd>
          }
        </dl>
        <p class="feedback__formula">
          Running count {{ tc.correctRunningCount }} ÷ {{ formatDecks(tc.decksRemaining) }} decks =
          true count {{ tc.correctTrueCount }}
        </p>
      } @else if (keyCountResult(); as kc) {
        <dl class="feedback__details">
          <dt>Your count</dt>
          <dd>{{ kc.userRunningCount }}</dd>
          <dt>Correct count</dt>
          <dd>{{ kc.correctRunningCount }}</dd>
          <dt>Key count</dt>
          <dd>{{ formatSigned(kc.keyCount) }}</dd>
          <dt>Advantage</dt>
          <dd>
            {{ kc.hasAdvantage ? 'Yes' : 'No' }} — you said
            {{ kc.userSaidAdvantage ? 'yes' : 'no' }}
          </dd>
        </dl>
        <p class="feedback__formula">
          Running count {{ formatSigned(kc.correctRunningCount) }} is
          {{ kc.hasAdvantage ? 'at or above' : 'below' }} the key count
          {{ formatSigned(kc.keyCount) }} —
          {{ kc.hasAdvantage ? 'the edge is yours' : 'no edge yet' }}. The shoe started at the IRC
          {{ formatSigned(kc.irc) }} and a full shoe ends at the pivot {{ formatSigned(kc.pivot) }}.
        </p>
        @if (kc.correctRunningCount >= kc.insuranceCount) {
          <p class="feedback__formula">
            Running count {{ formatSigned(kc.correctRunningCount) }} has reached
            {{ formatSigned(kc.insuranceCount) }} — take insurance when it is offered.
          </p>
        }
      } @else if (betSpreadResult(); as bs) {
        <dl class="feedback__details">
          <dt>Your true count</dt>
          <dd>{{ bs.userTrueCount }}</dd>
          <dt>Correct true count</dt>
          <dd>{{ bs.correctTrueCount }}</dd>
          <dt>Running count</dt>
          <dd>{{ bs.correctRunningCount }}</dd>
          <dt>Decks remaining</dt>
          <dd>{{ formatDecks(bs.decksRemaining) }}</dd>
          @if (bs.deckEstimate !== undefined) {
            <dt>Your decks estimate</dt>
            <dd>{{ formatDecks(bs.deckEstimate) }}</dd>
            <dt>Estimate within ±0.5</dt>
            <dd>{{ bs.deckEstimateWithinBand ? 'Yes' : 'No' }}</dd>
          }
          <dt>Your bet</dt>
          <dd>{{ units(bs.userUnits) }}</dd>
          <dt>Your spread says</dt>
          <dd>{{ units(bs.correctUnits) }}</dd>
        </dl>
        <p class="feedback__formula">
          Running count {{ bs.correctRunningCount }} ÷ {{ formatDecks(bs.decksRemaining) }} decks =
          true count {{ bs.correctTrueCount }}, which is the
          {{ rampBandLabel(bs.correctTrueCount) }} band of your spread.
        </p>
        <ul class="feedback__ramp" aria-label="Your bet spread">
          @for (band of rampBands(); track band.label) {
            <li class="feedback__band" [class.feedback__band--active]="band.active">
              <span class="feedback__band-label">{{ band.label }}</span>
              <span class="feedback__band-units">{{ units(band.units) }}</span>
            </li>
          }
        </ul>
      } @else if (deckSpeedResult(); as ds) {
        <dl class="feedback__details">
          <dt>Your count</dt>
          <dd>{{ ds.userRunningCount }}</dd>
          <dt>Correct count</dt>
          <dd>{{ ds.correctRunningCount }}</dd>
          <dt>Time</dt>
          <dd>{{ duration(ds.elapsedMs) }}</dd>
          <dt>Best</dt>
          <dd>
            {{ ds.previousBestMs === null ? '—' : duration(ds.previousBestMs) }}
          </dd>
        </dl>
        <p class="feedback__formula">
          The burned card was the {{ burnedLabel(ds) }}, worth
          {{ formatSigned(cardValue(ds.burnedCard)) }}. A full deck of this system counts
          {{ formatSigned(ds.fullDeckCount) }}, so the 51 you saw had to come to
          {{ formatSigned(ds.correctRunningCount) }}.
        </p>
        @if (ds.isPersonalBest) {
          <p class="feedback__formula feedback__best" role="status">
            New personal best — {{ duration(ds.elapsedMs) }}.
            {{ ds.elapsedMs < benchmarkMs ? 'That is under the 30-second benchmark.' : '' }}
          </p>
        }
      }

      <button
        type="button"
        class="feedback__toggle"
        [attr.aria-expanded]="showBreakdown()"
        (click)="toggleBreakdown()"
      >
        {{ showBreakdown() ? 'Hide' : 'Show' }} card-by-card breakdown
      </button>

      @if (showBreakdown()) {
        <ol class="feedback__breakdown">
          @for (entry of breakdown(); track entry.index) {
            <li class="feedback__cell">
              <app-card-image [card]="entry.card" />
              <span class="feedback__delta">{{ entry.deltaLabel }}</span>
              <span class="feedback__running">→ {{ entry.runningTotal }}</span>
            </li>
          }
        </ol>
      }

      <button type="button" class="feedback__next" (click)="next.emit()">
        Run again <span class="accent-hint">[Enter]</span>
      </button>
    </section>
  `,
  styleUrl: './count-feedback-panel.component.scss',
})
export class CountFeedbackPanelComponent {
  readonly result = input.required<CountingDrillResult>();
  readonly system = input.required<CountingSystem>();
  readonly next = output<void>();

  protected readonly showBreakdown = signal(false);

  // Mode-narrowed views so the template can read mode-specific fields without
  // repeated type guards in expressions.
  protected readonly runningCountResult = computed<RunningCountDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'running-count' ? r : null;
  });

  protected readonly trueCountResult = computed<TrueCountDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'true-count' ? r : null;
  });

  protected readonly keyCountResult = computed<KeyCountDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'key-count' ? r : null;
  });

  protected readonly betSpreadResult = computed<BetSpreadDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'bet-spread' ? r : null;
  });

  protected readonly deckSpeedResult = computed<DeckSpeedDrillResult | null>(() => {
    const r = this.result();
    return r.mode === 'deck-speed' ? r : null;
  });

  protected readonly benchmarkMs = DECK_SPEED_BENCHMARK_MS;

  // The whole spread, with the band this round landed in marked — the feedback
  // shows the table so a missed bet reads as "that count was this band".
  protected readonly rampBands = computed<readonly RampBand[]>(() => {
    const bs = this.betSpreadResult();
    if (!bs) return [];
    const active = betRampBandIndex(bs.correctTrueCount);
    return bs.ramp.map((units, index) => ({
      label: BET_RAMP_BAND_LABELS[index],
      units,
      active: index === active,
    }));
  });

  protected readonly breakdown = computed<readonly BreakdownEntry[]>(() => {
    const sys = this.system();
    const r = this.result();
    // Live-shoe rounds (true-count, key-count, bet-spread) carry a running count
    // from earlier rounds — the IRC itself on a fresh key-count shoe; start the
    // running total from that offset so it ends at correctRunningCount. Classic,
    // running-count, and deck-speed rounds have no prior, so this is 0.
    const carried =
      r.mode === 'running-count' || r.mode === 'deck-speed' ? 0 : (r.priorRunningCount ?? 0);
    let running = carried;
    return r.cards.map((card, index) => {
      const delta = cardCountValue(sys, card);
      running += delta;
      return {
        index,
        card,
        deltaLabel: formatSignedCount(delta),
        runningTotal: running,
      };
    });
  });

  protected toggleBreakdown(): void {
    this.showBreakdown.update((v) => !v);
  }

  // Schedule values read as signed counts ("+2", "-4", "0"), matching how the
  // KO tables are written.
  protected formatSigned(value: number): string {
    return formatSignedCount(value);
  }

  protected duration(ms: number): string {
    return formatDuration(ms);
  }

  // The burned card in words, so the proof line reads as a sentence.
  protected burnedLabel(result: DeckSpeedDrillResult): string {
    return `${RANK_WORDS[result.burnedCard.rank] ?? result.burnedCard.rank} of ${result.burnedCard.suit}`;
  }

  protected cardValue(card: RunningCountDrillResult['cards'][number]): number {
    return cardCountValue(this.system(), card);
  }

  // Bets are always whole units, and the singular reads oddly as "1 units".
  protected units(count: number): string {
    return count === 1 ? '1 unit' : `${count} units`;
  }

  // The band label a true count falls in, for the feedback line.
  protected rampBandLabel(trueCount: number): string {
    return BET_RAMP_BAND_LABELS[betRampBandIndex(trueCount)];
  }

  // Whole decks render as "5"; fractional decks as up to two decimals with
  // trailing zeros trimmed (e.g. 5.6153… → "5.62", 2.5 → "2.5").
  protected formatDecks(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
}
