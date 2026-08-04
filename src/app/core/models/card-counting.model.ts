import type { BetRamp } from './bet-ramp.model';
import type { Card } from './card.model';
import type { DeckSpeedDrillResult } from './deck-speed.model';

// 'key-count' is the unbalanced-system counterpart of the live-shoe true-count
// drill: the shoe's running count starts at the system's published IRC and the
// player calls whether it has reached the key count (the advantage threshold)
// instead of converting to a true count. Only offered for systems that carry a
// KeyCountSchedule (KO).
// 'bet-spread' is the true-count drill plus the question the count is for: how
// many units to bet. Balanced systems only, since it grades a true count first.
// 'deck-speed' is the self-paced one: a shuffled deck with one card burned,
// counted down against a stopwatch (see deck-speed.model.ts).
export type DrillMode = 'running-count' | 'true-count' | 'key-count' | 'bet-spread' | 'deck-speed';

// In true-count mode the decks-remaining figure can come from a live, depleting
// shoe the player reads ('live-shoe', the default) or from a fixed preset the
// player picks before each drill ('classic', the original behavior).
export type TrueCountSource = 'live-shoe' | 'classic';

// The shoe-driven modes: key count always reads a live shoe; the two true-count
// modes (true count and bet spread, which asks for one) only with the live-shoe
// source. The one predicate behind the settings fields, the prefs clamp, and
// the engine's shoe checks.
export function usesLiveShoe(mode: DrillMode, trueCountSource: TrueCountSource): boolean {
  return mode === 'key-count' || (asksTrueCount(mode) && trueCountSource === 'live-shoe');
}

// Modes whose answer is a true count: the true-count drill and the bet-spread
// drill built on top of it. They share the decks-remaining configuration, the
// deck estimate, and the true-count stat store.
export function asksTrueCount(mode: DrillMode): boolean {
  return mode === 'true-count' || mode === 'bet-spread';
}

// The modes in the order Settings offers them, with the label every surface
// uses — the radios, and the drill's idle screen, which names the mode it is
// about to run now that they differ this much.
export const DRILL_MODES: readonly DrillMode[] = [
  'running-count',
  'true-count',
  'key-count',
  'bet-spread',
  'deck-speed',
];

export const DRILL_MODE_LABELS: Readonly<Record<DrillMode, string>> = {
  'running-count': 'Running count',
  'true-count': 'True count',
  'key-count': 'Key count',
  'bet-spread': 'Bet spread',
  'deck-speed': 'Deck speed',
};

// Signed count rendering ("+2", "-4", "0") — the web mirror of the Swift
// CountFormat.signedCount, shared by the feedback panel and the reshuffle
// notice.
export function formatSignedCount(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

// What the player's own decks estimate would have made of the count.
//
// A live-shoe round grades the true count against the shoe's actual decks
// remaining and scores the estimate separately as inside the ±0.5 band or not.
// Neither figure answers the question the estimate exists for: at a table the
// only divisor a counter has is the one they estimated, so an estimate that is
// off is a true count that is off — by an amount that depends entirely on the
// running count it divides. Being five decks out is nothing at a running count
// of -2 and is the whole bet at +12.
export interface DeckEstimateEffect {
  readonly estimate: number;
  // Running count ÷ the estimate, truncated toward zero exactly as the drill
  // truncates the real one.
  readonly impliedTrueCount: number;
  // The estimate lands on the actual true count anyway.
  readonly matchesActual: boolean;
  // The player's answer is exactly what their estimate implies. Evidence, not
  // proof: the drill only ever sees a true count, so it cannot tell a good
  // running count divided by a bad estimate from two errors that cancel — which
  // is why the panel says the two agree and stops there.
  readonly matchesAnswer: boolean;
}

// Null off a classic (preset-decks) round, which asks for no estimate, and off
// a stored estimate that cannot be divided by.
export function deckEstimateEffect(
  runningCount: number,
  estimate: number | undefined,
  correctTrueCount: number,
  userTrueCount: number,
): DeckEstimateEffect | null {
  if (estimate === undefined || !Number.isFinite(estimate) || estimate <= 0) return null;
  const impliedTrueCount = Math.trunc(runningCount / estimate);
  return {
    estimate,
    impliedTrueCount,
    matchesActual: impliedTrueCount === correctTrueCount,
    matchesAnswer: impliedTrueCount === userTrueCount,
  };
}

export interface CountingDrillSettings {
  readonly mode: DrillMode;
  readonly numberOfCards: number;
  readonly millisecondsBetweenCards: number;
  // Units per true-count band, graded against in bet-spread mode.
  readonly betRamp: BetRamp;
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

// The bet-spread round: a true-count round (same count, decks, and estimate
// fields) plus the bet it was for. The units are graded against the ramp at the
// *correct* true count, not at the count the player claimed — a miscount that
// leads to the wrong bet is exactly the failure the drill is there to catch,
// and it mirrors how the key-count drill grades its advantage call.
export interface BetSpreadDrillResult {
  readonly mode: 'bet-spread';
  readonly cards: readonly Card[];
  readonly correctRunningCount: number;
  readonly decksRemaining: number;
  readonly correctTrueCount: number;
  readonly userTrueCount: number;
  readonly countCorrect: boolean;
  readonly priorRunningCount?: number;
  readonly deckEstimate?: number;
  readonly deckEstimateWithinBand?: boolean;
  // The ramp the round was graded against, kept on the result so the feedback
  // can show the whole spread without re-reading prefs.
  readonly ramp: BetRamp;
  readonly correctUnits: number;
  readonly userUnits: number;
  readonly betCorrect: boolean;
  // The rep is correct only when both the true count and the bet are.
  readonly isCorrect: boolean;
}

export type CountingDrillResult =
  | RunningCountDrillResult
  | TrueCountDrillResult
  | KeyCountDrillResult
  | BetSpreadDrillResult
  | DeckSpeedDrillResult;

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
