import { Injectable, signal, type Signal } from '@angular/core';

import type { DrillMode, TrueCountSource } from '../models/card-counting.model';
import { DEFAULT_NUMBER_OF_DECKS, DEFAULT_PENETRATION } from '../models/shoe.model';
import { DEFAULT_ENGINE_OPTIONS, type EngineOptions, type RuleSet } from '../models/strategy.model';

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
}

export interface FlowPrefs {
  readonly lastTrainer: TrainerId;
  readonly dailyGoal: number;
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
    if (typeof localStorage === 'undefined') return DEFAULT_FLOW_PREFS;
    try {
      const raw = localStorage.getItem(FLOW_PREFS_KEY);
      if (!raw) return DEFAULT_FLOW_PREFS;
      return mergePrefs(JSON.parse(raw));
    } catch {
      // Malformed payload — fall back to defaults.
      return DEFAULT_FLOW_PREFS;
    }
  }

  private persist(prefs: FlowPrefs): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(FLOW_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // localStorage can throw on quota / private browsing; tolerate silently.
    }
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
  return {
    lastTrainer: oneOf(p['lastTrainer'], TRAINER_ORDER, d.lastTrainer),
    dailyGoal: typeof p['dailyGoal'] === 'number' ? clampGoal(p['dailyGoal']) : d.dailyGoal,
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
      systemId: typeof cnt['systemId'] === 'string' ? cnt['systemId'] : d.counting.systemId,
      mode: oneOf(cnt['mode'], ['running-count', 'true-count'] as const, d.counting.mode),
      numberOfCards: num(cnt['numberOfCards'], d.counting.numberOfCards),
      millisecondsBetweenCards: num(
        cnt['millisecondsBetweenCards'],
        d.counting.millisecondsBetweenCards,
      ),
      decksRemaining: num(cnt['decksRemaining'], d.counting.decksRemaining),
      trueCountSource: oneOf(
        cnt['trueCountSource'],
        ['live-shoe', 'classic'] as const,
        d.counting.trueCountSource,
      ),
      numberOfDecks: num(cnt['numberOfDecks'], d.counting.numberOfDecks),
      penetration: num(cnt['penetration'], d.counting.penetration),
    },
  };
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
