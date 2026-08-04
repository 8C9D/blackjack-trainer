import { DrillSession } from './drill-session';

describe('DrillSession', () => {
  it('starts empty with null accuracy', () => {
    const s = new DrillSession();
    expect(s.attempts()).toBe(0);
    expect(s.streak()).toBe(0);
    expect(s.bestStreak()).toBe(0);
    expect(s.accuracy()).toBeNull();
  });

  it('tracks attempts, streaks, and best streak', () => {
    const s = new DrillSession();
    s.record(true);
    s.record(true);
    s.record(true);
    s.record(false);
    s.record(true);
    expect(s.attempts()).toBe(5);
    expect(s.correct()).toBe(4);
    expect(s.streak()).toBe(1);
    expect(s.bestStreak()).toBe(3);
    expect(s.accuracy()).toBe(80);
  });

  // The round's own figure is the median: one interrupted hand inside twenty
  // would otherwise decide it.
  describe('medianSeconds', () => {
    it('is null until a decision is timed', () => {
      const s = new DrillSession();
      s.record(true);
      expect(s.medianSeconds()).toBeNull();
    });

    it('takes the middle decision of an odd round', () => {
      const s = new DrillSession();
      for (const ms of [1000, 9000, 2000]) s.record(true, ms);
      expect(s.medianSeconds()).toBe(2);
    });

    it('averages the middle pair of an even round', () => {
      const s = new DrillSession();
      for (const ms of [1000, 2000, 3000, 8000]) s.record(true, ms);
      expect(s.medianSeconds()).toBe(2.5);
    });

    it('is not moved by one slow hand the way a mean would be', () => {
      const s = new DrillSession();
      for (const ms of [2000, 2000, 2000, 2000, 50_000]) s.record(true, ms);
      expect(s.medianSeconds()).toBe(2);
    });

    it('times a miss as readily as a correct answer', () => {
      const s = new DrillSession();
      s.record(false, 4000);
      expect(s.medianSeconds()).toBe(4);
    });
  });

  it('resets for a new round', () => {
    const s = new DrillSession();
    s.record(true, 3000);
    s.record(false);
    s.record(true); // correct = 2, streak = 1 before reset
    s.reset();
    expect(s.medianSeconds()).toBeNull();
    expect(s.attempts()).toBe(0);
    expect(s.correct()).toBe(0);
    expect(s.streak()).toBe(0);
    expect(s.bestStreak()).toBe(0);
    expect(s.accuracy()).toBeNull();
    // A reset that failed to zero correct() would show here as accuracy > 100%.
    s.record(true);
    expect(s.accuracy()).toBe(100);
  });
});
