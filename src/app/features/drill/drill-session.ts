import { computed, signal } from '@angular/core';

// Per-round answer counters for a drill session: attempts, correct, the
// current correct-streak, and the round's best streak. Reset when a new
// round starts ("one more round"). Persistent stats live elsewhere — this is
// the peak-end material for the Done screen and the top bar's streak chip.
export class DrillSession {
  private readonly _attempts = signal(0);
  private readonly _correct = signal(0);
  private readonly _streak = signal(0);
  private readonly _bestStreak = signal(0);

  readonly attempts = this._attempts.asReadonly();
  readonly correct = this._correct.asReadonly();
  readonly streak = this._streak.asReadonly();
  readonly bestStreak = this._bestStreak.asReadonly();

  // Every timed decision of the round, in the order they were answered.
  private readonly _times = signal<readonly number[]>([]);

  // Whole-percent accuracy, or null before the first answer.
  readonly accuracy = computed<number | null>(() => {
    const attempts = this._attempts();
    if (attempts === 0) return null;
    return Math.round((this._correct() / attempts) * 100);
  });

  // Seconds for the round's middle decision, to one decimal, or null when
  // nothing was timed. The median rather than the mean because one interrupted
  // hand — a doorbell inside a twenty-hand round — would otherwise decide the
  // figure, and the round is small enough for that to matter.
  readonly medianSeconds = computed<number | null>(() => {
    const times = [...this._times()].sort((a, b) => a - b);
    if (times.length === 0) return null;
    const middle = Math.floor(times.length / 2);
    const ms = times.length % 2 === 1 ? times[middle] : (times[middle - 1] + times[middle]) / 2;
    return Math.round(ms / 100) / 10;
  });

  record(correct: boolean, elapsedMs?: number): void {
    if (elapsedMs !== undefined) this._times.update((times) => [...times, elapsedMs]);
    this._attempts.update((n) => n + 1);
    if (correct) {
      this._correct.update((n) => n + 1);
      this._streak.update((n) => n + 1);
      this._bestStreak.update((n) => Math.max(n, this._streak()));
    } else {
      this._streak.set(0);
    }
  }

  reset(): void {
    this._attempts.set(0);
    this._correct.set(0);
    this._streak.set(0);
    this._bestStreak.set(0);
    this._times.set([]);
  }
}
