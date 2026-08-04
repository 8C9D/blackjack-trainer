import { Injectable, signal, type Signal } from '@angular/core';

import { readJson, writeJson } from './storage';

export const COUNT_DRIFT_KEY = 'blackjack-count-drift';

// How many answered counts the store remembers, newest first. Enough rounds for
// a lean to be a lean rather than a run of luck, few enough that a week of
// practice can still change what it says.
export const COUNT_DRIFT_MEMORY = 20;

// Anything past this is a typo or a corrupt payload, not a count a trainee held.
const MAX_DRIFT = 200;

// Which side the answers land on, over the rounds remembered.
export interface DriftShape {
  readonly rounds: number;
  readonly low: number;
  readonly high: number;
  readonly exact: number;
}

export function coerceDrifts(raw: unknown): readonly number[] {
  const stored = (raw as { drifts?: unknown } | null)?.drifts;
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_DRIFT,
    )
    .slice(0, COUNT_DRIFT_MEMORY);
}

// Every graded running count, kept as the signed distance from the real one
// (0 for an exact answer).
//
// Accuracy alone says a count was wrong; it never says *how*, and the two ways
// to be wrong want different practice. A count that lands under nearly every
// time is dropping the same thing each shoe — a rank, or the second card of a
// pair flashed together. One that scatters is being lost and restarted. The app
// has had this figure on every miss it ever graded and thrown it away.
//
// Its own key rather than a field on the running-count stats store: that store
// is a flat record of numbers, coerced as one, and a list does not belong in it.
@Injectable({ providedIn: 'root' })
export class CountDriftService {
  private readonly _drifts = signal<readonly number[]>(readJson(COUNT_DRIFT_KEY, [], coerceDrifts));
  readonly drifts: Signal<readonly number[]> = this._drifts.asReadonly();

  // `answer - actual`, so a count held too high is positive. Rounds where the
  // count was not asked for do not reach this.
  record(answer: number, actual: number): void {
    const drift = answer - actual;
    if (!Number.isFinite(drift) || Math.abs(drift) > MAX_DRIFT) return;
    const next = [drift, ...this._drifts()].slice(0, COUNT_DRIFT_MEMORY);
    this._drifts.set(next);
    writeJson(COUNT_DRIFT_KEY, { drifts: next });
  }

  // Null until there are enough rounds for a shape to mean anything: three
  // counts leaning one way is not a lean.
  shape(minimumRounds = 5): DriftShape | null {
    const drifts = this._drifts();
    if (drifts.length < minimumRounds) return null;
    return {
      rounds: drifts.length,
      low: drifts.filter((d) => d < 0).length,
      high: drifts.filter((d) => d > 0).length,
      exact: drifts.filter((d) => d === 0).length,
    };
  }

  reset(): void {
    this._drifts.set([]);
    writeJson(COUNT_DRIFT_KEY, { drifts: [] });
  }
}
