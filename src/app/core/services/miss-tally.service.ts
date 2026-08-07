import { Injectable, signal, type Signal } from '@angular/core';

import { formatSignedCount } from '../models/card-counting.model';
import { cardHighValue, softNonAceValue, type Card } from '../models/card.model';
import { handTotal, isSoftHand as isSoftNCardHand } from '../models/hand.model';
import type { DealerUpcard } from '../models/strategy.model';
import { classifyAsPair, isSoftHand, normalizeUpcardKey } from './basic-strategy-engine.service';
import { isLocalDateKey, localDateKey } from './practice-history.service';
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
  // True counts this scenario was recently missed at, most recent first. Only
  // the Deviations trainer records them: there the count is half the question,
  // and a re-deal that draws a fresh one asks something else.
  readonly missedCounts: readonly number[];
}

// How many missed true counts a scenario remembers. A hand can be missed on
// both sides of its index — 16 vs 10 stood at −1, hit at +2 — so one is too
// few; five is enough to cover a hand's real failure modes without letting a
// bad week write an unbounded list into storage.
export const MISSED_COUNT_MEMORY = 5;

// Widest true count worth storing. The trainer's own manual range is ±20; a
// stored value outside this is corrupt rather than practice.
const MAX_STORED_TRUE_COUNT = 30;

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
  // The true counts the scenario was missed at, most recent first.
  readonly missedCounts: readonly number[];
}

type TallyState = Partial<Record<TalliedTrainer, Record<string, ScenarioTally>>>;

export function scenarioRefFor(player: readonly Card[], dealerUpcard: Card): ScenarioRef {
  const dealer = normalizeUpcardKey(dealerUpcard);
  // Past two cards there is no pair to name and the ace may have softened, so
  // the ref is the N-card total — the row the chart reads the hand at. The one
  // dealt opening this covers is the pinned hard 20, whose only two-card form
  // is the 10,10 pair (F4).
  if (player.length !== 2) {
    return {
      kind: isSoftNCardHand(player) ? 'soft' : 'hard',
      hand: String(handTotal(player)),
      dealer,
    };
  }
  const opening: readonly [Card, Card] = [player[0], player[1]];
  const pairKey = classifyAsPair(opening);
  if (pairKey !== null) return { kind: 'pair', hand: pairKey, dealer };
  if (isSoftHand(opening)) {
    return { kind: 'soft', hand: String(11 + softNonAceValue(opening)), dealer };
  }
  return {
    kind: 'hard',
    hand: String(cardHighValue(opening[0]) + cardHighValue(opening[1])),
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

// The true counts a scenario was recently missed at, deduplicated and read low
// to high: "TC -1, +2" says the trainee got the hand wrong on both sides of its
// index, which is a different lesson from missing it twice on the same side.
// Empty for Basic Strategy, where the count is not part of the question.
export function missedCountsLabel(spot: WeakSpot): string | null {
  const distinct = [...new Set(spot.missedCounts)].sort((a, b) => a - b);
  if (distinct.length === 0) return null;
  return `TC ${distinct.map(formatSignedCount).join(', ')}`;
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

  // `trueCount` is the count the question was asked at, and is only meaningful
  // where the count is part of the question — the Deviations trainer, and the
  // showdown's index plays. A miss remembers it so the scenario can come back
  // as the question that was actually missed rather than the hand alone.
  record(trainer: TalliedTrainer, ref: ScenarioRef, correct: boolean, trueCount?: number): void {
    const today = localDateKey(this.now());
    const key = scenarioKey(ref);
    const state = this._state();
    const forTrainer = { ...(state[trainer] ?? {}) };
    const existing = forTrainer[key] ?? { ref, days: [], streak: 0, missedCounts: [] };
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
      missedCounts: rememberMissedCount(existing.missedCounts, correct, trueCount),
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
        missedCounts: tally.missedCounts,
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
      if (days.length > 0) {
        out[key] = {
          ref: tally.ref,
          days,
          streak: tally.streak,
          missedCounts: tally.missedCounts,
        };
      }
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
          const sanitized = sanitizeScenarioTally(tally);
          // The map key is derived from the ref. Requiring them to agree keeps
          // one hand from masquerading under another hand's stable identity.
          if (sanitized && key === scenarioKey(sanitized.ref)) valid[key] = sanitized;
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

function sanitizeScenarioTally(v: unknown): ScenarioTally | null {
  if (typeof v !== 'object' || v === null) return null;
  const t = v as Partial<ScenarioTally>;
  if (!isScenarioRef(t.ref) || !Array.isArray(t.days)) return null;
  const byDate = new Map<string, DayTally>();
  for (const candidate of t.days) {
    if (!isDayTally(candidate)) continue;
    const previous = byDate.get(candidate.date);
    const attempts = Math.min(
      Number.MAX_SAFE_INTEGER,
      (previous?.attempts ?? 0) + candidate.attempts,
    );
    const misses = Math.min(attempts, (previous?.misses ?? 0) + candidate.misses);
    byDate.set(candidate.date, { date: candidate.date, attempts, misses });
  }
  return {
    ref: t.ref,
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    // Payloads written before clear-streak tracking have no streak; a fresh 0
    // just means those scenarios must earn it again.
    streak: Number.isSafeInteger(t.streak) && (t.streak ?? -1) >= 0 ? t.streak! : 0,
    // Likewise for the missed counts: a scenario stored before they were kept
    // (or by the Basic Strategy trainer, which has no count) simply has none,
    // and comes back at a fresh count exactly as it used to.
    missedCounts: sanitizeMissedCounts(t.missedCounts),
  };
}

// Newest first, capped, and only for a miss — a correct answer leaves the list
// alone, since it is the record of what went wrong.
function rememberMissedCount(
  existing: readonly number[],
  correct: boolean,
  trueCount: number | undefined,
): readonly number[] {
  if (correct || trueCount === undefined || !Number.isInteger(trueCount)) return existing;
  if (Math.abs(trueCount) > MAX_STORED_TRUE_COUNT) return existing;
  return [trueCount, ...existing.filter((c) => c !== trueCount)].slice(0, MISSED_COUNT_MEMORY);
}

function sanitizeMissedCounts(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return [];
  const seen: number[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'number' || !Number.isInteger(candidate)) continue;
    if (Math.abs(candidate) > MAX_STORED_TRUE_COUNT) continue;
    if (!seen.includes(candidate)) seen.push(candidate);
  }
  return seen.slice(0, MISSED_COUNT_MEMORY);
}

function isScenarioRef(value: unknown): value is ScenarioRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as ScenarioRef;
  if (!['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'].includes(ref.dealer)) return false;
  if (ref.kind === 'pair') {
    return ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'].includes(ref.hand);
  }
  const hand = Number(ref.hand);
  if (!Number.isInteger(hand)) return false;
  if (ref.kind === 'hard') return hand >= 4 && hand <= 20;
  return ref.kind === 'soft' && hand >= 13 && hand <= 21;
}

function isDayTally(value: unknown): value is DayTally {
  if (typeof value !== 'object' || value === null) return false;
  const day = value as DayTally;
  return (
    isLocalDateKey(day.date) &&
    Number.isSafeInteger(day.attempts) &&
    day.attempts > 0 &&
    Number.isSafeInteger(day.misses) &&
    day.misses >= 0 &&
    day.misses <= day.attempts
  );
}
