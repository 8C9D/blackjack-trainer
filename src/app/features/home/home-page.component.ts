import { Component, HostListener, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import {
  FlowPrefsService,
  TRAINER_LABELS,
  TRAINER_ORDER,
  type TrainerId,
} from '../../core/services/flow-prefs.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { TrueCountStatsService } from '../../core/services/true-count-stats.service';
import { GoalRingComponent } from '../../shared/goal-ring.component';
import { StreakDotsComponent } from '../../shared/streak-dots.component';

interface TrainerCard {
  readonly id: TrainerId;
  readonly label: string;
  // Lifetime accuracy 0–100, or null before any attempts.
  readonly accuracy: number | null;
  readonly key: string;
}

// The Open moment: one loud primary action (resume the last trainer), the
// daily-goal ring and streak, and the other two trainers in stable positions.
// Zero decisions to start — Enter resumes with the last-used settings.
@Component({
  selector: 'app-home-page',
  imports: [GoalRingComponent, StreakDotsComponent],
  template: `
    <main class="home">
      <!-- The design has no visible title — the primary action is the screen.
           Screen readers still need one heading to anchor the page. -->
      <h1 class="sr-only">Blackjack Trainer</h1>

      <div class="home__glance">
        <p class="home__day">{{ dayLabel }}</p>
        <app-goal-ring [value]="handsToday()" [goal]="goal()" />
        <app-streak-dots [dots]="dots()" [streak]="streak()" />
      </div>

      <div class="home__actions">
        <button type="button" class="home__primary" (click)="start(lastTrainer())">
          <span class="home__primary-text">
            Continue — {{ labelFor(lastTrainer()) }}
            <small>{{ subtext() }}</small>
          </span>
          <kbd class="kcap kcap--on-accent">⏎</kbd>
        </button>

        <div class="home__others">
          @for (t of otherTrainers(); track t.id; let i = $index) {
            <button type="button" class="home__other" (click)="start(t.id)">
              <span class="home__other-label">{{ t.label }}</span>
              <span
                class="home__chip"
                [class.home__chip--good]="t.accuracy !== null && t.accuracy >= 85"
                [class.home__chip--new]="t.accuracy === null"
                >{{ t.accuracy === null ? 'new' : t.accuracy + '%' }}</span
              >
              <kbd class="kcap">{{ t.key }}</kbd>
            </button>
          }
        </div>

        <button type="button" class="home__settings" (click)="openSettings()">
          <kbd class="kcap">,</kbd>
          Settings
        </button>
      </div>
    </main>
  `,
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent {
  private readonly prefs = inject(FlowPrefsService);
  private readonly history = inject(PracticeHistoryService);
  private readonly basicStats = inject(BasicStrategyStatsService);
  private readonly deviationStats = inject(DeviationStatsService);
  private readonly runningCountStats = inject(CardCountingStatsService);
  private readonly trueCountStats = inject(TrueCountStatsService);
  private readonly router = inject(Router);

  // A getter, not a field: recomputed each change-detection pass so the label
  // doesn't freeze at construction time (e.g. showing "afternoon" into the
  // evening, or yesterday's weekday past midnight, while home stays mounted).
  protected get dayLabel(): string {
    return formatDayLabel(new Date());
  }

  protected readonly goal = computed(() => this.prefs.prefs().dailyGoal);
  protected readonly lastTrainer = computed(() => this.prefs.prefs().lastTrainer);

  protected readonly handsToday = computed(() => {
    this.history.days();
    return this.history.handsToday();
  });

  protected readonly dots = computed(() => {
    this.history.days();
    return this.history.last7(this.goal());
  });

  protected readonly streak = computed(() => {
    this.history.days();
    return this.history.streak(this.goal());
  });

  protected readonly subtext = computed(() => {
    const remaining = this.goal() - this.handsToday();
    if (remaining <= 0) return 'goal met — one more round?';
    return `${remaining} ${remaining === 1 ? 'hand' : 'hands'} to today's goal`;
  });

  // The two non-primary trainers, always in canonical order so their position
  // (and number key) never moves for a given primary.
  protected readonly otherTrainers = computed<readonly TrainerCard[]>(() =>
    TRAINER_ORDER.filter((id) => id !== this.lastTrainer()).map((id, i) => ({
      id,
      label: TRAINER_LABELS[id],
      accuracy: this.accuracyFor(id),
      key: String(i + 2),
    })),
  );

  protected labelFor(id: TrainerId): string {
    return TRAINER_LABELS[id];
  }

  protected start(trainer: TrainerId): void {
    void this.router.navigate(['/drill', trainer]);
  }

  protected openSettings(): void {
    void this.router.navigate(['/settings']);
  }

  private accuracyFor(id: TrainerId): number | null {
    switch (id) {
      case 'basic-strategy':
        return accuracy(this.basicStats.stats());
      case 'deviations':
        return accuracy(this.deviationStats.stats());
      case 'card-counting': {
        // Counting persists running- and true-count drills separately;
        // the card shows them combined.
        const running = this.runningCountStats.stats();
        const trueCount = this.trueCountStats.stats();
        return accuracy({
          attempts: running.attempts + trueCount.attempts,
          correct: running.correct + trueCount.correct,
        });
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.start(this.lastTrainer());
      return;
    }
    if (event.key === ',') {
      event.preventDefault();
      this.openSettings();
      return;
    }
    const others = this.otherTrainers();
    if (event.key === '2' && others[0]) {
      event.preventDefault();
      this.start(others[0].id);
    } else if (event.key === '3' && others[1]) {
      event.preventDefault();
      this.start(others[1].id);
    }
  }
}

// ─── pure helpers (exported for tests) ───────────────────────────────────

function accuracy(stats: { attempts: number; correct: number }): number | null {
  if (stats.attempts === 0) return null;
  return Math.round((stats.correct / stats.attempts) * 100);
}

// "Thursday evening" — ambient, glanceable, no clock precision.
export function formatDayLabel(now: Date): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `${weekday} ${part}`;
}
