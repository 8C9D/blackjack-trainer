import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const TRUE_COUNT_STATS_KEY = 'blackjack-true-count-stats';

// True-count attempts are kept under a separate storage key from running
// count so resetting one drill mode doesn't wipe the other's progress.
@Injectable({ providedIn: 'root' })
export class TrueCountStatsService extends StatsStore {
  constructor() {
    super(TRUE_COUNT_STATS_KEY);
  }
}
