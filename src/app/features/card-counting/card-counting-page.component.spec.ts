import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import type { Card } from '../../core/models/card.model';
import type {
  CountingDrillResult,
  CountingDrillSettings,
} from '../../core/models/card-counting.model';
import type { CountingSystem } from '../../core/models/counting-system.model';
import { Shoe } from '../../core/models/shoe.model';
import { HI_LO } from '../../data/counting-systems';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { FlowPrefsService, type CountingPrefs } from '../../core/services/flow-prefs.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { CardCountingPageComponent } from './card-counting-page.component';

// The page component exposes its signals and methods as `protected` for
// TypeScript's sake; at runtime they're just properties. This mirror lets
// the tests read/poke them without scattering `as any` casts.
type StatsLike = {
  stats(): { attempts: number; correct: number; streak: number; longestStreak: number };
  reset(): void;
};

type Internals = {
  state():
    | 'idle'
    | 'streaming'
    | 'estimating'
    | 'answering'
    | 'advantage'
    | 'betting'
    | 'flipping'
    | 'feedback'
    | 'showdown'
    | 'done';
  target(): number;
  handsToday(): number;
  settings(): CountingDrillSettings;
  cards(): readonly Card[];
  currentIndex(): number;
  result(): CountingDrillResult | null;
  system(): CountingSystem;
  fractionalAnswers(): boolean;
  liveShoeTrueCount(): boolean;
  keyCountDrill(): boolean;
  betSpreadDrill(): boolean;
  liveShoeBetSpread(): boolean;
  asksDeckEstimate(): boolean;
  usesLiveShoe(): boolean;
  countResetLabel(): string;
  isValid(): boolean;
  isDrillActive(): boolean;
  statsService: StatsLike;
  trueCountStatsService: StatsLike;
  deckEstimationStatsService: StatsLike;
  keyCountStatsService: StatsLike;
  betSpreadStatsService: StatsLike;
  deckSpeedStatsService: StatsLike & { bestMs(): number | null };
  deckSpeedDrill(): boolean;
  flipNext(): void;
  start(): void;
  runAgain(): void;
  oneMoreRound(): void;
  onEstimate(n: number): void;
  onAnswer(n: number): void;
  onAdvantage(saidYes: boolean): void;
  onBet(units: number): void;
  onKeyDown(e: KeyboardEvent): void;
  shoeRunningCount(): number;
  actualDecksRemaining(): number;
  deckEstimate(): number | null;
  reshuffleNotice(): boolean;
  timeoutId: ReturnType<typeof setTimeout> | null;
  shoe: Shoe | null;
  showdownAvailable(): boolean;
  enterShowdown(): void;
  exitShowdown(cards: readonly Card[]): void;
};

function asInternals(c: CardCountingPageComponent): Internals {
  return c as unknown as Internals;
}

// Drill settings now live in prefs (edited on the Settings screen); tests
// configure them the same way.
function updateSetting<K extends keyof CountingPrefs>(key: K, value: CountingPrefs[K]): void {
  TestBed.inject(FlowPrefsService).updateCounting({ [key]: value });
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

  describe('flow shell', () => {
    it('records itself as the last trainer and targets the daily goal', () => {
      const { fixture, c } = createPage();
      expect(TestBed.inject(FlowPrefsService).prefs().lastTrainer).toBe('card-counting');
      expect(c.target()).toBe(20);
      expect(
        (fixture.nativeElement.querySelector('.topbar__count') as HTMLElement).textContent,
      ).toBe('0/20');
    });

    it('hosts no settings controls — configuration points to the Settings screen', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelector('app-counting-settings')).toBeNull();
      expect(fixture.nativeElement.querySelector('fieldset')).toBeNull();
    });

    it('counts each graded rep toward the daily goal and the session streak', () => {
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(TestBed.inject(PracticeHistoryService).handsToday()).toBe(1);
      expect(c.handsToday()).toBe(1);
    });

    it('shows the Done moment at the session target and rolls into one more round', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(2);
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { fixture, c } = createPage();
      for (let i = 0; i < 2; i++) {
        c.start();
        vi.advanceTimersByTime(100);
        c.onAnswer(0);
        c.runAgain();
      }
      fixture.detectChanges();
      expect(c.state()).toBe('done');
      expect(fixture.nativeElement.querySelector('app-flow-done')).not.toBeNull();

      c.oneMoreRound();
      expect(c.target()).toBe(4);
      expect(c.state()).toBe('streaming');
    });

    it('Escape exits to home; Enter starts from idle and continues from feedback', () => {
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(c.state()).toBe('streaming');
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(c.state()).toBe('streaming');

      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('state machine', () => {
    it('starts in idle with no cards and no result', () => {
      const { c } = createPage();
      expect(c.state()).toBe('idle');
      expect(c.cards().length).toBe(0);
      expect(c.result()).toBeNull();
    });

    it('idle → streaming on start()', () => {
      updateSetting('numberOfCards', 3);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      expect(c.state()).toBe('streaming');
      expect(c.cards().length).toBe(3);
      expect(c.currentIndex()).toBe(0);
    });

    it('advances currentIndex on each tick while streaming', () => {
      updateSetting('numberOfCards', 3);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      expect(c.currentIndex()).toBe(0);
      vi.advanceTimersByTime(100);
      expect(c.currentIndex()).toBe(1);
      vi.advanceTimersByTime(100);
      expect(c.currentIndex()).toBe(2);
      expect(c.state()).toBe('streaming');
    });

    it('streaming → answering after the last card has held for ms', () => {
      updateSetting('numberOfCards', 3);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      // First card visible from t=0..100, second 100..200, third 200..300.
      vi.advanceTimersByTime(299);
      expect(c.state()).toBe('streaming');
      vi.advanceTimersByTime(1);
      expect(c.state()).toBe('answering');
    });

    it('answering → feedback on onAnswer()', () => {
      updateSetting('numberOfCards', 2);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(200);
      expect(c.state()).toBe('answering');
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      expect(c.result()).not.toBeNull();
    });

    it('feedback → streaming on runAgain() while under the target', () => {
      updateSetting('numberOfCards', 2);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(200);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      c.runAgain();
      expect(c.state()).toBe('streaming');
      expect(c.currentIndex()).toBe(0);
      expect(c.result()).toBeNull();
    });

    it('start() is a no-op while streaming', () => {
      updateSetting('numberOfCards', 3);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
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
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      expect(c.state()).toBe('answering');
      const cardsRef = c.cards();
      c.start();
      expect(c.state()).toBe('answering');
      expect(c.cards()).toBe(cardsRef);
    });

    it('start() cannot bypass the Done screen', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      c.runAgain();
      expect(c.state()).toBe('done');

      const cards = c.cards();
      c.start();

      expect(c.state()).toBe('done');
      expect(c.cards()).toBe(cards);
    });

    it('onAnswer is ignored when state is idle', () => {
      const { c } = createPage();
      c.onAnswer(5);
      expect(c.state()).toBe('idle');
      expect(c.result()).toBeNull();
    });

    it('onAnswer is ignored when state is streaming', () => {
      updateSetting('numberOfCards', 5);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      expect(c.state()).toBe('streaming');
      c.onAnswer(5);
      expect(c.state()).toBe('streaming');
      expect(c.result()).toBeNull();
    });

    it('onAnswer is ignored when state is feedback', () => {
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      const firstResult = c.result();
      c.onAnswer(999);
      expect(c.result()).toBe(firstResult);
    });

    it('onEstimate is ignored outside the estimating state', () => {
      const { c } = createPage();
      c.onEstimate(3.5);
      expect(c.state()).toBe('idle');
      expect(c.deckEstimate()).toBeNull();
    });

    it('clears the pending timeout on destroy', () => {
      updateSetting('numberOfCards', 10);
      updateSetting('millisecondsBetweenCards', 100);
      const { fixture, c } = createPage();
      c.start();
      expect(c.timeoutId).not.toBeNull();
      fixture.destroy();
      expect(c.timeoutId).toBeNull();
    });

    it('does not start when settings are invalid', () => {
      updateSetting('numberOfCards', 0);
      const { c } = createPage();
      c.start();
      expect(c.state()).toBe('idle');
      expect(c.cards().length).toBe(0);
    });

    it('ignores keyboard shortcuts from editable controls', () => {
      const { c } = createPage();
      const input = document.createElement('input');
      document.body.append(input);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.remove();

      expect(c.state()).toBe('idle');
    });
  });

  describe('idle screen', () => {
    it('offers the primary start action when settings are valid', () => {
      const { fixture } = createPage();
      const btn = fixture.nativeElement.querySelector('.count__start') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.textContent).toContain('Start counting');
    });

    it('points to Settings instead of starting when settings are invalid', () => {
      updateSetting('numberOfCards', 0);
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelector('.count__start')).toBeNull();
      expect(fixture.nativeElement.querySelector('.count__invalid')).not.toBeNull();
      const fix = fixture.nativeElement.querySelector('.count__fix') as HTMLAnchorElement;
      expect(fix.getAttribute('href')).toBe('/settings');
    });

    it('start button disappears once a drill begins', () => {
      updateSetting('numberOfCards', 3);
      updateSetting('millisecondsBetweenCards', 100);
      const { fixture, c } = createPage();
      c.start();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.count__start')).toBeNull();
    });
  });

  describe('settings via prefs', () => {
    it('reads mode, decks remaining, and system from prefs', () => {
      updateSetting('mode', 'true-count');
      updateSetting('decksRemaining', 2);
      updateSetting('systemId', 'omega-ii');
      const { c } = createPage();
      expect(c.settings().mode).toBe('true-count');
      expect(c.settings().decksRemaining).toBe(2);
      expect(c.system().id).toBe('omega-ii');
    });

    it('falls back to Hi-Lo for an unknown stored system id', () => {
      updateSetting('systemId', 'does-not-exist');
      const { c } = createPage();
      expect(c.system().id).toBe('hi-lo');
    });
  });

  describe('fractional answer wiring (Wong Halves)', () => {
    it('does not allow fractional answers for an integer system (Hi-Lo)', () => {
      const { c } = createPage();
      expect(c.fractionalAnswers()).toBe(false);
    });

    it('allows fractional answers for Wong Halves in running-count mode', () => {
      updateSetting('systemId', 'wong-halves');
      const { c } = createPage();
      expect(c.settings().mode).toBe('running-count');
      expect(c.fractionalAnswers()).toBe(true);
    });

    it('does not allow fractional answers for Wong Halves in true-count mode', () => {
      updateSetting('systemId', 'wong-halves');
      updateSetting('mode', 'true-count');
      const { c } = createPage();
      expect(c.fractionalAnswers()).toBe(false);
    });

    it('evaluates a fractional running-count answer for Wong Halves', () => {
      updateSetting('systemId', 'wong-halves');
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
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
      updateSetting('numberOfCards', 2);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(200);
      c.onAnswer(0);
      const r = c.result();
      expect(r).not.toBeNull();
      expect(r!.mode).toBe('running-count');
    });

    it('true-count mode evaluates as a true-count result', () => {
      updateSetting('mode', 'true-count');
      updateSetting('trueCountSource', 'classic');
      updateSetting('decksRemaining', 2);
      updateSetting('numberOfCards', 2);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
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
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.trueCountStatsService.stats().attempts).toBe(0);
    });

    it('records true-count attempts on TrueCountStatsService only', () => {
      updateSetting('mode', 'true-count');
      updateSetting('trueCountSource', 'classic');
      updateSetting('decksRemaining', 2);
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.trueCountStatsService.stats().attempts).toBe(1);
      expect(c.statsService.stats().attempts).toBe(0);
    });

    it('does not start when classic true-count settings are invalid (decksRemaining=0)', () => {
      updateSetting('mode', 'true-count');
      updateSetting('trueCountSource', 'classic');
      updateSetting('decksRemaining', 0);
      const { c } = createPage();
      c.start();
      expect(c.state()).toBe('idle');
    });
  });

  describe('live-shoe true-count drills', () => {
    // Configure a live-shoe true-count drill (Hi-Lo, balanced).
    function configureLiveShoe(
      opts: { numberOfCards?: number; numberOfDecks?: number; penetration?: number } = {},
    ): void {
      updateSetting('mode', 'true-count');
      updateSetting('trueCountSource', 'live-shoe');
      updateSetting('numberOfDecks', opts.numberOfDecks ?? 6);
      updateSetting('penetration', opts.penetration ?? 0.75);
      updateSetting('numberOfCards', opts.numberOfCards ?? 10);
      updateSetting('millisecondsBetweenCards', 100);
    }

    // Advance the stream past its last card so the drill leaves 'streaming'.
    function streamToEnd(c: Internals): void {
      vi.advanceTimersByTime(c.cards().length * 100);
    }

    const keyOf = (card: Card): string => `${card.rank}-${card.suit}`;

    it('is recognized as a live-shoe true-count drill for a balanced system', () => {
      configureLiveShoe();
      const { c } = createPage();
      expect(c.liveShoeTrueCount()).toBe(true);
    });

    it('is not a live-shoe drill in classic source mode', () => {
      updateSetting('mode', 'true-count');
      updateSetting('trueCountSource', 'classic');
      const { c } = createPage();
      expect(c.liveShoeTrueCount()).toBe(false);
    });

    it('deals the round from a finite shoe and depletes the decks remaining', () => {
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { c } = createPage();
      c.start();
      expect(c.cards().length).toBe(10);
      streamToEnd(c);
      // 312 - 10 = 302 cards remaining => 302 / 52 decks.
      expect(c.actualDecksRemaining()).toBeCloseTo(302 / 52, 6);
    });

    it('runs streaming → estimating → answering → feedback', () => {
      configureLiveShoe({ numberOfCards: 3 });
      const { c } = createPage();
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
      const engine = new CountingEngineService();
      configureLiveShoe({ numberOfCards: 10 });
      const { c } = createPage();
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
      configureLiveShoe();
      const { c } = createPage();
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
      configureLiveShoe();
      const { c } = createPage();
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
      configureLiveShoe();
      const { c } = createPage();
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
      const engine = new CountingEngineService();
      configureLiveShoe({ numberOfDecks: 6, penetration: 0.75, numberOfCards: 10 });
      const { c } = createPage();

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
      c.runAgain();
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
      configureLiveShoe({ numberOfDecks: 1, penetration: 0.9, numberOfCards: 20 });
      const { c } = createPage();
      c.start();
      const round1 = [...c.cards()];
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      c.runAgain();
      const round2 = [...c.cards()];
      // 40 cards dealt from one 52-card shoe with no reshuffle => all distinct.
      const keys = [...round1, ...round2].map(keyOf);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('auto-reshuffles at the cut card, resetting the running count with a notice', () => {
      // 1-deck shoe, cut at floor(52*0.5)=26. A 30-card round crosses the cut.
      configureLiveShoe({ numberOfDecks: 1, penetration: 0.5, numberOfCards: 30 });
      const { c } = createPage();

      // Round 1 begins with a fresh shoe (no reshuffle notice) and crosses the cut.
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      expect(c.reshuffleNotice()).toBe(false);

      // Round 2 must reshuffle before dealing.
      c.runAgain();
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

    it('rebuilds the shoe when the deck count changed between rounds', () => {
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { c } = createPage();
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      expect(c.shoeRunningCount()).not.toBeNull();

      // Reconfigured on the Settings screen to a 1-deck shoe: the next round
      // starts a fresh shoe with no carried count and no reshuffle notice.
      updateSetting('numberOfDecks', 1);
      c.runAgain();
      expect(c.reshuffleNotice()).toBe(false);
      expect(c.shoeRunningCount()).toBe(0);
      expect(c.actualDecksRemaining()).toBeCloseTo((52 - 10) / 52, 6);
    });

    it('discards the carried count when the counting system changed between rounds', () => {
      configureLiveShoe({ numberOfCards: 10 });
      const { c } = createPage();
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);

      updateSetting('systemId', 'omega-ii');
      c.runAgain();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      const r = c.result();
      if (r && r.mode === 'true-count') {
        expect(r.priorRunningCount).toBe(0);
      }
    });

    it('an unbalanced system (KO) is never a live-shoe true-count drill', () => {
      configureLiveShoe();
      updateSetting('systemId', 'ko'); // unbalanced
      const { c } = createPage();
      expect(c.liveShoeTrueCount()).toBe(false);
    });

    // Drive a live-shoe true-count round all the way to its feedback state.
    function toLiveShoeFeedback(c: Internals): void {
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
    }

    it('offers a showdown after a live-shoe true-count round', () => {
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { fixture, c } = createPage();
      toLiveShoeFeedback(c);
      expect(c.state()).toBe('feedback');
      expect(c.showdownAvailable()).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.count__showdown-button')).not.toBeNull();
    });

    // A hand dealt after the cut card is a hand no table deals, and it would be
    // graded on a true count divided by a sliver of a shoe. When the round just
    // counted crossed the cut, the offer is withdrawn and the reason given.
    it('offers no showdown once the cut card is out', () => {
      configureLiveShoe({ numberOfDecks: 1, numberOfCards: 30, penetration: 0.5 });
      const { fixture, c } = createPage();
      toLiveShoeFeedback(c);

      expect(c.shoe!.needsReshuffle).toBe(true);
      // The shoe is not short of cards — it is past its cut card.
      expect(c.shoe!.cardsRemaining).toBeGreaterThan(4);
      expect(c.showdownAvailable()).toBe(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.count__showdown-button')).toBeNull();
      expect(
        (fixture.nativeElement.querySelector('.count__shoe-spent') as HTMLElement).textContent,
      ).toContain('cut card is out');
    });

    it('enters the showdown and deals from the same persistent shoe', () => {
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { fixture, c } = createPage();
      toLiveShoeFeedback(c);
      const before = c.shoe!.cardsRemaining;
      c.enterShowdown();
      expect(c.state()).toBe('showdown');
      // Mounting app-showdown deals its opening hand from the page's shoe.
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-showdown')).not.toBeNull();
      expect(c.shoe!.cardsRemaining).toBe(before - 4);
    });

    it('exitShowdown returns to the count feedback', () => {
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { c } = createPage();
      toLiveShoeFeedback(c);
      c.enterShowdown();
      expect(c.state()).toBe('showdown');
      c.exitShowdown([]);
      expect(c.state()).toBe('feedback');
    });

    it('ignores stale showdown exits after the page has already left the showdown', () => {
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { c } = createPage();
      toLiveShoeFeedback(c);
      const before = c.shoeRunningCount();

      c.exitShowdown([{ rank: '5', suit: 'hearts' }]);

      expect(c.state()).toBe('feedback');
      expect(c.shoeRunningCount()).toBe(before);
    });

    it('exitShowdown folds the showdown cards into the carried running count', () => {
      // The showdown depletes the shared shoe (shrinking the next round's
      // decks-remaining denominator), so its cards' running-count value must be
      // folded into the carried count or the next round grades inconsistently.
      configureLiveShoe({ numberOfDecks: 6, numberOfCards: 10 });
      const { c } = createPage();
      toLiveShoeFeedback(c);
      c.enterShowdown();
      const before = c.shoeRunningCount();
      const dealt: readonly Card[] = [
        { rank: '5', suit: 'hearts' },
        { rank: '6', suit: 'spades' },
      ];
      c.exitShowdown(dealt);
      expect(c.state()).toBe('feedback');
      const delta = new CountingEngineService().runningCount(dealt, HI_LO);
      expect(delta).toBeGreaterThan(0); // 5 and 6 are +1 each in Hi-Lo
      expect(c.shoeRunningCount()).toBe(before + delta);
    });

    it('does not enter a showdown from a non-feedback state', () => {
      configureLiveShoe({ numberOfCards: 10 });
      const { c } = createPage();
      c.start(); // streaming
      c.enterShowdown();
      expect(c.state()).toBe('streaming');
    });

    it('requires enough opening cards for every configured showdown spot', () => {
      configureLiveShoe();
      updateSetting('showdownSpots', 3);
      const { c } = createPage();
      c.shoe = new Shoe(
        Array.from({ length: 7 }, (_, i) => ({
          rank: (i % 2 === 0 ? '5' : '10') as Card['rank'],
          suit: 'spades' as Card['suit'],
        })),
        1,
      );

      expect(c.showdownAvailable()).toBe(false);
    });

    it('does not offer a showdown in classic preset true-count mode (no live shoe)', () => {
      updateSetting('mode', 'true-count');
      updateSetting('trueCountSource', 'classic');
      updateSetting('decksRemaining', 2);
      updateSetting('numberOfCards', 1);
      updateSetting('millisecondsBetweenCards', 100);
      const { c } = createPage();
      c.start();
      vi.advanceTimersByTime(100);
      c.onAnswer(0);
      expect(c.state()).toBe('feedback');
      expect(c.showdownAvailable()).toBe(false);
    });
  });

  describe('key-count drills (KO)', () => {
    function configureKeyCount(
      opts: { numberOfCards?: number; numberOfDecks?: number; penetration?: number } = {},
    ): void {
      updateSetting('systemId', 'ko');
      updateSetting('mode', 'key-count');
      updateSetting('numberOfDecks', opts.numberOfDecks ?? 6);
      updateSetting('penetration', opts.penetration ?? 0.75);
      updateSetting('numberOfCards', opts.numberOfCards ?? 10);
      updateSetting('millisecondsBetweenCards', 100);
    }

    function streamToEnd(c: Internals): void {
      vi.advanceTimersByTime(c.cards().length * 100);
    }

    it('is recognized as a key-count drill, and as a live-shoe drill', () => {
      configureKeyCount();
      const { c } = createPage();
      expect(c.keyCountDrill()).toBe(true);
      expect(c.usesLiveShoe()).toBe(true);
      expect(c.liveShoeTrueCount()).toBe(false);
      expect(c.isValid()).toBe(true);
    });

    it('is invalid for a system without a schedule, and start() refuses', () => {
      // updateCounting stores the partial verbatim (no merge pass), so this
      // impossible pairing can exist in memory; the page must refuse it.
      updateSetting('systemId', 'hi-lo');
      updateSetting('mode', 'key-count');
      const { c } = createPage();
      expect(c.keyCountDrill()).toBe(false);
      expect(c.isValid()).toBe(false);
      c.start();
      expect(c.state()).toBe('idle');
    });

    it('runs streaming → answering → advantage → feedback, skipping the deck estimate', () => {
      configureKeyCount({ numberOfCards: 3 });
      const { c } = createPage();
      c.start();
      expect(c.state()).toBe('streaming');
      streamToEnd(c);
      expect(c.state()).toBe('answering');
      c.onAnswer(-20);
      expect(c.state()).toBe('advantage');
      c.onAdvantage(false);
      expect(c.state()).toBe('feedback');
    });

    it('seeds a fresh shoe at the IRC and grades the count from it', () => {
      const engine = new CountingEngineService();
      configureKeyCount({ numberOfDecks: 6, numberOfCards: 10 });
      const { c } = createPage();
      c.start();
      // Six decks: IRC −20 before any card is counted.
      expect(c.shoeRunningCount()).toBe(-20);
      const round = [...c.cards()];
      const correct = -20 + engine.runningCount(round, c.system());
      streamToEnd(c);
      c.onAnswer(correct);
      c.onAdvantage(correct >= -4);
      const r = c.result();
      expect(r).not.toBeNull();
      if (r && r.mode === 'key-count') {
        expect(r.priorRunningCount).toBe(-20);
        expect(r.correctRunningCount).toBe(correct);
        expect(r.irc).toBe(-20);
        expect(r.keyCount).toBe(-4);
        expect(r.isCorrect).toBe(true);
      }
      // The graded count carries into the next round of this shoe.
      expect(c.shoeRunningCount()).toBe(correct);
    });

    it('carries the count across rounds and resets to the IRC on a reshuffle', () => {
      // 2-deck shoe (IRC −4), cut at floor(104·0.5) = 52; 30-card rounds cross
      // the cut on round 2, so round 3 opens on a fresh IRC-seeded shoe.
      configureKeyCount({ numberOfDecks: 2, penetration: 0.5, numberOfCards: 30 });
      const { c } = createPage();
      c.start();
      expect(c.shoeRunningCount()).toBe(-4);
      streamToEnd(c);
      c.onAnswer(0);
      c.onAdvantage(true);
      const carried = c.shoeRunningCount();
      c.runAgain();
      expect(c.reshuffleNotice()).toBe(false);
      const r2 = c.result();
      expect(r2).toBeNull();
      streamToEnd(c);
      c.onAnswer(0);
      c.onAdvantage(true);
      const r = c.result();
      if (r && r.mode === 'key-count') {
        expect(r.priorRunningCount).toBe(carried);
      }
      // Round 3 crosses the cut: reshuffle, notice up, count back at the IRC.
      c.runAgain();
      expect(c.reshuffleNotice()).toBe(true);
      expect(c.shoeRunningCount()).toBe(-4);
      expect(c.countResetLabel()).toBe('-4 (the IRC)');
    });

    it('routes the count answer and the advantage call to their own stores', () => {
      const engine = new CountingEngineService();
      configureKeyCount({ numberOfCards: 5 });
      const { c } = createPage();
      c.statsService.reset();
      c.keyCountStatsService.reset();
      c.start();
      const correct = -20 + engine.runningCount([...c.cards()], c.system());
      streamToEnd(c);
      // Right count, wrong call: below-the-key "yes".
      c.onAnswer(correct);
      c.onAdvantage(correct < -4);
      expect(c.statsService.stats().attempts).toBe(1);
      expect(c.statsService.stats().correct).toBe(1);
      expect(c.keyCountStatsService.stats().attempts).toBe(1);
      expect(c.keyCountStatsService.stats().correct).toBe(0);
      expect(c.trueCountStatsService.stats().attempts).toBe(0);
      // The rep counts toward the goal but not the streak (strict AND).
      expect(c.handsToday()).toBe(1);
      const r = c.result();
      if (r && r.mode === 'key-count') {
        expect(r.isCorrect).toBe(false);
      }
    });

    it('offers the showdown off the same persistent shoe after a key-count round', () => {
      configureKeyCount({ numberOfCards: 5 });
      const { fixture, c } = createPage();
      c.start();
      streamToEnd(c);
      c.onAnswer(0);
      c.onAdvantage(true);
      expect(c.state()).toBe('feedback');
      expect(c.showdownAvailable()).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.count__showdown-button')).not.toBeNull();
      c.enterShowdown();
      expect(c.state()).toBe('showdown');
      // Exiting folds the showdown's cards into the carried count: 5 and 6 are
      // both +1 under KO, so the deltas cannot cancel.
      const before = c.shoeRunningCount();
      c.exitShowdown([
        { rank: '5', suit: 'spades' },
        { rank: '6', suit: 'hearts' },
      ]);
      expect(c.state()).toBe('feedback');
      expect(c.shoeRunningCount()).toBe(before + 2);
    });

    it('ignores an advantage call outside the advantage state', () => {
      configureKeyCount({ numberOfCards: 3 });
      const { c } = createPage();
      c.start();
      c.onAdvantage(true);
      expect(c.state()).toBe('streaming');
      expect(c.result()).toBeNull();
    });
  });

  describe('deck-speed drills', () => {
    // Flip through every card of the burned deck, spending `msPerCard` on each
    // so the stopwatch has something to measure under fake timers.
    function countDownTheDeck(c: Internals, msPerCard = 400): void {
      while (c.state() === 'flipping') {
        vi.advanceTimersByTime(msPerCard);
        c.flipNext();
      }
    }

    it('deals 51 cards from a burned deck and waits on the player', () => {
      updateSetting('mode', 'deck-speed');
      const { c } = createPage();
      expect(c.deckSpeedDrill()).toBe(true);
      c.start();
      expect(c.state()).toBe('flipping');
      expect(c.cards().length).toBe(51);
      // Self-paced: the app's stream timer never moves this drill on.
      vi.advanceTimersByTime(10_000);
      expect(c.currentIndex()).toBe(0);
      expect(c.state()).toBe('flipping');
    });

    it('deals every card of a real deck exactly once', () => {
      updateSetting('mode', 'deck-speed');
      const { c } = createPage();
      c.start();
      const seen = new Map<string, number>();
      for (const card of c.cards()) {
        const key = `${card.rank}${card.suit}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      expect(seen.size).toBe(51);
      expect([...seen.values()].every((n) => n === 1)).toBe(true);
    });

    it('flipping → answering on the last card, then grades against the burned card', () => {
      updateSetting('mode', 'deck-speed');
      const { c } = createPage();
      const engine = new CountingEngineService();
      c.start();
      countDownTheDeck(c);
      expect(c.state()).toBe('answering');
      const correct = engine.runningCount([...c.cards()], c.system());
      c.onAnswer(correct);
      expect(c.state()).toBe('feedback');
      const r = c.result();
      expect(r?.mode).toBe('deck-speed');
      if (r && r.mode === 'deck-speed') {
        expect(r.isCorrect).toBe(true);
        // Hi-Lo: a full deck counts 0, so the 51 shown plus the burned card's
        // tag must come back to that constant. (Written as a sum because the
        // negation of a 0-tag card is -0, which Object.is separates from 0.)
        expect(r.fullDeckCount).toBe(0);
        const burnedTag = engine.runningCount([r.burnedCard], c.system());
        expect(r.correctRunningCount + burnedTag).toBe(r.fullDeckCount);
        // 51 flips at 400ms each (the last one ends the countdown), timed from
        // the first card.
        expect(r.elapsedMs).toBe(51 * 400);
        expect(r.isPersonalBest).toBe(true);
      }
      expect(c.deckSpeedStatsService.bestMs()).toBe(51 * 400);
      expect(c.handsToday()).toBe(1);
    });

    it('routes the round to the deck-speed store and keeps the record honest', () => {
      updateSetting('mode', 'deck-speed');
      const { c } = createPage();
      c.deckSpeedStatsService.reset();
      c.start();
      countDownTheDeck(c, 100);
      // A deliberately wrong count, however fast, sets no record.
      c.onAnswer(999);
      expect(c.deckSpeedStatsService.stats().attempts).toBe(1);
      expect(c.deckSpeedStatsService.stats().correct).toBe(0);
      expect(c.deckSpeedStatsService.bestMs()).toBeNull();
      expect(c.statsService.stats().attempts).toBe(0);
      expect(c.trueCountStatsService.stats().attempts).toBe(0);
    });

    it('advances on the space bar and ignores a flip once the deck is done', () => {
      updateSetting('mode', 'deck-speed');
      const { c } = createPage();
      c.start();
      c.onKeyDown(new KeyboardEvent('keydown', { key: ' ' }));
      expect(c.currentIndex()).toBe(1);
      countDownTheDeck(c);
      expect(c.state()).toBe('answering');
      c.flipNext();
      expect(c.state()).toBe('answering');
    });

    it('offers no showdown — the deck-speed deck is not the live shoe', () => {
      updateSetting('mode', 'deck-speed');
      const { c } = createPage();
      c.start();
      countDownTheDeck(c);
      c.onAnswer(0);
      expect(c.usesLiveShoe()).toBe(false);
      expect(c.showdownAvailable()).toBe(false);
    });
  });

  describe('bet-spread drills', () => {
    function configureBetSpread(source: 'live-shoe' | 'classic' = 'live-shoe'): void {
      updateSetting('systemId', 'hi-lo');
      updateSetting('mode', 'bet-spread');
      updateSetting('trueCountSource', source);
      updateSetting('numberOfDecks', 6);
      updateSetting('penetration', 0.75);
      updateSetting('decksRemaining', 2);
      updateSetting('numberOfCards', 5);
      updateSetting('millisecondsBetweenCards', 100);
    }

    function streamToEnd(c: Internals): void {
      vi.advanceTimersByTime(c.cards().length * 100);
    }

    it('is a live-shoe drill that asks for the deck estimate first', () => {
      configureBetSpread();
      const { c } = createPage();
      expect(c.betSpreadDrill()).toBe(true);
      expect(c.liveShoeBetSpread()).toBe(true);
      expect(c.usesLiveShoe()).toBe(true);
      expect(c.asksDeckEstimate()).toBe(true);
      expect(c.isValid()).toBe(true);
    });

    it('is invalid for an unbalanced system, and start() refuses', () => {
      updateSetting('systemId', 'ko');
      updateSetting('mode', 'bet-spread');
      const { c } = createPage();
      expect(c.betSpreadDrill()).toBe(false);
      expect(c.isValid()).toBe(false);
      c.start();
      expect(c.state()).toBe('idle');
    });

    it('runs streaming → estimating → answering → betting → feedback', () => {
      configureBetSpread();
      const { c } = createPage();
      c.start();
      streamToEnd(c);
      expect(c.state()).toBe('estimating');
      c.onEstimate(5);
      expect(c.state()).toBe('answering');
      c.onAnswer(0);
      expect(c.state()).toBe('betting');
      expect(c.isDrillActive()).toBe(true);
      c.onBet(1);
      expect(c.state()).toBe('feedback');
    });

    it('skips the deck estimate on the classic preset', () => {
      configureBetSpread('classic');
      const { c } = createPage();
      expect(c.asksDeckEstimate()).toBe(false);
      c.start();
      streamToEnd(c);
      expect(c.state()).toBe('answering');
      c.onAnswer(0);
      c.onBet(1);
      const r = c.result();
      expect(r?.mode).toBe('bet-spread');
      if (r && r.mode === 'bet-spread') {
        // The classic preset's fixed decks, not a live shoe's.
        expect(r.decksRemaining).toBe(2);
        expect(r.deckEstimate).toBeUndefined();
      }
    });

    it('grades the bet against the ramp at the correct true count', () => {
      const engine = new CountingEngineService();
      configureBetSpread('classic');
      updateSetting('decksRemaining', 1);
      const { c } = createPage();
      c.start();
      const correctRc = engine.runningCount([...c.cards()], c.system());
      streamToEnd(c);
      c.onAnswer(correctRc);
      const ramp = c.settings().betRamp;
      const expectedUnits = ramp[Math.min(4, Math.max(0, correctRc - 1))];
      c.onBet(expectedUnits);
      const r = c.result();
      if (r && r.mode === 'bet-spread') {
        expect(r.correctTrueCount).toBe(correctRc);
        expect(r.correctUnits).toBe(expectedUnits);
        expect(r.betCorrect).toBe(true);
        expect(r.countCorrect).toBe(true);
        expect(r.isCorrect).toBe(true);
        expect(r.ramp).toEqual(ramp);
      }
    });

    it('routes the count to the true-count store and the bet to its own', () => {
      const engine = new CountingEngineService();
      configureBetSpread('classic');
      updateSetting('decksRemaining', 1);
      const { c } = createPage();
      c.trueCountStatsService.reset();
      c.betSpreadStatsService.reset();
      c.start();
      const correctRc = engine.runningCount([...c.cards()], c.system());
      streamToEnd(c);
      // Right count, deliberately wrong bet (0 is never a ramp entry).
      c.onAnswer(correctRc);
      c.onBet(99);
      expect(c.trueCountStatsService.stats().attempts).toBe(1);
      expect(c.trueCountStatsService.stats().correct).toBe(1);
      expect(c.betSpreadStatsService.stats().attempts).toBe(1);
      expect(c.betSpreadStatsService.stats().correct).toBe(0);
      expect(c.statsService.stats().attempts).toBe(0);
      // The rep counts toward the goal but not the streak (strict AND).
      expect(c.handsToday()).toBe(1);
      expect(c.result()?.isCorrect).toBe(false);
    });

    it('scores the deck estimate and carries the count across live-shoe rounds', () => {
      configureBetSpread();
      const { c } = createPage();
      c.deckEstimationStatsService.reset();
      c.start();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      c.onBet(1);
      expect(c.deckEstimationStatsService.stats().attempts).toBe(1);
      expect(c.deckEstimationStatsService.stats().correct).toBe(1);
      const first = c.result();
      if (!first || first.mode !== 'bet-spread') {
        throw new Error('expected a bet-spread result');
      }
      expect(first.deckEstimateWithinBand).toBe(true);
      expect(first.priorRunningCount).toBe(0);
      expect(c.shoeRunningCount()).toBe(first.correctRunningCount);
      // The next round of the same shoe opens on the carried count.
      c.runAgain();
      streamToEnd(c);
      c.onEstimate(c.actualDecksRemaining());
      c.onAnswer(0);
      c.onBet(1);
      const second = c.result();
      if (second && second.mode === 'bet-spread') {
        // The prior is the first round's graded count — which is legitimately 0
        // whenever the round's cards happen to cancel out, so assert the
        // carry-over itself rather than that it is non-zero.
        expect(second.priorRunningCount).toBe(first.correctRunningCount);
      }
    });

    it('offers the showdown off the same shoe after a bet-spread round', () => {
      configureBetSpread();
      const { fixture, c } = createPage();
      c.start();
      streamToEnd(c);
      c.onEstimate(5);
      c.onAnswer(0);
      c.onBet(1);
      expect(c.showdownAvailable()).toBe(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.count__showdown-button')).not.toBeNull();
    });

    it('ignores a bet outside the betting state', () => {
      configureBetSpread();
      const { c } = createPage();
      c.start();
      c.onBet(4);
      expect(c.state()).toBe('streaming');
      expect(c.result()).toBeNull();
    });
  });

  describe('the idle screen', () => {
    it('names the mode it is about to run', () => {
      const { fixture } = createPage();
      expect(
        (fixture.nativeElement.querySelector('.count__mode') as HTMLElement).textContent,
      ).toContain('Running count');

      updateSetting('mode', 'deck-speed');
      const speed = createPage();
      expect(
        (speed.fixture.nativeElement.querySelector('.count__mode') as HTMLElement).textContent,
      ).toContain('Deck speed');
    });
  });
});
