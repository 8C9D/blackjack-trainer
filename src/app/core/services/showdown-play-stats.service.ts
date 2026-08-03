import { Injectable } from '@angular/core';

import { StatsStore } from './stats-store';

export const SHOWDOWN_PLAY_STATS_KEY = 'blackjack-showdown-play-stats';

// Accuracy of the playing decisions made at the showdown table, kept apart from
// the win/lose/push tally in ShowdownStatsService: one measures how the cards
// fell, the other whether the hand was played right. Only the second is a
// skill, and only the second belongs beside the drills on Progress.
@Injectable({ providedIn: 'root' })
export class ShowdownPlayStatsService extends StatsStore {
  constructor() {
    super(SHOWDOWN_PLAY_STATS_KEY);
  }
}
