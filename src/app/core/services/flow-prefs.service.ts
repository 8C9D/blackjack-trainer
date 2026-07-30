import { Injectable, signal, type Signal } from '@angular/core';

import {
  DECKS_REMAINING_PRESETS,
  MAX_CARDS_PER_DRILL,
  MIN_MILLISECONDS_BETWEEN_CARDS,
  type DrillMode,
  type TrueCountSource,
} from '../models/card-counting.model';
import type { CountingSystem } from '../models/counting-system.model';
import {
  CARDS_PER_DECK,
  DEFAULT_NUMBER_OF_DECKS,
  DEFAULT_PENETRATION,
  PENETRATION_PRESETS,
  SHOE_DECK_OPTIONS,
} from '../models/shoe.model';
import { clampSpots } from '../models/showdown.model';
import { DEFAULT_ENGINE_OPTIONS, type EngineOptions, type RuleSet } from '../models/strategy.model';
import { COUNTING_SYSTEMS } from '../../data/counting-systems';
import { readJson, writeJson } from './storage';

export const FLOW_PREFS_KEY = 'blackjack-flow-prefs';

export type TrainerId = 'basic-strategy' | 'card-counting' | 'deviations';

// Canonical trainer order. Home renders the primary (last-used) trainer first
// and the remaining two in this order, so card positions never move.
export const TRAINER_ORDER: readonly TrainerId[] = [
  'basic-strategy',
  'card-counting',
  'deviations',
];

export const TRAINER_LABELS: Readonly<Record<TrainerId, string>> = {
  'basic-strategy': 'Basic Strategy',
  'card-counting': 'Card Counting',
  deviations: 'Deviations',
};

export type DeviationTrueCountSource = 'random' | 'manual';
export type DeviationPracticeMode = 'all-hands' | 'deviation-only';

// 'system' follows the OS setting; the other two pin a theme regardless.
export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark'];

export interface DeviationPrefs {
  readonly practiceMode: DeviationPracticeMode;
  readonly trueCountSource: DeviationTrueCountSource;
  readonly manualTrueCount: number;
}

export interface CountingPrefs {
  readonly systemId: string;
  readonly mode: DrillMode;
  readonly numberOfCards: number;
  readonly millisecondsBetweenCards: number;
  readonly decksRemaining: number;
  readonly trueCountSource: TrueCountSource;
  readonly numberOfDecks: number;
  readonly penetration: number;
  // Boxes the player occupies in the optional post-count showdown (1–3).
  readonly showdownSpots: number;
  // Bet sizing in the showdown: each round opens on a bet and settles against a
  // persisted bankroll. Off by default — the showdown stays a pure hand tally
  // until the player asks to practise spreading.
  readonly showdownBetting: boolean;
}

export interface FlowPrefs {
  readonly lastTrainer: TrainerId;
  readonly dailyGoal: number;
  readonly theme: ThemePref;
  // Table rules shared by the Basic Strategy and Deviations drills (and the
  // counting showdown's dealer play).
  readonly ruleSet: RuleSet;
  readonly options: EngineOptions;
  readonly deviations: DeviationPrefs;
  readonly counting: CountingPrefs;
}

export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 200;

export const DEFAULT_FLOW_PREFS: FlowPrefs = {
  lastTrainer: 'basic-strategy',
  dailyGoal: 20,
  theme: 'system',
  ruleSet: 'S17',
  options: DEFAULT_ENGINE_OPTIONS,
  deviations: {
    practiceMode: 'all-hands',
    trueCountSource: 'random',
    manualTrueCount: 0,
  },
  counting: {
    systemId: 'hi-lo',
    mode: 'running-count',
    numberOfCards: 20,
    millisecondsBetweenCards: 1000,
    decksRemaining: 1,
    trueCountSource: 'live-shoe',
    numberOfDecks: DEFAULT_NUMBER_OF_DECKS,
    penetration: DEFAULT_PENETRATION,
    showdownSpots: 1,
    showdownBetting: false,
  },
};

// The user's pre-made decisions: last trainer (Continue target), daily goal,
// table rules, and per-trainer drill settings. Everything the Settings screen
// edits and the drills read lives here, under a single localStorage key, so
// the drill screens themselves never host configuration.
@Injectable({ providedIn: 'root' })
export class FlowPrefsService {
  private readonly _prefs = signal<FlowPrefs>(this.load());
  readonly prefs: Signal<FlowPrefs> = this._prefs.asReadonly();

  setLastTrainer(trainer: TrainerId): void {
    this.set({ ...this._prefs(), lastTrainer: trainer });
  }

  setDailyGoal(goal: number): void {
    this.set({ ...this._prefs(), dailyGoal: clampGoal(goal) });
  }

  setTheme(theme: ThemePref): void {
    this.set({ ...this._prefs(), theme });
  }

  setRuleSet(ruleSet: RuleSet): void {
    this.set({ ...this._prefs(), ruleSet });
  }

  setOptions(options: EngineOptions): void {
    this.set({ ...this._prefs(), options });
  }

  updateDeviations(partial: Partial<DeviationPrefs>): void {
    const prev = this._prefs();
    this.set({ ...prev, deviations: { ...prev.deviations, ...partial } });
  }

  updateCounting(partial: Partial<CountingPrefs>): void {
    const prev = this._prefs();
    this.set({ ...prev, counting: { ...prev.counting, ...partial } });
  }

  private set(next: FlowPrefs): void {
    this._prefs.set(next);
    this.persist(next);
  }

  private load(): FlowPrefs {
    return readJson(FLOW_PREFS_KEY, DEFAULT_FLOW_PREFS, mergePrefs);
  }

  private persist(prefs: FlowPrefs): void {
    writeJson(FLOW_PREFS_KEY, prefs);
  }
}

// ─── pure helpers (exported for tests) ───────────────────────────────────

export function clampGoal(goal: number): number {
  if (!Number.isFinite(goal)) return DEFAULT_FLOW_PREFS.dailyGoal;
  return Math.min(MAX_DAILY_GOAL, Math.max(MIN_DAILY_GOAL, Math.round(goal)));
}

// Field-by-field merge of an untrusted parsed payload over the defaults, so a
// stale or partially-corrupt stored shape degrades to defaults per field
// instead of discarding everything.
export function mergePrefs(parsed: unknown): FlowPrefs {
  const d = DEFAULT_FLOW_PREFS;
  if (typeof parsed !== 'object' || parsed === null) return d;
  const p = parsed as Record<string, unknown>;
  const dev = asRecord(p['deviations']);
  const cnt = asRecord(p['counting']);
  const opts = asRecord(p['options']);
  const systemId = oneOf(
    cnt['systemId'],
    COUNTING_SYSTEMS.map((system) => system.id),
    d.counting.systemId,
  );
  const system = COUNTING_SYSTEMS.find((candidate) => candidate.id === systemId)!;
  const requestedMode = oneOf(
    cnt['mode'],
    ['running-count', 'true-count', 'key-count'] as const,
    d.counting.mode,
  );
  // True count needs a balanced system; the key-count drill needs a published
  // IRC/key-count schedule (KO). The Settings UI enforces both when changed
  // interactively; the loader must enforce the same invariants for stale or
  // hand-edited payloads.
  const mode: DrillMode = modeAllowedFor(system, requestedMode) ? requestedMode : 'running-count';
  const trueCountSource = oneOf(
    cnt['trueCountSource'],
    ['live-shoe', 'classic'] as const,
    d.counting.trueCountSource,
  );
  const numberOfDecks = numberOneOf(
    cnt['numberOfDecks'],
    SHOE_DECK_OPTIONS,
    d.counting.numberOfDecks,
  );
  let numberOfCards = integerInRange(
    cnt['numberOfCards'],
    1,
    MAX_CARDS_PER_DRILL,
    d.counting.numberOfCards,
  );
  if (
    (mode === 'key-count' || (mode === 'true-count' && trueCountSource === 'live-shoe')) &&
    numberOfCards >= numberOfDecks * CARDS_PER_DECK
  ) {
    numberOfCards = d.counting.numberOfCards;
  }
  return {
    lastTrainer: oneOf(p['lastTrainer'], TRAINER_ORDER, d.lastTrainer),
    dailyGoal: typeof p['dailyGoal'] === 'number' ? clampGoal(p['dailyGoal']) : d.dailyGoal,
    theme: oneOf(p['theme'], THEME_PREFS, d.theme),
    ruleSet: oneOf(p['ruleSet'], ['H17', 'S17'] as const, d.ruleSet),
    options: {
      doubleAfterSplit: bool(opts['doubleAfterSplit'], d.options.doubleAfterSplit),
      lateSurrender: bool(opts['lateSurrender'], d.options.lateSurrender),
    },
    deviations: {
      practiceMode: oneOf(
        dev['practiceMode'],
        ['all-hands', 'deviation-only'] as const,
        d.deviations.practiceMode,
      ),
      trueCountSource: oneOf(
        dev['trueCountSource'],
        ['random', 'manual'] as const,
        d.deviations.trueCountSource,
      ),
      manualTrueCount: int(dev['manualTrueCount'], d.deviations.manualTrueCount),
    },
    counting: {
      systemId,
      mode,
      numberOfCards,
      millisecondsBetweenCards: numberAtLeast(
        cnt['millisecondsBetweenCards'],
        MIN_MILLISECONDS_BETWEEN_CARDS,
        d.counting.millisecondsBetweenCards,
      ),
      decksRemaining: numberOneOf(
        cnt['decksRemaining'],
        DECKS_REMAINING_PRESETS,
        d.counting.decksRemaining,
      ),
      trueCountSource,
      numberOfDecks,
      penetration: numberOneOf(cnt['penetration'], PENETRATION_PRESETS, d.counting.penetration),
      showdownSpots: clampSpots(num(cnt['showdownSpots'], d.counting.showdownSpots)),
      showdownBetting: bool(cnt['showdownBetting'], d.counting.showdownBetting),
    },
  };
}

// Whether a system can host the requested drill mode: true count requires a
// balanced system, the key-count drill a published schedule; running count is
// always available.
export function modeAllowedFor(system: CountingSystem, mode: DrillMode): boolean {
  if (mode === 'true-count') return system.balanced;
  if (mode === 'key-count') return system.keyCounts !== undefined;
  return true;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function int(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) ? v : fallback;
}

function numberOneOf(value: unknown, allowed: readonly number[], fallback: number): number {
  return typeof value === 'number' && allowed.includes(value) ? value : fallback;
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function numberAtLeast(value: unknown, minimum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum ? value : fallback;
}
