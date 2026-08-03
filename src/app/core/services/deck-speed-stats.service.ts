import { Injectable, signal, type Signal } from '@angular/core';

import { StatsStore } from './stats-store';
import { readJson, writeJson } from './storage';

export const DECK_SPEED_STATS_KEY = 'blackjack-deck-speed-stats';
export const DECK_SPEED_BEST_KEY = 'blackjack-deck-speed-best';

interface StoredBest {
  readonly bestMs: number | null;
}

// A stored best that is negative, zero, or not a number is impossible; reject
// the payload rather than showing a nonsense record time.
export function coerceBest(raw: unknown): StoredBest {
  const value = (raw as StoredBest | null)?.bestMs;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? { bestMs: value }
    : { bestMs: null };
}

// The deck-speed drill's accuracy (the shared StatsStore shape) plus the one
// number the drill exists to move: the fastest *correct* countdown, under its
// own key so a reset clears both together.
@Injectable({ providedIn: 'root' })
export class DeckSpeedStatsService extends StatsStore {
  private readonly _bestMs = signal<number | null>(
    readJson(DECK_SPEED_BEST_KEY, { bestMs: null }, coerceBest).bestMs,
  );
  readonly bestMs: Signal<number | null> = this._bestMs.asReadonly();

  constructor() {
    super(DECK_SPEED_STATS_KEY);
  }

  // Records a finished countdown. The best time only moves on a correct round —
  // speed with the wrong count is not a counting skill — and returns the best
  // that stood before it, so the feedback can say what was beaten.
  recordRound(correct: boolean, elapsedMs: number): number | null {
    const previous = this._bestMs();
    this.recordAttempt(correct);
    const validElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0;
    if (correct && validElapsed && (previous === null || elapsedMs < previous)) {
      this._bestMs.set(elapsedMs);
      writeJson(DECK_SPEED_BEST_KEY, { bestMs: elapsedMs });
    }
    return previous;
  }

  override reset(): void {
    super.reset();
    this._bestMs.set(null);
    writeJson(DECK_SPEED_BEST_KEY, { bestMs: null });
  }
}
