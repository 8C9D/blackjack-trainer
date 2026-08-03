import { Injectable, signal, type Signal } from '@angular/core';

import { readJson, writeJson } from './storage';

export const PRACTICE_HISTORY_KEY = 'blackjack-practice-history';

// How many days of per-day hand counts to retain. The 7-day dot strip needs
// only a week, but streak() walks back day-by-day with no other bound, so
// retention must exceed any streak we want to display accurately: at 30 days a
// real 31+ day streak was silently capped at 30. 400 days (> a year) keeps the
// stored array small while making the cap effectively unreachable. Older
// entries are pruned on every write.
export const MAX_HISTORY_DAYS = 400;

export interface PracticeDay {
  // Local calendar date, 'YYYY-MM-DD'.
  readonly date: string;
  readonly hands: number;
  // Reps whose verdict was recorded, and how many of those were right.
  // Counted separately from `hands` because a day written by a build that only
  // tallied volume has no verdicts at all: dividing its correct count by its
  // hands would report a week of real practice as 0% rather than as unmeasured.
  readonly graded: number;
  readonly correct: number;
}

// One dot of the home screen's 7-day strip. `met` is whether that day reached
// the daily goal (the condition for a filled dot / streak membership).
export interface StreakDot {
  readonly date: string;
  readonly hands: number;
  readonly met: boolean;
  readonly isToday: boolean;
  // Correct share of that day's graded reps, or null when the day graded none.
  readonly accuracy: number | null;
}

// Percentage of graded reps that were right, or null when nothing was graded —
// an unpractised (or pre-grading) window is unmeasured, not zero.
function accuracyOf(graded: number, correct: number): number | null {
  return graded === 0 ? null : Math.round((correct / graded) * 100);
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

  // One graded rep. The verdict is the same one the session streak counts, so a
  // counting round that answers two questions is one rep, right only if both
  // were.
  recordHand(correct: boolean): void {
    const today = localDateKey(this.now());
    const days = this._days();
    const existing = days.find((d) => d.date === today);
    const next = existing
      ? days.map((d) => (d.date === today ? addRep(d, correct) : d))
      : [...days, { date: today, hands: 1, graded: 1, correct: correct ? 1 : 0 }];
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
      const day = this.dayOn(date);
      const hands = day?.hands ?? 0;
      dots.push({
        date,
        hands,
        met: hands >= goal,
        isToday: back === 0,
        accuracy: accuracyOf(day?.graded ?? 0, day?.correct ?? 0),
      });
    }
    return dots;
  }

  // How well the seven days ending `weeksBack` weeks ago went. Volume is
  // already on the screen; this is the half of practice the app grades every
  // rep of and has never said anything about — and a week beside the week
  // before it is the only way the app can answer "am I getting better?".
  accuracyLast7(weeksBack = 0): number | null {
    let graded = 0;
    let correct = 0;
    const first = weeksBack * 7;
    for (let back = first; back < first + 7; back++) {
      const day = this.dayOn(this.dateKeyDaysAgo(back));
      graded += day?.graded ?? 0;
      correct += day?.correct ?? 0;
    }
    return accuracyOf(graded, correct);
  }

  private dayOn(date: string): PracticeDay | undefined {
    return this._days().find((d) => d.date === date);
  }

  // Consecutive goal-met days ending today (if today's goal is already met)
  // or yesterday otherwise — today joins the chain the moment its goal lands,
  // and an unfinished today never breaks the chain.
  streak(goal: number): number {
    let count = 0;
    let back = this.handsOn(this.dateKeyDaysAgo(0)) >= goal ? 0 : 1;
    // Bounded by the retention window rather than by the data: days past it are
    // pruned, so no real streak can run longer, and the walk cannot spin forever
    // on a goal of zero — which every day in history, stored or not, satisfies.
    // The goal is clamped to at least 1 before it reaches here, so this is a
    // backstop for a caller that stops doing that, not a live path.
    while (back < MAX_HISTORY_DAYS && this.handsOn(this.dateKeyDaysAgo(back)) >= goal) {
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
      const byDate = new Map<string, PracticeDay>();
      for (const candidate of parsed.days) {
        const day = toPracticeDay(candidate);
        if (day === null) continue;
        byDate.set(day.date, mergeDays(byDate.get(day.date), day));
      }
      return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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

function addRep(day: PracticeDay, correct: boolean): PracticeDay {
  return {
    date: day.date,
    hands: day.hands + 1,
    graded: day.graded + 1,
    correct: day.correct + (correct ? 1 : 0),
  };
}

function mergeDays(a: PracticeDay | undefined, b: PracticeDay): PracticeDay {
  if (a === undefined) return b;
  return {
    date: b.date,
    hands: capped(a.hands + b.hands),
    graded: capped(a.graded + b.graded),
    correct: capped(a.correct + b.correct),
  };
}

function capped(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value);
}

// Coerce one untrusted stored entry. The verdict counts are optional: days
// written before the app recorded them read as ungraded (and so as unmeasured)
// rather than as a day nothing was got right on. Both are clamped into
// `correct ≤ graded ≤ hands` so no stored file can produce an accuracy over
// 100%.
function toPracticeDay(value: unknown): PracticeDay | null {
  if (typeof value !== 'object' || value === null) return null;
  const day = value as Partial<PracticeDay>;
  if (!isLocalDateKey(day.date)) return null;
  const hands = count(day.hands);
  if (hands === null) return null;
  const graded = Math.min(hands, count(day.graded) ?? 0);
  return { date: day.date, hands, graded, correct: Math.min(graded, count(day.correct) ?? 0) };
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function isLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
