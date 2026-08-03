import { TestBed } from '@angular/core/testing';

import { BankrollService } from './bankroll.service';
import { BasicStrategyStatsService } from './basic-strategy-stats.service';
import { BetSpreadStatsService } from './bet-spread-stats.service';
import { CardCountingStatsService } from './card-counting-stats.service';
import { DeckEstimationStatsService } from './deck-estimation-stats.service';
import { DeckSpeedStatsService } from './deck-speed-stats.service';
import { DeviationStatsService } from './deviation-stats.service';
import { KeyCountStatsService } from './key-count-stats.service';
import { MissTallyService } from './miss-tally.service';
import { PracticeDataService } from './practice-data.service';
import { PracticeHistoryService } from './practice-history.service';
import { ShowdownPlayStatsService } from './showdown-play-stats.service';
import { ShowdownStatsService } from './showdown-stats.service';
import { TrueCountStatsService } from './true-count-stats.service';

const STORE_TYPES = [
  BasicStrategyStatsService,
  DeviationStatsService,
  CardCountingStatsService,
  TrueCountStatsService,
  DeckEstimationStatsService,
  KeyCountStatsService,
  BetSpreadStatsService,
  DeckSpeedStatsService,
  ShowdownStatsService,
  ShowdownPlayStatsService,
  BankrollService,
  PracticeHistoryService,
  MissTallyService,
] as const;

describe('PracticeDataService', () => {
  it('resets every practice-data store in one operation', () => {
    const stores = STORE_TYPES.map((type) => ({ type, reset: vi.fn() }));
    TestBed.configureTestingModule({
      providers: [
        PracticeDataService,
        ...stores.map(({ type, reset }) => ({ provide: type, useValue: { reset } })),
      ],
    });

    TestBed.inject(PracticeDataService).reset();

    for (const { reset } of stores) expect(reset).toHaveBeenCalledOnce();
  });
});
