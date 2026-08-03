import type { Card } from './card.model';

// The oldest drill in card counting: shuffle a deck, burn one card face down,
// count down the other 51 as fast as you can, and name the count. Because a
// full deck sums to a known constant (0 for a balanced system, +4 for KO), the
// count of the 51 is exactly that constant minus the burned card's tag — so the
// drill grades itself, and the burned card revealed at the end is the proof.
//
// It is the one counting exercise the app's timed stream cannot cover: there
// the app sets the pace, and the whole point here is to measure yours.
export const DECK_SPEED_CARDS = 51;

// The benchmark quoted for a competent counter — a full deck counted down in
// under this, accurately. Under 30s is the widely cited threshold (Blackjack
// Apprenticeship's deck-speed drill); it is a milestone shown after a correct
// round, not a pass/fail.
export const DECK_SPEED_BENCHMARK_MS = 30_000;

export interface DeckSpeedDrillResult {
  readonly mode: 'deck-speed';
  // The 51 cards counted (the breakdown reads these).
  readonly cards: readonly Card[];
  // The card held back, revealed as the answer's proof.
  readonly burnedCard: Card;
  readonly correctRunningCount: number;
  readonly userRunningCount: number;
  // What a full deck of this system sums to (0 balanced, +4 for KO), so the
  // feedback can show the arithmetic rather than assert it.
  readonly fullDeckCount: number;
  readonly isCorrect: boolean;
  readonly elapsedMs: number;
  // Best correct time before this round, or null when there was none. A round
  // sets a new best only when the count was right — speed without accuracy is
  // not a counting skill.
  readonly previousBestMs: number | null;
  readonly isPersonalBest: boolean;
}

// Elapsed time as seconds with one decimal ("24.5s"). Minutes are not worth a
// format: a deck that takes over a minute reads fine as "72.4s".
export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
