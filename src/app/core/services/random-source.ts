import { InjectionToken } from '@angular/core';

// Query param that pins the app's randomness, e.g. `/drill/basic-strategy?seed=7`.
export const SEED_PARAM = 'seed';

// The single source of randomness for everything a user sees dealt: hands,
// card streams, shoe shuffles, true counts, and weak-spot draws. Injected
// rather than calling `Math.random` at each site so one switch — the `?seed=`
// query param — makes a whole session reproducible. That is what lets a
// browser-driven test assert an exact correct/incorrect outcome instead of only
// asserting flow (see docs/e2e-testing-plan.md §7.1).
//
// The hook is deliberately not gated on dev mode: CI runs the E2E suite against
// the production bundle. Being able to replay a seeded practice session is
// harmless here — the app has no wagering, no server, and no score anyone else
// sees — and it is opt-in, so an ordinary visit is unaffected.
export const RANDOM_SOURCE = new InjectionToken<() => number>('RANDOM_SOURCE', {
  providedIn: 'root',
  factory: () => randomSourceForLocation(globalThis.location?.search),
});

// `?seed=<integer>` → a deterministic generator; anything else → Math.random.
export function randomSourceForLocation(search: string | undefined): () => number {
  const raw = new URLSearchParams(search ?? '').get(SEED_PARAM);
  // A bare `?seed=` is an unfinished URL, not a request for seed 0 — which is
  // what `Number('')` would quietly make it.
  if (raw === null || raw.trim() === '') return Math.random;
  const seed = Number(raw);
  if (!Number.isFinite(seed)) return Math.random;
  return mulberry32(Math.trunc(seed));
}

// mulberry32: 32 bits of state, a handful of ops, and good enough distribution
// for dealing cards. Chosen over a longer-period generator because the whole
// point is reproducibility, not statistical quality — and it fits in a few
// lines with no dependency.
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
