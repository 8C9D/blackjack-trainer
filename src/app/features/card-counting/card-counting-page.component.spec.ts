import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type {
  CountingDrillResult,
  CountingDrillSettings,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { CardCountingPageComponent } from './card-counting-page.component';

// The page component exposes its signals and methods as `protected` for
// TypeScript's sake; at runtime they're just properties. This mirror lets
// the tests read/poke them without scattering `as any` casts.
type StatsLike = {
  stats(): { attempts: number; correct: number; streak: number; longestStreak: number };
  reset(): void;
};

type Internals = {
  state(): 'idle' | 'streaming' | 'answering' | 'feedback';
  settings(): CountingDrillSettings;
  cards(): readonly unknown[];
  currentIndex(): number;
  result(): CountingDrillResult | null;
  system(): CountingSystem;
  systems: readonly CountingSystem[];
  trueCountAvailable(): boolean;
  onSystemChange(id: string): void;
  isValid(): boolean;
  isDrillActive(): boolean;
  statsService: StatsLike;
  trueCountStatsService: StatsLike;
  activeStats(): { attempts: number; correct: number; streak: number; longestStreak: number };
  start(): void;
  onAnswer(n: number): void;
  updateSetting<K extends keyof CountingDrillSettings>(
    key: K,
    value: CountingDrillSettings[K],
  ): void;
  resetActiveStats(): void;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

function asInternals(c: CardCountingPageComponent): Internals {
  return c as unknown as Internals;
}

function createPage(): {
  fixture: ComponentFixture<CardCountingPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(CardCountingPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

describe('CardCountingPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [CardCountingPageComponent],
      providers: [provideRouter([])],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('state machine', () => {
    it('starts in idle with no cards and no result', () => {
      const { c } = createPage();
      expect(c.state()).toBe('idle');
      expect(c.cards().length).toBe(0);
      expect(c.result()).toBeNull();
    });

    it('idle → streaming on start()', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 3);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      expect(c.state()).toBe('streaming');
      expect(c.cards().length).toBe(3);
      expect(c.currentIndex()).toBe(0);
    });

    it('advances currentIndex on each tick while streaming', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 3);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      expect(c.currentIndex()).toBe(0);
      vi.advanceTimersByTime(100);
      expect(c.currentIndex()).toBe(1);
      vi.advanceTimersByTime(100);
      expect(c.currentIndex()).toBe(2);
      expect(c.state()).toBe('streaming');
    });

    it('streaming → answering after the last card has held for ms', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 3);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      // First card visible from t=0..100, second 100..200, third 200..300.
      vi.advanceTimersByTime(299);
      expect(c.state()).toBe('streaming');
      vi.advanceTimersByTime(1);
      expect(c.state()).toBe('answering');
    });

    it('answering → feedback on onAnswer()', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 2);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(200);
      expect(c.state()).toBe('answering');
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      expect(c.result()).not.toBeNull();
    });

    it('feedback → streaming on start() (Run again)', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 2);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(200);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      c.start();
      expect(c.state()).toBe('streaming');
      expect(c.currentIndex()).toBe(0);
      expect(c.result()).toBeNull();
    });

    it('start() is a no-op while streaming', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 3);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      const indexBefore = c.currentIndex();
      const cardsRef = c.cards();
      c.start();
      expect(c.state()).toBe('streaming');
      expect(c.cards()).toBe(cardsRef);
      expect(c.currentIndex()).toBe(indexBefore);
    });

    it('start() is a no-op while answering', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      expect(c.state()).toBe('answering');
      const cardsRef = c.cards();
      c.start();
      expect(c.state()).toBe('answering');
      expect(c.cards()).toBe(cardsRef);
    });

    it('onAnswer is ignored when state is idle', () => {
      const { c } = createPage();
      c.onAnswer(5);
      expect(c.state()).toBe('idle');
      expect(c.result()).toBeNull();
    });

    it('onAnswer is ignored when state is streaming', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 5);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      expect(c.state()).toBe('streaming');
      c.onAnswer(5);
      expect(c.state()).toBe('streaming');
      expect(c.result()).toBeNull();
    });

    it('onAnswer is ignored when state is feedback', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      const firstResult = c.result();
      c.onAnswer(999);
      expect(c.result()).toBe(firstResult);
    });

    it('clears the pending timeout on destroy', () => {
      const { fixture, c } = createPage();
      c.updateSetting('numberOfCards', 10);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      expect(c.timeoutId).not.toBeNull();
      fixture.destroy();
      expect(c.timeoutId).toBeNull();
    });

    it('does not start when settings are invalid', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 0);
      c.start();
      expect(c.state()).toBe('idle');
      expect(c.cards().length).toBe(0);
    });
  });

  describe('integration with DOM and stats', () => {
    it('Start button is rendered disabled when settings are invalid', () => {
      const { fixture, c } = createPage();
      c.updateSetting('numberOfCards', 0);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '.page__start-button',
      ) as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn!.disabled).toBe(true);
    });

    it('Start button is enabled when settings are valid', () => {
      const { fixture, c } = createPage();
      c.updateSetting('numberOfCards', 5);
      c.updateSetting('millisecondsBetweenCards', 100);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '.page__start-button',
      ) as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn!.disabled).toBe(false);
    });

    it('Start button disappears once a drill begins', () => {
      const { fixture, c } = createPage();
      c.updateSetting('numberOfCards', 3);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.page__start-button')).toBeNull();
    });

    it('settings fieldset is disabled while a drill is active', () => {
      const { fixture, c } = createPage();
      c.updateSetting('numberOfCards', 3);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      fixture.detectChanges();
      const fieldset = fixture.nativeElement.querySelector(
        'fieldset.settings',
      ) as HTMLFieldSetElement | null;
      expect(fieldset).not.toBeNull();
      expect(fieldset!.disabled).toBe(true);
    });

    it('records exactly one attempt when an answer is submitted', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      expect(c.statsService.stats().attempts).toBe(0);
      c.onAnswer(0);
      expect(c.statsService.stats().attempts).toBe(1);
    });

    it('reset() on the card-counting stats clears all counters', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.statsService.stats().attempts).toBe(1);
      c.statsService.reset();
      expect(c.statsService.stats()).toEqual({
        attempts: 0,
        correct: 0,
        streak: 0,
        longestStreak: 0,
      });
    });
  });

  describe('mode and decks-remaining wiring', () => {
    it('defaults to running-count mode', () => {
      const { c } = createPage();
      expect(c.settings().mode).toBe('running-count');
    });

    it("updateSetting('mode', ...) switches the mode signal", () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      expect(c.settings().mode).toBe('true-count');
      c.updateSetting('mode', 'running-count');
      expect(c.settings().mode).toBe('running-count');
    });

    it("updateSetting('decksRemaining', ...) updates the decks-remaining signal", () => {
      const { c } = createPage();
      c.updateSetting('decksRemaining', 2);
      expect(c.settings().decksRemaining).toBe(2);
    });
  });

  describe('counting system selection', () => {
    it('defaults to Hi-Lo with true count available', () => {
      const { c } = createPage();
      expect(c.system().id).toBe('hi-lo');
      expect(c.trueCountAvailable()).toBe(true);
    });

    it('exposes Hi-Lo, KO, and Omega II as the selectable systems', () => {
      const { c } = createPage();
      expect(c.systems.map((s) => s.id)).toEqual(['hi-lo', 'ko', 'omega-ii']);
    });

    it('onSystemChange switches the active system', () => {
      const { c } = createPage();
      c.onSystemChange('ko');
      expect(c.system().id).toBe('ko');
      expect(c.system().name).toBe('KO');
    });

    it('ignores an unknown system id', () => {
      const { c } = createPage();
      c.onSystemChange('does-not-exist');
      expect(c.system().id).toBe('hi-lo');
    });

    it('true count is unavailable for the unbalanced KO system', () => {
      const { c } = createPage();
      c.onSystemChange('ko');
      expect(c.trueCountAvailable()).toBe(false);
    });

    it('coerces true-count mode back to running-count when KO is selected', () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      expect(c.settings().mode).toBe('true-count');
      c.onSystemChange('ko');
      expect(c.settings().mode).toBe('running-count');
    });

    it('leaves running-count mode alone when KO is selected', () => {
      const { c } = createPage();
      expect(c.settings().mode).toBe('running-count');
      c.onSystemChange('ko');
      expect(c.settings().mode).toBe('running-count');
    });

    it('switching back to Hi-Lo restores true-count availability', () => {
      const { c } = createPage();
      c.onSystemChange('ko');
      expect(c.trueCountAvailable()).toBe(false);
      c.onSystemChange('hi-lo');
      expect(c.trueCountAvailable()).toBe(true);
    });

    it('selecting Omega II switches system and keeps true count available (balanced)', () => {
      const { c } = createPage();
      c.onSystemChange('omega-ii');
      expect(c.system().id).toBe('omega-ii');
      expect(c.system().name).toBe('Omega II');
      expect(c.trueCountAvailable()).toBe(true);
    });
  });

  describe('answer evaluation by mode', () => {
    it('running-count mode evaluates as a running-count result', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 2);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(200);
      c.onAnswer(0);
      const r = c.result();
      expect(r).not.toBeNull();
      expect(r!.mode).toBe('running-count');
    });

    it('true-count mode evaluates as a true-count result', () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      c.updateSetting('decksRemaining', 2);
      c.updateSetting('numberOfCards', 2);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(200);
      c.onAnswer(0);
      const r = c.result();
      expect(r).not.toBeNull();
      expect(r!.mode).toBe('true-count');
      if (r && r.mode === 'true-count') {
        expect(r.decksRemaining).toBe(2);
      }
    });
  });

  describe('stats routing by mode', () => {
    it('records running-count attempts on CardCountingStatsService only', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.trueCountStatsService.stats().attempts).toBe(0);
    });

    it('records true-count attempts on TrueCountStatsService only', () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      c.updateSetting('decksRemaining', 2);
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.trueCountStatsService.stats().attempts).toBe(1);
      expect(c.statsService.stats().attempts).toBe(0);
    });

    it('activeStats() reflects the currently selected mode', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      // Record one RC attempt.
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.activeStats().attempts).toBe(1);
      // Switching to true-count should swap the visible stats.
      c.updateSetting('mode', 'true-count');
      expect(c.activeStats().attempts).toBe(0);
      // And switching back should bring RC's stats back.
      c.updateSetting('mode', 'running-count');
      expect(c.activeStats().attempts).toBe(1);
    });

    it('resetActiveStats() only clears the active mode (RC)', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      // Record one RC attempt.
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      // Record one TC attempt.
      c.updateSetting('mode', 'true-count');
      c.updateSetting('decksRemaining', 2);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.trueCountStatsService.stats().attempts).toBe(1);
      // Back to RC and reset.
      c.updateSetting('mode', 'running-count');
      c.resetActiveStats();
      expect(c.statsService.stats().attempts).toBe(0);
      expect(c.trueCountStatsService.stats().attempts).toBe(1);
    });

    it('resetActiveStats() only clears the active mode (TC)', () => {
      const { c } = createPage();
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      // Record one RC attempt, then one TC.
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      c.updateSetting('mode', 'true-count');
      c.updateSetting('decksRemaining', 2);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      // While in TC mode, reset only TC.
      c.resetActiveStats();
      expect(c.trueCountStatsService.stats().attempts).toBe(0);
      expect(c.statsService.stats().attempts).toBe(1);
    });

    it('does not start when true-count settings are invalid (decksRemaining=0)', () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      c.updateSetting('decksRemaining', 0);
      c.start();
      expect(c.state()).toBe('idle');
    });
  });
});
