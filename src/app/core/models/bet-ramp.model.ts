// The player's bet spread: how many units to put out at each true count.
//
// This is deliberately NOT a computed optimum. What to bet at a given count
// follows from bankroll, risk of ruin, the rules of the game, and how much
// spread the table will tolerate — none of which this app knows. So the drill
// grades the bet against the ramp the player configured, the way a counter
// rehearses the ramp they intend to play. The default is the textbook 1-2-4-8-12
// spread quoted for a six-deck shoe.
//
// Five bands, because the ramp flattens once the count is high: everything at
// or below +1 is the table minimum (no advantage yet), then one band per true
// count to +4, then a top band for +5 and up.
export type BetRamp = readonly number[];

export const BET_RAMP_BAND_LABELS: readonly string[] = [
  'TC ≤ +1',
  'TC +2',
  'TC +3',
  'TC +4',
  'TC +5 or more',
];

export const BET_RAMP_BANDS = BET_RAMP_BAND_LABELS.length;

export const DEFAULT_BET_RAMP: BetRamp = [1, 2, 4, 8, 12];

export const MIN_BET_UNITS = 1;
export const MAX_BET_UNITS = 100;

// Which band a true count falls in. True counts arrive already truncated toward
// zero, but trunc here too so a fractional caller can't land between bands.
export function betRampBandIndex(trueCount: number): number {
  if (!Number.isFinite(trueCount)) return 0;
  return Math.min(BET_RAMP_BANDS - 1, Math.max(0, Math.trunc(trueCount) - 1));
}

// The units the ramp calls for at this true count.
export function betUnitsForTrueCount(trueCount: number, ramp: BetRamp): number {
  return ramp[betRampBandIndex(trueCount)];
}

// Bounds errors only — a ramp is a judgment call, and the only thing that makes
// one unusable is a unit count that is not a whole number in range. Betting
// *less* at a higher count is almost certainly a mistake but it is the player's
// to make, so it is surfaced as a note by the Settings UI rather than blocking
// the drill (see rampShrinks).
export function validateBetRamp(ramp: BetRamp): readonly string[] {
  if (ramp.length !== BET_RAMP_BANDS) {
    return [`A bet spread needs one entry per band (${BET_RAMP_BANDS}).`];
  }
  const inRange = ramp.every(
    (units) => Number.isInteger(units) && units >= MIN_BET_UNITS && units <= MAX_BET_UNITS,
  );
  return inRange
    ? []
    : [`Bet spread units must be whole numbers between ${MIN_BET_UNITS} and ${MAX_BET_UNITS}.`];
}

// Whether the ramp bets fewer units at some higher band than at a lower one.
export function rampShrinks(ramp: BetRamp): boolean {
  return ramp.some((units, index) => index > 0 && units < ramp[index - 1]);
}

// Field-by-field coercion of an untrusted stored ramp, matching how the rest of
// the prefs degrade: each band falls back to its default rather than the whole
// ramp being discarded.
export function normalizeBetRamp(value: unknown): BetRamp {
  if (!Array.isArray(value)) return DEFAULT_BET_RAMP;
  return DEFAULT_BET_RAMP.map((fallback, index) => {
    const units: unknown = value[index];
    return typeof units === 'number' &&
      Number.isInteger(units) &&
      units >= MIN_BET_UNITS &&
      units <= MAX_BET_UNITS
      ? units
      : fallback;
  });
}
