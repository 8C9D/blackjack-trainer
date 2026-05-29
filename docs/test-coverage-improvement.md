# Test Coverage Improvement Report

_Last updated by the test-coverage-improver skill on 2026-05-29._

> **History.** An earlier version of this file (commit `3524480`) described a
> Karma/Jasmine setup and `core/*.ts` modules that do not exist in this
> repository; a follow-up (2026-05-28) retracted that fabricated analysis but
> did not read the untested source files and therefore implemented nothing.
> **This version is grounded in the actual file contents** — every gap below
> was confirmed by reading the source and its spec, the test runner was run to
> a green baseline first, and the improvements in §5 were implemented,
> validated, committed, and pushed one at a time.

## 1. Repository Test Overview

- **Project**: `blackjack-trainer` — an Angular 21 (standalone components,
  signal-based inputs/outputs) blackjack training app, frontend-only with
  `localStorage` persistence.
- **Test framework**: **Vitest 4** with `jsdom` (`vitest@^4.0.8`,
  `jsdom@^28.0.0`; `tsconfig.spec.json` sets `"types": ["vitest/globals"]`).
  The test target is the Angular `@angular/build:unit-test` builder
  (`angular.json`).
- **Validation command**: `npm test` → `ng test`. In a non-TTY shell it does a
  single run; `CI=true npm test` forces that explicitly.
- **Baseline**: the earlier green baseline before any skill work was 14 spec
  files / 355 tests; the three prior additions brought it to **17 spec files /
  388 tests**, which is where this pass began. After this pass: **390 tests**.
- **Test layout**: co-located `*.spec.ts` next to the unit under test.

### Verified source-vs-spec inventory

Decision-critical logic that **already has specs**: `basic-strategy-engine`,
`counting-engine`, `deviation-engine`, `deviation-evaluator`, `stats-store`
(including all four `StatsStore` subclasses and their per-key isolation —
already covered in `stats-store.spec.ts`), `keyboard`, the `app` shell,
`scenario-generators`, and most of the card-counting / deviations components.

Source modules **without** a spec (candidate gaps), after reading each one:

| File | Kind | Value | Notes |
|------|------|-------|-------|
| `core/services/card-generator.service.ts` | RNG card/sequence generator | **High** | Pure logic with a `setRandomSource()` seam — fully determinizable. Feeds every drill. **No spec.** |
| `core/models/card.model.ts` | pure card helpers | **High** | `isTenValue` / `isAce` / `cardHighValue` / `softNonAceValue` — used by both engines; `softNonAceValue` was just extracted in a refactor. **No direct spec.** |
| `data/h17-basic-strategy.ts`, `data/s17-basic-strategy.ts` | static charts | Medium | Hand-transcribed from PDFs; structural drift is easy to introduce. **No integrity spec.** |
| `data/counting-systems.ts` | Hi-Lo values + registry | Low | Per-rank values exercised indirectly by the counting-engine spec. |
| `core/services/*-stats.service.ts` (4) | `StatsStore` subclasses | — | **Already covered** by `stats-store.spec.ts` (key isolation + independence). Not a gap. |
| `features/basic-strategy/*.component.ts` (4), `shared/*.component.ts` (4), `card-stream`, `deviation-feedback-panel` | UI components | Medium | TestBed/DOM; higher effort, deferred. |
| `app.config.ts`, `app.routes.ts`, `main.ts` | bootstrap/routing | Low | Deferred. |

## 2. Current Coverage Quality Summary

Coverage of the pure decision logic and persistence layer is strong. The
notable real gaps are **pure, easily-determinized units that simply had no
spec yet**:

1. **`card-generator.service.ts`** — generates the random cards/sequences that
   drive every drill. It exposes `setRandomSource()` specifically so tests can
   inject a deterministic RNG, but no spec used it.
2. **`card.model.ts` helpers** — small pure functions consumed by both
   engines; never unit-tested directly.
3. **Static charts (`data/*-basic-strategy.ts`)** — transcribed from BJA PDFs;
   no structural integrity guard against a missing row/column or an illegal
   cell symbol (the engine specs assert specific values, not whole-chart
   shape).

The four `StatsStore` subclasses, flagged as a gap by the previous (file-blind)
report, are in fact already tested in `stats-store.spec.ts` — that claim was
stale and is retracted here.

## 3. Highest-Value Coverage Gaps

### Gap 1 — `card-generator.service.ts` has no tests — Risk: Low — Status: **Implemented**
- **Location**: `src/app/core/services/card-generator.service.ts`
- **Why it matters**: feeds every drill; index math (`floor(random()*len)`) is
  a classic off-by-one site, and the with-replacement contract is load-bearing.
- **Existing tests**: none.
- **Missing cases**: sequence/scenario shape and length; only legal ranks/suits
  emitted; `random()=0` → first rank/suit and `random()≈1` → last (boundary,
  catches an off-by-one that would make `'A'` unreachable); independent
  rank-then-suit draws; with-replacement duplicates; `generateSequence(0)` /
  negative → empty; determinism under a fixed source.
- **Suggested validation**: `CI=true npm test`.

### Gap 2 — `card.model.ts` pure helpers have no direct tests — Risk: Low — Status: **Implemented**
- **Location**: `src/app/core/models/card.model.ts`
- **Why it matters**: `isTenValue`, `isAce`, `cardHighValue`, `softNonAceValue`
  are shared by both strategy engines; a regression here silently corrupts every
  hand total and lookup.
- **Existing tests**: none directly (only exercised transitively via engines).
- **Missing cases**: ten-value vs non-ten classification across all 13 ranks;
  ace detection; high value (A→11, T/J/Q/K→10, pips→face); suit-independence;
  `softNonAceValue` regardless of ace position, ten-value partner → 10, and the
  out-of-contract A,A input.
- **Suggested validation**: `CI=true npm test`.

### Gap 3 — Basic-strategy chart structural integrity — Risk: Low — Status: **Implemented**
- **Location**: `src/app/data/h17-basic-strategy.ts`, `src/app/data/s17-basic-strategy.ts`
- **Why it matters**: both charts are hand-transcribed from PDFs; a dropped row,
  missing dealer column, or typo'd cell (`'X'`) is easy to introduce and hard to
  eyeball. The engine specs assert specific strategy values but never the whole
  chart shape.
- **Existing tests**: none (structural).
- **Missing cases**: exact hard (5–20), soft (2–9), pair (2–10, A) key sets;
  every row has all 10 dealer upcards (`2`–`10`, `A`); every cell is a legal
  symbol for its table; `ruleSet` field matches. Deliberately does **not**
  assert specific actions (that would duplicate the engine specs and be brittle).
- **Suggested validation**: `CI=true npm test`.

### Gap 4 — Deviation-chart structural integrity (lookup well-formedness) — Risk: Low — Status: **Implemented**
- **Location**: `src/app/data/h17-deviations.ts`, `src/app/data/s17-deviations.ts`
  (guarded from `src/app/core/services/deviation-engine.service.spec.ts`).
- **Why it matters**: like the basic-strategy charts (Gap 3), both deviation
  charts are hand-transcribed from BJA PDFs. They are flat `DeviationRule[]`
  arrays, and `DeviationEngineService.findDeviationRule()` resolves a cell with
  `Array.prototype.find` — it returns the **first** match. A duplicated
  `(category, playerHand, dealerUpcard)` triple (an easy copy/paste slip
  between two near-identical files) would silently shadow the later rule: its
  threshold/action would never apply, and nothing in the type system or the
  existing specs would catch it. Separately, the insurance overlay
  (`resolveInsuranceDecision`) hard-codes a lookup of
  `{ category:'insurance', playerHand:'insurance', dealerUpcard:'A' }`, so the
  `INS` action leaking onto a playing rule — or the insurance rule being keyed
  differently — would be a silent, user-visible bug.
- **Existing tests**: the `describe('deviation data')` block already asserted
  `ruleSet` tagging, the *presence* of an insurance rule (A / +3 / INS), and
  several rule-set-specific present/absent cells — but **not** triple
  uniqueness, and **not** that `INS` is exclusive to the engine's hard-coded
  insurance key.
- **Missing cases (added)**: no duplicate `(category, playerHand, dealerUpcard)`
  lookup keys per rule set; `INS` appears on exactly one rule per chart, keyed
  exactly as `resolveInsuranceDecision` looks it up.
- **Deliberately not asserted**: per-field union membership
  (`category` / `direction` / `dealerUpcard` / `Action`), which TypeScript
  already enforces at the literal, and specific thresholds/actions, which the
  engine specs already cover. The guard is structural only.
- **Suggested validation**: `CI=true npm test`.

### Gap 5 — Untested feature/shared UI components — Risk: Medium — Status: Deferred
- **Location**: `features/basic-strategy/*`, `shared/*`, `card-stream`,
  `deviation-feedback-panel`.
- **Why it matters**: user-visible rendering/interaction.
- Higher effort (TestBed/DOM) and lower marginal value than Gaps 1–4; deferred.

## 4. Test Improvement Plan

1. Establish a green baseline with `CI=true npm test`. ✓ (355 passing)
2. Add `card-generator.service.spec.ts` (Gap 1); validate; commit; push.
3. Add `card.model.spec.ts` (Gap 2); validate; commit; push.
4. Add `basic-strategy-charts.spec.ts` (Gap 3); validate; commit; push.
5. Each improvement is one focused commit; no production code changed.

## 5. Implemented Test Improvements

### Improvement 1 — `card-generator.service.spec.ts`
- **Files changed**: `src/app/core/services/card-generator.service.spec.ts` (new).
- **Behavior covered**: `generateCard`, `generate`, `generateSequence` driven
  through the `setRandomSource()` seam — valid-card invariants, index-math
  boundaries (first/last rank+suit), independent rank/suit draws,
  with-replacement duplicates, empty/negative sequence lengths, and determinism.
- **Validation run**: targeted `--include` (12 passing), then full `CI=true npm test`.
- **Result**: **PASS** — full suite 15 files / 367 tests passing (+12 from this spec).
- **Commit**: see `git log -- src/app/core/services/card-generator.service.spec.ts`.
- **Push result**: pushed to `origin/main`.

### Improvement 2 — `card.model.spec.ts`
- **Files changed**: `src/app/core/models/card.model.spec.ts` (new).
- **Behavior covered**: `isTenValue`, `isAce`, `cardHighValue`,
  `softNonAceValue` across all ranks/suits and edge inputs.
- **Validation run**: targeted `--include` (13 passing), then full `CI=true npm test`.
- **Result**: **PASS** — full suite 16 files / 380 tests passing (+13 from this spec).
- **Commit**: see `git log -- src/app/core/models/card.model.spec.ts`.
- **Push result**: pushed to `origin/main`.

### Improvement 3 — `basic-strategy-charts.spec.ts`
- **Files changed**: `src/app/data/basic-strategy-charts.spec.ts` (new).
- **Behavior covered**: structural integrity of `H17_CHART` and `S17_CHART`
  (key sets, dealer columns, legal cell symbols, `ruleSet`).
- **Validation run**: targeted `--include` (8 passing), then full `CI=true npm test`.
- **Result**: **PASS** — full suite 17 files / 388 tests passing (+8 from this spec).
- **Commit**: see `git log -- src/app/data/basic-strategy-charts.spec.ts`.
- **Push result**: pushed to `origin/main`.

### Improvement 4 — deviation-chart structural integrity (Gap 4)
- **Files changed**: `src/app/core/services/deviation-engine.service.spec.ts`
  (extended the existing `describe('deviation data')` block — kept the
  deviation-data guards co-located rather than fragmenting them into a new
  file).
- **Behavior covered**: the two structural invariants the deviation engine's
  `find`-based lookups depend on but nothing tested — (1) no duplicate
  `(category, playerHand, dealerUpcard)` triple per rule set (a duplicate would
  silently shadow the later rule), and (2) `INS` is used by exactly one rule
  per chart, keyed exactly as `resolveInsuranceDecision` looks it up
  (`insurance` / `insurance` / `A`).
- **New test cases**: 2 (`uses INS only on the single insurance rule…`,
  `has no duplicate (category, playerHand, dealerUpcard) lookup keys`).
- **Validation run**: targeted `--include` deviation-engine spec (76 passing,
  +2), then full `CI=true npm test`.
- **Result**: **PASS** — full suite 17 files / 390 tests passing (+2).
- **Commit**: see `git log -- src/app/core/services/deviation-engine.service.spec.ts`.
- **Push result**: pushed to `origin/main`.

## 6. Skipped Opportunities

- **`StatsStore` subclasses** — not skipped on merit; **already covered** by
  `stats-store.spec.ts`. The earlier report listed them only because it could
  not read the spec.
- **Feature/shared UI components (Gap 5)** — deferred: TestBed/DOM effort
  outweighs marginal value relative to Gaps 1–4.
- **`data/counting-systems.ts`** — low value; Hi-Lo per-rank values are already
  exercised through the counting-engine spec.

## 7. Final Notes

The analysis is grounded in the real source, and the four production-code-free
additions delivered so far are small and high-signal: the random-scenario
generator (Gap 1), the shared card helpers (Gap 2), the structural integrity of
the hand-transcribed basic-strategy charts (Gap 3), and the structural
integrity of the hand-transcribed deviation charts (Gap 4 — triple uniqueness
and insurance-key exclusivity, the invariants the deviation engine's
`find`-based lookups silently depend on). Each was validated against a green
baseline, committed, and pushed one at a time. The remaining coverage gap is
the UI components (Gap 5), deferred as higher-effort, lower-value TestBed work.
