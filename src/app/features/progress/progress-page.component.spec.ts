import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { BasicStrategyStatsService } from '../../core/services/basic-strategy-stats.service';
import { BankrollService } from '../../core/services/bankroll.service';
import { CardCountingStatsService } from '../../core/services/card-counting-stats.service';
import { DeviationStatsService } from '../../core/services/deviation-stats.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import { MissTallyService, type ScenarioRef } from '../../core/services/miss-tally.service';
import { PracticeHistoryService } from '../../core/services/practice-history.service';
import { ShowdownStatsService } from '../../core/services/showdown-stats.service';
import { ProgressPageComponent, weekdayInitial } from './progress-page.component';

type Internals = { onKeyDown(event: KeyboardEvent): void };

function createPage(): {
  fixture: ComponentFixture<ProgressPageComponent>;
  c: Internals;
  navigate: ReturnType<typeof vi.spyOn>;
} {
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ProgressPageComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance as unknown as Internals, navigate };
}

function text(fixture: ComponentFixture<ProgressPageComponent>, selector: string): string {
  const el = fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`No element for "${selector}"`);
  return el.textContent!.replace(/\s+/g, ' ').trim();
}

// The Drill / Hands / Accuracy / Best-run cells of one trainer row.
function statRow(fixture: ComponentFixture<ProgressPageComponent>, label: string): string[] {
  const row = [...fixture.nativeElement.querySelectorAll('.progress__table tbody tr')].find(
    (tr) => tr.querySelector('th')!.textContent!.trim() === label,
  );
  if (!row) throw new Error(`No stat row "${label}"`);
  return [...row.querySelectorAll('th, td')].map((cell) => cell.textContent!.trim());
}

function record(
  store: { recordAttempt(correct: boolean): void },
  correct: number,
  wrong = 0,
): void {
  for (let i = 0; i < correct; i++) store.recordAttempt(true);
  for (let i = 0; i < wrong; i++) store.recordAttempt(false);
}

const SIXTEEN_V_TEN: ScenarioRef = { kind: 'hard', hand: '16', dealer: '10' };

describe('ProgressPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ProgressPageComponent],
      providers: [provideRouter([])],
    });
  });

  describe('weekdayInitial', () => {
    it('reads the date key as a local day', () => {
      // 2026-08-02 is a Sunday; a UTC parse would slip to Saturday west of GMT.
      expect(weekdayInitial('2026-08-02')).toBe('S');
      expect(weekdayInitial('2026-08-03')).toBe('M');
    });
  });

  describe('the week', () => {
    it('draws seven bars and names the streak and the goal', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.setDailyGoal(2);
      const history = TestBed.inject(PracticeHistoryService);
      history.recordHand(true);
      history.recordHand(true);
      const { fixture } = createPage();

      expect(fixture.nativeElement.querySelectorAll('.progress__bar')).toHaveLength(7);
      expect(text(fixture, '.progress__week-note')).toBe(
        '1-day streak · goal 2 hands/day · 2 hands all time',
      );
    });

    it('scales the bars against the goal, so an unmet week is not a full bar', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.setDailyGoal(20);
      const history = TestBed.inject(PracticeHistoryService);
      for (let i = 0; i < 5; i++) history.recordHand(true);
      const { fixture } = createPage();

      const bars = [...fixture.nativeElement.querySelectorAll('.progress__bar')] as HTMLElement[];
      // Six empty days, then today at a quarter of the goal.
      expect(bars.slice(0, 6).every((bar) => bar.style.height === '0%')).toBe(true);
      expect(bars[6].style.height).toBe('25%');
      expect(bars[6].classList.contains('progress__bar--today')).toBe(true);
      expect(bars[6].classList.contains('progress__bar--met')).toBe(false);
    });

    // The bars are volume. Accuracy is the half that says whether the practice
    // is working, and it is on none of them.
    it('says how much of the week was right', () => {
      const history = TestBed.inject(PracticeHistoryService);
      history.recordHand(true);
      history.recordHand(true);
      history.recordHand(false);
      const { fixture } = createPage();

      expect(text(fixture, '.progress__accuracy')).toContain('67% correct');
      // One week is a reading, not yet a direction.
      expect(fixture.nativeElement.querySelector('.progress__trend')).toBeNull();
    });

    it('names the direction once there is a week before to compare with', () => {
      const history = TestBed.inject(PracticeHistoryService);
      let now = new Date(2026, 6, 10, 12, 0);
      history.setNowSource(() => now);
      history.recordHand(false);
      history.recordHand(true);
      now = new Date(2026, 6, 18, 12, 0);
      history.recordHand(true);
      const { fixture } = createPage();

      const trend = fixture.nativeElement.querySelector('.progress__trend') as HTMLElement;
      expect(trend.textContent!.trim()).toBe('up from 50% the week before');
      expect(trend.classList.contains('progress__good')).toBe(true);
    });

    // Accuracy says whether the practice is working; the pace says whether it
    // would survive a table.
    it('says how long a hand took this week', () => {
      const history = TestBed.inject(PracticeHistoryService);
      history.recordHand(true, 3000);
      history.recordHand(true, 5000);
      const { fixture } = createPage();

      const lines = [...fixture.nativeElement.querySelectorAll('.progress__accuracy')].map((el) =>
        (el as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(lines.some((line) => line.includes('4s a hand this week'))).toBe(true);
    });

    // Faster is the good direction here, which the accuracy trend's colours
    // would get backwards.
    it('calls a quicker week faster, not "up"', () => {
      const history = TestBed.inject(PracticeHistoryService);
      let now = new Date(2026, 6, 10, 12, 0);
      history.setNowSource(() => now);
      history.recordHand(true, 6000);
      now = new Date(2026, 6, 18, 12, 0);
      history.recordHand(true, 3000);
      const { fixture } = createPage();

      const trends = [
        ...fixture.nativeElement.querySelectorAll('.progress__trend'),
      ] as HTMLElement[];
      const pace = trends.find((el) => el.textContent!.includes('s the week before'))!;
      expect(pace.textContent!.trim()).toBe('faster than 6s the week before');
      expect(pace.classList.contains('progress__good')).toBe(true);
    });

    it('says nothing about the pace before anything is timed', () => {
      TestBed.inject(PracticeHistoryService).recordHand(true);
      const { fixture } = createPage();
      const lines = [...fixture.nativeElement.querySelectorAll('.progress__accuracy')].map(
        (el) => (el as HTMLElement).textContent!,
      );
      expect(lines.some((line) => line.includes('a hand this week'))).toBe(false);
    });

    it('says nothing about accuracy before anything is graded', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelector('.progress__accuracy')).toBeNull();
    });

    it('reads a day of numbers out for a screen reader', () => {
      const history = TestBed.inject(PracticeHistoryService);
      history.recordHand(true);
      history.recordHand(false);
      const { fixture } = createPage();

      const labels = [...fixture.nativeElement.querySelectorAll('.progress__day .sr-only')].map(
        (el) => (el as HTMLElement).textContent!.trim(),
      );
      expect(labels[6]).toBe('2 hands, 50% correct');
      expect(labels[0]).toBe('0 hands');
    });

    it('uses singular grammar when a day contains one hand', () => {
      TestBed.inject(PracticeHistoryService).recordHand(true);
      const { fixture } = createPage();
      const labels = fixture.nativeElement.querySelectorAll('.progress__day .sr-only');
      expect((labels[6] as HTMLElement).textContent!.trim()).toBe('1 hand, 100% correct');
    });
  });

  describe('the trainer table', () => {
    it('lists every store, with a dash until a drill has been answered', () => {
      record(TestBed.inject(BasicStrategyStatsService), 9, 1);
      const { fixture } = createPage();

      expect(statRow(fixture, 'Basic Strategy')).toEqual(['Basic Strategy', '10', '90%', '9']);
      expect(statRow(fixture, 'Deviations')).toEqual(['Deviations', '0', '—', '0']);
      const labels = [...fixture.nativeElement.querySelectorAll('.progress__table tbody th')].map(
        (th) => (th as HTMLElement).textContent!.trim(),
      );
      expect(labels).toEqual([
        'Basic Strategy',
        'Deviations',
        'Running count',
        'True count',
        'Deck estimate',
        'Key count call',
        'Bet spread',
        'Deck speed',
        'Showdown play',
      ]);
    });

    it('marks 85% and up as good', () => {
      record(TestBed.inject(DeviationStatsService), 17, 3);
      const { fixture } = createPage();
      const cells = fixture.nativeElement.querySelectorAll('.progress__good');
      expect(cells.length).toBe(1);
      expect((cells[0] as HTMLElement).textContent!.trim()).toBe('85%');
    });
  });

  describe('the showdown ledger', () => {
    it('stays hidden until a hand has been played', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelector('.progress__record')).toBeNull();
    });

    it('shows the record, and the chips only once something was wagered', () => {
      const showdown = TestBed.inject(ShowdownStatsService);
      showdown.record('win', true);
      showdown.record('lose');
      showdown.record('push');
      showdown.record('win');
      const { fixture } = createPage();

      expect(text(fixture, '.progress__record')).toBe(
        '2W · 1L · 1P4 hands · 1 blackjacks · 50% won',
      );
      expect(fixture.nativeElement.querySelectorAll('.progress__record')).toHaveLength(1);
    });

    it('reports the bankroll as a signed net once bets are placed', () => {
      TestBed.inject(ShowdownStatsService).record('win');
      TestBed.inject(BankrollService).record(10, 10);
      const { fixture } = createPage();

      const records = fixture.nativeElement.querySelectorAll('.progress__record');
      expect(records).toHaveLength(2);
      expect((records[1] as HTMLElement).textContent!.replace(/\s+/g, ' ').trim()).toBe(
        '+10 510 chips on hand · 10 wagered',
      );
      expect(records[1].querySelector('.progress__good')).toBeTruthy();
    });
  });

  describe('weak spots', () => {
    it('names nothing until a scenario has been missed', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelectorAll('.progress__spots')).toHaveLength(0);
    });

    it('lists the outstanding scenarios worst first, with the cleared ones', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('basic-strategy', SIXTEEN_V_TEN, false);
      tally.record('basic-strategy', SIXTEEN_V_TEN, false);
      const softEighteen: ScenarioRef = { kind: 'soft', hand: '18', dealer: '9' };
      tally.record('basic-strategy', softEighteen, false);
      // Cleared: missed once, then three correct in a row.
      const pairEights: ScenarioRef = { kind: 'pair', hand: '8', dealer: '10' };
      tally.record('basic-strategy', pairEights, false);
      for (let i = 0; i < 3; i++) tally.record('basic-strategy', pairEights, true);

      const { fixture } = createPage();
      const spots = [...fixture.nativeElement.querySelectorAll('.progress__spots li')].map((li) =>
        (li as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(spots).toEqual(['16 vs 10missed 2 of 2', 'A,7 vs 9missed 1 of 1']);
      expect(text(fixture, '.progress__cleared')).toBe('Cleared: 8,8 vs 10');
    });

    // The deviations trainer already re-deals a weak spot at a count it was
    // missed at; until now nothing said what those counts were.
    it('names the true counts a deviation was missed at, low to high and deduplicated', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('deviations', SIXTEEN_V_TEN, false, 2);
      tally.record('deviations', SIXTEEN_V_TEN, false, -1);
      tally.record('deviations', SIXTEEN_V_TEN, false, 2);

      const { fixture } = createPage();
      const spot = fixture.nativeElement.querySelector('.progress__spots li') as HTMLElement;
      expect(spot.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        '16 vs 10missed 3 of 3 at TC -1, +2',
      );
    });

    it('leaves the count off a basic-strategy spot, where it is not the question', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('basic-strategy', SIXTEEN_V_TEN, false);

      const { fixture } = createPage();
      const spot = fixture.nativeElement.querySelector('.progress__spots li') as HTMLElement;
      expect(spot.textContent).not.toContain('TC');
    });

    it('still shows a trainer whose spots are all cleared', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('basic-strategy', SIXTEEN_V_TEN, false);
      for (let i = 0; i < 3; i++) tally.record('basic-strategy', SIXTEEN_V_TEN, true);

      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelectorAll('.progress__spots')).toHaveLength(0);
      expect(text(fixture, '.progress__empty')).toBe('Nothing outstanding.');
      expect(text(fixture, '.progress__cleared')).toBe('Cleared: 16 vs 10');
    });

    it('keeps each trainer to its own card', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('deviations', SIXTEEN_V_TEN, false);
      const { fixture } = createPage();

      const headings = [...fixture.nativeElement.querySelectorAll('.progress__heading')].map((h) =>
        (h as HTMLElement).textContent!.trim(),
      );
      expect(headings).toContain('Deviations — this week');
      expect(headings).not.toContain('Basic Strategy — this week');
    });
  });

  describe('navigation', () => {
    it('goes home on Back and on Escape', () => {
      const { fixture, c, navigate } = createPage();
      (fixture.nativeElement.querySelector('.progress__back') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/']);

      navigate.mockClear();
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
