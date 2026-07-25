import { signal, type Signal } from '@angular/core';

import { coerceNumericRecord, readJson, writeJson } from './storage';

// Stats keys from earlier versions that are no longer read. Bootstrap calls
// cleanupLegacyStatsKeys() once to wipe them so they don't accumulate in
// localStorage. Drop this list (and the helper below) once no installations
// of those versions remain.
const LEGACY_STATS_KEYS: readonly string[] = ['blackjack-trainer:stats:v1'];

export function cleanupLegacyStatsKeys(): void {
  if (typeof localStorage === 'undefined') return;
  for (const key of LEGACY_STATS_KEYS) {
    localStorage.removeItem(key);
  }
}

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

// Stats container parameterized by storage key. Concrete services
// (BasicStrategyStatsService, CardCountingStatsService) extend this and
// pass their key — multiple feature areas can persist independent stats
// without sharing state.
export class StatsStore {
  private readonly _stats;
  readonly stats: Signal<SessionStats>;

  constructor(private readonly storageKey: string) {
    this._stats = signal<SessionStats>(this.load());
    this.stats = this._stats.asReadonly();
  }

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
    return readJson(this.storageKey, EMPTY_STATS, (raw) => coerceNumericRecord(raw, EMPTY_STATS));
  }

  private persist(stats: SessionStats): void {
    writeJson(this.storageKey, stats);
  }
}
