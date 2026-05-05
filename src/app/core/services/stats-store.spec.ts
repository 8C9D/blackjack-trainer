import {
  BASIC_STRATEGY_STATS_KEY,
  BasicStrategyStatsService,
} from './basic-strategy-stats.service';
import {
  CARD_COUNTING_STATS_KEY,
  CardCountingStatsService,
} from './card-counting-stats.service';
import { StatsStore } from './stats-store';

const TEST_KEY = 'test-stats-store';

describe('StatsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with all zeros when storage is empty', () => {
    const store = new StatsStore(TEST_KEY);
    expect(store.stats()).toEqual({
      attempts: 0,
      correct: 0,
      streak: 0,
      longestStreak: 0,
    });
  });

  it('tracks correct/incorrect attempts and streak', () => {
    const store = new StatsStore(TEST_KEY);
    store.recordAttempt(true);
    store.recordAttempt(true);
    store.recordAttempt(false);
    store.recordAttempt(true);
    expect(store.stats()).toEqual({
      attempts: 4,
      correct: 3,
      streak: 1,
      longestStreak: 2,
    });
  });

  it('persists across instances via localStorage', () => {
    const first = new StatsStore(TEST_KEY);
    first.recordAttempt(true);
    first.recordAttempt(true);

    const second = new StatsStore(TEST_KEY);
    expect(second.stats()).toEqual({
      attempts: 2,
      correct: 2,
      streak: 2,
      longestStreak: 2,
    });
  });

  it('reset() clears in-memory and persisted state', () => {
    const store = new StatsStore(TEST_KEY);
    store.recordAttempt(true);
    store.reset();
    expect(store.stats()).toEqual({
      attempts: 0,
      correct: 0,
      streak: 0,
      longestStreak: 0,
    });
    expect(localStorage.getItem(TEST_KEY)).toBe(
      JSON.stringify({ attempts: 0, correct: 0, streak: 0, longestStreak: 0 }),
    );
  });

  it('ignores malformed stored payloads', () => {
    localStorage.setItem(TEST_KEY, '{not json');
    const store = new StatsStore(TEST_KEY);
    expect(store.stats()).toEqual({
      attempts: 0,
      correct: 0,
      streak: 0,
      longestStreak: 0,
    });
  });

  it('ignores payloads missing required fields', () => {
    localStorage.setItem(TEST_KEY, JSON.stringify({ attempts: 5 }));
    const store = new StatsStore(TEST_KEY);
    expect(store.stats().attempts).toBe(0);
  });

  it('isolates state between different keys', () => {
    const a = new StatsStore('key-a');
    const b = new StatsStore('key-b');
    a.recordAttempt(true);
    a.recordAttempt(true);
    b.recordAttempt(false);
    expect(a.stats()).toEqual({ attempts: 2, correct: 2, streak: 2, longestStreak: 2 });
    expect(b.stats()).toEqual({ attempts: 1, correct: 0, streak: 0, longestStreak: 0 });
  });
});

describe('Stats service subclasses', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('BasicStrategyStatsService persists under its dedicated key', () => {
    const svc = new BasicStrategyStatsService();
    svc.recordAttempt(true);
    expect(localStorage.getItem(BASIC_STRATEGY_STATS_KEY)).not.toBeNull();
    expect(localStorage.getItem(CARD_COUNTING_STATS_KEY)).toBeNull();
  });

  it('CardCountingStatsService persists under its dedicated key', () => {
    const svc = new CardCountingStatsService();
    svc.recordAttempt(false);
    expect(localStorage.getItem(CARD_COUNTING_STATS_KEY)).not.toBeNull();
    expect(localStorage.getItem(BASIC_STRATEGY_STATS_KEY)).toBeNull();
  });

  it('two services hold independent state', () => {
    const a = new BasicStrategyStatsService();
    const b = new CardCountingStatsService();
    a.recordAttempt(true);
    a.recordAttempt(true);
    a.recordAttempt(true);
    b.recordAttempt(false);
    expect(a.stats().attempts).toBe(3);
    expect(a.stats().correct).toBe(3);
    expect(b.stats().attempts).toBe(1);
    expect(b.stats().correct).toBe(0);
  });
});
