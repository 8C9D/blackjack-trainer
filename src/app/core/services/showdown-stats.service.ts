import { Injectable, signal, type Signal } from '@angular/core';

import type { ShowdownOutcome } from '../models/showdown.model';

export const SHOWDOWN_STATS_KEY = 'blackjack-showdown-stats';

// A showdown is a win/lose/push tally rather than the correct/incorrect model of
// StatsStore, so it gets its own shape and storage key. `blackjacks` counts the
// player naturals among the wins (flavor only — there is no bankroll or bet).
export interface ShowdownStats {
  readonly hands: number;
  readonly wins: number;
  readonly losses: number;
  readonly pushes: number;
  readonly blackjacks: number;
}

const EMPTY_STATS: ShowdownStats = {
  hands: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  blackjacks: 0,
};

// Persists the post-count showdown tally under its own localStorage key, mirror-
// ing the StatsStore load/persist idioms but tracking win/lose/push (and player
// naturals) instead of correct/incorrect. No money or bet sizing is tracked.
@Injectable({ providedIn: 'root' })
export class ShowdownStatsService {
  private readonly _stats = signal<ShowdownStats>(this.load());
  readonly stats: Signal<ShowdownStats> = this._stats.asReadonly();

  record(outcome: ShowdownOutcome, playerBlackjack = false): void {
    const prev = this._stats();
    const next: ShowdownStats = {
      hands: prev.hands + 1,
      wins: prev.wins + (outcome === 'win' ? 1 : 0),
      losses: prev.losses + (outcome === 'lose' ? 1 : 0),
      pushes: prev.pushes + (outcome === 'push' ? 1 : 0),
      blackjacks: prev.blackjacks + (outcome === 'win' && playerBlackjack ? 1 : 0),
    };
    this._stats.set(next);
    this.persist(next);
  }

  reset(): void {
    this._stats.set(EMPTY_STATS);
    this.persist(EMPTY_STATS);
  }

  private load(): ShowdownStats {
    if (typeof localStorage === 'undefined') return EMPTY_STATS;
    try {
      const raw = localStorage.getItem(SHOWDOWN_STATS_KEY);
      if (!raw) return EMPTY_STATS;
      const parsed = JSON.parse(raw) as Partial<ShowdownStats>;
      if (
        typeof parsed.hands === 'number' &&
        typeof parsed.wins === 'number' &&
        typeof parsed.losses === 'number' &&
        typeof parsed.pushes === 'number' &&
        typeof parsed.blackjacks === 'number'
      ) {
        return {
          hands: parsed.hands,
          wins: parsed.wins,
          losses: parsed.losses,
          pushes: parsed.pushes,
          blackjacks: parsed.blackjacks,
        };
      }
    } catch {
      // Malformed payload — fall through to empty.
    }
    return EMPTY_STATS;
  }

  private persist(stats: ShowdownStats): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SHOWDOWN_STATS_KEY, JSON.stringify(stats));
    } catch {
      // localStorage can throw on quota / private browsing; tolerate silently.
    }
  }
}
