import { Component, HostListener, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { BankrollService } from '../../core/services/bankroll.service';
import { BetSpreadStatsService } from '../../core/services/bet-spread-stats.service';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { DeckEstimationStatsService } from '../../core/services/deck-estimation-stats.service';
import { DeckSpeedStatsService } from '../../core/services/deck-speed-stats.service';
import { ShowdownPlayStatsService } from '../../core/services/showdown-play-stats.service';
import { formatDuration } from '../../core/models/deck-speed.model';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { KeyCountStatsService } from '../../core/services/key-count-stats.service';
import { MissTallyService, type WeakSpot } from '../../core/services/miss-tally.service';
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

// Weak spots are per trainer, and naming the trainer is what makes the list
// actionable ("16 vs 10" means different work in each drill).
interface WeakSpotGroup {
  readonly trainer: string;
  readonly outstanding: readonly WeakSpot[];
  readonly cleared: readonly WeakSpot[];
}

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
              <span class="sr-only">{{ day.hands }} hands</span>
            </div>
          }
        </div>
        <p class="progress__week-note">
          {{ streakLabel() }} · goal {{ goal() }} hands/day · {{ totalHands() }} hands all time
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
      </section>

      @if (showdown().hands > 0) {
        <section class="progress__card" aria-label="Showdown">
          <h2 class="progress__heading">Showdown</h2>
          <p class="progress__record">
            <b>{{ showdown().wins }}W</b> · <b>{{ showdown().losses }}L</b> ·
            <b>{{ showdown().pushes }}P</b>
            <small
              >{{ showdown().hands }} hands · {{ showdown().blackjacks }} blackjacks ·
              {{ winRate() }}% won</small
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
                >{{ bankroll().bankroll }} chips on hand · {{ bankroll().wagered }} wagered</small
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
              @for (spot of group.outstanding; track spot.label) {
                <li>
                  <b>{{ spot.label }}</b>
                  <span>missed {{ spot.misses }} of {{ spot.attempts }}</span>
                </li>
              }
            </ul>
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
    // Not a drill of its own — it is basic strategy, scored where the hands are
    // actually played out rather than dealt two at a time.
    row('Showdown play', this.showdownPlayStats.stats()),
  ]);

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
      .map(({ trainer, id }) => ({
        trainer,
        outstanding: this.missTally.weakSpots(id),
        cleared: this.missTally.clearedSpots(id),
      }))
      .filter((group) => group.outstanding.length > 0 || group.cleared.length > 0);
  });

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
