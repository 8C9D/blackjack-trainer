import { DOCUMENT } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import { formatSignedCount } from '../../core/models/card-counting.model';
import type { Card, Rank, Suit } from '../../core/models/card.model';
import { resolveKeyCounts, tagTableFor } from '../../core/models/counting-system.model';
import {
  DEVIATION_INDEX_SYSTEM_NAME,
  deviationIndexNote,
  type DeviationCategory,
  type DeviationRule,
} from '../../core/models/deviation.model';
import {
  ACTION_LABELS,
  type Action,
  type DealerUpcard,
  type EngineOptions,
  type HardKey,
  type PairKey,
  type RuleSet,
  type SoftKey,
} from '../../core/models/strategy.model';
import { BasicStrategyEngineService } from '../../core/services/basic-strategy-engine.service';
import { CountingEngineService } from '../../core/services/counting-engine.service';
import { deviationsFor } from '../../core/services/deviation-engine.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
import {
  MissTallyService,
  scenarioKey,
  type ScenarioRef,
  type TalliedTrainer,
  type WeakSpot,
} from '../../core/services/miss-tally.service';
import { countOf } from '../../core/text';
import { HAND_QUERY_PARAM } from '../drill/drill-hand';
import { countingSystemById } from '../../data/counting-systems';

export const DEALER_UPCARDS: readonly DealerUpcard[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'A',
];

const HARD_KEYS: readonly HardKey[] = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const SOFT_KEYS: readonly SoftKey[] = [2, 3, 4, 5, 6, 7, 8, 9];
// A soft row's key is its non-ace card; the tally keys it by the total.
const SOFT_ACE_VALUE = 11;
const PAIR_KEYS: readonly PairKey[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

// Chart shorthand. Surrender is 'R', not the BJA charts' 'SUR': ten columns
// have to fit a 320px screen, where three glyphs in one cell overrun into its
// neighbour. The legend and each cell's aria-label spell it out.
const ACTION_SYMBOLS: Readonly<Record<Action, string>> = {
  H: 'H',
  S: 'S',
  D: 'D',
  P: 'P',
  SUR: 'R',
  INS: 'I',
};

// Arrow keys move around the grid rather than out of it, which is what makes
// one tab stop per table enough.
const ARROW_STEPS: Readonly<Record<string, { row: number; col: number }>> = {
  ArrowUp: { row: -1, col: 0 },
  ArrowDown: { row: 1, col: 0 },
  ArrowLeft: { row: 0, col: -1 },
  ArrowRight: { row: 0, col: 1 },
};

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

export type ChartMode = 'basic' | 'deviations' | 'count';

export const CHART_MODES: readonly { value: ChartMode; label: string }[] = [
  { value: 'basic', label: 'Basic strategy' },
  { value: 'deviations', label: 'Deviations' },
  { value: 'count', label: 'Count' },
];

// Which tab the page opens on. The chart is three references behind one set of
// buttons, and the screens that send a trainee here are asking about one of
// them in particular — Settings picking a counting system wants the tags, not
// the hard totals. Also what makes the tab survive a reload and the back
// button, which a signal alone never did.
export const CHART_TAB_QUERY_PARAM = 'tab';

export function chartModeFrom(value: string | null): ChartMode {
  return CHART_MODES.some((mode) => mode.value === value) ? (value as ChartMode) : 'basic';
}

// Section order for the deviation list, matching how the source chart reads.
const DEVIATION_CATEGORIES: readonly { id: DeviationCategory; title: string }[] = [
  { id: 'insurance', title: 'Insurance' },
  { id: 'hard', title: 'Hard totals' },
  { id: 'soft', title: 'Soft totals' },
  { id: 'pair', title: 'Pairs' },
  { id: 'surrender', title: 'Surrender' },
];

export const LEGEND: readonly { action: Exclude<Action, 'INS'>; label: string }[] = (
  ['H', 'S', 'D', 'P', 'SUR'] as const
).map((action) => ({ action, label: ACTION_LABELS[action] }));

interface ChartCellView {
  readonly action: Exclude<Action, 'INS'>;
  readonly symbol: string;
  readonly label: string;
  // The hand this cell is about, in the tally's own terms — what marks it as
  // missed, and what the drill it starts is pinned to.
  readonly ref: ScenarioRef;
  // "missed 3 of 7 this week", or null when this hand is not outstanding. The
  // grid has no room for the words, so the ring carries it on screen and this
  // carries it to a screen reader.
  readonly missed: string | null;
}

interface ChartRowView {
  readonly label: string;
  readonly cells: readonly ChartCellView[];
}

interface ChartSectionView {
  readonly id: string;
  readonly title: string;
  readonly rowHeader: string;
  readonly rows: readonly ChartRowView[];
}

interface DeviationRowView {
  readonly hand: string;
  // Null for insurance, which is filed against the hand that was dealt rather
  // than against the offer, so there is no one hand to drill.
  readonly ref: ScenarioRef | null;
  readonly threshold: string;
  readonly action: Action;
  readonly symbol: string;
  readonly label: string;
  readonly missed: string | null;
}

interface DeviationSectionView {
  readonly id: DeviationCategory;
  readonly title: string;
  readonly rows: readonly DeviationRowView[];
  // Set where the table rules have taken the whole section off the felt: the
  // rows stay listed (the chart is the chart) and say they are not on offer.
  readonly unavailable: string | null;
}

// The chart the drills grade against, rendered rather than re-encoded: every
// cell is the engine's own decision for a representative hand under the
// player's live rule set, so the page cannot drift from what a miss is scored
// on. Read-only — rules stay a Settings decision.
@Component({
  selector: 'app-chart-page',
  template: `
    <main class="chart">
      <header class="chart__header">
        <button type="button" class="chart__back" (click)="goHome()">
          ← Back <kbd class="kcap">esc</kbd>
        </button>
        <h1 class="chart__title">Chart</h1>
      </header>

      <div class="chart__modes" role="group" aria-label="Chart">
        @for (option of modes; track option.value) {
          <button
            type="button"
            class="chart__mode"
            [class.chart__mode--on]="mode() === option.value"
            [attr.aria-pressed]="mode() === option.value"
            (click)="setMode(option.value)"
          >
            {{ option.label }}
          </button>
        }
      </div>

      <!-- Table rules decide a play; they have nothing to do with what a card
           is worth to the count. The count tab names the one setting its table
           does depend on instead. -->
      @if (mode() === 'count') {
        <p class="chart__rules">
          <span class="chart__chip">{{ systemName() }}</span>
          <span class="chart__chip">{{ balanceLabel() }}</span>
          <button type="button" class="chart__settings" (click)="openSettings()">
            Change system
          </button>
        </p>
      } @else {
        <p class="chart__rules">
          <span class="chart__chip">{{ ruleSetLabel() }}</span>
          @if (mode() === 'basic') {
            <span class="chart__chip">{{ dasLabel() }}</span>
          }
          <!-- Surrender is on both grids: it decides a basic cell and it decides
               whether the surrender indices are plays at all. DAS is not — no
               deviation below is written against it. -->
          <span class="chart__chip">{{ surrenderLabel() }}</span>
          <button type="button" class="chart__settings" (click)="openSettings()">
            Change rules
          </button>
        </p>
      }

      @if (mode() === 'count') {
        <section class="chart__section">
          <!-- The strategy grids refuse to scroll sideways, because a chart you
               drag around loses the row and column a cell is read from. A tag
               strip is one line per row and keeps its meaning at any offset, so
               the handful of computer-only systems with a distinct weight per
               rank scroll here rather than crushing every other system's table
               down to fit them. -->
          <div class="chart__tags-scroll">
            <table class="chart__table chart__table--tags">
              <caption class="chart__caption">
                What each card is worth
              </caption>
              <thead>
                <tr>
                  <th scope="col" class="chart__corner">Cards</th>
                  @for (column of tagTable().columns; track column.label) {
                    <th scope="col" class="chart__upcard">{{ column.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (label of tagTable().rowLabels; track label; let r = $index) {
                  <tr>
                    <th scope="row" class="chart__hand">{{ label }}</th>
                    @for (column of tagTable().columns; track column.label) {
                      <td class="chart__cell-slot">
                        <span class="chart__cell chart__tag">{{ column.values[r] }}</span>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <p class="chart__note">{{ systemDescription() }}</p>

        <!-- The one line that explains why two systems are drilled by different
             questions: a deck that sums to zero is what a true count divides. -->
        <p class="chart__note">{{ balanceNote() }}</p>

        @if (keyCountRows().length > 0) {
          <section class="chart__section">
            <table class="chart__table chart__table--rules">
              <caption class="chart__caption">
                {{
                  keyCountCaption()
                }}
              </caption>
              <tbody>
                @for (row of keyCountRows(); track row.label) {
                  <tr>
                    <th scope="row" class="chart__rule-hand">{{ row.label }}</th>
                    <td class="chart__index">{{ row.value }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        } @else if (keyCountMissing(); as note) {
          <p class="chart__note">{{ note }}</p>
        }

        @if (colorNote(); as note) {
          <p class="chart__note">{{ note }}</p>
        }
      } @else if (mode() === 'deviations') {
        @for (section of deviationSections(); track section.id) {
          <section class="chart__section" [class.chart__section--off]="section.unavailable">
            @if (section.unavailable; as note) {
              <p class="chart__note chart__note--off" role="note">{{ note }}</p>
            }
            <table class="chart__table chart__table--rules">
              <caption class="chart__caption">
                {{
                  section.title
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Hand</th>
                  <th scope="col">True count</th>
                  <th scope="col">Play</th>
                </tr>
              </thead>
              <tbody>
                @for (rule of section.rows; track rule.hand) {
                  <tr>
                    <th scope="row" class="chart__rule-hand" [class.chart__missed]="rule.missed">
                      @if (rule.ref; as ref) {
                        <button
                          type="button"
                          class="chart__rule-drill"
                          [attr.aria-label]="'Drill ' + rule.hand"
                          (click)="drill('deviations', ref)"
                        >
                          {{ rule.hand }}
                        </button>
                      } @else {
                        {{ rule.hand }}
                      }
                      @if (rule.missed; as missed) {
                        <small class="chart__missed-note">{{ missed }}</small>
                      }
                    </th>
                    <td class="chart__index">{{ rule.threshold }}</td>
                    <td class="chart__play">
                      <span
                        class="chart__cell chart__cell--{{ rule.action.toLowerCase() }}"
                        aria-hidden="true"
                        >{{ rule.symbol }}</span
                      >
                      {{ rule.label }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }

        <p class="chart__note">
          Every index here is a {{ indexSystemName }} true count. Deviations override basic strategy
          only once the true count reaches the index. Everything not listed here is played straight
          off the chart, at any count.
        </p>

        <!-- Insurance is the one row with no hand to pin: it is filed against
             whatever was dealt, so it has no scenario of its own to drill. -->
        <p class="chart__note">
          Pick a hand to drill it — every deal that round is that hand, at the counts your settings
          give it, so both sides of its index come up.
        </p>

        @if (indexNote(); as note) {
          <p class="chart__note chart__note--warn" role="note">{{ note }}</p>
        }

        <!-- No count here, unlike the grid's: one hand can carry two rules (a
             hard total and the surrender written over it), so a tally of marked
             rows would read as more weaknesses than there are. -->
        @if (missedRules() > 0) {
          <p class="chart__note">
            Marked hands are ones you have missed in the last 7 days and not yet answered right
            three times running.
          </p>
        }
      } @else {
        @for (section of sections(); track section.id) {
          <section class="chart__section">
            <table class="chart__table">
              <caption class="chart__caption">
                {{
                  section.title
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col" class="chart__corner">{{ section.rowHeader }}</th>
                  @for (upcard of dealerUpcards; track upcard) {
                    <th scope="col" class="chart__upcard">{{ upcard }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of section.rows; track row.label; let r = $index) {
                  <tr>
                    <th scope="row" class="chart__hand">{{ row.label }}</th>
                    @for (cell of row.cells; track $index; let c = $index) {
                      <td class="chart__cell-slot">
                        <!-- One tab stop per grid, arrow keys inside it: a chart
                             is 160 cells, and a button apiece would put them all
                             between "Back" and the legend for anyone reading
                             this page with a keyboard. -->
                        <button
                          type="button"
                          [id]="cellId(section.id, r, c)"
                          class="chart__cell chart__cell--button"
                          [class]="'chart__cell--' + cell.action.toLowerCase()"
                          [class.chart__cell--missed]="cell.missed"
                          [attr.aria-label]="cellLabel(cell)"
                          [attr.tabindex]="isTabStop(section.id, r, c) ? 0 : -1"
                          (focus)="rememberFocus(section.id, r, c)"
                          (keydown)="onCellKey($event, section, r, c)"
                          (click)="drill('basic-strategy', cell.ref)"
                        >
                          {{ cell.symbol }}
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }

        <ul class="chart__legend">
          @for (entry of legend; track entry.action) {
            <li>
              <span class="chart__cell chart__cell--{{ entry.action.toLowerCase() }}">{{
                symbolFor(entry.action)
              }}</span>
              {{ entry.label }}
            </li>
          }
          <!-- The ring is a shape, not a colour: every cell is already coloured
               by its action, so a seventh hue would collide with the six the
               legend above spends. -->
          @if (missedCells() > 0) {
            <li>
              <span class="chart__cell chart__cell--missed">&nbsp;</span>
              Missed this week
            </li>
          }
        </ul>

        <p class="chart__note">
          Every cell is the play for a two-card starting hand under the rules above. Pair rows show
          the split decision, or the play the hand falls back to when the chart says not to split.
        </p>

        <!-- The page a trainee reads to look a hand up could say what the play
             is and nothing else. Pick the cell and the drill deals that hand,
             which is the thing they came here to learn. -->
        <p class="chart__note">
          Pick any cell to drill that hand — arrow keys move around the grid, Enter starts the
          round.
        </p>

        <!-- The app has always known which hands keep costing you, and the page
             a trainee actually reads never said. Marked, not ranked: the count
             is on the Progress screen, which is also where the review round
             starts. -->
        @if (missedCells() > 0) {
          <p class="chart__note">
            {{ countOf(missedCells(), 'ringed cell') }} — hands you have missed in the last 7 days
            and not yet answered right three times running.
          </p>
        }
      }
    </main>
  `,
  styleUrl: './chart-page.component.scss',
})
export class ChartPageComponent {
  private readonly prefsService = inject(FlowPrefsService);
  private readonly engine = inject(BasicStrategyEngineService);
  private readonly countingEngine = inject(CountingEngineService);
  private readonly missTally = inject(MissTallyService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  // Templates can only call class members, so the shared counted-noun helper is
  // re-exposed rather than imported into the markup.
  protected readonly countOf = countOf;

  protected readonly dealerUpcards = DEALER_UPCARDS;
  protected readonly legend = LEGEND;
  protected readonly modes = CHART_MODES;

  protected readonly mode = signal<ChartMode>(
    chartModeFrom(inject(ActivatedRoute).snapshot.queryParamMap.get(CHART_TAB_QUERY_PARAM)),
  );

  private readonly prefs = this.prefsService.prefs;

  protected readonly ruleSetLabel = computed(() =>
    this.prefs().ruleSet === 'H17' ? 'H17 — dealer hits soft 17' : 'S17 — dealer stands soft 17',
  );

  protected readonly dasLabel = computed(() =>
    this.prefs().options.doubleAfterSplit ? 'Double after split' : 'No double after split',
  );

  protected readonly surrenderLabel = computed(() =>
    this.prefs().options.lateSurrender ? 'Late surrender' : 'No late surrender',
  );

  // The scenarios each trainer is still costing hands on, by scenario key. The
  // tally speaks the same (kind, hand, dealer) language a chart cell does, so
  // marking is a lookup rather than a second encoding of the chart.
  private readonly basicMisses = computed(() => this.missesFor('basic-strategy'));
  private readonly deviationMisses = computed(() => this.missesFor('deviations'));

  protected readonly sections = computed<readonly ChartSectionView[]>(() => {
    const { ruleSet, options } = this.prefs();
    const misses = this.basicMisses();
    return [
      {
        id: 'hard',
        title: 'Hard totals',
        rowHeader: 'Total',
        rows: HARD_KEYS.map((key) =>
          this.row('hard', String(key), String(key), hardHandFor(key), ruleSet, options, misses),
        ),
      },
      {
        id: 'soft',
        title: 'Soft totals',
        rowHeader: 'Hand',
        // A soft row is keyed by its non-ace card and tallied by its total, the
        // way the drill files it: A,7 is the scenario 'soft 18'.
        rows: SOFT_KEYS.map((key) =>
          this.row(
            'soft',
            String(SOFT_ACE_VALUE + key),
            `A,${key}`,
            softHandFor(key),
            ruleSet,
            options,
            misses,
          ),
        ),
      },
      {
        id: 'pair',
        title: 'Pairs',
        rowHeader: 'Hand',
        rows: PAIR_KEYS.map((key) =>
          this.row('pair', key, `${key},${key}`, pairHandFor(key), ruleSet, options, misses),
        ),
      },
    ];
  });

  protected readonly missedCells = computed(
    () =>
      this.sections()
        .flatMap((s) => s.rows)
        .flatMap((r) => r.cells)
        .filter((c) => c.missed).length,
  );

  protected readonly missedRules = computed(
    () =>
      this.deviationSections()
        .flatMap((s) => s.rows)
        .filter((r) => r.missed).length,
  );

  // ─── the count tab ──────────────────────────────────────────────────────
  //
  // The app grades every counted card against one of 58 systems' tags and,
  // until this tab, printed those tags nowhere: a trainee who picked Zen or
  // Wong Halves had to leave the app to learn what it was marking them on.

  protected readonly system = computed(() => countingSystemById(this.prefs().counting.systemId));

  protected readonly systemName = computed(() => this.system().name);

  protected readonly systemDescription = computed(() => this.system().description);

  protected readonly tagTable = computed(() => tagTableFor(this.system()));

  protected readonly balanceLabel = computed(() =>
    this.system().balanced ? 'Balanced' : 'Unbalanced',
  );

  // Derived from the tags on screen, not from the `balanced` flag, so the
  // sentence and the table above it can never disagree.
  private readonly deckSum = computed(() => this.countingEngine.fullDeckCount(this.system()));

  protected readonly balanceNote = computed(() => {
    const sum = this.deckSum();
    if (sum === 0) {
      return 'A full deck of these tags sums to 0. That is what a true count divides: the running count over the decks still to come is a per-deck figure, so this system can be drilled as a true count and its indices read at one.';
    }
    const direction = sum > 0 ? 'up' : 'down';
    return `A full deck of these tags sums to ${formatSignedCount(sum)}, not 0, so the running count drifts ${direction} on its own as a shoe is dealt. There is nothing for a true count to divide — an unbalanced system is read against running-count thresholds instead.`;
  });

  // KO's published schedule, resolved for the shoe the counting drill is set
  // to. Deck-dependent, so the figures move with that setting.
  private readonly keyCounts = computed(() =>
    resolveKeyCounts(this.system(), this.prefs().counting.numberOfDecks),
  );

  protected readonly keyCountCaption = computed(
    () => `Running counts for a ${this.prefs().counting.numberOfDecks}-deck shoe`,
  );

  protected readonly keyCountRows = computed<readonly { label: string; value: string }[]>(() => {
    const schedule = this.keyCounts();
    if (!schedule) return [];
    return [
      { label: 'Start of shoe (IRC)', value: formatSignedCount(schedule.irc) },
      { label: 'Key count — your advantage starts', value: formatSignedCount(schedule.keyCount) },
      { label: 'Pivot — where a fully dealt shoe ends', value: formatSignedCount(schedule.pivot) },
      {
        label: 'Take insurance at',
        value: `${formatSignedCount(schedule.insuranceCount)} or above`,
      },
    ];
  });

  // An unbalanced system with no schedule this app can print. Said rather than
  // left blank: the absence is why Settings offers it no key-count drill.
  protected readonly keyCountMissing = computed<string | null>(() => {
    const system = this.system();
    if (system.balanced || this.keyCounts() !== null) return null;
    return system.keyCounts
      ? `Its published key counts cover other shoe sizes, not the ${this.prefs().counting.numberOfDecks}-deck shoe your counting drill is set to.`
      : 'This app carries no published key-count schedule for it, so it is drilled by running count alone.';
  });

  // Only three systems tag a rank by suit color, and the two rows above say
  // nothing about why they are there.
  protected readonly colorNote = computed<string | null>(() =>
    this.system().colorValues
      ? 'This system counts some cards by suit color, so its table has a row each for red and black. Hearts and diamonds are red; spades and clubs are black.'
      : null,
  );

  protected readonly indexSystemName = DEVIATION_INDEX_SYSTEM_NAME;

  // Named on the reference screen too, not just in the drill: reading an index
  // off this chart while counting another system is the same mistake.
  protected readonly indexNote = computed(() =>
    deviationIndexNote(countingSystemById(this.prefs().counting.systemId)),
  );

  // The deviation chart for the active rule set, grouped the way its source
  // PDF is: insurance first, then the playing decisions, then surrender.
  protected readonly deviationSections = computed<readonly DeviationSectionView[]>(() => {
    const rules = deviationsFor(this.prefs().ruleSet);
    const misses = this.deviationMisses();
    // Late Surrender is the one table rule these indices depend on — no rule
    // below is written against DAS — and with it off the surrender overlay does
    // not fire, so the section would otherwise list five plays the drill will
    // never ask for and the table will never deal.
    const noSurrender = !this.prefs().options.lateSurrender;
    return DEVIATION_CATEGORIES.map(({ id, title }) => ({
      id,
      title,
      rows: rules.filter((rule) => rule.category === id).map((rule) => deviationRow(rule, misses)),
      unavailable:
        id === 'surrender' && noSurrender
          ? 'Late Surrender is off in your table rules, so none of these are on offer. ' +
            'Those hands play off the chart above.'
          : null,
    })).filter((section) => section.rows.length > 0);
  });

  protected symbolFor(action: Exclude<Action, 'INS'>): string {
    return ACTION_SYMBOLS[action];
  }

  // Replaces rather than pushes: the tabs are one page's three views, so Back
  // should leave the chart rather than step through whichever ones were opened.
  protected setMode(mode: ChartMode): void {
    this.mode.set(mode);
    void this.router.navigate([], {
      queryParams: { [CHART_TAB_QUERY_PARAM]: mode === 'basic' ? null : mode },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // The chart has always known which hand a cell is about and could do nothing
  // with it — the same gap the Progress screen's weak-spot list closed when it
  // learned to start a review round.
  protected drill(trainer: TalliedTrainer, ref: ScenarioRef): void {
    void this.router.navigate(['/drill', trainer], {
      queryParams: { [HAND_QUERY_PARAM]: scenarioKey(ref) },
    });
  }

  protected cellId(section: string, row: number, col: number): string {
    return `chart-${section}-${row}-${col}`;
  }

  // Where the tab stop sits in each grid: the last cell focused there, or its
  // top-left corner. Per section, so Tab still steps between the three tables.
  private readonly gridFocus = signal<Readonly<Record<string, { row: number; col: number }>>>({});

  protected isTabStop(section: string, row: number, col: number): boolean {
    const at = this.gridFocus()[section] ?? { row: 0, col: 0 };
    return at.row === row && at.col === col;
  }

  protected rememberFocus(section: string, row: number, col: number): void {
    this.gridFocus.update((all) => ({ ...all, [section]: { row, col } }));
  }

  protected onCellKey(
    event: KeyboardEvent,
    section: ChartSectionView,
    row: number,
    col: number,
  ): void {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const nextRow = clamp(row + step.row, section.rows.length - 1);
    const nextCol = clamp(col + step.col, DEALER_UPCARDS.length - 1);
    this.rememberFocus(section.id, nextRow, nextCol);
    const next = this.document.getElementById(this.cellId(section.id, nextRow, nextCol));
    next?.focus();
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected openSettings(): void {
    void this.router.navigate(['/settings']);
  }

  private missesFor(trainer: TalliedTrainer): ReadonlyMap<string, WeakSpot> {
    this.missTally.state();
    return new Map(this.missTally.weakSpots(trainer).map((spot) => [scenarioKey(spot.ref), spot]));
  }

  private row(
    kind: ScenarioRef['kind'],
    handKey: string,
    label: string,
    player: readonly [Card, Card],
    ruleSet: RuleSet,
    options: EngineOptions,
    misses: ReadonlyMap<string, WeakSpot>,
  ): ChartRowView {
    return {
      label,
      cells: DEALER_UPCARDS.map((upcard) => {
        const { action } = this.engine.decide({
          player,
          dealerUpcard: upcardCard(upcard),
          ruleSet,
          options,
        });
        const ref: ScenarioRef = { kind, hand: handKey, dealer: upcard };
        return {
          action,
          symbol: ACTION_SYMBOLS[action],
          label: ACTION_LABELS[action],
          ref,
          missed: missLabel(misses, ref),
        };
      }),
    };
  }

  // The ring is the only thing on screen, so the cell's own label is where the
  // count goes for anyone not looking at it.
  protected cellLabel(cell: ChartCellView): string {
    return cell.missed === null ? cell.label : `${cell.label} — ${cell.missed}`;
  }

  @HostListener('window:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (shouldIgnoreKeyboardEvent(event)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.goHome();
    }
  }
}

// ─── representative hands (exported for tests) ───────────────────────────
//
// The engine decides on cards, not chart keys, so each row is drawn as the
// hand that lands on it. Suits differ only so the pairs are physically
// dealable; no engine reads them.

function card(rank: Rank, suit: Suit = 'spades'): Card {
  return { rank, suit };
}

export function upcardCard(upcard: DealerUpcard): Card {
  return card(upcard as Rank);
}

// Two non-ace cards totalling `total`. Below 12 the partner is a 2 (no such
// total is a pair of 2s); from 12 up a ten carries it. Hard 20's only
// two-card form is 10,10 — a pair the chart never splits, so the engine falls
// through the pair row onto hard 20 and the cell is still this row's play.
export function hardHandFor(total: HardKey): readonly [Card, Card] {
  return total < 12
    ? [card(String(total - 2) as Rank), card('2', 'hearts')]
    : [card('10'), card(String(total - 10) as Rank, 'hearts')];
}

export function softHandFor(key: SoftKey): readonly [Card, Card] {
  return [card('A'), card(String(key) as Rank, 'hearts')];
}

export function pairHandFor(key: PairKey): readonly [Card, Card] {
  return [card(key as Rank), card(key as Rank, 'hearts')];
}

// ─── the deviation list (exported for tests) ─────────────────────────────

// "Take at +3 or above" reads as "≥ +3"; the two count-sign directions carry
// no index at all, so they print the comparison the chart legend uses.
export function formatDeviationThreshold(rule: DeviationRule): string {
  switch (rule.direction) {
    case 'positive':
      return '> 0';
    case 'negative':
      return '< 0';
    case 'at-or-above':
      return `≥ ${formatSignedCount(rule.index)}`;
    case 'at-or-below':
      return `≤ ${formatSignedCount(rule.index)}`;
  }
}

function deviationRow(
  rule: DeviationRule,
  misses: ReadonlyMap<string, WeakSpot>,
): DeviationRowView {
  const ref = deviationScenarioRef(rule);
  return {
    // Insurance has no player hand — the dealer's ace is the whole scenario.
    hand:
      rule.category === 'insurance'
        ? 'Dealer ace'
        : `${rule.playerHandLabel} vs ${rule.dealerUpcard}`,
    ref,
    threshold: formatDeviationThreshold(rule),
    action: rule.deviationAction,
    symbol: ACTION_SYMBOLS[rule.deviationAction],
    label: ACTION_LABELS[rule.deviationAction],
    missed: ref === null ? null : missLabel(misses, ref),
  };
}

// The scenario a rule is about, in the tally's own terms. Surrender rules are
// written over a hard total, so they tally as one; insurance is filed against
// whatever hand was dealt rather than against the offer, so it has no ref of
// its own and stays unmarked.
export function deviationScenarioRef(rule: DeviationRule): ScenarioRef | null {
  switch (rule.category) {
    case 'insurance':
      return null;
    case 'surrender':
      return { kind: 'hard', hand: rule.playerHand, dealer: rule.dealerUpcard };
    default:
      return { kind: rule.category, hand: rule.playerHand, dealer: rule.dealerUpcard };
  }
}

// "missed 3 of 7 this week", or null when the scenario is not outstanding.
function missLabel(misses: ReadonlyMap<string, WeakSpot>, ref: ScenarioRef): string | null {
  const spot = misses.get(scenarioKey(ref));
  return spot ? `missed ${spot.misses} of ${spot.attempts} this week` : null;
}
