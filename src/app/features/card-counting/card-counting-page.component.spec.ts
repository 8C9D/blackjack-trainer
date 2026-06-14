import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Card } from '../../core/models/card.model';
import type {
  CountingDrillResult,
  CountingDrillSettings,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { HI_LO } from '../../data/counting-systems';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { CardCountingPageComponent } from './card-counting-page.component';

// The page component exposes its signals and methods as `protected` for
// TypeScript's sake; at runtime they're just properties. This mirror lets
// the tests read/poke them without scattering `as any` casts.
type StatsLike = {
  stats(): { attempts: number; correct: number; streak: number; longestStreak: number };
  reset(): void;
};

type Internals = {
  state(): 'idle' | 'streaming' | 'estimating' | 'answering' | 'feedback';
  settings(): CountingDrillSettings;
  cards(): readonly Card[];
  currentIndex(): number;
  result(): CountingDrillResult | null;
  system(): CountingSystem;
  systems: readonly CountingSystem[];
  trueCountAvailable(): boolean;
  fractionalAnswers(): boolean;
  liveShoeTrueCount(): boolean;
  onSystemChange(id: string): void;
  isValid(): boolean;
  isDrillActive(): boolean;
  statsService: StatsLike;
  trueCountStatsService: StatsLike;
  deckEstimationStatsService: StatsLike;
  activeStats(): { attempts: number; correct: number; streak: number; longestStreak: number };
  start(): void;
  onEstimate(n: number): void;
  onAnswer(n: number): void;
  updateSetting<K extends keyof CountingDrillSettings>(
    key: K,
    value: CountingDrillSettings[K],
  ): void;
  resetActiveStats(): void;
  shoeRunningCount(): number;
  actualDecksRemaining(): number;
  deckEstimate(): number | null;
  liveDecksRemaining(): number;
  reshuffleNotice(): boolean;
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

    it('exposes Hi-Lo, KO, Omega II, and Wong Halves as the selectable systems', () => {
      const { c } = createPage();
      expect(c.systems.map((s) => s.id)).toEqual(['hi-lo', 'ko', 'omega-ii', 'wong-halves']);
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

    it('selecting Wong Halves switches system and keeps true count available (balanced)', () => {
      const { c } = createPage();
      c.onSystemChange('wong-halves');
      expect(c.system().id).toBe('wong-halves');
      expect(c.system().name).toBe('Wong Halves');
      expect(c.trueCountAvailable()).toBe(true);
    });
  });

  describe('fractional answer wiring (Wong Halves)', () => {
    it('does not allow fractional answers for an integer system (Hi-Lo)', () => {
      const { c } = createPage();
      expect(c.fractionalAnswers()).toBe(false);
    });

    it('allows fractional answers for Wong Halves in running-count mode', () => {
      const { c } = createPage();
      c.onSystemChange('wong-halves');
      expect(c.settings().mode).toBe('running-count');
      expect(c.fractionalAnswers()).toBe(true);
    });

    it('does not allow fractional answers for Wong Halves in true-count mode', () => {
      const { c } = createPage();
      c.onSystemChange('wong-halves');
      c.updateSetting('mode', 'true-count');
      expect(c.fractionalAnswers()).toBe(false);
    });

    it('evaluates a fractional running-count answer for Wong Halves', () => {
      const { c } = createPage();
      c.onSystemChange('wong-halves');
      c.updateSetting('numberOfCards', 1);
      c.updateSetting('millisecondsBetweenCards', 100);
      c.start();
      vi.advanceTimersByTime(100);
      expect(c.state()).toBe('answering');
      c.onAnswer(0.5);
      const r = c.result();
      expect(r).not.toBeNull();
      expect(r!.mode).toBe('running-count');
      if (r && r.mode === 'running-count') {
        expect(r.userRunningCount).toBe(0.5);
      }
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
      c.updateSetting('trueCountSource', 'classic');
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
      c.updateSetting('trueCountSource', 'classic');
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
      c.updateSetting('trueCountSource', 'classic');
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
      c.updateSetting('trueCountSource', 'classic');
      c.updateSetting('decksRemaining', 2);
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      // While in TC mode, reset only TC.
      c.resetActiveStats();
      expect(c.trueCountStatsService.stats().attempts).toBe(0);
      expect(c.statsService.stats().attempts).toBe(1);
    });

    it('does not start when classic true-count settings are invalid (decksRemaining=0)', () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      c.updateSetting('trueCountSource', 'classic');
      c.updateSetting('decksRemaining', 0);
      c.start();
      expect(c.state()).toBe('idle');
    });
  });

  describe('live-shoe true-count drills', () => {
    // Configure a live-shoe true-count drill (Hi-Lo, balanced).
    function configureLiveShoe(
      c: Internals,
      opts: { numberOfCards?: number; numberOfDecks?: number; penetration?: number } = {},
    ): void {
      c.updateSetting('mode', 'true-count');
      c.updateSetting('trueCountSource', 'live-shoe');
      c.updateSetting('numberOfDecks', opts.numberOfDecks ?? 6);
      c.updateSetting('penetration', opts.penetration ?? 0.75);
      c.updateSetting('numberOfCards', opts.numberOfCards ?? 10);
      c.updateSetting('millisecondsBetweenCards', 100);
    }

    // Advance the stream past its last card so the drill leaves 'streaming'.
    function streamToEnd(c: Internals): void {
      vi.advanceTimersByTime(c.cards().length * 100);
    }

    const keyOf = (card: Card): string => `${card.rank}-${card.suit}`;

    it('is recognized as a live-shoe true-count drill for a balanced system', () => {
      const { c } = createPage();
      configureLiveShoe(c);
      expect(c.liveShoeTrueCount()).toBe(true);
    });

    it('is not a live-shoe drill in classic source mode', () => {
      const { c } = createPage();
      c.updateSetting('mode', 'true-count');
      c.updateSetting('trueCountSource', 'classic');
      expect(c.liveShoeTrueCount()).toBe(false);
    });

    it('deals the round from a finite shoe and depletes the decks remaining', () => {
      const { c } = createPage();
      configureLiveShoe(c, { numberOfDecks: 6, numberOfCards: 10 });
      c.start();
      expect(c.cards().length).toBe(10);
      streamToEnd(c);
      // 312 - 10 = 302 cards remaining => 302 / 52 decks.
      expect(c.actualDecksRemaining()).toBeCloseTo(302 / 52, 6);
    });

    it('runs streaming → estimating → answering → feedback', () => {
      const { c } = createPage();
      configureLiveShoe(c, { numberOfCards: 3 });
      c.start();
      expect(c.state()).toBe('streaming');
      streamToEnd(c);
      expect(c.state()).toBe('estimating');
      c.onEstimate(5.5);
      expect(c.state()).toBe('answering');
      expect(c.deckEstimate()).toBe(5.5);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
    });

    it('grades the true count against the shoe actual decks remaining', () => {
      const { c } = createPage();
      const engine = new CountingEngineService();
      configureLiveShoe(c, { numberOfCards: 10 });
      c.start();
      const round = [...c.cards()];
      const decks = c.actualDecksRemaining();
      streamToEnd(c);
      c.onEstimate(decks);
      const expectedTrue = engine.trueCount(engine.runningCount(round, HI_LO), decks);
      c.onAnswer(expectedTrue);
      const r = c.result();
      expect(r).not.toBeNull();
      if (r && r.mode === 'true-count') {
        expect(r.isCorrect).toBe(true);
        expect(r.decksRemaining).toBe(decks);
        expect(r.priorRunningCount).toBe(0);
      }
    });

    it('scores an exact deck estimate as within the ±0.5 band', () => {
      const { c } = createPage();
      configureLiveShoe(c);
      c.start();
      const decks = c.actualDecksRemaining();
      streamToEnd(c);
      c.onEstimate(decks);
      c.onAnswer(0);
      const r = c.result();
      if (r && r.mode === 'true-count') {
        expect(r.deckEstimate).toBe(decks);
        expect(r.deckEstimateWithinBand).toBe(true);
      }
      expect(c.deckEstimationStatsService.stats().attempts).toBe(1);
      expect(c.deckEstimationStatsService.stats().correct).toBe(1);
    });

    it('scores a deck estimate one deck off as a miss', () => {
      const { c } = createPage();
      configureLiveShoe(c);
      c.start();
      const decks = c.actualDecksRemaining();
      streamToEnd(c);
      c.onEstimate(decks + 1);
      c.onAnswer(0);
      const r = c.result();
      if (r && r.mode === 'true-count') {
        expect(r.deckEstimateWithinBand).toBe(false);
      }
      expect(c.deckEstimationStatsService.stats().attempts).toBe(1);
      expect(c.deckEstimationStatsService.stats().correct).toBe(0);
    });

    it('records the true count and the deck estimate on their separate stores', () => {
      const { c } = createPage();
      configureLiveShoe(c);
      c.start();
      const decks = c.actualDecksRemaining();
      streamToEnd(c);
      c.onEstimate(decks);
      c.onAnswer(0);
      expect(c.trueCountStatsService.stats().attempts).toBe(1);
      expect(c.deckEstimationStatsService.stats().attempts).toBe(1);
      // The running-count store is untouched by true-count drills.
      expect(c.statsService.stats().attempts).toBe(0);
    });

    it('carries the running count across rounds of the same shoe', () => {
      const { c } = createPage();
      const engine = new CountingEngineService();
      configureLiveShoe(c, { numberOfDecks: 6, penetration: 0.75, numberOfCards: 10 });

      // Round 1.
      c.start();
      const round1 = [...c.cards()];
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      const rc1 = engine.runningCount(round1, HI_LO);
      expect(c.shoeRunningCount()).toBe(rc1);
      expect(c.reshuffleNotice()).toBe(false);

      // Round 2 carries rc1 as the prior running count.
      c.start();
      const round2 = [...c.cards()];
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      const r = c.result();
      if (r && r.mode === 'true-count') {
        expect(r.priorRunningCount).toBe(rc1);
        expect(r.correctRunningCount).toBe(rc1 + engine.runningCount(round2, HI_LO));
      }
    });

    it('deals without replacement across rounds of the same shoe', () => {
      const { c } = createPage();
      configureLiveShoe(c, { numberOfDecks: 1, penetration: 0.9, numberOfCards: 20 });
      c.start();
      const round1 = [...c.cards()];
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      c.start();
      const round2 = [...c.cards()];
      // 40 cards dealt from one 52-card shoe with no reshuffle => all distinct.
      const keys = [...round1, ...round2].map(keyOf);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('auto-reshuffles at the cut card, resetting the running count with a notice', () => {
      const { c } = createPage();
      // 1-deck shoe, cut at floor(52*0.5)=26. A 30-card round crosses the cut.
      configureLiveShoe(c, { numberOfDecks: 1, penetration: 0.5, numberOfCards: 30 });

      // Round 1 begins with a fresh shoe (no reshuffle notice) and crosses the cut.
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      expect(c.reshuffleNotice()).toBe(false);

      // Round 2 must reshuffle before dealing.
      c.start();
      expect(c.reshuffleNotice()).toBe(true);
      expect(c.shoeRunningCount()).toBe(0);
      // Fresh full deck: 52 - 30 = 22 cards remaining after dealing.
      expect(c.actualDecksRemaining()).toBeCloseTo(22 / 52, 6);
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      const r = c.result();
      if (r && r.mode === 'true-count') {
        expect(r.priorRunningCount).toBe(0);
      }
    });

    it('changing the deck count invalidates the shoe and resets the live readout', () => {
      const { c } = createPage();
      configureLiveShoe(c, { numberOfDecks: 6, numberOfCards: 10 });
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      expect(c.shoeRunningCount()).toBeDefined();
      // Switch to a 1-deck shoe: carried count clears and the readout shows 1.
      c.updateSetting('numberOfDecks', 1);
      expect(c.shoeRunningCount()).toBe(0);
      expect(c.liveDecksRemaining()).toBe(1);
    });

    it('switching the counting system invalidates the shoe carry-over', () => {
      const { c } = createPage();
      configureLiveShoe(c, { numberOfCards: 10 });
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      c.onSystemChange('omega-ii');
      expect(c.shoeRunningCount()).toBe(0);
      expect(c.reshuffleNotice()).toBe(false);
    });

    it('an unbalanced system (KO) is never a live-shoe true-count drill', () => {
      const { c } = createPage();
      configureLiveShoe(c);
      c.onSystemChange('ko'); // unbalanced => coerced to running-count
      expect(c.liveShoeTrueCount()).toBe(false);
    });
  });
});
