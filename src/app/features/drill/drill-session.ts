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

  // Whole-percent accuracy, or null before the first answer.
  readonly accuracy = computed<number | null>(() => {
    const attempts = this._attempts();
    if (attempts === 0) return null;
    return Math.round((this._correct() / attempts) * 100);
  });

  record(correct: boolean): void {
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
  }
}
