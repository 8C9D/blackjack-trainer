import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const DEVIATION_STATS_KEY = 'blackjack-deviation-stats';

@Injectable({ providedIn: 'root' })
export class DeviationStatsService extends StatsStore {
  constructor() {
    super(DEVIATION_STATS_KEY);
  }
}
