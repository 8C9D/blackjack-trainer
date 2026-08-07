import { TestBed } from '@angular/core/testing';

import { BACKUP_KEYS, BACKUP_KEY_PREFIX } from '../models/backup.model';
import { BankrollService } from './bankroll.service';
import { BasicStrategyStatsService } from './basic-strategy-stats.service';
import { BetSpreadStatsService } from './bet-spread-stats.service';
import { CardCountingStatsService } from './card-counting-stats.service';
import { CountDriftService } from './count-drift.service';
import { DeckEstimationStatsService } from './deck-estimation-stats.service';
import { DeckSpeedStatsService } from './deck-speed-stats.service';
import { DeviationStatsService } from './deviation-stats.service';
import { FlowPrefsService } from './flow-prefs.service';
import { KeyCountStatsService } from './key-count-stats.service';
import { MissTallyService } from './miss-tally.service';
import { PracticeHistoryService } from './practice-history.service';
import { ShowdownPlayStatsService } from './showdown-play-stats.service';
import { ShowdownStatsService } from './showdown-stats.service';
import { TrueCountStatsService } from './true-count-stats.service';

// The backup used to be defined by the 'blackjack-' prefix, whose virtue was
// that no store could be silently left behind. Now that the app shares its
// origin with other Pages projects, the backup is the declared BACKUP_KEYS
// list — and this spec carries the old guarantee instead: it drives a write
// through every storage-backed service and fails if anything lands in
// localStorage that the list does not carry (or the list carries a key no
// service writes). Adding a store without declaring its key fails here.
describe('BACKUP_KEYS', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('declares exactly the keys the app writes', () => {
    TestBed.inject(BasicStrategyStatsService).reset();
    TestBed.inject(BetSpreadStatsService).reset();
    TestBed.inject(CardCountingStatsService).reset();
    TestBed.inject(DeckEstimationStatsService).reset();
    TestBed.inject(DeckSpeedStatsService).reset(); // writes its best-time key too
    TestBed.inject(DeviationStatsService).reset();
    TestBed.inject(KeyCountStatsService).reset();
    TestBed.inject(ShowdownPlayStatsService).reset();
    TestBed.inject(ShowdownStatsService).reset();
    TestBed.inject(TrueCountStatsService).reset();
    TestBed.inject(BankrollService).reset();
    TestBed.inject(CountDriftService).reset();
    TestBed.inject(MissTallyService).reset();
    TestBed.inject(PracticeHistoryService).reset();
    TestBed.inject(FlowPrefsService).setDailyGoal(20);

    const written = Object.keys(localStorage).sort();
    expect(written).toEqual([...BACKUP_KEYS].sort());
  });

  it('keeps every declared key inside the app prefix', () => {
    for (const key of BACKUP_KEYS) {
      expect(key.startsWith(BACKUP_KEY_PREFIX)).toBe(true);
    }
  });
});
