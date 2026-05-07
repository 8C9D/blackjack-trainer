import type { Card } from './card.model';

export type DrillMode = 'running-count' | 'true-count';

export interface CountingDrillSettings {
  readonly mode: DrillMode;
  readonly numberOfCards: number;
  readonly millisecondsBetweenCards: number;
  readonly decksRemaining: number;
}

export interface RunningCountDrillResult {
  readonly mode: 'running-count';
  readonly cards: readonly Card[];
  readonly correctRunningCount: number;
  readonly userRunningCount: number;
  readonly isCorrect: boolean;
}

export interface TrueCountDrillResult {
  readonly mode: 'true-count';
  readonly cards: readonly Card[];
  readonly correctRunningCount: number;
  readonly decksRemaining: number;
  readonly correctTrueCount: number;
  readonly userTrueCount: number;
  readonly isCorrect: boolean;
}

export type CountingDrillResult = RunningCountDrillResult | TrueCountDrillResult;

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

// Deck-remaining presets the UI will offer. Half-deck granularity below 3
// decks (where small changes swing the true count the most) and whole decks
// from there to 6.
export const DECKS_REMAINING_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6] as const;
