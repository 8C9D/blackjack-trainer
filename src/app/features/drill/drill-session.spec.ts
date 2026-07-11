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

  it('resets for a new round', () => {
    const s = new DrillSession();
    s.record(true);
    s.record(false);
    s.reset();
    expect(s.attempts()).toBe(0);
    expect(s.bestStreak()).toBe(0);
    expect(s.accuracy()).toBeNull();
  });
});
