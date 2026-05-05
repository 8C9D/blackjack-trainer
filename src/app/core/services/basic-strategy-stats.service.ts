import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const BASIC_STRATEGY_STATS_KEY = 'blackjack-basic-strategy-stats';

@Injectable({ providedIn: 'root' })
export class BasicStrategyStatsService extends StatsStore {
  constructor() {
    super(BASIC_STRATEGY_STATS_KEY);
  }
}
