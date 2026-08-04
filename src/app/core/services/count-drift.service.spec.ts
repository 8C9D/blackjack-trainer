import { TestBed } from '@angular/core/testing';

import {
  COUNT_DRIFT_KEY,
  COUNT_DRIFT_MEMORY,
  CountDriftService,
  coerceDrifts,
} from './count-drift.service';

function service(): CountDriftService {
  return TestBed.inject(CountDriftService);
}

describe('CountDriftService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('records the signed distance from the real count, newest first', () => {
    const drift = service();
    drift.record(3, 5); // two low
    drift.record(6, 5); // one high
    expect(drift.drifts()).toEqual([1, -2]);
  });

  it('keeps an exact count as a zero rather than dropping it', () => {
    const drift = service();
    drift.record(5, 5);
    expect(drift.drifts()).toEqual([0]);
  });

  it('remembers only the most recent rounds', () => {
    const drift = service();
    for (let i = 0; i < COUNT_DRIFT_MEMORY + 5; i++) drift.record(i, 0);
    expect(drift.drifts().length).toBe(COUNT_DRIFT_MEMORY);
    // Newest first: the last round recorded leads.
    expect(drift.drifts()[0]).toBe(COUNT_DRIFT_MEMORY + 4);
  });

  it('persists across a reload', () => {
    service().record(3, 5);
    TestBed.resetTestingModule();
    expect(service().drifts()).toEqual([-2]);
  });

  it('holds the fractional drifts a half-point system produces', () => {
    const drift = service();
    drift.record(2.5, 3);
    expect(drift.drifts()).toEqual([-0.5]);
  });

  it('ignores a drift no trainee could have held', () => {
    const drift = service();
    drift.record(Number.POSITIVE_INFINITY, 0);
    drift.record(10_000, 0);
    expect(drift.drifts()).toEqual([]);
  });

  describe('shape', () => {
    it('stays null until there are enough rounds to lean', () => {
      const drift = service();
      drift.record(1, 0);
      drift.record(1, 0);
      expect(drift.shape()).toBeNull();
    });

    it('counts each side once there are', () => {
      const drift = service();
      for (const [answer, actual] of [
        [1, 3],
        [2, 4],
        [0, 1],
        [5, 4],
        [2, 2],
      ]) {
        drift.record(answer, actual);
      }
      expect(drift.shape()).toEqual({ rounds: 5, low: 3, high: 1, exact: 1 });
    });
  });

  it('clears with a practice-data reset', () => {
    const drift = service();
    drift.record(3, 5);
    drift.reset();
    expect(drift.drifts()).toEqual([]);
    expect(drift.shape()).toBeNull();
  });

  describe('coerceDrifts', () => {
    it('takes an empty list from anything that is not one', () => {
      expect(coerceDrifts(null)).toEqual([]);
      expect(coerceDrifts({ drifts: 'lots' })).toEqual([]);
      expect(coerceDrifts({})).toEqual([]);
    });

    it('drops the entries that are not counts and keeps the rest', () => {
      expect(coerceDrifts({ drifts: [1, 'two', null, -3, Number.NaN, 0] })).toEqual([1, -3, 0]);
    });

    it('caps a payload longer than the memory', () => {
      const long = Array.from({ length: COUNT_DRIFT_MEMORY + 10 }, () => 1);
      expect(coerceDrifts({ drifts: long }).length).toBe(COUNT_DRIFT_MEMORY);
    });

    it('reads what the service wrote', () => {
      service().record(3, 5);
      expect(coerceDrifts(JSON.parse(localStorage.getItem(COUNT_DRIFT_KEY)!))).toEqual([-2]);
    });

    // The backup file moves this payload between the browser and the phone, so
    // the wrapper object is a cross-platform contract: a bare array on one side
    // and `{ drifts: [...] }` on the other reads as an empty history, and the
    // Progress line that names which way your counts lean simply disappears.
    it('writes exactly the shape the iOS store reads', () => {
      service().record(3, 5);
      const stored = JSON.parse(localStorage.getItem(COUNT_DRIFT_KEY)!);
      expect(Object.keys(stored)).toEqual(['drifts']);
      expect(Array.isArray(stored.drifts)).toBe(true);
    });
  });
});
