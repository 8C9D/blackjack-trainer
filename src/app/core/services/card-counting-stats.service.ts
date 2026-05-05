import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const CARD_COUNTING_STATS_KEY = 'blackjack-card-counting-stats';

@Injectable({ providedIn: 'root' })
export class CardCountingStatsService extends StatsStore {
  constructor() {
    super(CARD_COUNTING_STATS_KEY);
  }
}
