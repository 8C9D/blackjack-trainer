import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { cardHighValue, isAce } from '../../core/models/card.model';
import type { DeviationRule } from '../../core/models/deviation.model';
import type { HardKey, PairKey, SoftKey } from '../../core/models/strategy.model';
import { classifyAsPair, isSoftHand } from '../../core/services/basic-strategy-engine.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import {
  MissTallyService,
  type ScenarioRef,
  type TalliedTrainer,
} from '../../core/services/miss-tally.service';
import {
  ChartPageComponent,
  DEALER_UPCARDS,
  formatDeviationThreshold,
  hardHandFor,
  pairHandFor,
  softHandFor,
} from './chart-page.component';

type Internals = {
  onKeyDown(event: KeyboardEvent): void;
  sections(): readonly { id: string; rows: readonly unknown[] }[];
  onCellKey(event: KeyboardEvent, section: unknown, row: number, col: number): void;
  isTabStop(section: string, row: number, col: number): boolean;
};

function createPage(): {
  fixture: ComponentFixture<ChartPageComponent>;
  c: Internals;
  navigate: ReturnType<typeof vi.spyOn>;
} {
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ChartPageComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance as unknown as Internals, navigate };
}

// The cell text for one row of one section, e.g. cells('hard', '16').
function cells(fixture: ComponentFixture<ChartPageComponent>, section: number, label: string) {
  const table = fixture.nativeElement.querySelectorAll('.chart__table')[section] as HTMLElement;
  const row = [...table.querySelectorAll('tbody tr')].find(
    (tr) => tr.querySelector('.chart__hand')!.textContent!.trim() === label,
  );
  if (!row) throw new Error(`No row "${label}" in section ${section}`);
  return [...row.querySelectorAll('td')].map((td) => td.textContent!.trim());
}

// The button inside a cell: it carries the colour, the ring, the label and the
// round it starts.
function cellButton(
  fixture: ComponentFixture<ChartPageComponent>,
  section: number,
  label: string,
  upcard: string,
): HTMLElement {
  const table = fixture.nativeElement.querySelectorAll('.chart__table')[section] as HTMLElement;
  const row = [...table.querySelectorAll('tbody tr')].find(
    (tr) => tr.querySelector('.chart__hand')!.textContent!.trim() === label,
  );
  if (!row) throw new Error(`No row "${label}" in section ${section}`);
  return [...row.querySelectorAll('.chart__cell')][col(upcard)] as HTMLElement;
}

const HARD = 0;
const SOFT = 1;
const PAIR = 2;

// Column index of a dealer upcard in every table.
function col(upcard: string): number {
  return DEALER_UPCARDS.indexOf(upcard as (typeof DEALER_UPCARDS)[number]);
}

function showDeviationsTab(fixture: ComponentFixture<ChartPageComponent>): void {
  const tab = [...fixture.nativeElement.querySelectorAll('button')].find(
    (b) => (b as HTMLElement).textContent!.trim() === 'Deviations',
  ) as HTMLButtonElement;
  tab.click();
  fixture.detectChanges();
}

describe('ChartPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [ChartPageComponent],
      providers: [provideRouter([])],
    });
  });

  describe('representative hands', () => {
    it('lands every hard total on its own row and never on a pair row', () => {
      const totals: HardKey[] = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      for (const total of totals) {
        const hand = hardHandFor(total);
        expect(cardHighValue(hand[0]) + cardHighValue(hand[1])).toBe(total);
        expect(isSoftHand(hand)).toBe(false);
        // Hard 20 is only dealable as 10,10; every other row avoids the pair
        // lookup entirely.
        expect(classifyAsPair(hand)).toBe(total === 20 ? '10' : null);
      }
    });

    it('lands every soft total on the matching A,x row', () => {
      const keys: SoftKey[] = [2, 3, 4, 5, 6, 7, 8, 9];
      for (const key of keys) {
        const hand = softHandFor(key);
        expect(isSoftHand(hand)).toBe(true);
        expect(hand.some(isAce)).toBe(true);
        expect(hand.filter((c) => !isAce(c)).map(cardHighValue)).toEqual([key]);
      }
    });

    it('lands every pair on its own row', () => {
      const keys: PairKey[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
      for (const key of keys) {
        expect(classifyAsPair(pairHandFor(key))).toBe(key);
      }
    });
  });

  describe('grid', () => {
    it('renders a full row per chart key and a column per dealer upcard', () => {
      const { fixture } = createPage();
      const tables = fixture.nativeElement.querySelectorAll('.chart__table');
      expect(tables.length).toBe(3);
      expect(tables[HARD].querySelectorAll('tbody tr').length).toBe(16);
      expect(tables[SOFT].querySelectorAll('tbody tr').length).toBe(8);
      expect(tables[PAIR].querySelectorAll('tbody tr').length).toBe(10);
      for (const table of tables) {
        expect(table.querySelectorAll('thead th').length).toBe(DEALER_UPCARDS.length + 1);
        for (const row of table.querySelectorAll('tbody tr')) {
          expect(row.querySelectorAll('td').length).toBe(DEALER_UPCARDS.length);
        }
      }
    });

    it('names the action on each cell so the letter is not the only label', () => {
      const { fixture } = createPage();
      const cell = fixture.nativeElement.querySelector('.chart__cell') as HTMLElement;
      expect(cell.getAttribute('aria-label')).toBe('Hit');
    });

    it('spells out every symbol it uses in the legend', () => {
      const { fixture } = createPage();
      const entries = [...fixture.nativeElement.querySelectorAll('.chart__legend li')].map((li) =>
        (li as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(entries).toEqual(['H Hit', 'S Stand', 'D Double', 'P Split', 'R Surrender']);
    });

    it('shows hard 20 standing against every upcard', () => {
      const { fixture } = createPage();
      expect(cells(fixture, HARD, '20')).toEqual(Array(10).fill('S'));
    });

    it('resolves pair cells the chart declines to split into the fall-back play', () => {
      const { fixture } = createPage();
      // 10,10 is never split, so the row shows what hard 20 plays.
      expect(cells(fixture, PAIR, '10,10')).toEqual(Array(10).fill('S'));
      // 8,8 is always split.
      expect(cells(fixture, PAIR, '8,8')).toEqual(Array(10).fill('P'));
    });
  });

  describe('the active rules', () => {
    it('follows the rule set: soft 18 vs 2 stands under S17 and doubles under H17', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.setRuleSet('S17');
      const { fixture } = createPage();
      expect(cells(fixture, SOFT, 'A,7')[col('2')]).toBe('S');

      prefs.setRuleSet('H17');
      fixture.detectChanges();
      expect(cells(fixture, SOFT, 'A,7')[col('2')]).toBe('D');
    });

    it('hits 16 vs 10 without late surrender and surrenders with it', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      const { fixture } = createPage();
      expect(cells(fixture, HARD, '16')[col('10')]).toBe('H');

      prefs.setOptions({ doubleAfterSplit: false, lateSurrender: true });
      fixture.detectChanges();
      expect(cells(fixture, HARD, '16')[col('10')]).toBe('R');
    });

    it('splits 4,4 vs 5 only when double after split is on', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      const { fixture } = createPage();
      // Without DAS the hand falls through to hard 8 — hit.
      expect(cells(fixture, PAIR, '4,4')[col('5')]).toBe('H');

      prefs.setOptions({ doubleAfterSplit: true, lateSurrender: false });
      fixture.detectChanges();
      expect(cells(fixture, PAIR, '4,4')[col('5')]).toBe('P');
    });

    it('names the rules the chart was built under', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      prefs.setRuleSet('H17');
      prefs.setOptions({ doubleAfterSplit: true, lateSurrender: true });
      const { fixture } = createPage();
      const chips = [...fixture.nativeElement.querySelectorAll('.chart__chip')].map((el) =>
        (el as HTMLElement).textContent!.trim(),
      );
      expect(chips).toEqual(['H17 — dealer hits soft 17', 'Double after split', 'Late surrender']);
    });
  });

  describe('the deviation list', () => {
    function showDeviations(fixture: ComponentFixture<ChartPageComponent>): void {
      const button = [...fixture.nativeElement.querySelectorAll('.chart__mode')].find(
        (el) => (el as HTMLElement).textContent!.trim() === 'Deviations',
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
    }

    // "Hard 16 vs 10 | ≥ 0 | Stand" → the three cells as text.
    function ruleRow(fixture: ComponentFixture<ChartPageComponent>, hand: string): string[] {
      const row = [...fixture.nativeElement.querySelectorAll('.chart__table--rules tbody tr')].find(
        (tr) => tr.querySelector('.chart__rule-hand')!.textContent!.trim() === hand,
      );
      if (!row) throw new Error(`No deviation row "${hand}"`);
      return [...row.querySelectorAll('th, td')].map((cell) =>
        cell.textContent!.replace(/\s+/g, ' ').trim(),
      );
    }

    it('opens on the basic chart and switches to the deviations on demand', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelectorAll('.chart__table--rules')).toHaveLength(0);

      showDeviations(fixture);
      expect(fixture.nativeElement.querySelector('.chart__table')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('.chart__cell--h')).toHaveLength(2);
      const captions = [...fixture.nativeElement.querySelectorAll('.chart__caption')].map((el) =>
        (el as HTMLElement).textContent!.trim(),
      );
      expect(captions).toEqual(['Insurance', 'Hard totals', 'Soft totals', 'Pairs', 'Surrender']);
    });

    it('prints every rule as hand, threshold, and play', () => {
      const { fixture } = createPage();
      showDeviations(fixture);
      expect(ruleRow(fixture, 'Hard 16 vs 10')).toEqual(['Hard 16 vs 10', '≥ 0', 'S Stand']);
      expect(ruleRow(fixture, 'Hard 13 vs 2')).toEqual(['Hard 13 vs 2', '≤ -1', 'H Hit']);
      expect(ruleRow(fixture, 'Dealer ace')).toEqual(['Dealer ace', '≥ +3', 'I Insurance']);
      expect(ruleRow(fixture, 'Pair of 10s vs 5')).toEqual(['Pair of 10s vs 5', '≥ +5', 'P Split']);
    });

    it('follows the rule set — H17 carries its own index for 12 vs 4', () => {
      const prefs = TestBed.inject(FlowPrefsService);
      const { fixture } = createPage();
      showDeviations(fixture);
      const s17 = fixture.nativeElement.querySelectorAll('.chart__table--rules tbody tr').length;

      prefs.setRuleSet('H17');
      fixture.detectChanges();
      const h17 = fixture.nativeElement.querySelectorAll('.chart__table--rules tbody tr').length;
      expect(h17).toBeGreaterThan(0);
      expect(h17).not.toBe(s17);
    });

    it('drops the DAS and surrender chips, which no deviation reads', () => {
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelectorAll('.chart__chip')).toHaveLength(3);
      showDeviations(fixture);
      const chips = [...fixture.nativeElement.querySelectorAll('.chart__chip')].map((el) =>
        (el as HTMLElement).textContent!.trim(),
      );
      expect(chips).toEqual(['S17 — dealer stands soft 17']);
    });
  });

  describe('formatDeviationThreshold', () => {
    const rule = (
      direction: DeviationRule['direction'],
      index: number,
    ): Pick<DeviationRule, 'direction' | 'index'> => ({ direction, index });

    it('reads as the comparison the chart legend uses', () => {
      expect(formatDeviationThreshold(rule('at-or-above', 3) as DeviationRule)).toBe('≥ +3');
      expect(formatDeviationThreshold(rule('at-or-above', 0) as DeviationRule)).toBe('≥ 0');
      expect(formatDeviationThreshold(rule('at-or-below', -1) as DeviationRule)).toBe('≤ -1');
      expect(formatDeviationThreshold(rule('positive', 0) as DeviationRule)).toBe('> 0');
      expect(formatDeviationThreshold(rule('negative', 0) as DeviationRule)).toBe('< 0');
    });
  });

  describe('navigation', () => {
    it('goes home on Back and on Escape', () => {
      const { fixture, c, navigate } = createPage();
      (fixture.nativeElement.querySelector('.chart__back') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/']);

      navigate.mockClear();
      c.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(navigate).toHaveBeenCalledWith(['/']);
    });

    it('sends "Change rules" to Settings', () => {
      const { fixture, navigate } = createPage();
      (fixture.nativeElement.querySelector('.chart__settings') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/settings']);
    });

    it('ignores keys typed into a field', () => {
      const { c, navigate } = createPage();
      const input = document.createElement('input');
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      Object.defineProperty(event, 'target', { value: input });
      c.onKeyDown(event);
      expect(navigate).not.toHaveBeenCalled();
      input.remove();
    });
  });

  // The reference screen prints bare index numbers, so it has to say whose
  // count they are — and warn a trainee counting anything else.
  describe('index attribution', () => {
    const showDeviations = (fixture: ComponentFixture<ChartPageComponent>) => {
      const tab = [...fixture.nativeElement.querySelectorAll('button')].find(
        (b) => (b as HTMLElement).textContent!.trim() === 'Deviations',
      ) as HTMLButtonElement;
      tab.click();
      fixture.detectChanges();
    };
    const notes = (fixture: ComponentFixture<ChartPageComponent>) =>
      [...fixture.nativeElement.querySelectorAll('.chart__note')].map((n) =>
        (n as HTMLElement).textContent!.trim(),
      );

    it('names Hi-Lo as the system every index is written for', () => {
      const { fixture } = createPage();
      showDeviations(fixture);
      expect(notes(fixture)[0]).toContain('Hi-Lo true count');
    });

    it('adds no warning for a Hi-Lo counter', () => {
      const { fixture } = createPage();
      showDeviations(fixture);
      expect(fixture.nativeElement.querySelector('.chart__note--warn')).toBeNull();
    });

    it('warns a counter using another system, naming it', () => {
      TestBed.inject(FlowPrefsService).updateCounting({ systemId: 'ko' });
      const { fixture } = createPage();
      showDeviations(fixture);
      const warn = fixture.nativeElement.querySelector('.chart__note--warn') as HTMLElement;
      expect(warn.textContent).toContain('KO');
      expect(warn.textContent).toContain('unbalanced');
    });

    it('keeps the advisory off the basic-strategy chart, which carries no indices', () => {
      TestBed.inject(FlowPrefsService).updateCounting({ systemId: 'ko' });
      const { fixture } = createPage();
      expect(fixture.nativeElement.querySelector('.chart__note--warn')).toBeNull();
    });
  });

  // The tally has always known which hands keep costing you; the page a trainee
  // reads to look one up never said.
  // The page a trainee reads to look a hand up could name the play and do
  // nothing about it — the same gap the Progress weak-spot list closed.
  describe('drilling a hand from the chart', () => {
    it('starts a round pinned to the cell that was picked', () => {
      const { fixture, navigate } = createPage();
      (cellButton(fixture, HARD, '16', '10') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledWith(['/drill', 'basic-strategy'], {
        queryParams: { hand: 'hard-16-v-10' },
      });
    });

    it('keys a soft row by its total and a pair by its rank, as the tally does', () => {
      const { fixture, navigate } = createPage();
      (cellButton(fixture, SOFT, 'A,7', '9') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenLastCalledWith(['/drill', 'basic-strategy'], {
        queryParams: { hand: 'soft-18-v-9' },
      });

      (cellButton(fixture, PAIR, '8,8', 'A') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenLastCalledWith(['/drill', 'basic-strategy'], {
        queryParams: { hand: 'pair-8-v-A' },
      });
    });

    it('sends a deviation row to the trainer that teaches it', () => {
      const { fixture, navigate } = createPage();
      showDeviationsTab(fixture);
      const drill = [...fixture.nativeElement.querySelectorAll('.chart__rule-drill')].find((b) =>
        (b as HTMLElement).textContent!.includes('Hard 16 vs 10'),
      ) as HTMLButtonElement;
      drill.click();
      expect(navigate).toHaveBeenCalledWith(['/drill', 'deviations'], {
        queryParams: { hand: 'hard-16-v-10' },
      });
    });

    // Insurance is filed against whatever hand was dealt rather than against the
    // offer, so there is no one hand to pin a round to.
    it('leaves the insurance row with nothing to drill', () => {
      const { fixture } = createPage();
      showDeviationsTab(fixture);
      const rows = [...fixture.nativeElement.querySelectorAll('.chart__rule-hand')];
      const insurance = rows.find((th) =>
        (th as HTMLElement).textContent!.includes('Dealer ace'),
      ) as HTMLElement;
      expect(insurance.querySelector('.chart__rule-drill')).toBeNull();
    });

    // 340 cells, and a button apiece would put every one of them between "Back"
    // and the legend for anyone reading this page with a keyboard.
    it('holds one tab stop per grid and moves inside it with the arrows', () => {
      const { fixture, c } = createPage();
      const stops = [...fixture.nativeElement.querySelectorAll('.chart__cell--button')].filter(
        (b) => (b as HTMLElement).getAttribute('tabindex') === '0',
      );
      expect(stops.length).toBe(3);

      const section = c.sections()[0];
      c.onCellKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }), section, 0, 0);
      fixture.detectChanges();
      expect(c.isTabStop('hard', 1, 0)).toBe(true);
      expect(c.isTabStop('hard', 0, 0)).toBe(false);
      // Each grid keeps its own, so Tab still steps between the three tables.
      expect(c.isTabStop('soft', 0, 0)).toBe(true);
    });

    it('stops at the edges rather than wrapping to another row', () => {
      const { fixture, c } = createPage();
      const section = c.sections()[0];
      c.onCellKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), section, 0, 0);
      c.onCellKey(new KeyboardEvent('keydown', { key: 'ArrowUp' }), section, 0, 0);
      fixture.detectChanges();
      expect(c.isTabStop('hard', 0, 0)).toBe(true);
    });
  });

  describe('the hands you keep missing', () => {
    const missOnce = (trainer: TalliedTrainer, ref: ScenarioRef) =>
      TestBed.inject(MissTallyService).record(trainer, ref, false);

    // The cell for one (section, row label, dealer upcard).
    const cell = (
      fixture: ComponentFixture<ChartPageComponent>,
      section: number,
      label: string,
      upcard: string,
    ) => {
      const table = fixture.nativeElement.querySelectorAll('.chart__table')[section] as HTMLElement;
      const row = [...table.querySelectorAll('tbody tr')].find(
        (tr) => tr.querySelector('.chart__hand')!.textContent!.trim() === label,
      )!;
      // The cell is a button now — it starts a round drilling its own hand — so
      // the ring and the label ride on that rather than on the <td> around it.
      return [...row.querySelectorAll('.chart__cell')][col(upcard)] as HTMLElement;
    };

    it('rings a hard total that is outstanding, and only that one', () => {
      missOnce('basic-strategy', { kind: 'hard', hand: '16', dealer: '10' });
      const { fixture } = createPage();
      expect(cell(fixture, HARD, '16', '10').classList).toContain('chart__cell--missed');
      expect(cell(fixture, HARD, '16', '9').classList).not.toContain('chart__cell--missed');
      expect(cell(fixture, HARD, '15', '10').classList).not.toContain('chart__cell--missed');
    });

    // The tally keys a soft hand by its total; the chart rows it by the non-ace
    // card, and a mismatch here would mark the wrong row.
    it('lines a soft row up with the total the drill files it under', () => {
      missOnce('basic-strategy', { kind: 'soft', hand: '18', dealer: '9' });
      const { fixture } = createPage();
      expect(cell(fixture, SOFT, 'A,7', '9').classList).toContain('chart__cell--missed');
      expect(cell(fixture, SOFT, 'A,8', '9').classList).not.toContain('chart__cell--missed');
    });

    it('rings a pair by its rank', () => {
      missOnce('basic-strategy', { kind: 'pair', hand: '8', dealer: 'A' });
      const { fixture } = createPage();
      expect(cell(fixture, PAIR, '8,8', 'A').classList).toContain('chart__cell--missed');
    });

    // A ring is a shape on a coloured cell, so the count has to reach a screen
    // reader some other way.
    it('carries the count in the cell label', () => {
      const tally = TestBed.inject(MissTallyService);
      const ref = { kind: 'hard', hand: '16', dealer: '10' } as const;
      tally.record('basic-strategy', ref, false);
      tally.record('basic-strategy', ref, true);
      const { fixture } = createPage();
      const label = cell(fixture, HARD, '16', '10').getAttribute('aria-label');
      expect(label).toContain('missed 1 of 2 this week');
      expect(cell(fixture, HARD, '16', '9').getAttribute('aria-label')).not.toContain('missed');
    });

    it('drops the ring once the scenario is answered right three times running', () => {
      const tally = TestBed.inject(MissTallyService);
      const ref = { kind: 'hard', hand: '16', dealer: '10' } as const;
      tally.record('basic-strategy', ref, false);
      for (let i = 0; i < 3; i++) tally.record('basic-strategy', ref, true);
      const { fixture } = createPage();
      expect(cell(fixture, HARD, '16', '10').classList).not.toContain('chart__cell--missed');
    });

    it('says how many cells are ringed, and nothing at all when none are', () => {
      const clean = createPage();
      expect(clean.fixture.nativeElement.textContent).not.toContain('ringed');
      clean.fixture.destroy();

      missOnce('basic-strategy', { kind: 'hard', hand: '16', dealer: '10' });
      missOnce('basic-strategy', { kind: 'pair', hand: '8', dealer: 'A' });
      const { fixture } = createPage();
      expect(fixture.nativeElement.textContent).toContain('2 ringed cells');
    });

    // The deviations trainer keeps its own tally, and the basic chart is not
    // where its misses belong.
    it('keeps each trainer to its own chart', () => {
      missOnce('deviations', { kind: 'hard', hand: '16', dealer: '10' });
      const { fixture } = createPage();
      expect(cell(fixture, HARD, '16', '10').classList).not.toContain('chart__cell--missed');
    });

    it('marks the deviation rule for a hand missed in that trainer', () => {
      missOnce('deviations', { kind: 'hard', hand: '16', dealer: '10' });
      const { fixture } = createPage();
      showDeviationsTab(fixture);
      const marked = [...fixture.nativeElement.querySelectorAll('.chart__missed')].map((el) =>
        (el as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(marked).toContain('Hard 16 vs 10 missed 1 of 1 this week');
      expect(marked.some((text) => text.startsWith('Hard 16 vs 9'))).toBe(false);
    });

    // A surrender rule is written over a hard total, and the tally files it as
    // that hard total — so the surrender row has to look itself up that way.
    it('marks a surrender rule through the hard total it is written over', () => {
      missOnce('deviations', { kind: 'hard', hand: '15', dealer: '10' });
      const { fixture } = createPage();
      showDeviationsTab(fixture);
      const marked = [...fixture.nativeElement.querySelectorAll('.chart__missed')].map((el) =>
        (el as HTMLElement).textContent!.replace(/\s+/g, ' ').trim(),
      );
      expect(marked.filter((t) => t.startsWith('Hard 15 vs 10')).length).toBe(2);
    });

    it('leaves the insurance row alone, which is filed against no hand', () => {
      missOnce('deviations', { kind: 'hard', hand: '16', dealer: '10' });
      const { fixture } = createPage();
      showDeviationsTab(fixture);
      const insurance = fixture.nativeElement.querySelector('.chart__table--rules tbody th')!;
      expect(insurance.textContent).toContain('Dealer ace');
      expect(insurance.classList).not.toContain('chart__missed');
    });
  });
});
