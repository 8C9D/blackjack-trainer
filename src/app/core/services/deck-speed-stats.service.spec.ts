import { TestBed } from '@angular/core/testing';

import {
  DECK_SPEED_BEST_KEY,
  DECK_SPEED_STATS_KEY,
  DeckSpeedStatsService,
  coerceBest,
} from './deck-speed-stats.service';

describe('DeckSpeedStatsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts with no record', () => {
    expect(TestBed.inject(DeckSpeedStatsService).bestMs()).toBeNull();
  });

  it('records the first correct countdown as the record and returns the one it beat', () => {
    const store = TestBed.inject(DeckSpeedStatsService);
    expect(store.recordRound(true, 32_000)).toBeNull();
    expect(store.bestMs()).toBe(32_000);
    expect(store.recordRound(true, 28_500)).toBe(32_000);
    expect(store.bestMs()).toBe(28_500);
    expect(store.stats().attempts).toBe(2);
    expect(store.stats().correct).toBe(2);
  });

  it('leaves the record alone for a slower round', () => {
    const store = TestBed.inject(DeckSpeedStatsService);
    store.recordRound(true, 25_000);
    store.recordRound(true, 40_000);
    expect(store.bestMs()).toBe(25_000);
  });

  it('will not record a fast round with the wrong count', () => {
    const store = TestBed.inject(DeckSpeedStatsService);
    store.recordRound(true, 30_000);
    store.recordRound(false, 5_000);
    expect(store.bestMs()).toBe(30_000);
    expect(store.stats().correct).toBe(1);
    expect(store.stats().attempts).toBe(2);
  });

  it('persists the record and reloads it in a fresh instance', () => {
    TestBed.inject(DeckSpeedStatsService).recordRound(true, 21_500);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(DeckSpeedStatsService).bestMs()).toBe(21_500);
  });

  it('clears the record along with the accuracy on reset', () => {
    const store = TestBed.inject(DeckSpeedStatsService);
    store.recordRound(true, 21_500);
    store.reset();
    expect(store.bestMs()).toBeNull();
    expect(store.stats().attempts).toBe(0);
    expect(localStorage.getItem(DECK_SPEED_BEST_KEY)).toContain('null');
    expect(localStorage.getItem(DECK_SPEED_STATS_KEY)).toContain('0');
  });

  it('rejects an impossible stored record', () => {
    expect(coerceBest({ bestMs: 0 }).bestMs).toBeNull();
    expect(coerceBest({ bestMs: -5 }).bestMs).toBeNull();
    expect(coerceBest({ bestMs: 'fast' }).bestMs).toBeNull();
    expect(coerceBest(null).bestMs).toBeNull();
    expect(coerceBest({ bestMs: 19_000 }).bestMs).toBe(19_000);
  });
});
