import { Injectable } from '@angular/core';

import type { Card } from '../models/card.model';
import {
  MAX_CARDS_PER_DRILL,
  MIN_MILLISECONDS_BETWEEN_CARDS,
  type CountingDrillSettings,
  type RunningCountDrillResult,
  type SettingsValidation,
  type TrueCountDrillResult,
} from '../models/card-counting.model';
import type { CountingSystem } from '../models/counting-system.model';

@Injectable({ providedIn: 'root' })
export class CountingEngineService {
  // Sum of per-card values for the given system. Empty sequence → 0.
  runningCount(cards: readonly Card[], system: CountingSystem): number {
    let total = 0;
    for (const card of cards) {
      total += system.values[card.rank];
    }
    return total;
  }

  // True count = running count / decks remaining, truncated toward zero.
  // Truncation (not floor) is the standard convention: a running count of
  // -5 over 2 decks should round to -2, not -3.
  trueCount(runningCount: number, decksRemaining: number): number {
    return Math.trunc(runningCount / decksRemaining);
  }

  // Compare the user's claimed running count to the true count for the
  // sequence. The result also includes the cards so the UI can show a
  // breakdown without recomputing.
  evaluate(
    cards: readonly Card[],
    userRunningCount: number,
    system: CountingSystem,
  ): RunningCountDrillResult {
    const correctRunningCount = this.runningCount(cards, system);
    return {
      mode: 'running-count',
      cards,
      correctRunningCount,
      userRunningCount,
      isCorrect: userRunningCount === correctRunningCount,
    };
  }

  // Compare the user's claimed true count against the truncated true count
  // derived from the sequence's running count and the given decks remaining.
  evaluateTrueCount(
    cards: readonly Card[],
    userTrueCount: number,
    decksRemaining: number,
    system: CountingSystem,
  ): TrueCountDrillResult {
    const correctRunningCount = this.runningCount(cards, system);
    const correctTrueCount = this.trueCount(correctRunningCount, decksRemaining);
    return {
      mode: 'true-count',
      cards,
      correctRunningCount,
      decksRemaining,
      correctTrueCount,
      userTrueCount,
      isCorrect: userTrueCount === correctTrueCount,
    };
  }

  // Validates a drill settings object. Returns all errors at once so the UI
  // can render them inline rather than one-at-a-time.
  validateSettings(settings: CountingDrillSettings): SettingsValidation {
    const errors: string[] = [];

    if (!Number.isFinite(settings.numberOfCards) || !Number.isInteger(settings.numberOfCards)) {
      errors.push('Number of cards must be a whole number.');
    } else if (settings.numberOfCards < 1) {
      errors.push('Number of cards must be at least 1.');
    } else if (settings.numberOfCards > MAX_CARDS_PER_DRILL) {
      errors.push(`Number of cards must be at most ${MAX_CARDS_PER_DRILL}.`);
    }

    if (!Number.isFinite(settings.millisecondsBetweenCards)) {
      errors.push('Time between cards must be a number.');
    } else if (settings.millisecondsBetweenCards < MIN_MILLISECONDS_BETWEEN_CARDS) {
      errors.push(`Time between cards must be at least ${MIN_MILLISECONDS_BETWEEN_CARDS}ms.`);
    }

    // Decks remaining is only required when the user is being asked for a
    // true count. In running-count mode it has no bearing on the drill.
    if (settings.mode === 'true-count') {
      if (!Number.isFinite(settings.decksRemaining)) {
        errors.push('Decks remaining must be a number.');
      } else if (settings.decksRemaining <= 0) {
        errors.push('Decks remaining must be greater than 0.');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Whether a string is a valid integer answer for the running count. Used by
  // the answer form to enable submission. Accepts optional leading sign and
  // rejects decimals / non-numeric input.
  isValidIntegerAnswer(raw: string): boolean {
    if (!/^-?\d+$/.test(raw.trim())) return false;
    const n = Number(raw);
    return Number.isFinite(n) && Number.isInteger(n);
  }

  // Whether a string is a valid fractional answer for the running count. Used by
  // the answer form for fractional systems (e.g. Wong Halves, whose running
  // count lands on halves like 2.5 or -0.5). Accepts an optional leading sign,
  // an integer part, and an optional decimal part; whole numbers are accepted
  // too. Rejects empty, non-numeric, and malformed input.
  isValidDecimalAnswer(raw: string): boolean {
    if (!/^-?\d+(\.\d+)?$/.test(raw.trim())) return false;
    return Number.isFinite(Number(raw));
  }

  // Whether a system assigns any fractional per-rank value (e.g. Wong Halves).
  // Such systems produce fractional running counts, so the running-count answer
  // form must accept decimal input. Integer-valued systems (Hi-Lo, KO, Omega II)
  // return false and stay integer-only.
  isFractionalSystem(system: CountingSystem): boolean {
    return Object.values(system.values).some((v) => !Number.isInteger(v));
  }
}
