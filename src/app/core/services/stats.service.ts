import { Injectable, signal } from '@angular/core';

export interface SessionStats {
  readonly attempts: number;
  readonly correct: number;
  readonly streak: number;
  readonly longestStreak: number;
}

const EMPTY_STATS: SessionStats = {
  attempts: 0,
  correct: 0,
  streak: 0,
  longestStreak: 0,
};

// Bumping the suffix here will discard any previously-stored stats. Increase
// it when the shape changes in a backwards-incompatible way.
const STORAGE_KEY = 'blackjack-trainer:stats:v1';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly _stats = signal<SessionStats>(this.load());

  // Read-only signal consumed by views.
  readonly stats = this._stats.asReadonly();

  recordAttempt(correct: boolean): void {
    const prev = this._stats();
    const streak = correct ? prev.streak + 1 : 0;
    const next: SessionStats = {
      attempts: prev.attempts + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak,
      longestStreak: Math.max(prev.longestStreak, streak),
    };
    this._stats.set(next);
    this.persist(next);
  }

  reset(): void {
    this._stats.set(EMPTY_STATS);
    this.persist(EMPTY_STATS);
  }

  private load(): SessionStats {
    if (typeof localStorage === 'undefined') return EMPTY_STATS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return EMPTY_STATS;
      const parsed = JSON.parse(raw) as Partial<SessionStats>;
      if (
        typeof parsed.attempts === 'number' &&
        typeof parsed.correct === 'number' &&
        typeof parsed.streak === 'number' &&
        typeof parsed.longestStreak === 'number'
      ) {
        return {
          attempts: parsed.attempts,
          correct: parsed.correct,
          streak: parsed.streak,
          longestStreak: parsed.longestStreak,
        };
      }
    } catch {
      // Malformed payload — fall through to empty.
    }
    return EMPTY_STATS;
  }

  private persist(stats: SessionStats): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch {
      // localStorage can throw on quota / private browsing; tolerate silently.
    }
  }
}
