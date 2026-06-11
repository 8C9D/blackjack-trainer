# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 6

## Prompt for next slice (slice 6)

Implement **Slice 6 — Widen CountValue + Omega II counting system** from
`docs/roadmap.md`. One slice only. **Decision: None** — the model's own comment
prescribes widening `CountValue`, so proceed (no pause). This changes a **core
type**, so keep the diff tight and behavior-preserving for the existing systems
(Hi-Lo and KO).

**Goal:** widen the per-rank `CountValue` type to support multi-level systems,
then add Omega II (a level-2, balanced system) as a third selectable system.

**Counting data (Omega II):** `2,3,7 → +1`, `4,5,6 → +2`, `8,A → 0`, `9 → −1`,
`10,J,Q,K → −2`. Omega II is **balanced** (`balanced: true`): a full 52-card
deck sums to **0**. Because it is balanced, it must get true-count mode back
automatically (see "carried forward" below) — no per-system special-casing.

**Before writing code, read these to learn the real shapes (do not assume):**

- `src/app/core/models/counting-system.model.ts` — `CountValue` is currently
  `-1 | 0 | 1`. Widen it (a wider integer union like `-2 | -1 | 0 | 1 | 2`, or
  `number`). The interface already carries a `balanced: boolean` flag.
- `src/app/core/services/counting-engine.service.ts` — `runningCount` just sums
  `system.values[rank]`, so it already handles multi-level values; confirm.
  `isValidIntegerAnswer` accepts any integer (fine for Omega II). True-count math
  (`trueCount` = trunc(running ÷ decks)) is unchanged and valid for balanced
  Omega II.
- `src/app/data/counting-systems.ts` — `HI_LO` and `KO` descriptors and the
  `COUNTING_SYSTEMS` registry. Add `OMEGA_II` and append it to the registry; the
  UI selector discovers systems from this list automatically.
- `src/app/data/counting-systems.spec.ts` — the data-level golden tests (per-rank
  values, full-deck sums, registry). Extend for Omega II.
- `src/app/features/card-counting/count-feedback-panel.component.ts` — the
  breakdown `deltaLabel` is `delta > 0 ? '+'+delta : String(delta)`; verify it
  reads fine for ±2 (e.g. shows `+2` / `-2`).

**Scope:**

- Widen `CountValue` in `counting-system.model.ts` and update any validation /
  type that assumed `-1 | 0 | 1`. Keep Hi-Lo and KO outputs **identical**.
- Add the `OMEGA_II` descriptor + registry entry. No new UI wiring should be
  needed — the selector is data-driven (added in Slice 5).
- Tests: Omega II per-rank values, balanced full-deck sum 0, the engine summing
  multi-level (±2) values, true-count still correct for Omega II, and Hi-Lo / KO
  unchanged.

**Files:** `src/app/core/models/counting-system.model.ts`,
`src/app/core/services/counting-engine.service.ts` (verify only — likely no
change), `src/app/data/counting-systems.ts`, `src/app/data/counting-systems.spec.ts`,
`src/app/core/services/counting-engine.service.spec.ts`. Touch
`features/card-counting/*` only if the wider type surfaces a gap.

**Out of scope:** Wong Halves / fractional values (Slice 7).

**Acceptance criteria:**

- `CountValue` widened; Hi-Lo and KO outputs unchanged.
- Omega II selectable and correct (running count; and true count, since it is
  balanced).
- Tests green.

**Validation:** full baseline — `npm run lint`, `CI=true npm test`,
`npm run build`.

**Commit:** `feat: widen count values and add Omega II counting system`

**Assumptions carried forward (Slice 5):** the counting-system **selector** now
lives in `CountingSettingsComponent` (inputs `systems`, `systemId`,
`trueCountAvailable`; output `systemChange`). The page
(`card-counting-page.component.ts`) holds `system = signal<CountingSystem>(HI_LO)`,
`systems = COUNTING_SYSTEMS`, `trueCountAvailable = computed(() => system().balanced)`,
and `onSystemChange(id)` (which coerces mode → running-count when the picked
system is unbalanced). **True-count availability is gated purely on
`system.balanced`** — Omega II is balanced, so it gets true count automatically
with no extra code. KO stays running-count-only. Adding a descriptor to
`COUNTING_SYSTEMS` is all that is needed for it to appear in the selector.
`CountValue` is still `-1 | 0 | 1` today (KO fit within it); Slice 6 is what
widens it for Omega II's ±2.

One-slice contract: implement only Slice 6, make exactly one commit, push to
`origin main`, then record the prompt for **Slice 7 — Wong Halves counting
system** (Slice 7 adds fractional level-3 values; **Decision: Required —
representation**, default = store true fractional values). Do not start Slice 7.

## Execution log

| Slice | Title                                   | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----: | --------------------------------------- | ------ | ------- | -------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling                   | Done   | b6bd53c | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|     2 | LICENSE + license clarification         | Done   | afc3fda | lint+typecheck+test+build              | 2026-06-03 | Chose **MIT** (recorded default), copyright © 2026 Arthur Zhang (git author name; GitHub owner is `8C9D` — used the personal name per the recorded prompt). Added canonical MIT `LICENSE` at repo root (extensionless, so Prettier does not check it). Rewrote the README "App code" section to state MIT and carve out `public/cards/`; changed the card-art note from "all-rights-reserved" to "MIT license above". Left `package.json` (`license` field + `private: true`) unchanged — only `LICENSE` + `README.md` were in scope. Card attribution files untouched.                                                                                                                                                                                                                                                                                                                                                       |
|     3 | Chart correctness golden-file guards    | Done   | f896c22 | lint+typecheck+test+build              | 2026-06-03 | Added `src/app/data/chart-values.golden.spec.ts` (+10 tests → 491 total). Chose **inline** golden literals (simplest; matches existing style). Basic-strategy charts serialized as rowKey → space-joined cells across upcards 2..A; deviations serialized one line per rule capturing ruleSet/category/hand/upcard/index/direction and basic→deviation action (`playerHandLabel` + `source` excluded as documentation, not the decision matrix). Guards **regressions only**, not original transcription errors (re-verifying vs the BJA PDFs stays a human task). Bootstrapped the golden via a throwaway Node type-strip script (not committed) to avoid transcription error. Verified the "any single cell flip fails" intent by flipping H17 hard 16 v9 (SUR_H→S) and the H17 insurance index (3→2): both turned the golden spec red (and the existing engine specs), then reverted. Chart data files unchanged.          |
|     4 | Shared blackjack-UI / keyboard refactor | Done   | 3564bbf | lint+typecheck+test+build              | 2026-06-05 | Mechanical path (no pause): assessed remaining duplication first. Moved `BlackjackTableComponent` and `ActionButtonsComponent` from `features/basic-strategy/` to `src/app/shared/` (they were already shared via a cross-feature import from the deviations page) and repointed both pages' imports — removes the `features/deviations → features/basic-strategy` dependency. Extracted the duplicated trainer keydown body into `handleTrainerKeydown(event, { canNext, onNext, onAction })` in `core/keyboard.ts`; both pages delegate from their own `@HostListener` (behavior identical: basic-strategy gates Enter on a graded hand, deviations also on a valid next-hand). Added 6 helper unit tests (491→497). Feedback panels already share `feedback-shell` via content projection, and `rule-controls`/`stats-panel` were already shared — left as-is. `card-counting` keyboard handling untouched (out of scope). |
|     5 | KO (Knock-Out) counting system          | Done   | pending | lint+typecheck+test+build              | 2026-06-05 | Safe default (no pause): KO is **running-count-only**; true-count stays Hi-Lo-only. Gated true-count on the existing `balanced` flag (not KO-by-name): the page exposes `trueCountAvailable = system().balanced`; added a `Counting system` `<select>` to `CountingSettingsComponent` (`systems`/`systemId`/`trueCountAvailable` inputs, `systemChange` output) that disables the true-count radio and shows a note when unbalanced; `onSystemChange` coerces mode→running-count for unbalanced systems. Page `system` is now a signal (was a const). Engine untouched — already system-agnostic (sums `values[rank]`). KO descriptor: 2–7→+1, 8–9→0, 10–A→−1, `balanced:false`, full-deck sum **+4** (differs from Hi-Lo only on the 7). New `data/counting-systems.spec.ts`; +27 tests (497→524). KO IRC/key-count true-count math deferred. Hi-Lo unaffected.                                                              |
