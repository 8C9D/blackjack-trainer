import { Injectable, signal, type Signal } from '@angular/core';

import { cardHighValue, softNonAceValue, type Card } from '../models/card.model';
import type { DealerUpcard } from '../models/strategy.model';
import { classifyAsPair, isSoftHand, normalizeUpcardKey } from './basic-strategy-engine.service';
import { localDateKey } from './practice-history.service';
import { readJson, writeJson } from './storage';

export const MISS_TALLY_KEY = 'blackjack-miss-tally';

// Rolling window for weak-spot selection ("missed 3 of 7 this week").
const WINDOW_DAYS = 7;

// Consecutive correct answers that retire a scenario from the weak list.
// Three is enough to distinguish "learned it" from "guessed it once": at six
// answerable actions a lucky run of three is a 1-in-216 accident.
export const CLEAR_STREAK = 3;

// Trainers that produce per-scenario tallies. Card counting has no scenario
// identity per rep, so it never records here.
export type TalliedTrainer = 'basic-strategy' | 'deviations';

// Identity of a drillable scenario, structured so a drill can re-deal it as
// the first hand of the next session (the "Drill next" seed).
export interface ScenarioRef {
  readonly kind: 'hard' | 'soft' | 'pair';
  // hard/soft: stringified total ('16', '18'); pair: rank key ('8', 'A', '10').
  readonly hand: string;
  readonly dealer: DealerUpcard;
}

export interface WeakSpot {
  readonly ref: ScenarioRef;
  readonly label: string;
  readonly misses: number;
  readonly attempts: number;
  // Consecutive correct answers since this scenario was last missed.
  readonly streak: number;
}

interface DayTally {
  readonly date: string;
  readonly attempts: number;
  readonly misses: number;
}

interface ScenarioTally {
  readonly ref: ScenarioRef;
  readonly days: readonly DayTally[];
  // Consecutive correct answers since the last miss. Unlike `days` this is
  // not windowed: it is the live clear-streak signal, reset by any miss.
  readonly streak: number;
}

type TallyState = Partial<Record<TalliedTrainer, Record<string, ScenarioTally>>>;

export function scenarioRefFor(player: readonly [Card, Card], dealerUpcard: Card): ScenarioRef {
  const dealer = normalizeUpcardKey(dealerUpcard);
  const pairKey = classifyAsPair(player);
  if (pairKey !== null) return { kind: 'pair', hand: pairKey, dealer };
  if (isSoftHand(player)) {
    return { kind: 'soft', hand: String(11 + softNonAceValue(player)), dealer };
  }
  return {
    kind: 'hard',
    hand: String(cardHighValue(player[0]) + cardHighValue(player[1])),
    dealer,
  };
}

export function scenarioKey(ref: ScenarioRef): string {
  return `${ref.kind}-${ref.hand}-v-${ref.dealer}`;
}

// Chart-style shorthand: hard "16 vs 10", soft "A,7 vs 9", pair "8,8 vs 10".
export function scenarioLabel(ref: ScenarioRef): string {
  switch (ref.kind) {
    case 'hard':
      return `${ref.hand} vs ${ref.dealer}`;
    case 'soft':
      return `A,${Number(ref.hand) - 11} vs ${ref.dealer}`;
    case 'pair':
      return `${ref.hand},${ref.hand} vs ${ref.dealer}`;
  }
}

// Per-scenario attempt/miss tallies over a rolling 7-day window, keyed by
// trainer. Drives the Done screen's "Drill next: 16 vs 10 — missed 3 of 7
// this week" card and the next session's opening hand.
@Injectable({ providedIn: 'root' })
export class MissTallyService {
  private now: () => Date = () => new Date();

  private readonly _state = signal<TallyState>({});
  readonly state: Signal<TallyState> = this._state.asReadonly();

  constructor() {
    this._state.set(this.load());
  }

  // Test seam mirroring PracticeHistoryService.setNowSource.
  setNowSource(fn: () => Date): void {
    this.now = fn;
  }

  record(trainer: TalliedTrainer, ref: ScenarioRef, correct: boolean): void {
    const today = localDateKey(this.now());
    const key = scenarioKey(ref);
    const state = this._state();
    const forTrainer = { ...(state[trainer] ?? {}) };
    const existing = forTrainer[key] ?? { ref, days: [], streak: 0 };
    const day = existing.days.find((d) => d.date === today);
    const days = day
      ? existing.days.map((d) =>
          d.date === today
            ? { date: d.date, attempts: d.attempts + 1, misses: d.misses + (correct ? 0 : 1) }
            : d,
        )
      : [...existing.days, { date: today, attempts: 1, misses: correct ? 0 : 1 }];
    forTrainer[key] = {
      ref,
      days: this.pruneDays(days),
      streak: correct ? existing.streak + 1 : 0,
    };
    const next: TallyState = { ...state, [trainer]: this.pruneScenarios(forTrainer) };
    this._state.set(next);
    this.persist(next);
  }

  // Scenarios missed inside the window and not yet cleared, worst first
  // (most misses, then highest miss rate, then scenario key so the order is
  // stable). This is what adaptive selection draws from.
  weakSpots(trainer: TalliedTrainer): readonly WeakSpot[] {
    return this.windowed(trainer)
      .filter((spot) => spot.streak < CLEAR_STREAK)
      .sort(
        (a, b) =>
          b.misses - a.misses ||
          b.misses / b.attempts - a.misses / a.attempts ||
          scenarioKey(a.ref).localeCompare(scenarioKey(b.ref)),
      );
  }

  // The counterpart: scenarios that were missed this week and have since been
  // answered correctly CLEAR_STREAK times running. They no longer get extra
  // practice, and the Done screen names them as the week's wins.
  clearedSpots(trainer: TalliedTrainer): readonly WeakSpot[] {
    return this.windowed(trainer)
      .filter((spot) => spot.streak >= CLEAR_STREAK)
      .sort((a, b) => b.streak - a.streak || scenarioKey(a.ref).localeCompare(scenarioKey(b.ref)));
  }

  // The worst outstanding scenario, or null when nothing is outstanding.
  weakSpotFor(trainer: TalliedTrainer): WeakSpot | null {
    return this.weakSpots(trainer)[0] ?? null;
  }

  // Every scenario with at least one miss inside the window, with its
  // in-window attempt/miss totals. Unsorted; the callers above rank it.
  private windowed(trainer: TalliedTrainer): WeakSpot[] {
    const forTrainer = this._state()[trainer];
    if (!forTrainer) return [];
    const cutoff = this.cutoffDate();
    const spots: WeakSpot[] = [];
    for (const tally of Object.values(forTrainer)) {
      let attempts = 0;
      let misses = 0;
      for (const d of tally.days) {
        if (d.date >= cutoff) {
          attempts += d.attempts;
          misses += d.misses;
        }
      }
      if (misses === 0) continue;
      spots.push({
        ref: tally.ref,
        label: scenarioLabel(tally.ref),
        misses,
        attempts,
        streak: tally.streak,
      });
    }
    return spots;
  }

  private cutoffDate(): string {
    const d = new Date(this.now());
    d.setDate(d.getDate() - (WINDOW_DAYS - 1));
    return localDateKey(d);
  }

  private pruneDays(days: readonly DayTally[]): readonly DayTally[] {
    const cutoff = this.cutoffDate();
    // 'YYYY-MM-DD' compares chronologically as a string.
    return days.filter((d) => d.date >= cutoff);
  }

  // Re-prune every scenario's window and drop scenarios whose window emptied
  // out, so the stored map cannot grow without bound.
  private pruneScenarios(forTrainer: Record<string, ScenarioTally>): Record<string, ScenarioTally> {
    const out: Record<string, ScenarioTally> = {};
    for (const [key, tally] of Object.entries(forTrainer)) {
      const days = this.pruneDays(tally.days);
      if (days.length > 0) out[key] = { ref: tally.ref, days, streak: tally.streak };
    }
    return out;
  }

  private load(): TallyState {
    return readJson(MISS_TALLY_KEY, {} as TallyState, (raw) => {
      const parsed = raw as TallyState;
      if (typeof parsed !== 'object' || parsed === null) return {};
      const out: TallyState = {};
      for (const trainer of ['basic-strategy', 'deviations'] as const) {
        const forTrainer = parsed[trainer];
        if (typeof forTrainer !== 'object' || forTrainer === null) continue;
        const valid: Record<string, ScenarioTally> = {};
        for (const [key, tally] of Object.entries(forTrainer)) {
          if (isScenarioTally(tally)) {
            valid[key] = {
              ref: tally.ref,
              days: this.pruneDays(tally.days),
              // Payloads written before clear-streak tracking have no streak; a
              // fresh 0 just means those scenarios must earn it again.
              streak: typeof tally.streak === 'number' && tally.streak >= 0 ? tally.streak : 0,
            };
          }
        }
        out[trainer] = this.pruneScenarios(valid);
      }
      return out;
    });
  }

  // Forgets every scenario tally, so adaptive practice starts from scratch.
  reset(): void {
    this._state.set({});
    this.persist({});
  }

  private persist(state: TallyState): void {
    writeJson(MISS_TALLY_KEY, state);
  }
}

function isScenarioTally(v: unknown): v is ScenarioTally {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as ScenarioTally;
  return (
    typeof t.ref === 'object' &&
    t.ref !== null &&
    ['hard', 'soft', 'pair'].includes(t.ref.kind) &&
    typeof t.ref.hand === 'string' &&
    typeof t.ref.dealer === 'string' &&
    Array.isArray(t.days) &&
    t.days.every(
      (d) =>
        typeof d === 'object' &&
        d !== null &&
        typeof d.date === 'string' &&
        typeof d.attempts === 'number' &&
        typeof d.misses === 'number',
    )
  );
}
