import { Injectable, inject, signal, type Signal } from '@angular/core';

import { FlowPrefsService } from './flow-prefs.service';
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
  // Reps the app timed, and the milliseconds they took between them. Counted
  // separately again: only the strategy drills time a decision (the counting
  // drills are paced by the app or, for the deck countdown, timed already), and
  // days written before this have none — untimed, not instant.
  readonly timed: number;
  readonly millis: number;
  // The daily goal in force when this day was last practised. Kept per day
  // because a goal is a decision about a day, and judging every past day by
  // today's number lets one setting rewrite history: raise the goal and a
  // thirty-day streak reads 0, lower it and days you barely practised count.
  // Absent on a day written before this was stored, which reads as "whatever
  // the goal is now" — exactly what those days did before.
  readonly goal?: number;
}

// Longest a single decision can be and still count as one. Past this the
// trainee put the phone down: a hand you walked away from is not a hand you
// were slow on, and one of them would swamp a round's average.
export const MAX_TIMED_DECISION_MS = 60_000;

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

// Mean seconds per timed decision to one decimal, or null when none were timed.
// A mean rather than a median because only per-day totals are stored, and over
// a week's hands the cap above is what keeps it honest.
function paceOf(timed: number, millis: number): number | null {
  return timed === 0 ? null : Math.round(millis / timed / 100) / 10;
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
  private readonly prefs = inject(FlowPrefsService);
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
  recordHand(correct: boolean, elapsedMs?: number): void {
    const today = localDateKey(this.now());
    const millis = plausibleDecisionMs(elapsedMs);
    // Read here rather than passed in by each drill: six call sites would be six
    // chances to forget, and a day with no goal reads as judged by whatever the
    // goal is now — the very thing this is here to stop.
    const goal = this.prefs.prefs().dailyGoal;
    const days = this._days();
    const existing = days.find((d) => d.date === today);
    const next = existing
      ? days.map((d) => (d.date === today ? addRep(d, correct, millis, goal) : d))
      : [
          ...days,
          {
            date: today,
            hands: 1,
            graded: 1,
            correct: correct ? 1 : 0,
            timed: millis === null ? 0 : 1,
            millis: millis ?? 0,
            ...(plausibleGoal(goal) === null ? {} : { goal }),
          },
        ];
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

  // Whether a day reached the goal it is judged by.
  private metOn(date: string, current: number, isToday: boolean): boolean {
    const day = this.dayOn(date);
    return (day?.hands ?? 0) >= this.goalFor(day, current, isToday);
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
        met: hands >= this.goalFor(day, goal, back === 0),
        isToday: back === 0,
        accuracy: accuracyOf(day?.graded ?? 0, day?.correct ?? 0),
      });
    }
    return dots;
  }

  // Which goal a day is judged by: today's is the one on the Settings screen —
  // the day is still running, and raising the goal is a statement about it — but
  // a finished day keeps the goal it was practised under, so changing the number
  // cannot un-meet a day that was met.
  private goalFor(day: PracticeDay | undefined, current: number, isToday: boolean): number {
    if (isToday) return current;
    return plausibleGoal(day?.goal) ?? current;
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

  // How long a decision took over the seven days ending `weeksBack` weeks ago.
  // Accuracy says whether the practice is working; this says whether it would
  // survive a table, where the dealer is waiting.
  paceLast7(weeksBack = 0): number | null {
    let timed = 0;
    let millis = 0;
    const first = weeksBack * 7;
    for (let back = first; back < first + 7; back++) {
      const day = this.dayOn(this.dateKeyDaysAgo(back));
      timed += day?.timed ?? 0;
      millis += day?.millis ?? 0;
    }
    return paceOf(timed, millis);
  }

  private dayOn(date: string): PracticeDay | undefined {
    return this._days().find((d) => d.date === date);
  }

  // Consecutive goal-met days ending today (if today's goal is already met)
  // or yesterday otherwise — today joins the chain the moment its goal lands,
  // and an unfinished today never breaks the chain.
  streak(goal: number): number {
    let count = 0;
    let back = this.metOn(this.dateKeyDaysAgo(0), goal, true) ? 0 : 1;
    // Bounded by the retention window rather than by the data: days past it are
    // pruned, so no real streak can run longer, and the walk cannot spin forever
    // on a goal of zero — which every day in history, stored or not, satisfies.
    // The goal is clamped to at least 1 before it reaches here, so this is a
    // backstop for a caller that stops doing that, not a live path.
    while (back < MAX_HISTORY_DAYS && this.metOn(this.dateKeyDaysAgo(back), goal, back === 0)) {
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

function addRep(
  day: PracticeDay,
  correct: boolean,
  millis: number | null,
  goal: number | undefined,
): PracticeDay {
  // The goal in force when the day was last practised: a day whose goal was
  // raised and then practised again was practised under the new number.
  const stored = plausibleGoal(goal) ?? day.goal;
  return {
    date: day.date,
    hands: day.hands + 1,
    graded: day.graded + 1,
    correct: day.correct + (correct ? 1 : 0),
    timed: day.timed + (millis === null ? 0 : 1),
    millis: day.millis + (millis ?? 0),
    ...(stored === undefined ? {} : { goal: stored }),
  };
}

// A stored goal has to be a whole number of hands to judge a day by. Anything
// else — a repaired preference, a hand-edited backup — reads as no goal at all,
// which falls back to the one on the Settings screen.
export function plausibleGoal(goal: number | undefined): number | null {
  if (goal === undefined || !Number.isFinite(goal)) return null;
  return goal >= 1 ? Math.floor(goal) : null;
}

// A decision counts as timed only when the clock read plausibly: a zero or
// negative reading is a clock that moved backwards, and anything past the cap
// is a trainee who walked away. Exported because the drill pages apply the same
// judgement to the round's own figure — one rule, one place.
export function plausibleDecisionMs(elapsedMs: number | undefined): number | null {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs)) return null;
  if (elapsedMs <= 0 || elapsedMs > MAX_TIMED_DECISION_MS) return null;
  return Math.round(elapsedMs);
}

function mergeDays(a: PracticeDay | undefined, b: PracticeDay): PracticeDay {
  if (a === undefined) return b;
  // Two entries for one date is a hand-edited file; the later one's goal is the
  // one that day was last practised under, and a missing one keeps the other.
  const goal = b.goal ?? a.goal;
  return {
    date: b.date,
    hands: capped(a.hands + b.hands),
    graded: capped(a.graded + b.graded),
    correct: capped(a.correct + b.correct),
    timed: capped(a.timed + b.timed),
    millis: capped(a.millis + b.millis),
    ...(goal === undefined ? {} : { goal }),
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
  // A timed rep is a graded one, and no run of them can average past the cap,
  // so a hand-edited file cannot report an impossible pace either way.
  const timed = Math.min(graded, count(day.timed) ?? 0);
  const goal = plausibleGoal(typeof day.goal === 'number' ? day.goal : undefined);
  return {
    date: day.date,
    hands,
    graded,
    correct: Math.min(graded, count(day.correct) ?? 0),
    timed,
    millis: Math.min(timed * MAX_TIMED_DECISION_MS, count(day.millis) ?? 0),
    ...(goal === null ? {} : { goal }),
  };
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function isLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
