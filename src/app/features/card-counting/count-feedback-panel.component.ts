import { Component, computed, input, output, signal } from '@angular/core';

import {
  BET_RAMP_BAND_LABELS,
  betRampBandIndex,
  betUnitsForTrueCount,
} from '../../core/models/bet-ramp.model';
import {
  DECK_SPEED_BENCHMARK_MS,
  formatDuration,
  type DeckSpeedDrillResult,
} from '../../core/models/deck-speed.model';
import {
  countDriftLabel,
  deckEstimateEffect,
  formatSignedCount,
  type BetSpreadDrillResult,
  type CountingDrillResult,
  type DeckEstimateEffect,
  type KeyCountDrillResult,
  type RunningCountDrillResult,
  type TrueCountDrillResult,
} from '../../core/models/card-counting.model';
import { cardCountValue, type CountingSystem } from '../../core/models/counting-system.model';
import { CardImageComponent } from '../../shared/card-image.component';
import { countOf } from '../../core/text';

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
        @if (driftLine(); as line) {
          <p class="feedback__formula">{{ line }}</p>
        }
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
          Running count {{ tc.correctRunningCount }} ÷
          {{ countOf(tc.decksRemaining, 'deck', formatDecks(tc.decksRemaining)) }} = true count
          {{ tc.correctTrueCount }}
        </p>
        @if (estimateEffect(); as est) {
          <p class="feedback__formula">{{ estimateLine(tc.correctRunningCount, est) }}</p>
        }
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
        @if (driftLine(); as line) {
          <p class="feedback__formula">{{ line }}</p>
        }
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
          Running count {{ bs.correctRunningCount }} ÷
          {{ countOf(bs.decksRemaining, 'deck', formatDecks(bs.decksRemaining)) }} = true count
          {{ bs.correctTrueCount }}, which is the {{ rampBandLabel(bs.correctTrueCount) }} band of
          your spread.
        </p>
        @if (estimateEffect(); as est) {
          <p class="feedback__formula">
            {{ estimateLine(bs.correctRunningCount, est) }}
            <!-- The bet is what a deck estimate is *for*, so this round can say
                 what the estimate would have cost in units rather than leaving
                 the trainee to read it off the ramp below. -->
            @if (estimateBetLine(bs, est); as line) {
              <span>{{ line }}</span>
            }
          </p>
        }
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
        @if (driftLine(); as line) {
          <p class="feedback__formula">{{ line }}</p>
        }
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
  // Templates can only call class members, so the shared counted-noun
  // helper is re-exposed rather than imported into the markup.
  protected readonly countOf = countOf;

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

  // How far a wrong count landed from the real one, in the same words the
  // table's count check uses on the way out — it is the same skill and the same
  // miss, and two numbers side by side leave the subtraction to the trainee.
  // Null on a correct count, and on the modes whose answer is a true count:
  // there the deck-estimate line above already accounts for the miss.
  protected readonly driftLine = computed<string | null>(() => {
    const r = this.result();
    if (r.mode === 'true-count' || r.mode === 'bet-spread') return null;
    const drift = r.userRunningCount - r.correctRunningCount;
    if (drift === 0) return null;
    // "over 20 cards" is only true where this round's cards are the whole count.
    // A key-count round carries the shoe's prior — the drift is over every card
    // dealt since the shuffle, and this panel knows how many only for the round.
    const over = r.mode === 'key-count' ? '' : ` over ${countOf(r.cards.length, 'card')}`;
    return `Your count came in ${countDriftLabel(drift)}${over}.`;
  });

  // The estimate is graded on its own (inside ±0.5 or not) and the true count
  // against the shoe's real decks — so the round shows both halves and never
  // said what the one did to the other, which is the only reason to estimate
  // decks at all.
  protected readonly estimateEffect = computed<DeckEstimateEffect | null>(() => {
    const r = this.trueCountResult() ?? this.betSpreadResult();
    if (!r) return null;
    return deckEstimateEffect(
      r.correctRunningCount,
      r.deckEstimate,
      r.correctTrueCount,
      r.userTrueCount,
    );
  });

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
    return countOf(count, 'unit');
  }

  // The band label a true count falls in, for the feedback line.
  protected rampBandLabel(trueCount: number): string {
    return BET_RAMP_BAND_LABELS[betRampBandIndex(trueCount)];
  }

  // The same division the line above it does, with the divisor the player
  // actually had. When it lands on the same true count the estimate cost
  // nothing this round, which is worth saying too: how far out an estimate is
  // only matters against the running count it divides.
  protected estimateLine(runningCount: number, effect: DeckEstimateEffect): string {
    const divided = `Your estimate: ${runningCount} ÷ ${countOf(
      effect.estimate,
      'deck',
      this.formatDecks(effect.estimate),
    )} = true count ${effect.impliedTrueCount}`;
    if (effect.matchesActual) {
      return `${divided} — the same true count, so the estimate cost nothing here.`;
    }
    // "The count you would have played on" is only true where the answer agrees
    // with the estimate. Say it of an answer that lands somewhere else — the
    // shoe's own count, most of all, which is marked correct — and the panel
    // contradicts the verdict two lines above it.
    return effect.matchesAnswer
      ? `${divided} — the count you would have played on, and the answer you gave.`
      : `${divided}.`;
  }

  // What that count would have bet, when the ramp says something different
  // there. Null when both land in bands holding the same units, since then the
  // estimate cost no bet even though it moved the count.
  protected estimateBetLine(
    result: BetSpreadDrillResult,
    effect: DeckEstimateEffect,
  ): string | null {
    if (effect.matchesActual) return null;
    const implied = betUnitsForTrueCount(effect.impliedTrueCount, result.ramp);
    if (implied === result.correctUnits) return null;
    return `Your spread bets ${this.units(implied)} there, not ${this.units(result.correctUnits)}.`;
  }

  // Whole decks render as "5"; fractional decks as up to two decimals with
  // trailing zeros trimmed (e.g. 5.6153… → "5.62", 2.5 → "2.5").
  protected formatDecks(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
}
