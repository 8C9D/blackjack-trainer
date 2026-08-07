import { TestBed } from '@angular/core/testing';

import { FlowPrefsService } from './flow-prefs.service';
import { MissTallyService, type ScenarioRef } from './miss-tally.service';
import { PracticeHistoryService } from './practice-history.service';

// Suspicion S1 (review/findings.md): day keys drifting by one around DST.
// Chile shifts at *midnight* — the spring-forward makes 00:00–00:59 of the
// transition day nonexistent and the fall-back gives the day before a 25th
// hour — and Lord Howe shifts by 30 minutes. The worry was that the
// `dateKeyDaysAgo` walk (setDate / Calendar day arithmetic) could skip or
// double a key there. It cannot: setDate preserves the local wall clock, and
// V8 maps a nonexistent wall time forward within the same calendar day, so
// the walk is pure calendar arithmetic. These tests pin that behaviour on the
// three surfaces the suspicion named: streak(), last7(), and the miss-tally
// window.
//
// Node reads process.env.TZ live and each vitest worker is its own isolate,
// so the suite sets the zone per test and restores the original afterwards.
// The spec tsconfig has no Node types; vitest runs in Node, where this exists.
declare const process: { env: Record<string, string | undefined> };

describe('day keys across DST transitions (S1)', () => {
  const originalTz = process.env['TZ'];

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env['TZ'];
    } else {
      process.env['TZ'] = originalTz;
    }
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  const GOAL = 3;

  function historyAt(now: () => Date): PracticeHistoryService {
    TestBed.inject(FlowPrefsService).setDailyGoal(GOAL);
    const service = TestBed.inject(PracticeHistoryService);
    service.setNowSource(now);
    return service;
  }

  function meetGoal(service: PracticeHistoryService): void {
    for (let i = 0; i < GOAL; i++) service.recordHand(true);
  }

  // The seven keys ending on `end`, oldest first, by pure calendar arithmetic
  // (Date.UTC), which no DST rule can touch.
  function calendarWeekEnding(y: number, m: number, d: number): string[] {
    const keys: string[] = [];
    for (let back = 6; back >= 0; back--) {
      keys.push(new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10));
    }
    return keys;
  }

  it('keeps streak and last7 aligned across Santiago spring-forward, where midnight does not exist', () => {
    process.env['TZ'] = 'America/Santiago';
    // 2026-09-06: clocks jump 00:00 → 01:00, so 00:15 that day is a
    // nonexistent wall time (it lands at 01:15).
    let current = new Date(2026, 8, 4, 23, 45);
    const s = historyAt(() => current);
    meetGoal(s);
    current = new Date(2026, 8, 5, 23, 45);
    meetGoal(s);
    current = new Date(2026, 8, 6, 0, 15);
    meetGoal(s);

    expect(s.streak(GOAL)).toBe(3);
    expect(s.last7(GOAL).map((dot) => dot.date)).toEqual(calendarWeekEnding(2026, 9, 6));
    expect(s.handsToday()).toBe(GOAL);
  });

  it('keeps streak and last7 aligned across Santiago fall-back, where the prior day runs 25 hours', () => {
    process.env['TZ'] = 'America/Santiago';
    // 2026-04-05: clocks fall back 24:00 → 23:00, so 2026-04-04 has two 23:xx
    // hours; recording at 23:45 lands in the ambiguous hour.
    let current = new Date(2026, 3, 2, 23, 45);
    const s = historyAt(() => current);
    meetGoal(s);
    current = new Date(2026, 3, 3, 23, 45);
    meetGoal(s);
    current = new Date(2026, 3, 4, 23, 45);
    meetGoal(s);
    current = new Date(2026, 3, 5, 0, 15);
    meetGoal(s);

    expect(s.streak(GOAL)).toBe(4);
    expect(s.last7(GOAL).map((dot) => dot.date)).toEqual(calendarWeekEnding(2026, 4, 5));
  });

  it('keeps streak and last7 aligned across the Lord Howe half-hour shift', () => {
    process.env['TZ'] = 'Australia/Lord_Howe';
    // 2026-10-04: clocks jump 02:00 → 02:30 (a 23.5-hour day).
    let current = new Date(2026, 9, 2, 23, 45);
    const s = historyAt(() => current);
    meetGoal(s);
    current = new Date(2026, 9, 3, 23, 45);
    meetGoal(s);
    current = new Date(2026, 9, 4, 0, 15);
    meetGoal(s);

    expect(s.streak(GOAL)).toBe(3);
    expect(s.last7(GOAL).map((dot) => dot.date)).toEqual(calendarWeekEnding(2026, 10, 4));
  });

  it('keeps the miss-tally 7-day window honest across the Santiago transition', () => {
    process.env['TZ'] = 'America/Santiago';
    const inWindow: ScenarioRef = { kind: 'hard', hand: '16', dealer: '10' };
    const outside: ScenarioRef = { kind: 'hard', hand: '15', dealer: '9' };

    let current = new Date(2026, 7, 30, 12, 0); // 7 days before the 6th — just outside
    const tally = TestBed.inject(MissTallyService);
    tally.setNowSource(() => current);
    tally.record('basic-strategy', outside, false);
    current = new Date(2026, 7, 31, 12, 0); // 6 days before — the window's oldest day
    tally.record('basic-strategy', inWindow, false);

    current = new Date(2026, 8, 6, 0, 15);
    const refs = tally.weakSpots('basic-strategy').map((spot) => spot.ref);
    expect(refs).toContainEqual(inWindow);
    expect(refs).not.toContainEqual(outside);
  });
});
