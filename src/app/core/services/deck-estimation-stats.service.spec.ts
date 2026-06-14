import { TestBed } from '@angular/core/testing';

import {
  DECK_ESTIMATION_STATS_KEY,
  DeckEstimationStatsService,
} from './deck-estimation-stats.service';
import { TRUE_COUNT_STATS_KEY } from './true-count-stats.service';
import { CARD_COUNTING_STATS_KEY } from './card-counting-stats.service';

describe('DeckEstimationStatsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('uses a distinct storage key from the running-count and true-count stores', () => {
    expect(DECK_ESTIMATION_STATS_KEY).not.toBe(TRUE_COUNT_STATS_KEY);
    expect(DECK_ESTIMATION_STATS_KEY).not.toBe(CARD_COUNTING_STATS_KEY);
  });

  it('records attempts and persists under its own key', () => {
    const service = TestBed.inject(DeckEstimationStatsService);
    service.recordAttempt(true);
    service.recordAttempt(false);
    expect(service.stats().attempts).toBe(2);
    expect(service.stats().correct).toBe(1);
    expect(localStorage.getItem(DECK_ESTIMATION_STATS_KEY)).not.toBeNull();
  });
});
