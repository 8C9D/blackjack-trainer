import { TestBed } from '@angular/core/testing';

import {
  DEFAULT_FLOW_PREFS,
  FLOW_PREFS_KEY,
  FlowPrefsService,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  clampGoal,
  mergePrefs,
} from './flow-prefs.service';

describe('FlowPrefsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('starts from defaults with no stored payload', () => {
    const s = TestBed.inject(FlowPrefsService);
    expect(s.prefs()).toEqual(DEFAULT_FLOW_PREFS);
  });

  it('persists updates and reloads them in a fresh instance', () => {
    const s = TestBed.inject(FlowPrefsService);
    s.setLastTrainer('deviations');
    s.setDailyGoal(30);
    s.setRuleSet('H17');
    s.setTheme('light');
    s.setOptions({ doubleAfterSplit: true, lateSurrender: true });
    s.updateDeviations({ practiceMode: 'deviation-only', manualTrueCount: 4 });
    s.updateCounting({ systemId: 'ko', numberOfCards: 40 });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const reloaded = TestBed.inject(FlowPrefsService);
    const p = reloaded.prefs();
    expect(p.lastTrainer).toBe('deviations');
    expect(p.dailyGoal).toBe(30);
    expect(p.ruleSet).toBe('H17');
    expect(p.theme).toBe('light');
    expect(p.options).toEqual({ doubleAfterSplit: true, lateSurrender: true });
    expect(p.deviations.practiceMode).toBe('deviation-only');
    expect(p.deviations.manualTrueCount).toBe(4);
    expect(p.deviations.trueCountSource).toBe('random');
    expect(p.counting.systemId).toBe('ko');
    expect(p.counting.numberOfCards).toBe(40);
    expect(p.counting.penetration).toBe(DEFAULT_FLOW_PREFS.counting.penetration);
  });

  it('clamps the daily goal into its valid range', () => {
    const s = TestBed.inject(FlowPrefsService);
    s.setDailyGoal(0);
    expect(s.prefs().dailyGoal).toBe(MIN_DAILY_GOAL);
    s.setDailyGoal(9999);
    expect(s.prefs().dailyGoal).toBe(MAX_DAILY_GOAL);
    s.setDailyGoal(Number.NaN);
    expect(s.prefs().dailyGoal).toBe(DEFAULT_FLOW_PREFS.dailyGoal);
  });

  it('falls back to defaults on a malformed payload', () => {
    localStorage.setItem(FLOW_PREFS_KEY, '{{nope');
    const s = TestBed.inject(FlowPrefsService);
    expect(s.prefs()).toEqual(DEFAULT_FLOW_PREFS);
  });

  describe('mergePrefs', () => {
    it('merges a partial payload field-by-field over defaults', () => {
      const merged = mergePrefs({ dailyGoal: 15, counting: { mode: 'true-count' } });
      expect(merged.dailyGoal).toBe(15);
      expect(merged.counting.mode).toBe('true-count');
      expect(merged.counting.systemId).toBe(DEFAULT_FLOW_PREFS.counting.systemId);
      expect(merged.lastTrainer).toBe(DEFAULT_FLOW_PREFS.lastTrainer);
    });

    it('rejects out-of-vocabulary enum values per field', () => {
      const merged = mergePrefs({
        lastTrainer: 'poker',
        ruleSet: 'X17',
        deviations: { practiceMode: 'chaos', manualTrueCount: 2.5 },
      });
      expect(merged.lastTrainer).toBe(DEFAULT_FLOW_PREFS.lastTrainer);
      expect(merged.ruleSet).toBe(DEFAULT_FLOW_PREFS.ruleSet);
      expect(merged.deviations.practiceMode).toBe(DEFAULT_FLOW_PREFS.deviations.practiceMode);
      expect(merged.deviations.manualTrueCount).toBe(0);
    });

    it('returns defaults for a non-object payload', () => {
      expect(mergePrefs(null)).toEqual(DEFAULT_FLOW_PREFS);
      expect(mergePrefs('x')).toEqual(DEFAULT_FLOW_PREFS);
    });

    it('keeps only a known theme, defaulting to system', () => {
      expect(mergePrefs({ theme: 'light' }).theme).toBe('light');
      expect(mergePrefs({ theme: 'dark' }).theme).toBe('dark');
      expect(mergePrefs({ theme: 'sepia' }).theme).toBe('system');
      // Prefs written before the theme existed must not lose it.
      expect(mergePrefs({ dailyGoal: 15 }).theme).toBe('system');
    });

    it('clamps the showdown box count into its supported range', () => {
      expect(mergePrefs({ counting: { showdownSpots: 3 } }).counting.showdownSpots).toBe(3);
      expect(mergePrefs({ counting: { showdownSpots: 9 } }).counting.showdownSpots).toBe(3);
      expect(mergePrefs({ counting: { showdownSpots: 0 } }).counting.showdownSpots).toBe(1);
      // Prefs written before the setting existed fall back to a single box.
      expect(mergePrefs({ dailyGoal: 15 }).counting.showdownSpots).toBe(1);
    });

    it('keeps showdown bet sizing off unless it was explicitly turned on', () => {
      expect(mergePrefs({ counting: { showdownBetting: true } }).counting.showdownBetting).toBe(
        true,
      );
      expect(mergePrefs({ counting: { showdownBetting: 'yes' } }).counting.showdownBetting).toBe(
        false,
      );
      // Prefs written before the setting existed stay on the pure hand tally.
      expect(mergePrefs({ dailyGoal: 15 }).counting.showdownBetting).toBe(false);
    });

    it('falls back from an unknown counting-system id', () => {
      expect(mergePrefs({ counting: { systemId: 'missing-system' } }).counting.systemId).toBe(
        DEFAULT_FLOW_PREFS.counting.systemId,
      );
    });

    it('coerces an unbalanced system out of true-count mode', () => {
      const counting = mergePrefs({
        counting: { systemId: 'ko', mode: 'true-count', trueCountSource: 'classic' },
      }).counting;
      expect(counting.systemId).toBe('ko');
      expect(counting.mode).toBe('running-count');
    });

    it('keeps key-count mode for KO (the system with a published schedule)', () => {
      const counting = mergePrefs({
        counting: { systemId: 'ko', mode: 'key-count' },
      }).counting;
      expect(counting.systemId).toBe('ko');
      expect(counting.mode).toBe('key-count');
    });

    it('coerces key-count mode away from systems without a schedule', () => {
      for (const systemId of ['hi-lo', 'red-seven']) {
        const counting = mergePrefs({ counting: { systemId, mode: 'key-count' } }).counting;
        expect(counting.systemId).toBe(systemId);
        expect(counting.mode).toBe('running-count');
      }
    });

    it('rejects a key-count round that would consume the whole shoe', () => {
      const counting = mergePrefs({
        counting: {
          systemId: 'ko',
          mode: 'key-count',
          numberOfDecks: 1,
          numberOfCards: 52,
        },
      }).counting;
      expect(counting.mode).toBe('key-count');
      expect(counting.numberOfCards).toBe(DEFAULT_FLOW_PREFS.counting.numberOfCards);
    });

    it('falls back field-by-field from unsupported counting numbers', () => {
      const counting = mergePrefs({
        counting: {
          numberOfCards: 0,
          millisecondsBetweenCards: 99,
          decksRemaining: 0.75,
          numberOfDecks: 3,
          penetration: 0.95,
        },
      }).counting;
      expect(counting.numberOfCards).toBe(DEFAULT_FLOW_PREFS.counting.numberOfCards);
      expect(counting.millisecondsBetweenCards).toBe(
        DEFAULT_FLOW_PREFS.counting.millisecondsBetweenCards,
      );
      expect(counting.decksRemaining).toBe(DEFAULT_FLOW_PREFS.counting.decksRemaining);
      expect(counting.numberOfDecks).toBe(DEFAULT_FLOW_PREFS.counting.numberOfDecks);
      expect(counting.penetration).toBe(DEFAULT_FLOW_PREFS.counting.penetration);
    });

    it('rejects a live true-count round that would consume the whole shoe', () => {
      const counting = mergePrefs({
        counting: {
          systemId: 'hi-lo',
          mode: 'true-count',
          trueCountSource: 'live-shoe',
          numberOfDecks: 1,
          numberOfCards: 52,
        },
      }).counting;
      expect(counting.numberOfDecks).toBe(1);
      expect(counting.numberOfCards).toBe(DEFAULT_FLOW_PREFS.counting.numberOfCards);
    });

    it('keeps supported counting preferences unchanged', () => {
      const counting = mergePrefs({
        counting: {
          systemId: 'omega-ii',
          mode: 'true-count',
          numberOfCards: 40,
          millisecondsBetweenCards: 250,
          decksRemaining: 2.5,
          trueCountSource: 'live-shoe',
          numberOfDecks: 2,
          penetration: 0.8,
          showdownSpots: 2,
          showdownBetting: true,
        },
      }).counting;
      expect(counting).toEqual({
        systemId: 'omega-ii',
        mode: 'true-count',
        numberOfCards: 40,
        millisecondsBetweenCards: 250,
        decksRemaining: 2.5,
        trueCountSource: 'live-shoe',
        numberOfDecks: 2,
        penetration: 0.8,
        showdownSpots: 2,
        showdownBetting: true,
      });
    });
  });

  describe('clampGoal', () => {
    it('rounds and clamps', () => {
      expect(clampGoal(19.6)).toBe(20);
      expect(clampGoal(-3)).toBe(MIN_DAILY_GOAL);
      expect(clampGoal(Infinity)).toBe(DEFAULT_FLOW_PREFS.dailyGoal);
    });
  });
});
