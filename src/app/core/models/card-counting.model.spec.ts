import { deckEstimateEffect } from './card-counting.model';

describe('deckEstimateEffect', () => {
  it('divides the running count by the estimate the player actually had', () => {
    // +6 over a shoe really holding 2 decks is +3; read as 1 deck it is +6.
    const effect = deckEstimateEffect(6, 1, 3, 6);
    expect(effect?.impliedTrueCount).toBe(6);
    expect(effect?.estimate).toBe(1);
  });

  it('truncates toward zero, exactly as the drill grades the real one', () => {
    expect(deckEstimateEffect(6, 2.5, 2, 2)?.impliedTrueCount).toBe(2);
    expect(deckEstimateEffect(-6, 2.5, -2, -2)?.impliedTrueCount).toBe(-2);
  });

  it('marks an estimate that lands on the actual true count anyway', () => {
    // Five decks out, and at a running count of -2 it changes nothing.
    expect(deckEstimateEffect(-2, 1, 0, 0)?.matchesActual).toBe(false);
    expect(deckEstimateEffect(-2, 3, 0, 0)?.matchesActual).toBe(true);
  });

  it('marks when the answer given is what the estimate implies', () => {
    expect(deckEstimateEffect(6, 3, 3, 2)?.matchesAnswer).toBe(true);
    expect(deckEstimateEffect(6, 3, 3, 3)?.matchesAnswer).toBe(false);
  });

  it('is null off a round that asked for no estimate', () => {
    expect(deckEstimateEffect(6, undefined, 3, 3)).toBeNull();
  });

  it('is null rather than infinite on an estimate it cannot divide by', () => {
    expect(deckEstimateEffect(6, 0, 3, 3)).toBeNull();
    expect(deckEstimateEffect(6, -1, 3, 3)).toBeNull();
    expect(deckEstimateEffect(6, Number.NaN, 3, 3)).toBeNull();
  });
});
