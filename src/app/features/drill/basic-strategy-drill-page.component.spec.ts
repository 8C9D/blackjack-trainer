import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import {
  ALL_RANKS,
  type Card,
  type Rank,
  type Scenario,
  type Suit,
} from '../../core/models/card.model';
import type { Action, EvaluationResult } from '../../core/models/strategy.model';
import { BASIC_STRATEGY_STATS_KEY } from '../../core/services/basic-strategy-stats.service';
import { CardGeneratorService } from '../../core/services/card-generator.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import {
  CLEAR_STREAK,
  MissTallyService,
  type ScenarioRef,
} from '../../core/services/miss-tally.service';
import {
  MAX_TIMED_DECISION_MS,
  PracticeHistoryService,
} from '../../core/services/practice-history.service';
import { BasicStrategyDrillPageComponent } from './basic-strategy-drill-page.component';
import { handQuestion } from './drill-hand';
import { FLOW_ADVANCE_DELAY_MS } from './drill-timing';

const ADVANCE_MS = 50;

const card = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

const scenarioOf = (c1: Rank, c2: Rank, up: Rank): Scenario => ({
  player: [card(c1), card(c2, 'hearts')],
  dealerUpcard: card(up, 'clubs'),
});

// Hard 7 (3+4) vs 6 always hits under S17 — "H" is correct, "S" is wrong.
const HIT_SCENARIO = scenarioOf('3', '4', '6');

// Hard 19 (10+9) vs 6 always stands, which ends the hand in one decision.
const STAND_SCENARIO = scenarioOf('10', '9', '6');

// The page exposes its signals/methods as `protected`; at runtime they are
// plain properties. This mirror lets the tests drive them directly, matching
// the approach of the pre-Flow page specs.
type Internals = {
  scenario: { (): Scenario; set(v: Scenario): void };
  hands: { (): readonly (readonly Card[])[]; set(v: readonly (readonly Card[])[]): void };
  activeIndex: { (): number; set(v: number): void };
  hand: () => readonly Card[];
  handLabel: () => string;
  splitAces: { (): boolean; set(v: boolean): void };
  atDeal: { (): boolean; set(v: boolean): void };
  result: { (): EvaluationResult | null };
  phase: { (): 'question' | 'flash' | 'miss' | 'over' | 'done' };
  target: { (): number };
  handsToday: () => number;
  legalActions: () => readonly Action[];
  answer(action: Action): void;
  onKeyDown(event: KeyboardEvent): void;
  onHostClick(): void;
};

function asInternals(c: BasicStrategyDrillPageComponent): Internals {
  return c as unknown as Internals;
}

// Deal a scenario the way the page does: the opening two cards are both the
// recorded deal and the only hand in play, and the decision in front of the
// user is the deal's own.
function deal(c: Internals, scenario: Scenario): void {
  c.scenario.set(scenario);
  c.hands.set([scenario.player]);
  c.activeIndex.set(0);
  c.splitAces.set(false);
  c.atDeal.set(true);
}

function createPage(): {
  fixture: ComponentFixture<BasicStrategyDrillPageComponent>;
  c: Internals;
} {
  const fixture = TestBed.createComponent(BasicStrategyDrillPageComponent);
  fixture.detectChanges();
  return { fixture, c: asInternals(fixture.componentInstance) };
}

function actionButton(
  fixture: ComponentFixture<BasicStrategyDrillPageComponent>,
  label: string,
): HTMLButtonElement {
  const found = Array.from(fixture.nativeElement.querySelectorAll('.acts__btn')).find((b) =>
    ((b as HTMLElement).querySelector('.acts__label')?.textContent ?? '').includes(label),
  );
  if (!found) throw new Error(`No action button labelled "${label}"`);
  return found as HTMLButtonElement;
}

function key(c: Internals, k: string): void {
  c.onKeyDown(new KeyboardEvent('keydown', { key: k }));
}

// Pin the next card the drill draws. `generateCard` reads rank and suit off
// one call each, so a value inside the rank's 1/13 slice picks it exactly.
function nextCardIs(rank: Rank): void {
  const index = ALL_RANKS.indexOf(rank);
  TestBed.inject(CardGeneratorService).setRandomSource(() => (index + 0.5) / ALL_RANKS.length);
}

describe('BasicStrategyDrillPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [BasicStrategyDrillPageComponent],
      providers: [provideRouter([]), { provide: FLOW_ADVANCE_DELAY_MS, useValue: ADVANCE_MS }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('session setup', () => {
    it('records itself as the last trainer for Continue', () => {
      createPage();
      expect(TestBed.inject(FlowPrefsService).prefs().lastTrainer).toBe('basic-strategy');
    });

    it('targets the daily goal and shows the topbar counter', () => {
      const { fixture, c } = createPage();
      expect(c.target()).toBe(20);
      expect(
        (fixture.nativeElement.querySelector('.topbar__count') as HTMLElement).textContent,
      ).toBe('0/20');
    });

    it('opens on the recorded weak spot when one exists', () => {
      TestBed.inject(MissTallyService).record(
        'basic-strategy',
        { kind: 'hard', hand: '16', dealer: '10' },
        false,
      );
      const { fixture, c } = createPage();
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hard 16 vs 10');
      expect(c.phase()).toBe('question');
    });
  });

  describe('question line', () => {
    it('computes the hand for the user', () => {
      const { fixture, c } = createPage();
      deal(c, scenarioOf('A', '7', 'Q'));
      fixture.detectChanges();
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Soft 18 vs 10');
    });
  });

  describe('correct answer — grade in place, auto-advance', () => {
    it('flashes the pressed button green and locks input', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();

      actionButton(fixture, 'Hit').click();
      fixture.detectChanges();

      expect(c.phase()).toBe('flash');
      expect(actionButton(fixture, 'Hit').classList.contains('acts__btn--correct')).toBe(true);
      // No feedback panel anywhere — the grade lands on the button.
      expect(fixture.nativeElement.querySelector('.drill__rule')).toBeNull();
    });

    it('auto-advances to a new hand after the delay with zero extra taps', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();

      c.answer('H');
      expect(c.phase()).toBe('flash');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();

      expect(c.phase()).toBe('question');
      expect(c.result()).toBeNull();
      expect(c.handsToday()).toBe(1);
    });

    it('ignores further answers while flashing', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      c.answer('H');
      c.answer('S');
      expect(c.handsToday()).toBe(1);
    });
  });

  // Grading is conveyed by color and position on the action grid, neither of
  // which a screen reader can report. The live region is the only channel
  // that carries the verdict, so it has to hold the whole sentence.
  describe('grading announcement', () => {
    function liveRegion(fixture: ComponentFixture<BasicStrategyDrillPageComponent>): HTMLElement {
      return fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    }

    it('is silent while a hand is unanswered', () => {
      const { fixture } = createPage();
      expect(liveRegion(fixture).textContent).toBe('');
    });

    it('names the correct action on a hit', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();
      actionButton(fixture, 'Hit').click();
      fixture.detectChanges();
      expect(liveRegion(fixture).textContent).toBe('Correct: Hit.');
    });

    it('names the verdict, the correct action, and the reason on a miss', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();
      actionButton(fixture, 'Stand').click();
      fixture.detectChanges();
      const text = liveRegion(fixture).textContent!;
      expect(text).toContain('Incorrect. Correct: Hit.');
      expect(text).toContain('Hard 7 vs dealer 6 under S17: hit.');
    });

    it('clears on the next hand so the following verdict is a fresh change', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();
      actionButton(fixture, 'Hit').click();
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(liveRegion(fixture).textContent).toBe('');
    });
  });

  describe('miss — the only pause in the loop', () => {
    it('shows the rule in place of the question and waits', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();

      actionButton(fixture, 'Stand').click();
      fixture.detectChanges();

      expect(c.phase()).toBe('miss');
      const rule = fixture.nativeElement.querySelector('.drill__rule') as HTMLElement;
      expect(rule.textContent).toContain('Correct: Hit.');
      expect(rule.textContent).toContain('Hard 7 vs dealer 6 under S17: hit.');
      expect(fixture.nativeElement.querySelector('.drill__question')).toBeNull();
      expect(actionButton(fixture, 'Stand').classList.contains('acts__btn--picked')).toBe(true);
      expect(actionButton(fixture, 'Hit').classList.contains('acts__btn--correct')).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(c.phase()).toBe('miss');
    });

    it('continues on any key', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      c.answer('S');
      expect(c.phase()).toBe('miss');
      key(c, 'x');
      expect(c.phase()).toBe('question');
      expect(c.result()).toBeNull();
    });

    it('continues on a tap anywhere, but not on the tap that graded the miss', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      fixture.detectChanges();

      // The grading click bubbles to the host after answer() runs, and is
      // swallowed instead of continuing.
      actionButton(fixture, 'Stand').click();
      expect(c.phase()).toBe('miss');

      // The next tap continues.
      c.onHostClick();
      expect(c.phase()).toBe('question');
    });

    it('a key-graded miss continues on the very next tap', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      key(c, 's');
      expect(c.phase()).toBe('miss');
      c.onHostClick();
      expect(c.phase()).toBe('question');
    });
  });

  describe('poka-yoke', () => {
    it('disables illegal actions and keeps their hotkeys dead', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO); // non-pair, no ace up, LS off
      fixture.detectChanges();

      expect(c.legalActions()).toEqual(['H', 'S', 'D']);
      expect(actionButton(fixture, 'Split').disabled).toBe(true);
      expect(actionButton(fixture, 'Insurance').disabled).toBe(true);
      expect(actionButton(fixture, 'Surrender').disabled).toBe(true);

      key(c, 'p');
      key(c, 'i');
      key(c, 'r');
      expect(c.phase()).toBe('question');
      expect(c.handsToday()).toBe(0);
    });

    it('offers surrender once the Late Surrender rule is on', () => {
      TestBed.inject(FlowPrefsService).setOptions({
        doubleAfterSplit: false,
        lateSurrender: true,
      });
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      expect(c.legalActions()).toContain('SUR');
    });

    it('offers insurance against a dealer ace and grades it via the engine', () => {
      const { c } = createPage();
      deal(c, scenarioOf('3', '4', 'A'));
      expect(c.legalActions()).toContain('INS');
      c.answer('INS');
      expect(c.phase()).toBe('miss');
      expect(c.result()!.reason).toContain('never takes insurance');
    });
  });

  // A hit is the one correct answer that leaves another decision behind it. The
  // drill follows it rather than dealing a fresh hand, which is the only place
  // in the app a multi-card decision is taught.
  describe('playing the hand out', () => {
    function hitOnce(c: Internals, rank: Rank): void {
      nextCardIs(rank);
      c.answer('H');
      vi.advanceTimersByTime(ADVANCE_MS);
    }

    it('deals the next card and asks the decision it leaves', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO); // hard 7 vs 6
      hitOnce(c, '9');
      fixture.detectChanges();

      expect(c.phase()).toBe('question');
      expect(c.hand().length).toBe(3);
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hard 16 vs 6');
    });

    it('leaves only hit and stand answerable once a card is drawn', () => {
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      hitOnce(c, '9');
      fixture.detectChanges();

      expect(c.legalActions()).toEqual(['H', 'S']);
      expect(actionButton(fixture, 'Double').disabled).toBe(true);
      expect(actionButton(fixture, 'Split').disabled).toBe(true);
    });

    it('grades the continued decision against the hand as it stands', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      hitOnce(c, '9'); // hard 16 vs 6 — stand
      c.answer('H');
      expect(c.phase()).toBe('miss');
      expect(c.result()!.reason).toContain('Hard 16 vs dealer 6 under S17: stand.');
    });

    // A hard 11 doubles on the opening two cards and can only hit once a card
    // is drawn — the rule the dead Double button is teaching.
    it('reads the same total differently once doubling has lapsed', () => {
      const { c } = createPage();
      deal(c, scenarioOf('5', '3', '6')); // hard 8 vs 6 — hit
      hitOnce(c, '3'); // hard 11 vs 6, three cards deep
      c.answer('D');
      // Double is not even answerable, so the press is dead rather than wrong.
      expect(c.phase()).toBe('question');
      c.answer('H');
      expect(c.phase()).toBe('flash');
      expect(c.result()!.correct).toBe(true);
    });

    it('holds the bust on screen, then deals on', () => {
      const { fixture, c } = createPage();
      deal(c, scenarioOf('10', '6', '10')); // hard 16 vs 10 — hit
      hitOnce(c, 'K');
      fixture.detectChanges();

      expect(c.phase()).toBe('over');
      expect((fixture.nativeElement.querySelector('.drill__rule') as HTMLElement).textContent).toBe(
        'Bust — 26.',
      );
      // The hit still graded as correct: the play was right, the card was not.
      expect(c.result()!.correct).toBe(true);

      vi.advanceTimersByTime(ADVANCE_MS * 2);
      fixture.detectChanges();
      expect(c.phase()).toBe('question');
      expect(c.hand().length).toBe(2);
    });

    it('ends the hand on 21 with nothing left to ask', () => {
      const { fixture, c } = createPage();
      deal(c, scenarioOf('10', '6', '10'));
      hitOnce(c, '5');
      fixture.detectChanges();

      expect(c.phase()).toBe('over');
      expect((fixture.nativeElement.querySelector('.drill__rule') as HTMLElement).textContent).toBe(
        '21 — nothing left to decide.',
      );
    });

    // Every decision is a rep, so a hand played out counts for as many as it asks.
    it('counts each decision toward the day', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      hitOnce(c, '2'); // hard 9 vs 6 — double, but three cards deep it hits
      expect(c.handsToday()).toBe(1);
      c.answer('H');
      expect(c.handsToday()).toBe(2);
    });

    // A `ScenarioRef` names a two-card hand. Filing a three-card 16 under one
    // would re-deal a hand that can double, which is a different question.
    it('files a weak spot for the opening decision only', () => {
      const tally = TestBed.inject(MissTallyService);
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      hitOnce(c, '9'); // hard 16 vs 6 — stand
      c.answer('H'); // wrong, but three cards deep
      expect(c.phase()).toBe('miss');
      expect(tally.weakSpotFor('basic-strategy')).toBeNull();
    });

    it('finishes the hand it is on before the Done screen', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      hitOnce(c, '9');
      // The goal is met, but the hand still owes a decision.
      expect(c.handsToday()).toBe(1);
      expect(c.phase()).toBe('question');

      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(c.phase()).toBe('done');
    });

    it('deals a fresh hand instead when the setting is off', () => {
      TestBed.inject(FlowPrefsService).setPlayHandsOut(false);
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      hitOnce(c, '9');
      expect(c.hand().length).toBe(2);
      expect(c.hand()).toEqual(c.scenario().player);
    });
  });

  // A split is the other correct answer that leaves decisions behind it — two
  // of them, on hands the drill never used to ask about. The showdown's table
  // has played splits out since it shipped; the drill that teaches the play
  // ended the hand and dealt a fresh one, so "split 8s, then what" was the one
  // question the chart's most-drilled cell never led to.
  describe('playing a split out', () => {
    // 8,8 is a split against every upcard, so the split itself is always the
    // correct answer here and what follows is the hand it made.
    const PAIR_8S_V_6 = scenarioOf('8', '8', '6');
    const PAIR_ACES_V_6 = scenarioOf('A', 'A', '6');

    // Split correctly, with the card each new hand draws pinned.
    function splitOnce(c: Internals, rank: Rank): void {
      nextCardIs(rank);
      c.answer('P');
      vi.advanceTimersByTime(ADVANCE_MS);
    }

    it('turns one hand into two and asks about the first', () => {
      const { fixture, c } = createPage();
      deal(c, PAIR_8S_V_6);
      splitOnce(c, '3');
      fixture.detectChanges();

      expect(c.phase()).toBe('question');
      expect(c.hands().length).toBe(2);
      expect(c.hand().length).toBe(2); // 8 + 3
      const q = fixture.nativeElement.querySelector('.drill__question') as HTMLElement;
      expect(q.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hard 11 vs 6');
    });

    // The stage shows one hand at a time, so without this the second hand of a
    // split is indistinguishable from a fresh deal.
    it('names which hand of the split is in front of you', () => {
      const { fixture, c } = createPage();
      expect(c.handLabel()).toBe('');

      deal(c, PAIR_8S_V_6);
      splitOnce(c, '3');
      fixture.detectChanges();
      expect(c.handLabel()).toBe('Hand 1 of 2');
      expect(
        (fixture.nativeElement.querySelector('.stage__hand-label') as HTMLElement).textContent,
      ).toBe('Hand 1 of 2');
      expect(
        (fixture.nativeElement.querySelector('.stage__hand') as HTMLElement).getAttribute(
          'aria-label',
        ),
      ).toBe('Hand 1 of 2');
    });

    // Insurance was settled on the deal and surrender is a first-two-cards
    // action of the hand the dealer dealt. Both are gone for good.
    it('takes surrender and insurance off a hand out of a split', () => {
      TestBed.inject(FlowPrefsService).setOptions({
        doubleAfterSplit: false,
        lateSurrender: true,
      });
      const { c } = createPage();
      deal(c, { player: [card('8'), card('8', 'hearts')], dealerUpcard: card('A', 'clubs') });
      expect(c.legalActions()).toContain('SUR');
      expect(c.legalActions()).toContain('INS');

      splitOnce(c, '3');
      expect(c.legalActions()).toEqual(['H', 'S']);
    });

    it('offers the double back only under DAS, and grades it that way', () => {
      TestBed.inject(FlowPrefsService).setOptions({
        doubleAfterSplit: true,
        lateSurrender: false,
      });
      const { c } = createPage();
      deal(c, PAIR_8S_V_6);
      splitOnce(c, '3'); // hard 11 vs 6

      expect(c.legalActions()).toEqual(['H', 'S', 'D']);
      c.answer('D');
      expect(c.result()!.correct).toBe(true);
    });

    it('makes the same 11 a hit when the table has no DAS', () => {
      const { c } = createPage();
      deal(c, PAIR_8S_V_6);
      splitOnce(c, '3');

      expect(c.legalActions()).toEqual(['H', 'S']);
      c.answer('H');
      expect(c.result()!.correct).toBe(true);
    });

    it('moves to the second hand when the first is finished, then deals on', () => {
      const { fixture, c } = createPage();
      deal(c, PAIR_8S_V_6);
      splitOnce(c, '10'); // 8 + 10 = hard 18 vs 6 — stand

      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(c.handLabel()).toBe('Hand 2 of 2');
      expect(c.hand().length).toBe(2); // its second card was dealt on arrival

      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(c.hands().length).toBe(1);
      expect(c.hand()).toEqual(c.scenario().player);
    });

    // Split aces take a single card each and stand — the rule the showdown's
    // table already plays, and the reason a 21 made that way is not a natural.
    it('gives split aces one card each and never asks', () => {
      const { fixture, c } = createPage();
      deal(c, PAIR_ACES_V_6);
      splitOnce(c, '5');
      fixture.detectChanges();

      expect(c.phase()).toBe('over');
      expect((fixture.nativeElement.querySelector('.drill__rule') as HTMLElement).textContent).toBe(
        '16 — split aces take one card.',
      );

      vi.advanceTimersByTime(ADVANCE_MS * 2);
      fixture.detectChanges();
      expect(c.phase()).toBe('over'); // the second ace, same rule
      expect(c.handLabel()).toBe('Hand 2 of 2');

      vi.advanceTimersByTime(ADVANCE_MS * 2);
      fixture.detectChanges();
      expect(c.hands().length).toBe(1);
    });

    it('re-splits a pair up to four hands, then reads it as a total', () => {
      const { c } = createPage();
      deal(c, PAIR_8S_V_6);
      splitOnce(c, '8'); // 8,8 again
      expect(c.hands().length).toBe(2);
      expect(c.legalActions()).toContain('P');

      splitOnce(c, '8');
      expect(c.hands().length).toBe(3);
      splitOnce(c, '8');
      expect(c.hands().length).toBe(4);

      // At the cap the pair is not a pair the table will act on, so the chart is
      // read at the total: hard 16 vs 6 stands.
      expect(c.legalActions()).toEqual(['H', 'S']);
      c.answer('S');
      expect(c.result()!.correct).toBe(true);
    });

    // A hand out of a split is two cards again, but it is not the hand that was
    // dealt: filing it would re-deal an 11 that can surrender and insure.
    it('neither times nor files a decision on a hand out of a split', () => {
      const tally = TestBed.inject(MissTallyService);
      const { c } = createPage();
      deal(c, PAIR_8S_V_6);

      vi.advanceTimersByTime(2000);
      splitOnce(c, '3');

      vi.advanceTimersByTime(9000);
      c.answer('S'); // hard 11 vs 6 — wrong, and not the deal's question
      expect(c.result()!.correct).toBe(false);

      const history = TestBed.inject(PracticeHistoryService);
      expect(history.handsToday()).toBe(2);
      expect(history.paceLast7()).toBe(2); // the split alone, at 2.0s
      // The deal itself was answered correctly, so nothing is outstanding.
      expect(tally.weakSpotFor('basic-strategy')).toBeNull();
    });

    it('deals a fresh hand instead when the setting is off', () => {
      TestBed.inject(FlowPrefsService).setPlayHandsOut(false);
      const { c } = createPage();
      deal(c, PAIR_8S_V_6);
      splitOnce(c, '3');
      expect(c.hands().length).toBe(1);
      expect(c.hand()).toEqual(c.scenario().player);
    });
  });

  describe('recording', () => {
    it('feeds the legacy stats store, the practice history, and the miss tally', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      c.answer('H');

      const stats = JSON.parse(localStorage.getItem(BASIC_STRATEGY_STATS_KEY)!);
      expect(stats.attempts).toBe(1);
      expect(stats.correct).toBe(1);
      expect(TestBed.inject(PracticeHistoryService).handsToday()).toBe(1);
      // A correct answer alone yields no weak spot.
      expect(TestBed.inject(MissTallyService).weakSpotFor('basic-strategy')).toBeNull();

      vi.advanceTimersByTime(ADVANCE_MS);
      deal(c, HIT_SCENARIO);
      c.answer('S');
      expect(TestBed.inject(MissTallyService).weakSpotFor('basic-strategy')).toEqual(
        expect.objectContaining({ label: '7 vs 6', misses: 1, attempts: 2 }),
      );
    });
  });

  // The app has graded every rep and never said how long it took, which at a
  // table is half of whether the chart is any use to you.
  describe('the decision clock', () => {
    it('times the answer and reports the round median on the Done screen', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      const { fixture, c } = createPage();
      deal(c, STAND_SCENARIO);

      vi.advanceTimersByTime(2500);
      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();

      expect(c.phase()).toBe('done');
      expect(TestBed.inject(PracticeHistoryService).paceLast7()).toBe(2.5);
      expect(
        (fixture.nativeElement.querySelector('.done__peak') as HTMLElement).textContent,
      ).toContain('2.5s a hand');
    });

    it('restarts the clock on every deal', () => {
      const { c } = createPage();
      deal(c, STAND_SCENARIO);
      vi.advanceTimersByTime(1000);
      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);

      vi.advanceTimersByTime(3000);
      c.answer('S');
      // 1.0s then 3.0s — the second hand is not timed from the first deal.
      expect(TestBed.inject(PracticeHistoryService).paceLast7()).toBe(2);
    });

    // A continued decision offers two buttons and one total where the deal
    // offers six and a pair-or-soft-or-hard lookup. Timing both would move the
    // week's figure when the trainee turned a setting on rather than when they
    // got faster.
    it('times the opening decision only', () => {
      const { c } = createPage();
      deal(c, HIT_SCENARIO);
      TestBed.inject(CardGeneratorService).setRandomSource(() => 0.5); // a 7
      vi.advanceTimersByTime(2000);
      c.answer('H');
      vi.advanceTimersByTime(ADVANCE_MS); // the continuation deals a card

      vi.advanceTimersByTime(9000);
      c.answer('S'); // hard 14 vs 6 — correct, and three cards deep
      expect(c.hand().length).toBe(3);

      const history = TestBed.inject(PracticeHistoryService);
      expect(history.handsToday()).toBe(2);
      expect(history.paceLast7()).toBe(2);
    });

    // A hand you walked away from is not a hand you were slow on.
    it('leaves an abandoned hand out of the figure entirely', () => {
      const { c } = createPage();
      deal(c, STAND_SCENARIO);
      vi.advanceTimersByTime(2000);
      c.answer('S');
      vi.advanceTimersByTime(ADVANCE_MS);

      deal(c, STAND_SCENARIO);
      vi.advanceTimersByTime(MAX_TIMED_DECISION_MS + 1000);
      c.answer('S');

      const history = TestBed.inject(PracticeHistoryService);
      expect(history.paceLast7()).toBe(2);
      expect(history.handsToday()).toBe(2);
    });
  });

  describe('session end (Done)', () => {
    function drillToTarget(
      fixture: ComponentFixture<BasicStrategyDrillPageComponent>,
      c: Internals,
      hands: number,
    ): void {
      // One decision per hand: a stand ends the hand where a hit would play it
      // out, so `hands` answers are `hands` hands.
      for (let i = 0; i < hands; i++) {
        deal(c, STAND_SCENARIO);
        c.answer('S');
        vi.advanceTimersByTime(ADVANCE_MS);
      }
      fixture.detectChanges();
    }

    it('shows the Done screen when the session target is reached', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(3);
      const { fixture, c } = createPage();
      expect(c.target()).toBe(3);

      drillToTarget(fixture, c, 3);

      expect(c.phase()).toBe('done');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-flow-done')).not.toBeNull();
      expect(el.querySelector('.ring')!.textContent).toContain('3/3');
      expect(el.querySelector('.ring')!.textContent).toContain('goal met');
      expect(el.querySelector('.done__peak')!.textContent).toContain('Best streak: 3');
      expect(el.querySelector('.done__peak')!.textContent).toContain('100% this round');
      // The drill chrome is gone.
      expect(el.querySelector('app-flow-topbar')).toBeNull();
    });

    it('reaches Done through a final miss after the continue tap', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      const { fixture, c } = createPage();
      deal(c, HIT_SCENARIO);
      c.answer('S');
      expect(c.phase()).toBe('miss');
      key(c, ' ');
      fixture.detectChanges();
      expect(c.phase()).toBe('done');
    });

    it('"One more round" starts a fresh round targeting one more goal', () => {
      TestBed.inject(FlowPrefsService).setDailyGoal(2);
      const { fixture, c } = createPage();
      drillToTarget(fixture, c, 2);
      expect(c.phase()).toBe('done');

      (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(c.phase()).toBe('question');
      expect(c.target()).toBe(4);
      expect(
        (fixture.nativeElement.querySelector('.topbar__count') as HTMLElement).textContent,
      ).toBe('2/4');
    });

    it('names every outstanding weakness and what the week cleared', () => {
      const tally = TestBed.inject(MissTallyService);
      tally.record('basic-strategy', { kind: 'hard', hand: '16', dealer: '10' }, false);
      tally.record('basic-strategy', { kind: 'pair', hand: '8', dealer: '10' }, false);
      // A third scenario missed once, then answered right three times running.
      const cleared: ScenarioRef = { kind: 'soft', hand: '18', dealer: '9' };
      tally.record('basic-strategy', cleared, false);
      for (let i = 0; i < CLEAR_STREAK; i++) tally.record('basic-strategy', cleared, true);

      TestBed.inject(FlowPrefsService).setDailyGoal(1);
      const { fixture, c } = createPage();
      drillToTarget(fixture, c, 1);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.done__next')!.textContent).toContain('+1 more');
      expect(el.querySelector('.done__cleared')!.textContent).toContain('A,7 vs 9');
    });

    // The queued weakness promises the next round drills it. A review round
    // makes that every hand; an ordinary round only weights toward it.
    describe('review rounds', () => {
      const PAIR_8S: ScenarioRef = { kind: 'pair', hand: '8', dealer: '10' };
      const PAIR_8S_QUESTION = { prefix: '', value: '8,8', dealer: '10' };

      // Both sources of randomness pinned, so which hand is dealt is a fact
      // about the round's mode and nothing else. Math.random at 0.99 fails an
      // ordinary round's 0.4 share roll but never a review round's roll of 1.
      // Playing hands out goes with them: the weak spot is a pair whose correct
      // answer is Split, which would otherwise play two hands before the next
      // deal — and the next deal is the whole of what these tests read.
      function pinTheNextDeal(): void {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        TestBed.inject(CardGeneratorService).setRandomSource(() => 0);
        TestBed.inject(FlowPrefsService).setPlayHandsOut(false);
      }

      function startedReviewRound(): {
        fixture: ComponentFixture<BasicStrategyDrillPageComponent>;
        c: Internals;
      } {
        TestBed.inject(MissTallyService).record('basic-strategy', PAIR_8S, false);
        TestBed.inject(FlowPrefsService).setDailyGoal(10);
        const { fixture, c } = createPage();
        drillToTarget(fixture, c, 10);
        expect(c.phase()).toBe('done');
        (fixture.nativeElement.querySelector('.done__next') as HTMLButtonElement).click();
        fixture.detectChanges();
        return { fixture, c };
      }

      it('deals the weak spot on every hand, not just the first', () => {
        const { fixture, c } = startedReviewRound();
        expect(c.phase()).toBe('question');
        expect(c.target()).toBe(20);

        pinTheNextDeal();
        for (let i = 0; i < 3; i++) {
          expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual(
            PAIR_8S_QUESTION,
          );
          c.answer('P');
          vi.advanceTimersByTime(ADVANCE_MS);
          fixture.detectChanges();
        }
      });

      // Progress lists the same weak spots and, until now, could do nothing
      // about them. `?review=1` is that card's entry into this round.
      it('opens straight into a review round when the route asks for one', () => {
        TestBed.overrideProvider(ActivatedRoute, {
          useValue: { snapshot: { queryParamMap: convertToParamMap({ review: '1' }) } },
        });
        TestBed.inject(MissTallyService).record('basic-strategy', PAIR_8S, false);

        const { fixture, c } = createPage();
        pinTheNextDeal();
        // Hand one opens on the weakness in any round; hand two is the one that
        // separates a review round from an ordinary one, because 0.99 fails the
        // ordinary 0.4 share roll.
        for (let i = 0; i < 2; i++) {
          expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual(
            PAIR_8S_QUESTION,
          );
          c.answer('P');
          vi.advanceTimersByTime(ADVANCE_MS);
          fixture.detectChanges();
        }
      });

      it('treats any other value of the review parameter as an ordinary round', () => {
        TestBed.overrideProvider(ActivatedRoute, {
          useValue: { snapshot: { queryParamMap: convertToParamMap({ review: 'yes' }) } },
        });
        TestBed.inject(MissTallyService).record('basic-strategy', PAIR_8S, false);

        const { fixture, c } = createPage();
        pinTheNextDeal();
        c.answer('P');
        vi.advanceTimersByTime(ADVANCE_MS);
        fixture.detectChanges();
        expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).not.toEqual(
          PAIR_8S_QUESTION,
        );
      });

      it('"One more round" afterwards goes back to weighting, not forcing', () => {
        const { fixture, c } = startedReviewRound();
        drillToTarget(fixture, c, 10);
        (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
        fixture.detectChanges();

        // Hand one still opens on the weak spot — that promise is unchanged.
        expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual(
          PAIR_8S_QUESTION,
        );

        // Hand two takes the share roll, which now fails: a fresh hand.
        pinTheNextDeal();
        c.answer('P');
        vi.advanceTimersByTime(ADVANCE_MS);
        fixture.detectChanges();
        expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).not.toEqual(
          PAIR_8S_QUESTION,
        );
      });
    });
  });

  // The chart is the page a trainee reads to look a hand up, and until now it
  // could say what the play is and nothing else. `?hand=` is its entry here.
  describe('drilling one hand from the chart', () => {
    // `before` runs between the route override and the first injection: TestBed
    // refuses an override once the module has been instantiated, which reading a
    // store does.
    function enterWith(
      hand: string,
      before: () => void = () => {},
    ): { fixture: ComponentFixture<BasicStrategyDrillPageComponent>; c: Internals } {
      TestBed.overrideProvider(ActivatedRoute, {
        useValue: { snapshot: { queryParamMap: convertToParamMap({ hand }) } },
      });
      before();
      return createPage();
    }

    it('deals the pinned hand and says the round is pinned to it', () => {
      const { fixture, c } = enterWith('pair-8-v-10');
      expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual({
        prefix: '',
        value: '8,8',
        dealer: '10',
      });
      expect(
        (fixture.nativeElement.querySelector('.drill__advisory') as HTMLElement).textContent,
      ).toContain('8,8 vs 10');
    });

    it('deals it again on every hand of the round', () => {
      const { fixture, c } = enterWith('hard-16-v-10', () => {
        TestBed.inject(FlowPrefsService).setPlayHandsOut(false);
      });
      for (let i = 0; i < 3; i++) {
        expect(handQuestion(c.scenario().player, c.scenario().dealerUpcard)).toEqual({
          prefix: 'Hard',
          value: '16',
          dealer: '10',
        });
        c.answer('H');
        vi.advanceTimersByTime(ADVANCE_MS);
        fixture.detectChanges();
      }
    });

    // The pin belongs to the round the chart started, exactly as review mode
    // belongs to the round the Done screen started.
    it('goes back to ordinary practice on the round after', () => {
      const { fixture, c } = enterWith('hard-16-v-10', () => {
        const prefs = TestBed.inject(FlowPrefsService);
        prefs.setDailyGoal(1);
        prefs.setPlayHandsOut(false);
      });
      c.answer('H');
      vi.advanceTimersByTime(ADVANCE_MS);
      fixture.detectChanges();
      expect(c.phase()).toBe('done');

      (fixture.nativeElement.querySelector('.done__again') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.drill__advisory')).toBeNull();
    });

    it('treats a hand it cannot deal as an ordinary round', () => {
      const { fixture } = enterWith('hard-99-v-Z');
      expect(fixture.nativeElement.querySelector('.drill__advisory')).toBeNull();
    });
  });

  describe('exit', () => {
    it('Escape leaves for home without confirmation', () => {
      const { c } = createPage();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      key(c, 'Escape');
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('the topbar ✕ leaves too', () => {
      const { fixture } = createPage();
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (fixture.nativeElement.querySelector('.topbar__exit') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
