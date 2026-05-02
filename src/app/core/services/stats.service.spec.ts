import { StatsService } from './stats.service';

const STORAGE_KEY = 'blackjack-trainer:stats:v1';

describe('StatsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with all zeros when storage is empty', () => {
    const svc = new StatsService();
    expect(svc.stats()).toEqual({
      attempts: 0,
      correct: 0,
      streak: 0,
      longestStreak: 0,
    });
  });

  it('tracks correct/incorrect attempts and streak', () => {
    const svc = new StatsService();
    svc.recordAttempt(true);
    svc.recordAttempt(true);
    svc.recordAttempt(false);
    svc.recordAttempt(true);
    expect(svc.stats()).toEqual({
      attempts: 4,
      correct: 3,
      streak: 1,
      longestStreak: 2,
    });
  });

  it('persists across instances via localStorage', () => {
    const first = new StatsService();
    first.recordAttempt(true);
    first.recordAttempt(true);

    const second = new StatsService();
    expect(second.stats()).toEqual({
      attempts: 2,
      correct: 2,
      streak: 2,
      longestStreak: 2,
    });
  });

  it('reset() clears in-memory and persisted state', () => {
    const svc = new StatsService();
    svc.recordAttempt(true);
    svc.reset();
    expect(svc.stats()).toEqual({
      attempts: 0,
      correct: 0,
      streak: 0,
      longestStreak: 0,
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ attempts: 0, correct: 0, streak: 0, longestStreak: 0 }),
    );
  });

  it('ignores malformed stored payloads', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const svc = new StatsService();
    expect(svc.stats()).toEqual({
      attempts: 0,
      correct: 0,
      streak: 0,
      longestStreak: 0,
    });
  });

  it('ignores payloads missing required fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts: 5 }));
    const svc = new StatsService();
    expect(svc.stats().attempts).toBe(0);
  });
});
