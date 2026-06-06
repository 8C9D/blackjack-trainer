import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const DECK_ESTIMATION_STATS_KEY = 'blackjack-deck-estimation-stats';

// Deck-estimation accuracy (live-shoe true-count mode) is kept under its own
// storage key, separate from the running-count and true-count stores, so it
// measures the estimation skill independently and resets independently.
@Injectable({ providedIn: 'root' })
export class DeckEstimationStatsService extends StatsStore {
  constructor() {
    super(DECK_ESTIMATION_STATS_KEY);
  }
}
