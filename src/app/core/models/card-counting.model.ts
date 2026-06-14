import type { Card } from './card.model';

export type DrillMode = 'running-count' | 'true-count';

// In true-count mode the decks-remaining figure can come from a live, depleting
// shoe the player reads ('live-shoe', the default) or from a fixed preset the
// player picks before each drill ('classic', the original behavior).
export type TrueCountSource = 'live-shoe' | 'classic';

export interface CountingDrillSettings {
  readonly mode: DrillMode;
  readonly numberOfCards: number;
  readonly millisecondsBetweenCards: number;
  // Decks remaining for classic (preset) true-count mode.
  readonly decksRemaining: number;
  // True-count-only shoe configuration. trueCountSource selects between the live
  // shoe and the classic preset; numberOfDecks/penetration drive the live shoe.
  readonly trueCountSource: TrueCountSource;
  readonly numberOfDecks: number;
  readonly penetration: number;
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
  // Running count carried into this round from earlier rounds of the same shoe
  // (0 in classic mode). Lets the feedback breakdown start from the right offset
  // and is the prior added to this round's cards to form correctRunningCount.
  readonly priorRunningCount?: number;
  // Live-shoe deck estimation (absent in classic preset mode). deckEstimate is
  // the player's decks-remaining guess; deckEstimateWithinBand is whether it fell
  // within the ±0.5-deck "good" band of the actual decksRemaining.
  readonly deckEstimate?: number;
  readonly deckEstimateWithinBand?: boolean;
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
