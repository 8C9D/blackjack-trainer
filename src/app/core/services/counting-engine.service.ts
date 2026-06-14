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
import {
  CARDS_PER_DECK,
  MAX_PENETRATION,
  MIN_PENETRATION,
  SHOE_DECK_OPTIONS,
} from '../models/shoe.model';

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
  // priorRunningCount carries the running count from earlier rounds of the same
  // shoe (live-shoe mode); it defaults to 0, preserving classic single-round
  // behavior, and is folded into correctRunningCount so the true count reflects
  // every card seen since the last shuffle.
  evaluateTrueCount(
    cards: readonly Card[],
    userTrueCount: number,
    decksRemaining: number,
    system: CountingSystem,
    priorRunningCount = 0,
  ): TrueCountDrillResult {
    const correctRunningCount = priorRunningCount + this.runningCount(cards, system);
    const correctTrueCount = this.trueCount(correctRunningCount, decksRemaining);
    return {
      mode: 'true-count',
      cards,
      correctRunningCount,
      decksRemaining,
      correctTrueCount,
      userTrueCount,
      isCorrect: userTrueCount === correctTrueCount,
      priorRunningCount,
    };
  }

  // Whether a decks-remaining estimate falls within the "good" tolerance band of
  // the actual decks remaining. The default band is ±0.5 deck; a small epsilon
  // absorbs floating-point error from decksRemaining = cardsRemaining / 52.
  scoreDeckEstimate(estimate: number, actual: number, tolerance = 0.5): boolean {
    return Math.abs(estimate - actual) <= tolerance + 1e-9;
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

    // The decks-remaining configuration is only relevant when the user is being
    // asked for a true count. In running-count mode it has no bearing on the
    // drill, so it is not validated.
    if (settings.mode === 'true-count') {
      if (settings.trueCountSource === 'classic') {
        // Classic mode: the user picks a fixed decks-remaining value.
        if (!Number.isFinite(settings.decksRemaining)) {
          errors.push('Decks remaining must be a number.');
        } else if (settings.decksRemaining <= 0) {
          errors.push('Decks remaining must be greater than 0.');
        }
      } else {
        // Live-shoe mode: validate the shoe configuration instead.
        const deckOptions = SHOE_DECK_OPTIONS as readonly number[];
        if (!deckOptions.includes(settings.numberOfDecks)) {
          errors.push('Number of decks must be 1, 2, 6, or 8.');
        }
        if (
          !Number.isFinite(settings.penetration) ||
          settings.penetration < MIN_PENETRATION ||
          settings.penetration > MAX_PENETRATION
        ) {
          errors.push(
            `Penetration must be between ${Math.round(MIN_PENETRATION * 100)}% and ${Math.round(
              MAX_PENETRATION * 100,
            )}%.`,
          );
        } else if (
          Number.isInteger(settings.numberOfCards) &&
          settings.numberOfCards >= 1 &&
          deckOptions.includes(settings.numberOfDecks) &&
          settings.numberOfCards > settings.numberOfDecks * CARDS_PER_DECK
        ) {
          errors.push('Number of cards must not exceed the shoe size (52 × decks).');
        }
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
