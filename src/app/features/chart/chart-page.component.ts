import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { shouldIgnoreKeyboardEvent } from '../../core/keyboard';
import { formatSignedCount } from '../../core/models/card-counting.model';
import type { Card, Rank, Suit } from '../../core/models/card.model';
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
import { deviationsFor } from '../../core/services/deviation-engine.service';
import { FlowPrefsService } from '../../core/services/flow-prefs.service';
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

export type ChartMode = 'basic' | 'deviations';

export const CHART_MODES: readonly { value: ChartMode; label: string }[] = [
  { value: 'basic', label: 'Basic strategy' },
  { value: 'deviations', label: 'Deviations' },
];

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
  readonly threshold: string;
  readonly action: Action;
  readonly symbol: string;
  readonly label: string;
}

interface DeviationSectionView {
  readonly id: DeviationCategory;
  readonly title: string;
  readonly rows: readonly DeviationRowView[];
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
        <h1 class="chart__title">Strategy chart</h1>
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

      <p class="chart__rules">
        <span class="chart__chip">{{ ruleSetLabel() }}</span>
        @if (mode() === 'basic') {
          <span class="chart__chip">{{ dasLabel() }}</span>
          <span class="chart__chip">{{ surrenderLabel() }}</span>
        }
        <button type="button" class="chart__settings" (click)="openSettings()">Change rules</button>
      </p>

      @if (mode() === 'deviations') {
        @for (section of deviationSections(); track section.id) {
          <section class="chart__section">
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
                    <th scope="row" class="chart__rule-hand">{{ rule.hand }}</th>
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

        @if (indexNote(); as note) {
          <p class="chart__note chart__note--warn" role="note">{{ note }}</p>
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
                @for (row of section.rows; track row.label) {
                  <tr>
                    <th scope="row" class="chart__hand">{{ row.label }}</th>
                    @for (cell of row.cells; track $index) {
                      <td
                        class="chart__cell"
                        [class]="'chart__cell--' + cell.action.toLowerCase()"
                        [attr.aria-label]="cell.label"
                      >
                        {{ cell.symbol }}
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
        </ul>

        <p class="chart__note">
          Every cell is the play for a two-card starting hand under the rules above. Pair rows show
          the split decision, or the play the hand falls back to when the chart says not to split.
        </p>
      }
    </main>
  `,
  styleUrl: './chart-page.component.scss',
})
export class ChartPageComponent {
  private readonly prefsService = inject(FlowPrefsService);
  private readonly engine = inject(BasicStrategyEngineService);
  private readonly router = inject(Router);

  protected readonly dealerUpcards = DEALER_UPCARDS;
  protected readonly legend = LEGEND;
  protected readonly modes = CHART_MODES;

  protected readonly mode = signal<ChartMode>('basic');

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

  protected readonly sections = computed<readonly ChartSectionView[]>(() => {
    const { ruleSet, options } = this.prefs();
    return [
      {
        id: 'hard',
        title: 'Hard totals',
        rowHeader: 'Total',
        rows: HARD_KEYS.map((key) => this.row(String(key), hardHandFor(key), ruleSet, options)),
      },
      {
        id: 'soft',
        title: 'Soft totals',
        rowHeader: 'Hand',
        rows: SOFT_KEYS.map((key) => this.row(`A,${key}`, softHandFor(key), ruleSet, options)),
      },
      {
        id: 'pair',
        title: 'Pairs',
        rowHeader: 'Hand',
        rows: PAIR_KEYS.map((key) => this.row(`${key},${key}`, pairHandFor(key), ruleSet, options)),
      },
    ];
  });

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
    return DEVIATION_CATEGORIES.map(({ id, title }) => ({
      id,
      title,
      rows: rules.filter((rule) => rule.category === id).map(deviationRow),
    })).filter((section) => section.rows.length > 0);
  });

  protected symbolFor(action: Exclude<Action, 'INS'>): string {
    return ACTION_SYMBOLS[action];
  }

  protected setMode(mode: ChartMode): void {
    this.mode.set(mode);
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected openSettings(): void {
    void this.router.navigate(['/settings']);
  }

  private row(
    label: string,
    player: readonly [Card, Card],
    ruleSet: RuleSet,
    options: EngineOptions,
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
        return { action, symbol: ACTION_SYMBOLS[action], label: ACTION_LABELS[action] };
      }),
    };
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

function deviationRow(rule: DeviationRule): DeviationRowView {
  return {
    // Insurance has no player hand — the dealer's ace is the whole scenario.
    hand:
      rule.category === 'insurance'
        ? 'Dealer ace'
        : `${rule.playerHandLabel} vs ${rule.dealerUpcard}`,
    threshold: formatDeviationThreshold(rule),
    action: rule.deviationAction,
    symbol: ACTION_SYMBOLS[rule.deviationAction],
    label: ACTION_LABELS[rule.deviationAction],
  };
}
