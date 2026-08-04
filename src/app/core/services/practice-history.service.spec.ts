import { TestBed } from '@angular/core/testing';

import {
  MAX_HISTORY_DAYS,
  MAX_TIMED_DECISION_MS,
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
      s.recordHand(true);
      s.recordHand(true);
      s.recordHand(true);
      expect(s.handsToday()).toBe(3);
    });

    it('rolls over to a fresh count when the day changes', () => {
      const s = createService(() => current);
      s.recordHand(true);
      expect(s.handsToday()).toBe(1);
      current = new Date(2026, 6, 11, 9, 0);
      expect(s.handsToday()).toBe(0);
      s.recordHand(true);
      expect(s.handsToday()).toBe(1);
      expect(s.handsOn('2026-07-10')).toBe(1);
    });

    it('persists across service instances via localStorage', () => {
      const s = createService(() => current);
      s.recordHand(true);
      s.recordHand(true);

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
      s.recordHand(true);
      expect(s.days().some((d) => d.date === '2024-01-01')).toBe(false);
      expect(s.handsOn('2026-07-09')).toBe(2);
    });

    it('tolerates a malformed stored payload', () => {
      localStorage.setItem(PRACTICE_HISTORY_KEY, 'not-json{');
      const s = createService(() => current);
      expect(s.handsToday()).toBe(0);
      s.recordHand(true);
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
        { date: '2026-07-09', hands: 1, graded: 0, correct: 0, timed: 0, millis: 0 },
        { date: '2026-07-10', hands: 6, graded: 0, correct: 0, timed: 0, millis: 0 },
      ]);
      expect(s.handsToday()).toBe(6);
    });
  });

  // Volume was all the history ever kept, so the app could say how much was
  // practised and never how well.
  describe('accuracyLast7', () => {
    it('is null before anything is graded', () => {
      const s = createService(() => current);
      expect(s.accuracyLast7()).toBeNull();
    });

    it('is the correct share of the week just practised', () => {
      const s = createService(() => current);
      s.recordHand(true);
      s.recordHand(true);
      s.recordHand(false);
      expect(s.accuracyLast7()).toBe(67);
    });

    it('reads the week before it separately', () => {
      const s = createService(() => current);
      s.recordHand(true);
      // Eight days on: the earlier rep has fallen out of this week into the last.
      current = new Date(2026, 6, 18, 18, 30);
      s.recordHand(false);
      expect(s.accuracyLast7()).toBe(0);
      expect(s.accuracyLast7(1)).toBe(100);
    });

    // A day recorded by a build that only counted volume has no verdicts at
    // all. Reading its hands as ungraded reports it as unmeasured; dividing by
    // them would report a week of real practice as 0% correct.
    it('leaves a day written before grading unmeasured', () => {
      localStorage.setItem(
        PRACTICE_HISTORY_KEY,
        JSON.stringify({ days: [{ date: '2026-07-09', hands: 20 }] }),
      );
      const s = createService(() => current);
      expect(s.accuracyLast7()).toBeNull();
      expect(s.last7(20)[5].accuracy).toBeNull();
      // A rep recorded today is measured on its own, not against those 20.
      s.recordHand(true);
      expect(s.accuracyLast7()).toBe(100);
    });

    it('carries each day of the strip its own accuracy', () => {
      const s = createService(() => current);
      s.recordHand(true);
      s.recordHand(false);
      const today = s.last7(1)[6];
      expect(today.isToday).toBe(true);
      expect(today.accuracy).toBe(50);
      expect(s.last7(1)[0].accuracy).toBeNull();
    });

    // The file is user-supplied (a restored backup can be hand-edited), and an
    // accuracy over 100% would be nonsense on the screen.
    it('clamps a stored day to correct ≤ graded ≤ hands', () => {
      localStorage.setItem(
        PRACTICE_HISTORY_KEY,
        JSON.stringify({ days: [{ date: '2026-07-10', hands: 4, graded: 9, correct: 9 }] }),
      );
      const s = createService(() => current);
      expect(s.days()[0]).toEqual({
        date: '2026-07-10',
        hands: 4,
        graded: 4,
        correct: 4,
        timed: 0,
        millis: 0,
      });
      expect(s.accuracyLast7()).toBe(100);
    });
  });

  // Accuracy says whether the practice is working; the pace says whether it
  // would survive a table, where the dealer is waiting.
  describe('paceLast7', () => {
    it('is null before anything is timed', () => {
      const s = createService(() => current);
      s.recordHand(true);
      expect(s.paceLast7()).toBeNull();
    });

    it('averages the timed decisions to a tenth of a second', () => {
      const s = createService(() => current);
      s.recordHand(true, 2000);
      s.recordHand(false, 3000);
      s.recordHand(true, 4000);
      expect(s.paceLast7()).toBe(3);
    });

    // A hand you walked away from is not a hand you were slow on.
    it('ignores a reading past the cap, or one the clock ran backwards on', () => {
      const s = createService(() => current);
      s.recordHand(true, 2000);
      s.recordHand(true, MAX_TIMED_DECISION_MS + 1);
      s.recordHand(true, -5);
      s.recordHand(true, 0);
      expect(s.paceLast7()).toBe(2);
      expect(s.days()[0].timed).toBe(1);
      expect(s.days()[0].graded).toBe(4);
    });

    it('separates the weeks, so last week can be compared with this one', () => {
      const s = createService(() => current);
      const lastWeek = new Date(BASE);
      lastWeek.setDate(lastWeek.getDate() - 8);
      current = lastWeek;
      s.recordHand(true, 5000);
      current = BASE;
      s.recordHand(true, 2500);
      expect(s.paceLast7()).toBe(2.5);
      expect(s.paceLast7(1)).toBe(5);
    });

    it('reads a day written before decisions were timed as untimed, not instant', () => {
      localStorage.setItem(
        PRACTICE_HISTORY_KEY,
        JSON.stringify({ days: [{ date: localDateKey(BASE), hands: 9, graded: 9, correct: 9 }] }),
      );
      const s = createService(() => current);
      expect(s.paceLast7()).toBeNull();
    });

    it('clamps a stored day to a pace the cap allows', () => {
      localStorage.setItem(
        PRACTICE_HISTORY_KEY,
        JSON.stringify({
          days: [
            {
              date: localDateKey(BASE),
              hands: 2,
              graded: 2,
              correct: 2,
              timed: 9,
              millis: 999_999_999,
            },
          ],
        }),
      );
      const s = createService(() => current);
      const day = s.days()[0];
      expect(day.timed).toBe(2);
      expect(day.millis).toBe(2 * MAX_TIMED_DECISION_MS);
      expect(s.paceLast7()).toBe(MAX_TIMED_DECISION_MS / 1000);
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
      s.recordHand(true); // today 20 -> 21, still met; prunes on write
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

    // The walk back has no data to stop it when every day clears the goal, and a
    // goal of zero is cleared by every day there has ever been — including the
    // ones with no entry, which read as 0 hands. Prefs clamp the goal to at
    // least 1, so this is the backstop, not a live path: without it the loop
    // never returns and the screen reading the streak hangs.
    it('terminates on a goal no day can fail', () => {
      const s = seed({ 0: 20, 1: 20 });
      expect(s.streak(0)).toBe(MAX_HISTORY_DAYS);
      expect(s.streak(-1)).toBe(MAX_HISTORY_DAYS);
    });
  });

  describe('last7', () => {
    it('returns seven dots oldest-first with today flagged last', () => {
      const s = createService(() => current);
      s.recordHand(true);
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
      s.recordHand(true);
      s.recordHand(true);
      expect(s.handsToday()).toBe(2);

      s.reset();

      expect(s.handsToday()).toBe(0);
      expect(s.days()).toEqual([]);
      expect(s.streak(1)).toBe(0);
      expect(localStorage.getItem(PRACTICE_HISTORY_KEY)).toBe(JSON.stringify({ days: [] }));
    });
  });
});
