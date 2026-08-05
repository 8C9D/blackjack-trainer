import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { BetSpreadStatsService } from '../../core/services/bet-spread-stats.service';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { DeckEstimationStatsService } from '../../core/services/deck-estimation-stats.service';
import { DeckSpeedStatsService } from '../../core/services/deck-speed-stats.service';
import { KeyCountStatsService } from '../../core/services/key-count-stats.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { TrueCountStatsService } from '../../core/services/true-count-stats.service';
import { HomePageComponent, formatDayLabel } from './home-page.component';

type Internals = {
  onKeyDown(event: KeyboardEvent): void;
};

function createPage(): {
  fixture: ComponentFixture<HomePageComponent>;
  c: Internals;
  navigate: ReturnType<typeof vi.spyOn>;
} {
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(HomePageComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance as unknown as Internals, navigate };
}

function text(fixture: ComponentFixture<HomePageComponent>, selector: string): string {
  const el = fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`No element for "${selector}"`);
  return el.textContent!.replace(/\s+/g, ' ').trim();
}

function recordCorrect(store: { recordAttempt(c: boolean): void }, correct: number, wrong = 0) {
  for (let i = 0; i < correct; i++) store.recordAttempt(true);
  for (let i = 0; i < wrong; i++) store.recordAttempt(false);
}

describe('HomePageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [provideRouter([])],
    });
  });

  describe('formatDayLabel', () => {
    it('names the weekday and part of day', () => {
      expect(formatDayLabel(new Date(2026, 6, 9, 19, 30))).toBe('Thursday evening');
      expect(formatDayLabel(new Date(2026, 6, 6, 9, 0))).toBe('Monday morning');
      expect(formatDayLabel(new Date(2026, 6, 7, 13, 0))).toBe('Tuesday afternoon');
    });
  });

  describe('the one loud action', () => {
    it('continues the last trainer with hands-to-goal subtext', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.setLastTrainer('basic-strategy');
      const history = TestBed.inject(PracticeHistoryService);
      for (let i = 0; i < 14; i++) history.recordHand(true);

      const { fixture } = createPage();
      expect(text(fixture, '.home__primary')).toContain('Continue — Basic Strategy');
      expect(text(fixture, '.home__primary')).toContain("6 hands to today's goal");
      expect(text(fixture, '.ring')).toContain('14/20');
    });

    it('starts the last trainer on click and on Enter — one interaction total', () => {
      TestBed.inject(FlowPrefsService).setLastTrainer('deviations');
      const { fixture, c, navigate } = createPage();

      (fixture.nativeElement.querySelector('.home__primary') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/drill', 'deviations']);

      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(navigate).toHaveBeenCalledTimes(2);
    });

    it('celebrates a met goal instead of nagging', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(2);
      const history = TestBed.inject(PracticeHistoryService);
      history.recordHand(true);
      history.recordHand(true);
      const { fixture } = createPage();
      expect(text(fixture, '.home__primary')).toContain('goal met — one more round?');
    });
  });

  describe('the other two trainers', () => {
    it('keeps canonical order with number keys 2 and 3', () => {
      TestBed.inject(FlowPrefsService).setLastTrainer('card-counting');
      const { fixture, c, navigate } = createPage();

      const others = Array.from(
        fixture.nativeElement.querySelectorAll('.home__other-label'),
      ) as HTMLElement[];
      expect(others.map((o) => o.textContent)).toEqual(['Basic Strategy', 'Deviations']);

      c.onKeyDown(new KeyboardEvent('keydown', { key: '2' }));
      expect(navigate).toHaveBeenCalledWith(['/drill', 'basic-strategy']);
      c.onKeyDown(new KeyboardEvent('keydown', { key: '3' }));
      expect(navigate).toHaveBeenCalledWith(['/drill', 'deviations']);
    });

    it('shows lifetime accuracy chips, combining the two counting stores', () => {
      recordCorrect(TestBed.inject(CardCountingStatsService), 9, 1); // 90%
      recordCorrect(TestBed.inject(TrueCountStatsService), 5, 5); // combined 14/20 = 70%
      recordCorrect(TestBed.inject(DeviationStatsService), 6, 2); // 75%
      TestBed.inject(FlowPrefsService).setLastTrainer('basic-strategy');

      const { fixture } = createPage();
      const chips = Array.from(
        fixture.nativeElement.querySelectorAll('.home__chip'),
      ) as HTMLElement[];
      expect(chips.map((chip) => chip.textContent)).toEqual(['70%', '75%']);
    });

    it('marks untouched trainers as new and high accuracy as good', () => {
      recordCorrect(TestBed.inject(BasicStrategyStatsService), 9, 1); // 90% → good
      TestBed.inject(FlowPrefsService).setLastTrainer('card-counting');
      const { fixture } = createPage();
      const chips = Array.from(
        fixture.nativeElement.querySelectorAll('.home__chip'),
      ) as HTMLElement[];
      expect(chips[0].textContent).toBe('90%');
      expect(chips[0].classList.contains('home__chip--good')).toBe(true);
      expect(chips[1].textContent).toBe('new');
    });
  });

  describe('settings', () => {
    it('is a quiet link, also on the comma key', () => {
      const { fixture, c, navigate } = createPage();
      (fixture.nativeElement.querySelector('.home__settings') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/settings']);
      c.onKeyDown(new KeyboardEvent('keydown', { key: ',' }));
      expect(navigate).toHaveBeenCalledTimes(2);
    });
  });

  describe('chart', () => {
    it('is a quiet link, also on the C key', () => {
      const { fixture, c, navigate } = createPage();
      (fixture.nativeElement.querySelector('.home__chart') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/chart']);
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'c' }));
      expect(navigate).toHaveBeenCalledTimes(2);
    });
  });

  describe('progress', () => {
    it('is a quiet link, also on the P key', () => {
      const { fixture, c, navigate } = createPage();
      (fixture.nativeElement.querySelector('.home__progress') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/progress']);
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'p' }));
      expect(navigate).toHaveBeenCalledTimes(2);
    });
  });

  describe('streak strip', () => {
    it('renders seven dots and the streak label', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelectorAll('.dots__dot')).toHaveLength(7);
      expect(text(fixture, '.dots__label')).toBe('No streak yet');
    });
  });

  describe('the Card Counting accuracy chip', () => {
    // The chip lives on the trainer's own button; find it by that button's label.
    function countingChip(fixture: ComponentFixture<HomePageComponent>): string {
      const button = [...fixture.nativeElement.querySelectorAll('.home__other')].find((el) =>
        (el as HTMLElement).textContent?.includes('Card Counting'),
      ) as HTMLElement | undefined;
      if (!button) throw new Error('No Card Counting button');
      return (button.querySelector('.home__chip') as HTMLElement).textContent!.trim();
    }

    it('sums every counting store, not just the two oldest', () => {
      TestBed.inject(FlowPrefsService).setLastTrainer('basic-strategy');
      recordCorrect(TestBed.inject(CardCountingStatsService), 1);
      recordCorrect(TestBed.inject(TrueCountStatsService), 0, 1);
      recordCorrect(TestBed.inject(KeyCountStatsService), 1);
      recordCorrect(TestBed.inject(BetSpreadStatsService), 1);
      recordCorrect(TestBed.inject(DeckSpeedStatsService), 1);
      recordCorrect(TestBed.inject(DeckEstimationStatsService), 1);
      const { fixture } = createPage();
      // 5 of 6 correct across the six stores.
      expect(countingChip(fixture)).toBe('83%');
    });

    // The estimate is what the true count is divided by, and Progress has always
    // listed it as one of this trainer's rows. Leaving it out let the chip read
    // 90% for someone missing the divisor nine rounds in ten.
    it('counts the deck estimate the true-count round is graded beside', () => {
      TestBed.inject(FlowPrefsService).setLastTrainer('basic-strategy');
      recordCorrect(TestBed.inject(CardCountingStatsService), 9, 1);
      recordCorrect(TestBed.inject(TrueCountStatsService), 9, 1);
      recordCorrect(TestBed.inject(DeckEstimationStatsService), 1, 9);
      const { fixture } = createPage();
      // 19 of 30, not the 18 of 20 the two count stores show on their own.
      expect(countingChip(fixture)).toBe('63%');
    });

    it('reads as new only when no counting store has an attempt', () => {
      TestBed.inject(FlowPrefsService).setLastTrainer('basic-strategy');
      const before = createPage();
      expect(countingChip(before.fixture)).toBe('new');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [HomePageComponent],
        providers: [provideRouter([])],
      });
      TestBed.inject(FlowPrefsService).setLastTrainer('basic-strategy');
      recordCorrect(TestBed.inject(DeckSpeedStatsService), 1);
      const after = createPage();
      expect(countingChip(after.fixture)).toBe('100%');
    });
  });
});
