import { Injectable, inject } from '@angular/core';

import { BankrollService } from './bankroll.service';
import { BasicStrategyStatsService } from './basic-strategy-stats.service';
import { BetSpreadStatsService } from './bet-spread-stats.service';
import { CardCountingStatsService } from './card-counting-stats.service';
import { DeckSpeedStatsService } from './deck-speed-stats.service';
import { DeckEstimationStatsService } from './deck-estimation-stats.service';
import { DeviationStatsService } from './deviation-stats.service';
import { KeyCountStatsService } from './key-count-stats.service';
import { MissTallyService } from './miss-tally.service';
import { PracticeHistoryService } from './practice-history.service';
import { ShowdownStatsService } from './showdown-stats.service';
import { TrueCountStatsService } from './true-count-stats.service';

// Everything practice writes, in one place, so "start over" is one call and no
// store can be forgotten when a new one is added. Settings (rules, daily goal,
// drill configuration) is deliberately NOT touched: a trainee clearing their
// numbers has not changed their mind about the table they are practising for.
@Injectable({ providedIn: 'root' })
export class PracticeDataService {
  private readonly stores = [
    inject(BasicStrategyStatsService),
    inject(DeviationStatsService),
    inject(CardCountingStatsService),
    inject(TrueCountStatsService),
    inject(DeckEstimationStatsService),
    inject(KeyCountStatsService),
    inject(BetSpreadStatsService),
    inject(DeckSpeedStatsService),
    inject(ShowdownStatsService),
    inject(BankrollService),
    inject(PracticeHistoryService),
    inject(MissTallyService),
  ];

  reset(): void {
    for (const store of this.stores) store.reset();
  }
}
