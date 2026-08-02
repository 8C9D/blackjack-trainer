import { Injectable, signal, type Signal } from '@angular/core';

import { readJson, writeJson } from './storage';

export const PRACTICE_HISTORY_KEY = 'blackjack-practice-history';

// How many days of per-day hand counts to retain. The 7-day dot strip needs
// only a week, but streak() walks back day-by-day with no other bound, so
// retention must exceed any streak we want to display accurately: at 30 days a
// real 31+ day streak was silently capped at 30. 400 days (> a year) keeps the
// stored array small while making the cap effectively unreachable. Older
// entries are pruned on every write.
const MAX_HISTORY_DAYS = 400;

export interface PracticeDay {
  // Local calendar date, 'YYYY-MM-DD'.
  readonly date: string;
  readonly hands: number;
}

// One dot of the home screen's 7-day strip. `met` is whether that day reached
// the daily goal (the condition for a filled dot / streak membership).
export interface StreakDot {
  readonly date: string;
  readonly hands: number;
  readonly met: boolean;
  readonly isToday: boolean;
}

// Local (not UTC) calendar date key — a hand practiced at 23:30 belongs to the
// user's day, not the server's.
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Per-day hands-practiced history backing the daily-goal ring and the streak
// dots. Persists to localStorage with the same tolerant load/persist behavior
// as StatsStore; the stored keys are additive (existing stats keys untouched).
@Injectable({ providedIn: 'root' })
export class PracticeHistoryService {
  private now: () => Date = () => new Date();

  private readonly _days = signal<readonly PracticeDay[]>([]);
  readonly days: Signal<readonly PracticeDay[]> = this._days.asReadonly();

  constructor() {
    this._days.set(this.load());
  }

  // Test seam mirroring CardGeneratorService.setRandomSource.
  setNowSource(fn: () => Date): void {
    this.now = fn;
  }

  recordHand(): void {
    const today = localDateKey(this.now());
    const days = this._days();
    const existing = days.find((d) => d.date === today);
    const next = existing
      ? days.map((d) => (d.date === today ? { date: d.date, hands: d.hands + 1 } : d))
      : [...days, { date: today, hands: 1 }];
    const pruned = this.prune(next);
    this._days.set(pruned);
    this.persist(pruned);
  }

  handsToday(): number {
    return this.handsOn(localDateKey(this.now()));
  }

  handsOn(date: string): number {
    return this._days().find((d) => d.date === date)?.hands ?? 0;
  }

  // The 7-day dot strip ending today, oldest first.
  last7(goal: number): StreakDot[] {
    const dots: StreakDot[] = [];
    for (let back = 6; back >= 0; back--) {
      const date = this.dateKeyDaysAgo(back);
      const hands = this.handsOn(date);
      dots.push({ date, hands, met: hands >= goal, isToday: back === 0 });
    }
    return dots;
  }

  // Consecutive goal-met days ending today (if today's goal is already met)
  // or yesterday otherwise — today joins the chain the moment its goal lands,
  // and an unfinished today never breaks the chain.
  streak(goal: number): number {
    let count = 0;
    let back = this.handsOn(this.dateKeyDaysAgo(0)) >= goal ? 0 : 1;
    while (this.handsOn(this.dateKeyDaysAgo(back)) >= goal) {
      count++;
      back++;
    }
    return count;
  }

  private dateKeyDaysAgo(back: number): string {
    const d = new Date(this.now());
    d.setDate(d.getDate() - back);
    return localDateKey(d);
  }

  private prune(days: readonly PracticeDay[]): readonly PracticeDay[] {
    const cutoff = this.dateKeyDaysAgo(MAX_HISTORY_DAYS - 1);
    // 'YYYY-MM-DD' compares chronologically as a string.
    return days.filter((d) => d.date >= cutoff);
  }

  private load(): readonly PracticeDay[] {
    return readJson(PRACTICE_HISTORY_KEY, [] as readonly PracticeDay[], (raw) => {
      const parsed = raw as { days?: unknown };
      if (!Array.isArray(parsed.days)) return [];
      return parsed.days.filter(
        (d): d is PracticeDay =>
          typeof d === 'object' &&
          d !== null &&
          typeof (d as PracticeDay).date === 'string' &&
          typeof (d as PracticeDay).hands === 'number',
      );
    });
  }

  // Wipes the history: the goal ring, streak, and week strip all start over.
  reset(): void {
    this._days.set([]);
    this.persist([]);
  }

  private persist(days: readonly PracticeDay[]): void {
    writeJson(PRACTICE_HISTORY_KEY, { days });
  }
}
