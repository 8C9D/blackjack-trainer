import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const KEY_COUNT_STATS_KEY = 'blackjack-key-count-stats';

// Accuracy of the key-count advantage call (KO's key-count drill mode) is kept
// under its own storage key, separate from the running-count store, so it
// measures the threshold skill independently and resets independently.
@Injectable({ providedIn: 'root' })
export class KeyCountStatsService extends StatsStore {
  constructor() {
    super(KEY_COUNT_STATS_KEY);
  }
}
