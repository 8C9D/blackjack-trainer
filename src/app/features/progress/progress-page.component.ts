import { Component, HostListener, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { BankrollService } from '../../core/services/bankroll.service';
import { BetSpreadStatsService } from '../../core/services/bet-spread-stats.service';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { CountDriftService } from '../../core/services/count-drift.service';
import { DeckEstimationStatsService } from '../../core/services/deck-estimation-stats.service';
import { DeckSpeedStatsService } from '../../core/services/deck-speed-stats.service';
import { ShowdownPlayStatsService } from '../../core/services/showdown-play-stats.service';
import { formatDuration } from '../../core/models/deck-speed.model';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { KeyCountStatsService } from '../../core/services/key-count-stats.service';
import {
  MissTallyService,
  missedCountsLabel,
  type TalliedTrainer,
  type WeakSpot,
} from '../../core/services/miss-tally.service';
import { countOf } from '../../core/text';
import { REVIEW_QUERY_PARAM } from '../drill/drill-hand';
import {
  PracticeHistoryService,
  type StreakDot,
} from '../../core/services/practice-history.service';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';
import type { SessionStats } from '../../core/services/stats-store';
import { TrueCountStatsService } from '../../core/services/true-count-stats.service';

// A drilled row: one stat store's lifetime numbers.
interface StatRow {
  readonly label: string;
  readonly attempts: number;
  readonly accuracy: number | null;
  readonly best: number;
}

// One bar of the week strip.
interface DayBar extends StreakDot {
  readonly weekday: string;
  // Height as a percentage of the tallest day (or the goal, whichever is larger).
  readonly height: number;
}

// This week's accuracy against last week's, as a direction and a sentence.
interface Trend {
  readonly direction: 'up' | 'down' | 'level';
  readonly label: string;
}

// Weak spots are per trainer, and naming the trainer is what makes the list
// actionable ("16 vs 10" means different work in each drill).
interface WeakSpotGroup {
  readonly trainer: string;
  // The trainer's route segment, so the card can start a review round in it.
  readonly id: TalliedTrainer;
  readonly outstanding: readonly WeakSpot[];
  // The worst few, which is what the card lists, and the count it did not.
  readonly shown: readonly WeakSpot[];
  readonly hidden: number;
  readonly cleared: readonly WeakSpot[];
}

// How many outstanding scenarios a card names before it collapses to a count.
// Enough to be a work list, few enough that the worst ones stay legible — the
// review round the card starts is not capped by this.
const SPOTS_SHOWN = 5;

// Everything the app has been quietly recording, in one place: the week, each
// trainer's lifetime accuracy, the showdown ledger, and the scenarios still
// costing hands. Read-only — practice is what changes these.
@Component({
  selector: 'app-progress-page',
  template: `
    <main class="progress">
      <header class="progress__header">
        <button type="button" class="progress__back" (click)="goHome()">
          ← Back <kbd class="kcap">esc</kbd>
        </button>
        <h1 class="progress__title">Progress</h1>
      </header>

      <section class="progress__card" aria-label="This week">
        <h2 class="progress__heading">This week</h2>
        <div class="progress__week">
          @for (day of week(); track day.date) {
            <div class="progress__day">
              <div class="progress__bar-track">
                <div
                  class="progress__bar"
                  [class.progress__bar--met]="day.met"
                  [class.progress__bar--today]="day.isToday"
                  [style.height.%]="day.height"
                ></div>
              </div>
              <span class="progress__weekday">{{ day.weekday }}</span>
              <span class="sr-only">{{ dayLabel(day) }}</span>
            </div>
          }
        </div>
        <!-- The bars are volume. Every one of those hands was graded, so the
             half of practice that actually improves is the accuracy — and a
             week beside the week before it is the only thing here that answers
             whether it is going up. -->
        @if (weekAccuracy() !== null) {
          <p class="progress__accuracy">
            <b>{{ weekAccuracy() }}% correct</b> this week
            @if (trend(); as t) {
              <span
                class="progress__trend"
                [class.progress__good]="t.direction === 'up'"
                [class.progress__bad]="t.direction === 'down'"
                >{{ t.label }}</span
              >
            }
          </p>
        }
        <!-- The other half of table-readiness: a chart answered perfectly and
             slowly is not a chart you can play. Reported, never judged — the
             app has no published number to hold a trainee to, so the direction
             against their own week before is the whole claim. -->
        @if (weekPace() !== null) {
          <p class="progress__accuracy">
            <b>{{ weekPace() }}s a hand</b> this week
            @if (paceTrend(); as t) {
              <span
                class="progress__trend"
                [class.progress__good]="t.direction === 'up'"
                [class.progress__bad]="t.direction === 'down'"
                >{{ t.label }}</span
              >
            }
          </p>
        }
        <p class="progress__week-note">
          {{ streakLabel() }} · goal {{ countOf(goal(), 'hand') }}/day ·
          {{ countOf(totalHands(), 'hand') }} all time
        </p>
      </section>

      <section class="progress__card" aria-label="Trainers">
        <h2 class="progress__heading">Trainers</h2>
        <table class="progress__table">
          <thead>
            <tr>
              <th scope="col">Drill</th>
              <th scope="col">Hands</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Best run</th>
            </tr>
          </thead>
          <tbody>
            @for (row of trainerRows(); track row.label) {
              <tr>
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.attempts }}</td>
                <td [class.progress__good]="row.accuracy !== null && row.accuracy >= 85">
                  {{ row.accuracy === null ? '—' : row.accuracy + '%' }}
                </td>
                <td>{{ row.best }}</td>
              </tr>
            }
          </tbody>
        </table>
        @if (deckSpeedBest() !== null) {
          <p class="progress__week-note">
            Fastest deck counted down: <b>{{ formatDuration(deckSpeedBest()!) }}</b>
          </p>
        }
        <!-- Accuracy says a count was wrong and never how. A count that lands
             under nearly every time is dropping the same thing each shoe; one
             that scatters is being lost and restarted. Named, not diagnosed —
             the app has no way to tell which card went missing. -->
        @if (driftShape(); as shape) {
          <p class="progress__week-note">
            Your last {{ countOf(shape.rounds, 'count') }}: <b>{{ shape.low }} low</b> ·
            <b>{{ shape.high }} high</b> · <b>{{ shape.exact }} exact</b>. Missing on the same side
            every time and missing all over are different problems.
          </p>
        }
      </section>

      @if (showdown().hands > 0) {
        <section class="progress__card" aria-label="Showdown">
          <h2 class="progress__heading">Showdown</h2>
          <p class="progress__record">
            <b>{{ showdown().wins }}W</b> · <b>{{ showdown().losses }}L</b> ·
            <b>{{ showdown().pushes }}P</b>
            <small
              >{{ countOf(showdown().hands, 'hand') }} ·
              {{ countOf(showdown().blackjacks, 'blackjack') }} · {{ winRate() }}% won</small
            >
          </p>
          @if (bankroll().wagered > 0) {
            <p class="progress__record">
              <b
                [class.progress__good]="bankroll().net > 0"
                [class.progress__bad]="bankroll().net < 0"
              >
                {{ signed(bankroll().net) }}
              </b>
              <small
                >{{ countOf(bankroll().bankroll, 'chip') }} on hand ·
                {{ bankroll().wagered }} wagered</small
              >
            </p>
          }
        </section>
      }

      @for (group of weakSpots(); track group.trainer) {
        <section class="progress__card" [attr.aria-label]="group.trainer + ' weak spots'">
          <h2 class="progress__heading">{{ group.trainer }} — this week</h2>
          @if (group.outstanding.length > 0) {
            <ul class="progress__spots">
              @for (spot of group.shown; track spot.label) {
                <li>
                  <b>{{ spot.label }}</b>
                  <span>{{ spotDetail(spot) }}</span>
                </li>
              }
            </ul>
            <!-- A bad week can outstand thirty scenarios, and a card that lists
                 them all buries the ones actually costing hands. The list is
                 worst-first, so the cut is at the bottom — and it is stated,
                 never silent, because the round below still drills all of them. -->
            @if (group.hidden > 0) {
              <p class="progress__more">+{{ group.hidden }} more this week</p>
            }
            <!-- Naming a weakness on a read-only screen leaves the trainee to
                 go and hope it comes up. This is the Done screen's "Drill my
                 misses" reachable from where the list actually lives. -->
            <button type="button" class="progress__drill" (click)="drillMisses(group.id)">
              Drill these misses
            </button>
          } @else {
            <p class="progress__empty">Nothing outstanding.</p>
          }
          @if (group.cleared.length > 0) {
            <p class="progress__cleared">
              Cleared: <b>{{ clearedLabel(group.cleared) }}</b>
            </p>
          }
        </section>
      }
    </main>
  `,
  styleUrl: './progress-page.component.scss',
})
export class ProgressPageComponent {
  // Templates can only call class members, so the shared counted-noun
  // helper is re-exposed rather than imported into the markup.
  protected readonly countOf = countOf;

  private readonly prefs = inject(FlowPrefsService);
  private readonly history = inject(PracticeHistoryService);
  private readonly missTally = inject(MissTallyService);
  private readonly basicStats = inject(BasicStrategyStatsService);
  private readonly deviationStats = inject(DeviationStatsService);
  private readonly runningCountStats = inject(CardCountingStatsService);
  private readonly trueCountStats = inject(TrueCountStatsService);
  private readonly deckEstimationStats = inject(DeckEstimationStatsService);
  private readonly keyCountStats = inject(KeyCountStatsService);
  private readonly betSpreadStats = inject(BetSpreadStatsService);
  private readonly deckSpeedStats = inject(DeckSpeedStatsService);
  private readonly showdownPlayStats = inject(ShowdownPlayStatsService);
  private readonly showdownStats = inject(ShowdownStatsService);
  private readonly bankrollService = inject(BankrollService);
  private readonly countDrift = inject(CountDriftService);
  private readonly router = inject(Router);

  protected readonly goal = computed(() => this.prefs.prefs().dailyGoal);
  protected readonly deckSpeedBest = this.deckSpeedStats.bestMs;
  protected readonly formatDuration = formatDuration;
  protected readonly showdown = this.showdownStats.stats;
  protected readonly bankroll = this.bankrollService.state;

  protected readonly week = computed<readonly DayBar[]>(() => {
    this.history.days();
    const dots = this.history.last7(this.goal());
    // Scale against the goal as well as the week's peak, so a week under the
    // goal doesn't render as a full-height bar.
    const peak = Math.max(this.goal(), ...dots.map((d) => d.hands), 1);
    return dots.map((dot) => ({
      ...dot,
      weekday: weekdayInitial(dot.date),
      height: dot.hands === 0 ? 0 : Math.max(6, Math.round((dot.hands / peak) * 100)),
    }));
  });

  protected readonly weekAccuracy = computed(() => {
    this.history.days();
    return this.history.accuracyLast7();
  });

  // How this week compares with the one before it. Null until there are two
  // weeks with graded reps in them — a single week's figure is a reading, not
  // yet a direction.
  protected readonly trend = computed<Trend | null>(() => {
    this.history.days();
    const now = this.weekAccuracy();
    const before = this.history.accuracyLast7(1);
    if (now === null || before === null) return null;
    if (now === before) return { direction: 'level', label: 'level with the week before' };
    const direction = now > before ? 'up' : 'down';
    return { direction, label: `${direction} from ${before}% the week before` };
  });

  protected readonly weekPace = computed(() => {
    this.history.days();
    return this.history.paceLast7();
  });

  // Faster is the good direction here, which is why this cannot reuse the
  // accuracy trend: there, up is better; here, down is.
  protected readonly paceTrend = computed<Trend | null>(() => {
    this.history.days();
    const now = this.weekPace();
    const before = this.history.paceLast7(1);
    if (now === null || before === null) return null;
    if (now === before) return { direction: 'level', label: 'level with the week before' };
    const faster = now < before;
    return {
      direction: faster ? 'up' : 'down',
      label: `${faster ? 'faster' : 'slower'} than ${before}s the week before`,
    };
  });

  protected readonly streakLabel = computed(() => {
    this.history.days();
    const streak = this.history.streak(this.goal());
    return streak === 0 ? 'No streak yet' : `${streak}-day streak`;
  });

  protected readonly totalHands = computed(() =>
    this.history.days().reduce((sum, day) => sum + day.hands, 0),
  );

  protected readonly trainerRows = computed<readonly StatRow[]>(() => [
    row('Basic Strategy', this.basicStats.stats()),
    row('Deviations', this.deviationStats.stats()),
    row('Running count', this.runningCountStats.stats()),
    row('True count', this.trueCountStats.stats()),
    row('Deck estimate', this.deckEstimationStats.stats()),
    row('Key count call', this.keyCountStats.stats()),
    row('Bet spread', this.betSpreadStats.stats()),
    row('Deck speed', this.deckSpeedStats.stats()),
    // Not a drill of its own — it is every decision at a table, scored where the
    // hands are actually played out rather than dealt two at a time: basic
    // strategy, the indices laid over it, and the insurance call.
    row('Showdown play', this.showdownPlayStats.stats()),
  ]);

  // Which side the counts land on, once there are enough of them for a lean to
  // be a lean. Every mode that answers a running count feeds it, including the
  // count carried out of the showdown.
  protected readonly driftShape = computed(() => {
    this.countDrift.drifts();
    return this.countDrift.shape();
  });

  protected readonly winRate = computed(() => {
    const { hands, wins } = this.showdown();
    return hands === 0 ? 0 : Math.round((wins / hands) * 100);
  });

  // Only trainers that tally scenarios appear, and only once they have one.
  protected readonly weakSpots = computed<readonly WeakSpotGroup[]>(() => {
    this.missTally.state();
    return (
      [
        { trainer: 'Basic Strategy', id: 'basic-strategy' },
        { trainer: 'Deviations', id: 'deviations' },
      ] as const
    )
      .map(({ trainer, id }) => {
        const outstanding = this.missTally.weakSpots(id);
        return {
          trainer,
          id,
          outstanding,
          shown: outstanding.slice(0, SPOTS_SHOWN),
          hidden: Math.max(0, outstanding.length - SPOTS_SHOWN),
          cleared: this.missTally.clearedSpots(id),
        };
      })
      .filter((group) => group.outstanding.length > 0 || group.cleared.length > 0);
  });

  // The bars carry only height, so the screen-reader text is where a day's
  // numbers actually live.
  protected dayLabel(day: DayBar): string {
    const hands = countOf(day.hands, 'hand');
    return day.accuracy === null ? hands : `${hands}, ${day.accuracy}% correct`;
  }

  // "missed 3 of 7 at TC -1, +2". A deviation missed on both sides of its index
  // is two different mistakes, and the hand's label carries neither.
  protected spotDetail(spot: WeakSpot): string {
    const at = missedCountsLabel(spot);
    const counts = at === null ? '' : ` at ${at}`;
    return `missed ${spot.misses} of ${spot.attempts}${counts}`;
  }

  protected clearedLabel(cleared: readonly WeakSpot[]): string {
    const shown = cleared.slice(0, 3).map((spot) => spot.label);
    const rest = cleared.length - shown.length;
    return rest > 0 ? `${shown.join(' · ')} · +${rest} more` : shown.join(' · ');
  }

  protected signed(net: number): string {
    return net > 0 ? `+${net}` : String(net);
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected drillMisses(trainer: TalliedTrainer): void {
    void this.router.navigate(['/drill', trainer], {
      queryParams: { [REVIEW_QUERY_PARAM]: '1' },
    });
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.goHome();
    }
  }
}

// ─── pure helpers (exported for tests) ───────────────────────────────────

function row(label: string, stats: SessionStats): StatRow {
  return {
    label,
    attempts: stats.attempts,
    accuracy: stats.attempts === 0 ? null : Math.round((stats.correct / stats.attempts) * 100),
    best: stats.longestStreak,
  };
}

// '2026-08-02' → 'S'. Parsed as a local date (not UTC) so the letter matches
// the day the hands were recorded on.
export function weekdayInitial(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'narrow' });
}
