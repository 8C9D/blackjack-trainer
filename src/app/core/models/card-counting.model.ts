import type { Card } from './card.model';

export interface CountingDrillSettings {
  readonly numberOfCards: number;
  readonly millisecondsBetweenCards: number;
}

export interface CountingDrillResult {
  readonly cards: readonly Card[];
  readonly correctRunningCount: number;
  readonly userRunningCount: number;
  readonly isCorrect: boolean;
}

export interface SettingsValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

// Floor for inter-card timing. Anything faster than this isn't useful as
// practice and risks dropped frames on slower devices.
export const MIN_MILLISECONDS_BETWEEN_CARDS = 100;

// Upper bound on drill length. Picked to keep a single drill comfortably
// under a few minutes even at moderate pacing, and to prevent a typo from
// kicking off a 10000-card session.
export const MAX_CARDS_PER_DRILL = 200;
