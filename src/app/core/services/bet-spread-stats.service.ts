import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const BET_SPREAD_STATS_KEY = 'blackjack-bet-spread-stats';

// Accuracy of the bet call in the bet-spread drill, under its own storage key:
// betting the ramp is a separate skill from counting the shoe, and a trainee
// who counts well but bets flat should be able to see exactly that.
@Injectable({ providedIn: 'root' })
export class BetSpreadStatsService extends StatsStore {
  constructor() {
    super(BET_SPREAD_STATS_KEY);
  }
}
