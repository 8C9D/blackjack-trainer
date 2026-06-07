/**
 * Parity fixture exporter (iOS roadmap Slice 0.2).
 *
 * The native Swift rewrite re-implements the decision/counting/deviation/shoe/
 * showdown engines. To stop the two implementations from drifting, the existing
 * TypeScript engines — the source of truth — export their chart data and
 * exhaustive input→output "golden vectors" as JSON. The Swift test target loads
 * these as bundled resources and asserts its engines reproduce every row exactly
 * (see docs/ios-app-roadmap.md → "Parity strategy"). A CI step regenerates these
 * files and fails if they differ from the committed copy (anti-drift gate).
 *
 * Run with:  npm run export:fixtures   (tsx tools/export-parity-fixtures.ts)
 *
 * Determinism: every loop iterates a fixed, ordered domain and no timestamps or
 * randomness are emitted, so re-running yields byte-identical output.
 *
 * Exhaustiveness via canonical representatives: the basic-strategy and deviation
 * engines are pure functions of a hand's *classification* (pair rank / soft
 * total / hard total) — two hands that classify the same (e.g. hard 16 from
 * {10,6} or {9,7}) produce identical decisions for every upcard/count/option. We
 * therefore enumerate exactly one canonical hand per reachable classification
 * (all pairs, all soft totals A,2..A,10, all non-pair hard totals 5..19; hard 20
 * is only reachable via the 10,10 pair fall-through and is covered by that pair).
 * This is exhaustive over the engines' input space while keeping the fixtures
 * compact.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_RANKS,
  ALL_SUITS,
  isAce,
  type Card,
  type Rank,
  type Suit,
} from '../src/app/core/models/card.model';
import { COUNTING_SYSTEMS } from '../src/app/data/counting-systems';
import { H17_CHART } from '../src/app/data/h17-basic-strategy';
import { H17_DEVIATIONS } from '../src/app/data/h17-deviations';
import { S17_CHART } from '../src/app/data/s17-basic-strategy';
import { S17_DEVIATIONS } from '../src/app/data/s17-deviations';
import { dealerShouldHit, playDealerHand, settle } from '../src/app/core/models/showdown.model';
import type { EngineOptions, RuleSet } from '../src/app/core/models/strategy.model';
import { BasicStrategyEngineService } from '../src/app/core/services/basic-strategy-engine.service';
import { CountingEngineService } from '../src/app/core/services/counting-engine.service';
import { DeviationEngineService } from '../src/app/core/services/deviation-engine.service';

// ─── engine instances (DI-free; DeviationEvaluator's inject() path is avoided
// by composing the deviation engine directly, reproducing its expected-action) ──
const basic = new BasicStrategyEngineService();
const counting = new CountingEngineService();
const deviation = new DeviationEngineService(basic);

// ─── enumeration domains ─────────────────────────────────────────────────────

// The ten value-distinct ranks. '10' stands in for every ten-value card (J/Q/K)
// since the engines normalize ten-values identically.
const VALUE_RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const DEALER_UPCARDS: readonly Rank[] = VALUE_RANKS;
const RULE_SETS: readonly RuleSet[] = ['H17', 'S17'];
const BOOLS: readonly boolean[] = [false, true];

// Fixed suits for strategy/deviation/showdown inputs (suit is irrelevant there).
const SUIT_A: Suit = 'spades';
const SUIT_B: Suit = 'hearts';
const SUIT_DEALER: Suit = 'clubs';

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

interface RepHand {
  readonly label: string;
  readonly cards: readonly [Card, Card];
}

// One canonical two-card hand per reachable classification (see file header).
function representativeHands(): RepHand[] {
  const hands: RepHand[] = [];
  // Pairs 2..10, A.
  for (const r of VALUE_RANKS) {
    hands.push({ label: `pair-${r}`, cards: [card(r, SUIT_A), card(r, SUIT_B)] });
  }
  // Soft hands A,2 .. A,10 (soft totals 13..21).
  for (const r of ['2', '3', '4', '5', '6', '7', '8', '9', '10'] as Rank[]) {
    hands.push({ label: `soft-A${r}`, cards: [card('A', SUIT_A), card(r, SUIT_B)] });
  }
  // Hard hands, non-pair non-ace, totals 5..19 (first a<b with a+b=t, b<=10).
  for (let total = 5; total <= 19; total++) {
    let pair: [number, number] | null = null;
    for (let a = 2; a <= 9 && !pair; a++) {
      const b = total - a;
      if (b > a && b <= 10) pair = [a, b];
    }
    if (pair) {
      hands.push({
        label: `hard-${total}`,
        cards: [card(String(pair[0]) as Rank, SUIT_A), card(String(pair[1]) as Rank, SUIT_B)],
      });
    }
  }
  return hands;
}

const HANDS = representativeHands();

// ─── output plumbing ─────────────────────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'ios', 'Fixtures');

function options(das: boolean, ls: boolean): EngineOptions {
  return { doubleAfterSplit: das, lateSurrender: ls };
}

// Pretty-print small structured data (charts, systems) with stable key order.
function writeJson(name: string, data: unknown): void {
  writeFileSync(join(OUT_DIR, name), JSON.stringify(data, null, 2) + '\n');
}

// Write a vector file with a readable header and one compact vector per line
// (line-oriented diffs; far smaller than fully-indented JSON for large arrays).
function writeVectors(name: string, schema: string, description: string, vectors: unknown[]): void {
  const lines = vectors.map((v) => '    ' + JSON.stringify(v));
  const text =
    '{\n' +
    `  "schema": ${JSON.stringify(schema)},\n` +
    '  "generatedBy": "tools/export-parity-fixtures.ts",\n' +
    `  "description": ${JSON.stringify(description)},\n` +
    `  "count": ${vectors.length},\n` +
    '  "vectors": [\n' +
    lines.join(',\n') +
    '\n  ]\n}\n';
  writeFileSync(join(OUT_DIR, name), text);
}

// ─── 1. charts.json ──────────────────────────────────────────────────────────
function exportCharts(): void {
  writeJson('charts.json', {
    schema: 'charts/1',
    generatedBy: 'tools/export-parity-fixtures.ts',
    description:
      'The four BJA charts (H17/S17 basic strategy, H17/S17 Hi-Lo deviations) ' +
      'serialized verbatim from the TypeScript source of truth.',
    basicStrategy: { H17: H17_CHART, S17: S17_CHART },
    deviations: { H17: H17_DEVIATIONS, S17: S17_DEVIATIONS },
  });
}

// ─── 2. counting-systems.json ────────────────────────────────────────────────
function exportCountingSystems(): void {
  // Serialized verbatim. NOTE: the source CountingSystem has no "level" field
  // (the roadmap mentions one); we export the real shape — id/name/description/
  // values/colorValues?/balanced — plus a derived isFractional flag the counting
  // UI keys off, rather than inventing source data.
  const systems = COUNTING_SYSTEMS.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    balanced: s.balanced,
    isFractional: counting.isFractionalSystem(s),
    values: s.values,
    ...(s.colorValues ? { colorValues: s.colorValues } : {}),
  }));
  writeJson('counting-systems.json', {
    schema: 'counting-systems/1',
    generatedBy: 'tools/export-parity-fixtures.ts',
    description: `All ${systems.length} counting systems with per-rank and per-color values.`,
    count: systems.length,
    systems,
  });
}

// ─── 3. basic-strategy-vectors.json ──────────────────────────────────────────
function exportBasicStrategyVectors(): void {
  const vectors: unknown[] = [];
  for (const hand of HANDS) {
    for (const dealer of DEALER_UPCARDS) {
      for (const ruleSet of RULE_SETS) {
        for (const das of BOOLS) {
          for (const ls of BOOLS) {
            const decision = basic.decide({
              player: hand.cards,
              dealerUpcard: card(dealer, SUIT_DEALER),
              ruleSet,
              options: options(das, ls),
            });
            vectors.push({
              hand: [hand.cards[0].rank, hand.cards[1].rank],
              dealer,
              ruleSet,
              das,
              ls,
              action: decision.action,
              source: decision.source,
              label: decision.handDescription,
              rationale: decision.reason,
            });
          }
        }
      }
    }
  }
  writeVectors(
    'basic-strategy-vectors.json',
    'basic-strategy-vectors/1',
    'Exhaustive basic-strategy decisions: every canonical hand × upcard × rule ' +
      'set × DAS × LS → { action, source, label, rationale }. Suits are arbitrary ' +
      '(basic strategy is suit-independent).',
    vectors,
  );
}

// ─── 4. deviation-vectors.json ───────────────────────────────────────────────
// Reproduces DeviationEvaluatorService.evaluate's expected action without its
// inject() path: insurance overlay (dealer Ace, TC >= +3) dominates, else the
// playing-decision deviation overlay (with surrender precedence) applies.
//
// Columnar encoding (one fixed-order array per row, plus an interned `sources`
// table) because the full cross-product is large; this keeps every vector while
// staying compact. The Swift loader decodes each row positionally per `columns`.
function exportDeviationVectors(): void {
  const sources: string[] = [];
  const sourceIndex = new Map<string, number>();
  const intern = (s: string | null | undefined): number => {
    if (s == null) return -1;
    let idx = sourceIndex.get(s);
    if (idx === undefined) {
      idx = sources.length;
      sources.push(s);
      sourceIndex.set(s, idx);
    }
    return idx;
  };

  const rows: unknown[][] = [];
  for (const hand of HANDS) {
    for (const dealer of DEALER_UPCARDS) {
      const dealerCard = card(dealer, SUIT_DEALER);
      const dealerAce = isAce(dealerCard);
      for (let tc = -10; tc <= 12; tc++) {
        for (const ruleSet of RULE_SETS) {
          for (const das of BOOLS) {
            for (const ls of BOOLS) {
              const input = {
                player: hand.cards,
                dealerUpcard: dealerCard,
                ruleSet,
                options: options(das, ls),
              };
              const playing = deviation.resolveDeviationDecision(input, tc);
              const insurance = dealerAce ? deviation.resolveInsuranceDecision(tc, ruleSet) : null;
              const useInsurance = insurance?.deviationApplied === true;
              const matched = useInsurance ? insurance?.matchedRule : playing.matchedRule;
              rows.push([
                hand.cards[0].rank,
                hand.cards[1].rank,
                dealer,
                tc,
                ruleSet,
                das,
                ls,
                useInsurance ? 'INS' : playing.finalAction,
                playing.basicAction,
                useInsurance ? true : playing.deviationApplied,
                intern(matched?.source ?? null),
                useInsurance ? 'insurance' : 'playing',
              ]);
            }
          }
        }
      }
    }
  }

  const columns = [
    'handCard1',
    'handCard2',
    'dealer',
    'trueCount',
    'ruleSet',
    'das',
    'lateSurrender',
    'expectedAction',
    'basicAction',
    'deviationApplied',
    'matchedRuleSourceIndex', // -1 = none, else index into sources[]
    'evalSource', // 'playing' | 'insurance'
  ];
  const rowLines = rows.map((r) => '    ' + JSON.stringify(r));
  const text =
    '{\n' +
    '  "schema": "deviation-vectors/1",\n' +
    '  "generatedBy": "tools/export-parity-fixtures.ts",\n' +
    '  "description": "Exhaustive deviation decisions: every canonical hand × upcard × true count [-10,+12] × rule set × DAS × LS → expected action (incl. insurance overlay and surrender precedence). Columnar: each row follows `columns`; matchedRuleSourceIndex indexes `sources` (-1 = none). Suits are arbitrary.",\n' +
    `  "columns": ${JSON.stringify(columns)},\n` +
    `  "sources": ${JSON.stringify(sources)},\n` +
    `  "count": ${rows.length},\n` +
    '  "rows": [\n' +
    rowLines.join(',\n') +
    '\n  ]\n}\n';
  writeFileSync(join(OUT_DIR, 'deviation-vectors.json'), text);
}

// ─── 5. counting-vectors.json ────────────────────────────────────────────────
function fullDeck(): Card[] {
  const cards: Card[] = [];
  for (const rank of ALL_RANKS) {
    for (const suit of ALL_SUITS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

// Fixed sequences applied to every system; their per-system running/true counts
// exercise color overrides (mixed suits), fractional systems (Wong Halves), and
// truncation toward zero (the ±odd/2 cases below resolve to e.g. -5/2 → -2).
function countingSequences(): { label: string; cards: Card[]; decksRemaining: number }[] {
  const c = (rank: Rank, suit: Suit) => card(rank, suit);
  return [
    { label: 'full-deck', cards: fullDeck(), decksRemaining: 1 },
    {
      label: 'low-five-over-two-decks', // Hi-Lo: +5 over 2 decks → trunc(2.5) = +2
      cards: [
        c('2', 'spades'),
        c('3', 'hearts'),
        c('4', 'diamonds'),
        c('5', 'clubs'),
        c('6', 'spades'),
      ],
      decksRemaining: 2,
    },
    {
      label: 'high-five-over-two-decks', // Hi-Lo: -5 over 2 decks → trunc(-2.5) = -2
      cards: [
        c('10', 'spades'),
        c('J', 'hearts'),
        c('Q', 'diamonds'),
        c('K', 'clubs'),
        c('A', 'spades'),
      ],
      decksRemaining: 2,
    },
    {
      label: 'mixed-over-one-and-half', // fractional decksRemaining; mixed ranks
      cards: [
        c('5', 'hearts'),
        c('5', 'spades'),
        c('7', 'hearts'),
        c('7', 'spades'),
        c('10', 'diamonds'),
        c('A', 'clubs'),
        c('2', 'clubs'),
        c('9', 'hearts'),
      ],
      decksRemaining: 1.5,
    },
    {
      label: 'all-four-sevens', // exercises per-color tags (2 red, 2 black sevens)
      cards: [c('7', 'hearts'), c('7', 'diamonds'), c('7', 'spades'), c('7', 'clubs')],
      decksRemaining: 1,
    },
  ];
}

function exportCountingVectors(): void {
  const sequences = countingSequences();
  const systems = COUNTING_SYSTEMS.map((system) => ({
    systemId: system.id,
    balanced: system.balanced,
    isFractional: counting.isFractionalSystem(system),
    sequences: sequences.map((seq) => {
      const runningCount = counting.runningCount(seq.cards, system);
      return {
        label: seq.label,
        decksRemaining: seq.decksRemaining,
        cards: seq.cards.map((cd) => ({ rank: cd.rank, suit: cd.suit })),
        runningCount,
        trueCount: counting.trueCount(runningCount, seq.decksRemaining),
      };
    }),
  }));

  // scoreDeckEstimate(estimate, actual, tolerance=0.5): |est-act| <= tol + 1e-9.
  const estimateCases = [
    { estimate: 2.0, actual: 2.0 },
    { estimate: 2.5, actual: 2.0 }, // exactly +0.5 → within band
    { estimate: 1.5, actual: 2.0 }, // exactly -0.5 → within band
    { estimate: 2.51, actual: 2.0 }, // just over → outside
    { estimate: 1.49, actual: 2.0 }, // just under → outside
    { estimate: 0.0, actual: 0.5 }, // boundary near zero
    { estimate: 3.0, actual: 2.5 }, // 130/52 = 2.5 actual analogue
    { estimate: 2.2, actual: 2.0, tolerance: 0.25 }, // custom tolerance → within
    { estimate: 2.3, actual: 2.0, tolerance: 0.25 }, // custom tolerance → outside
  ].map((cse) => ({
    ...cse,
    withinBand:
      cse.tolerance === undefined
        ? counting.scoreDeckEstimate(cse.estimate, cse.actual)
        : counting.scoreDeckEstimate(cse.estimate, cse.actual, cse.tolerance),
  }));

  writeJson('counting-vectors.json', {
    schema: 'counting-vectors/1',
    generatedBy: 'tools/export-parity-fixtures.ts',
    description:
      'Per-system running/true counts over fixed sequences (color, fractional, ' +
      'and truncation-toward-zero cases) plus scoreDeckEstimate ±0.5 boundaries.',
    systems,
    deckEstimateCases: estimateCases,
  });
}

// ─── 6. showdown-vectors.json ────────────────────────────────────────────────
function ranks(cards: readonly Card[]): string[] {
  return cards.map((c) => c.rank);
}

function exportShowdownVectors(): void {
  const c = (rank: Rank): Card => card(rank, SUIT_A);

  // dealerShouldHit across hard 13..21 and soft 13..21 under both rule sets.
  const hardHands: Record<number, Card[]> = {
    13: [c('10'), c('3')],
    14: [c('10'), c('4')],
    15: [c('10'), c('5')],
    16: [c('10'), c('6')],
    17: [c('10'), c('7')],
    18: [c('10'), c('8')],
    19: [c('10'), c('9')],
    20: [c('10'), c('10')],
    21: [c('7'), c('7'), c('7')],
  };
  const softHands: Record<number, Card[]> = {
    13: [c('A'), c('2')],
    14: [c('A'), c('3')],
    15: [c('A'), c('4')],
    16: [c('A'), c('5')],
    17: [c('A'), c('6')],
    18: [c('A'), c('7')],
    19: [c('A'), c('8')],
    20: [c('A'), c('9')],
    21: [c('A'), c('10')],
  };
  const dealerShouldHitCases: unknown[] = [];
  for (const ruleSet of RULE_SETS) {
    for (const [total, hand] of Object.entries(hardHands)) {
      dealerShouldHitCases.push({
        hand: ranks(hand),
        kind: 'hard',
        total: Number(total),
        ruleSet,
        shouldHit: dealerShouldHit(hand, ruleSet),
      });
    }
    for (const [total, hand] of Object.entries(softHands)) {
      dealerShouldHitCases.push({
        hand: ranks(hand),
        kind: 'soft',
        total: Number(total),
        ruleSet,
        shouldHit: dealerShouldHit(hand, ruleSet),
      });
    }
  }

  // playDealerHand: fixed initial hand + draw queue → final hand.
  const playCases = [
    {
      label: 'soft-17-h17-draws-to-bust',
      initial: [c('A'), c('6')],
      ruleSet: 'H17' as RuleSet,
      draws: [c('5'), c('10')],
    },
    {
      label: 'soft-17-s17-stands',
      initial: [c('A'), c('6')],
      ruleSet: 'S17' as RuleSet,
      draws: [c('5'), c('10')],
    },
    {
      label: 'hard-16-hits-once',
      initial: [c('10'), c('6')],
      ruleSet: 'H17' as RuleSet,
      draws: [c('5')],
    },
    {
      label: 'hard-17-stands',
      initial: [c('10'), c('7')],
      ruleSet: 'H17' as RuleSet,
      draws: [c('9')],
    },
    {
      label: 'low-hits-multiple',
      initial: [c('4'), c('3')],
      ruleSet: 'S17' as RuleSet,
      draws: [c('5'), c('2'), c('4')],
    },
  ].map((pc) => {
    const queue = [...pc.draws];
    const final = playDealerHand(pc.initial, pc.ruleSet, () => queue.shift());
    return {
      label: pc.label,
      initial: ranks(pc.initial),
      ruleSet: pc.ruleSet,
      draws: ranks(pc.draws),
      finalHand: ranks(final),
    };
  });

  // settle: outcome matrix covering naturals (3:2), bust ordering, totals, pushes.
  const settleCases = [
    { label: 'player-bj-beats-17', player: [c('A'), c('10')], dealer: [c('10'), c('7')] },
    { label: 'both-naturals-push', player: [c('A'), c('10')], dealer: [c('A'), c('K')] },
    { label: 'dealer-bj-beats-player', player: [c('10'), c('7')], dealer: [c('A'), c('Q')] },
    { label: 'player-bust-loses', player: [c('10'), c('6'), c('10')], dealer: [c('10'), c('7')] },
    {
      label: 'player-bust-loses-even-vs-dealer-bust',
      player: [c('10'), c('6'), c('10')],
      dealer: [c('10'), c('6'), c('10')],
    },
    {
      label: 'dealer-bust-pays-standing-player',
      player: [c('10'), c('7')],
      dealer: [c('10'), c('6'), c('10')],
    },
    { label: 'higher-total-wins', player: [c('10'), c('10')], dealer: [c('10'), c('9')] },
    { label: 'lower-total-loses', player: [c('10'), c('8')], dealer: [c('10'), c('10')] },
    { label: 'equal-total-pushes', player: [c('10'), c('9')], dealer: [c('10'), c('9')] },
    {
      label: 'three-card-21-not-natural-wins',
      player: [c('7'), c('7'), c('7')],
      dealer: [c('10'), c('10')],
    },
    {
      label: 'natural-beats-three-card-21',
      player: [c('A'), c('10')],
      dealer: [c('10'), c('6'), c('5')],
    },
  ].map((sc) => {
    const result = settle(sc.player, sc.dealer);
    return {
      label: sc.label,
      player: ranks(sc.player),
      dealer: ranks(sc.dealer),
      outcome: result.outcome,
      playerBlackjack: result.playerBlackjack,
      dealerBlackjack: result.dealerBlackjack,
    };
  });

  writeJson('showdown-vectors.json', {
    schema: 'showdown-vectors/1',
    generatedBy: 'tools/export-parity-fixtures.ts',
    description:
      'Pure dealer-play and settlement cases: dealerShouldHit (H17/S17 soft-17), ' +
      'playDealerHand draw loops, and settle() outcomes (3:2 naturals, bust ' +
      'ordering, totals, pushes). Suits are arbitrary.',
    dealerShouldHitCases,
    playCases,
    settleCases,
  });
}

// ─── main ────────────────────────────────────────────────────────────────────
function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  exportCharts();
  exportCountingSystems();
  exportBasicStrategyVectors();
  exportDeviationVectors();
  exportCountingVectors();
  exportShowdownVectors();
  // eslint-disable-next-line no-console
  console.log(`Wrote 6 parity fixtures to ${OUT_DIR}`);
}

main();
