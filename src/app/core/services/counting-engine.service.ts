import { Injectable } from '@angular/core';

import type { Card } from '../models/card.model';
import {
  MIN_MILLISECONDS_BETWEEN_CARDS,
  type CountingDrillResult,
  type CountingDrillSettings,
  type SettingsValidation,
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

  // Compare the user's claimed running count to the true count for the
  // sequence. The result also includes the cards so the UI can show a
  // breakdown without recomputing.
  evaluate(
    cards: readonly Card[],
    userRunningCount: number,
    system: CountingSystem,
  ): CountingDrillResult {
    const correctRunningCount = this.runningCount(cards, system);
    return {
      cards,
      correctRunningCount,
      userRunningCount,
      isCorrect: userRunningCount === correctRunningCount,
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
    }

    if (!Number.isFinite(settings.millisecondsBetweenCards)) {
      errors.push('Time between cards must be a number.');
    } else if (settings.millisecondsBetweenCards < MIN_MILLISECONDS_BETWEEN_CARDS) {
      errors.push(`Time between cards must be at least ${MIN_MILLISECONDS_BETWEEN_CARDS}ms.`);
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
}
