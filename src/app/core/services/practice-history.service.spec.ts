import { TestBed } from '@angular/core/testing';

import {
  PRACTICE_HISTORY_KEY,
  PracticeHistoryService,
  localDateKey,
} from './practice-history.service';

// Fixed local reference date; tests move a mutable `current` around it.
const BASE = new Date(2026, 6, 10, 18, 30); // 2026-07-10 local

function createService(now: () => Date): PracticeHistoryService {
  const service = TestBed.inject(PracticeHistoryService);
  service.setNowSource(now);
  return service;
}

describe('PracticeHistoryService', () => {
  let current: Date;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    current = new Date(BASE);
  });

  describe('localDateKey', () => {
    it('formats a local calendar date with zero padding', () => {
      expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
      expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });
  });

  describe('recordHand / handsToday', () => {
    it('starts at zero and counts hands recorded today', () => {
      const s = createService(() => current);
      expect(s.handsToday()).toBe(0);
      s.recordHand();
      s.recordHand();
      s.recordHand();
      expect(s.handsToday()).toBe(3);
    });

    it('rolls over to a fresh count when the day changes', () => {
      const s = createService(() => current);
      s.recordHand();
      expect(s.handsToday()).toBe(1);
      current = new Date(2026, 6, 11, 9, 0);
      expect(s.handsToday()).toBe(0);
      s.recordHand();
      expect(s.handsToday()).toBe(1);
      expect(s.handsOn('2026-07-10')).toBe(1);
    });

    it('persists across service instances via localStorage', () => {
      const s = createService(() => current);
      s.recordHand();
      s.recordHand();

      const raw = localStorage.getItem(PRACTICE_HISTORY_KEY);
      expect(raw).not.toBeNull();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const reloaded = createService(() => current);
      expect(reloaded.handsToday()).toBe(2);
    });

    it('prunes entries older than the retention window on write', () => {
      // Well outside the 400-day retention window ending at BASE (2026-07-10).
      const old = { date: '2024-01-01', hands: 5 };
      const recent = { date: '2026-07-09', hands: 2 };
      localStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify({ days: [old, recent] }));
      const s = createService(() => current);
      s.recordHand();
      expect(s.days().some((d) => d.date === '2024-01-01')).toBe(false);
      expect(s.handsOn('2026-07-09')).toBe(2);
    });

    it('tolerates a malformed stored payload', () => {
      localStorage.setItem(PRACTICE_HISTORY_KEY, 'not-json{');
      const s = createService(() => current);
      expect(s.handsToday()).toBe(0);
      s.recordHand();
      expect(s.handsToday()).toBe(1);
    });

    it('sanitizes, combines, and orders restored day entries', () => {
      localStorage.setItem(
        PRACTICE_HISTORY_KEY,
        JSON.stringify({
          days: [
            { date: '2026-07-10', hands: 2 },
            { date: '2026-02-30', hands: 99 },
            { date: '2026-07-09', hands: -1 },
            { date: '2026-07-08', hands: 3.5 },
            { date: '2026-07-10', hands: 4 },
            { date: '2026-07-09', hands: 1 },
          ],
        }),
      );

      const s = createService(() => current);

      expect(s.days()).toEqual([
        { date: '2026-07-09', hands: 1 },
        { date: '2026-07-10', hands: 6 },
      ]);
      expect(s.handsToday()).toBe(6);
    });
  });

  describe('streak', () => {
    function seed(daysAgoToHands: Record<number, number>): PracticeHistoryService {
      const days = Object.entries(daysAgoToHands).map(([back, hands]) => {
        const d = new Date(BASE);
        d.setDate(d.getDate() - Number(back));
        return { date: localDateKey(d), hands };
      });
      localStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify({ days }));
      return createService(() => current);
    }

    it('counts consecutive goal-met days ending yesterday when today is unmet', () => {
      // 6 previous days met, today at 14/20 — mirrors the mockup's "6-day streak".
      const s = seed({ 0: 14, 1: 20, 2: 25, 3: 20, 4: 20, 5: 21, 6: 20 });
      expect(s.streak(20)).toBe(6);
    });

    it('includes today once its goal is met', () => {
      const s = seed({ 0: 20, 1: 20, 2: 20 });
      expect(s.streak(20)).toBe(3);
    });

    it('reports a streak longer than the 7-day dot strip and survives a pruning write', () => {
      // 40 consecutive met days exceeds the old 30-day retention cap that used
      // to silently truncate long streaks. recordHand() triggers prune, which
      // must not drop days still inside the streak.
      const longRun: Record<number, number> = {};
      for (let back = 0; back < 40; back++) longRun[back] = 20;
      const s = seed(longRun);
      s.recordHand(); // today 20 -> 21, still met; prunes on write
      expect(s.streak(20)).toBe(40);
    });

    it('breaks on a day below the goal', () => {
      const s = seed({ 1: 20, 2: 3, 3: 20 });
      expect(s.streak(20)).toBe(1);
    });

    it('is zero with no history', () => {
      const s = createService(() => current);
      expect(s.streak(20)).toBe(0);
    });

    it('an unfinished today does not break a run ending yesterday', () => {
      const s = seed({ 0: 1, 1: 20, 2: 20 });
      expect(s.streak(20)).toBe(2);
    });
  });

  describe('last7', () => {
    it('returns seven dots oldest-first with today flagged last', () => {
      const s = createService(() => current);
      s.recordHand();
      const dots = s.last7(1);
      expect(dots).toHaveLength(7);
      expect(dots[6].isToday).toBe(true);
      expect(dots[6].met).toBe(true);
      expect(dots[0].isToday).toBe(false);
      expect(dots[0].date).toBe('2026-07-04');
    });

    it('marks met against the given goal', () => {
      localStorage.setItem(
        PRACTICE_HISTORY_KEY,
        JSON.stringify({ days: [{ date: '2026-07-09', hands: 19 }] }),
      );
      const s = createService(() => current);
      const yesterday = s.last7(20)[5];
      expect(yesterday.date).toBe('2026-07-09');
      expect(yesterday.hands).toBe(19);
      expect(yesterday.met).toBe(false);
      expect(s.last7(19)[5].met).toBe(true);
    });
  });
  describe('reset', () => {
    it('empties the history and the stored payload', () => {
      const s = createService(() => current);
      s.recordHand();
      s.recordHand();
      expect(s.handsToday()).toBe(2);

      s.reset();

      expect(s.handsToday()).toBe(0);
      expect(s.days()).toEqual([]);
      expect(s.streak(1)).toBe(0);
      expect(localStorage.getItem(PRACTICE_HISTORY_KEY)).toBe(JSON.stringify({ days: [] }));
    });
  });
});
