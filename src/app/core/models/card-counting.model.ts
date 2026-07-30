import type { Card } from './card.model';

// 'key-count' is the unbalanced-system counterpart of the live-shoe true-count
// drill: the shoe's running count starts at the system's published IRC and the
// player calls whether it has reached the key count (the advantage threshold)
// instead of converting to a true count. Only offered for systems that carry a
// KeyCountSchedule (KO).
export type DrillMode = 'running-count' | 'true-count' | 'key-count';

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

export interface KeyCountDrillResult {
  readonly mode: 'key-count';
  readonly cards: readonly Card[];
  readonly correctRunningCount: number;
  readonly userRunningCount: number;
  readonly countCorrect: boolean;
  // Running count carried into this round from earlier rounds of the same shoe
  // (the IRC itself on a fresh shoe). The feedback breakdown starts from this
  // offset, exactly like the live-shoe true count's priorRunningCount.
  readonly priorRunningCount: number;
  // The schedule values the round was judged against, resolved for the shoe's
  // deck count so the feedback can cite them without re-deriving.
  readonly irc: number;
  readonly keyCount: number;
  readonly pivot: number;
  readonly insuranceCount: number;
  // The advantage call: the player has the edge at or above the key count.
  readonly hasAdvantage: boolean;
  readonly userSaidAdvantage: boolean;
  readonly advantageCorrect: boolean;
  // The rep is correct only when both the count and the advantage call are.
  readonly isCorrect: boolean;
}

export type CountingDrillResult =
  | RunningCountDrillResult
  | TrueCountDrillResult
  | KeyCountDrillResult;

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
