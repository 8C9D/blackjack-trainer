# Blackjack Trainer — Slice-by-Slice Roadmap

A sequenced, vertical-slice plan for the work that remains. Each slice is a
**single shippable increment**: one focused change that leaves `main` green
(typecheck + tests + build) and is worth exactly one commit.

**Ordering principle:** infrastructure and quality first (Phase A), then user-
facing features (Phase B). The rationale is that the feature slices touch the
counting engine and chart data, and we want lint/format gates and value-level
chart guards in place _before_ we start editing that logic.

## How this roadmap is consumed

This file is the source of truth for _what_ each slice is. It is driven by the
**`roadmap-slice-autopilot`** skill, which implements one slice per invocation,
commits it, pushes it, and records the prompt for the following slice in
[`roadmap-progress.md`](roadmap-progress.md) (the cursor / handoff file).

- Implement the next pending slice: invoke the skill with no argument.
- Implement a specific slice: invoke the skill with that slice number.
- Current position and the next slice's prompt live in
  [`roadmap-progress.md`](roadmap-progress.md).

## Status legend

- **Planned** — not started.
- **In progress** — partially done (should be rare; slices are small).
- **Done** — implemented, validated, committed, pushed.
- **Skipped** — deliberately not done (reason recorded in the progress log).
- **Needs review** — autopilot paused here because the slice needs a human
  decision it could not safely default (see each slice's _Decision_ field).

## Slice schema

Every slice below uses the same fields so it is both human- and machine-
readable: **Phase**, **Status**, **Goal**, **Why here**, **Scope**, **Files**,
**Out of scope**, **Acceptance criteria**, **Validation**, **Commit**, and
**Decision** (whether a human choice is required, and the default if any).

## Validation baseline (applies to every slice)

Unless a slice says otherwise, "validated" means all of these pass:

```bash
npm run typecheck
CI=true npm test
npm run build
```

Plus, once Slice 1 lands: `npm run lint`.

---

## Phase A — Infrastructure & Quality

> Already done (do **not** re-add): GitHub Actions CI
> (`.github/workflows/ci.yml`), `.nvmrc` (`22`), `engines` in `package.json`,
> the `typecheck` script, and co-located specs for **all** UI components
> (the former "Gap 5" is closed — 16/16 components have specs, ~480 tests).

### Slice 1 — Lint & format tooling

- **Phase:** A — Infra/Quality
- **Status:** Done
- **Goal:** Make formatting and quality checks first-class and CI-enforced.
- **Why here:** Prettier is already a dependency (`^3.8.1`) but nothing runs it;
  there is no `lint` script. Wiring this first means every later slice is held
  to a consistent, automated standard.
- **Scope:**
  - Add npm scripts: `format` (`prettier --write .`), `format:check`
    (`prettier --check .`), and `lint` (run `typecheck` **and** `format:check`).
  - Add a `.prettierignore` covering `dist/`, `node_modules/`, `.angular/`,
    `coverage/`, `package-lock.json`, and `public/cards/` (do not reformat the
    vendored card SVGs).
  - Run `npm run format` once and commit any resulting formatting in this same
    slice so `format:check` is clean.
  - Wire `npm run lint` into `.github/workflows/ci.yml` (a step before `npm test`).
- **Files:** `package.json`, `.prettierignore` (new), `.github/workflows/ci.yml`,
  plus any files Prettier reformats.
- **Out of scope:** Adding ESLint / `@angular-eslint` (a larger dependency
  decision — leave for a later, explicitly-requested slice).
- **Acceptance criteria:**
  - [ ] `npm run lint` exists and exits 0 on a clean tree.
  - [ ] `npm run format:check` reports no changes.
  - [ ] CI runs `npm run lint`.
  - [ ] Tests and build remain green.
- **Validation:** `npm run lint`, `npm run format:check`, baseline.
- **Commit:** `chore: add lint and format scripts and wire into CI`
- **Decision:** None. (ESLint intentionally deferred.)

### Slice 2 — Top-level LICENSE + license clarification

- **Phase:** A — Infra/Quality
- **Status:** Done
- **Goal:** State the reuse terms for the application code, distinct from the
  bundled card art.
- **Why here:** Open question in `docs/repo-current-state.md`: card assets carry
  LGPL/GPL notices, but the app code has no license. `private: true` blocks
  publish but does not state reuse terms.
- **Scope:**
  - Add a top-level `LICENSE` file.
  - Update the README license section to distinguish **application code**
    (the new license) from the **bundled card SVGs** (LGPL/GPL — keep the
    existing `public/cards/AUTHORS.txt` / `COPYING*.txt` references intact).
- **Files:** `LICENSE` (new), `README.md`.
- **Out of scope:** Changing or relicensing the card assets; removing
  `private: true`.
- **Acceptance criteria:**
  - [ ] `LICENSE` present at repo root.
  - [ ] README clearly separates app-code license from card-asset license.
  - [ ] Card-asset attribution files are unchanged.
  - [ ] Build/tests green (docs-only change).
- **Validation:** baseline (effectively docs-only).
- **Commit:** `docs: add LICENSE and clarify app vs card-asset licensing`
- **Decision:** **Required — which license.** Default: **MIT**, copyright the
  repo owner, current year. The autopilot may proceed with MIT but must record
  the assumption in the progress log and its report. If the owner wants a
  different license, set the slice's recorded prompt accordingly before running.

### Slice 3 — Chart correctness golden-file guards

- **Phase:** A — Infra/Quality
- **Status:** Done
- **Goal:** Guard the transcribed chart **values** (not just their shape)
  against accidental edits.
- **Why here:** Existing specs prove chart _structure_; the most plausible place
  for a latent or future regression is a wrong cell value. The feature slices in
  Phase B will edit nearby data, so lock the charts down first.
- **Scope:**
  - Add regression specs for the four chart data files
    (`h17-basic-strategy.ts`, `s17-basic-strategy.ts`, `h17-deviations.ts`,
    `s17-deviations.ts`) that assert the full decision matrix against a
    checked-in golden representation (inline fixture or `*.golden` file).
  - Document, in the spec and/or this slice's log entry, that this guards
    against **regressions**, not original transcription errors — a periodic
    human review against the published BJA source is still the way to catch a
    bad transcription (see the open question in `repo-current-state.md`).
- **Files:** new spec/fixture file(s) under `src/app/data/` (co-located).
- **Out of scope:** Re-verifying values against the BJA PDFs (that is a human
  review task, not an automated slice).
- **Acceptance criteria:**
  - [ ] Each of the four charts has a value-level golden guard.
  - [ ] Mutating any single chart cell makes a test fail (design intent).
  - [ ] Tests green.
- **Validation:** `CI=true npm test`, `npm run typecheck`.
- **Commit:** `test: add golden-file guards for basic-strategy and deviation charts`
- **Decision:** None.

### Slice 4 — Shared blackjack-UI / keyboard refactor

- **Phase:** A — Infra/Quality
- **Status:** Done
- **Goal:** Remove duplication in the table / action-buttons / feedback shell
  and keyboard handling shared between v1 (basic strategy) and v4 (deviations).
- **Why here:** Last quality item before features. Some shared pieces already
  exist (`shared/feedback-shell.component.ts`, `rule-controls.component.ts`,
  `stats-panel.component.ts`, `core/keyboard.ts`); this slice assesses what is
  _still_ duplicated and extracts it **without changing behavior**.
- **Scope:** Identify remaining duplication between `features/basic-strategy/`
  and `features/deviations/` (and their use of `core/keyboard.ts`), extract into
  shared components/utilities, and update both features to consume them.
- **Files:** `src/app/shared/*`, `src/app/features/basic-strategy/*`,
  `src/app/features/deviations/*`, `src/app/core/keyboard.ts`.
- **Out of scope:** Any behavior change, restyle, or new feature.
- **Acceptance criteria:**
  - [ ] No behavior change (all existing tests pass unmodified, or are updated
        only to follow moved code — not to change assertions).
  - [ ] Targeted duplication is gone.
  - [ ] Build green; manual smoke of v1 and v4 looks identical.
- **Validation:** baseline + manual smoke of both trainers.
- **Commit:** `refactor: extract shared blackjack-UI scaffolding between v1 and v4`
- **Decision:** **Required if non-mechanical.** The _shape_ of the extraction is
  a judgment call. If the duplication is small and mechanical, proceed. If it
  requires meaningful API/design choices, **pause**: write the proposed
  extraction plan into the progress log, mark the slice **Needs review**, and
  stop without implementing.

---

## Phase B — Features

> Counting-system extension point (confirmed): `CountingSystem` interface in
> `src/app/core/models/counting-system.model.ts`, registry `COUNTING_SYSTEMS`
> in `src/app/data/counting-systems.ts`. The engine reads values purely off the
> descriptor, and the UI discovers systems from the registry.
>
> **Key constraint:** `CountValue` is currently locked to `-1 | 0 | 1`. KO fits
> (level-1). Omega II and Wong Halves do **not** — the model comment says so —
> so Slice 6 widens the type as a prerequisite that also unblocks Slice 7.

### Slice 5 — KO (Knock-Out) counting system

- **Phase:** B — Feature
- **Status:** Done
- **Goal:** Add KO as a selectable second counting system.
- **Why here:** Gentlest feature: KO is level-1 and fits the existing
  `CountValue` range, so it exercises the "add a system + UI selector" path
  without touching the value type.
- **Context / data:** KO values — `2–7 → +1`, `8–9 → 0`, `10,J,Q,K,A → −1`
  (differs from Hi-Lo only by counting the **7** as +1). KO is **unbalanced**
  (`balanced: false`); a full 52-card deck sums to **+4**. Unbalanced systems
  are normally played as a running count (with an Initial Running Count / key
  count) rather than converted to a true count the Hi-Lo way.
- **Scope:**
  - Add the `KO` descriptor to `data/counting-systems.ts` and register it in
    `COUNTING_SYSTEMS`.
  - Ensure the running-count trainer lets the user pick the system (UI discovers
    it from the registry).
  - Handle the unbalanced case in the true-count trainer: either implement KO's
    unbalanced math correctly or restrict KO to running-count mode with a clear
    in-UI note (see Decision).
  - Tests: per-rank values, the +4 deck sum, trainer wiring, Hi-Lo unaffected.
- **Files:** `src/app/data/counting-systems.ts`,
  `src/app/core/services/counting-engine.service.ts` (verify unbalanced
  handling), `src/app/features/card-counting/*` (system selector), specs.
- **Out of scope:** Omega II / Wong Halves; widening `CountValue`.
- **Acceptance criteria:**
  - [ ] KO selectable in the running-count trainer.
  - [ ] Counting math correct for KO; Hi-Lo behavior unchanged.
  - [ ] Tests green.
- **Validation:** baseline.
- **Commit:** `feat: add KO (Knock-Out) counting system`
- **Decision:** **Required — unbalanced true-count handling.** Default for this
  slice: **running-count-only for KO** (true-count conversion stays Hi-Lo-only
  for now), documented in the UI and the log. A full key-count/IRC model can be
  its own later slice.

### Slice 6 — Widen CountValue + Omega II counting system

- **Phase:** B — Feature
- **Status:** Done
- **Goal:** Support multi-level systems and add Omega II.
- **Why here:** First system that needs a wider value type. Doing the widening
  here (rather than as a bare refactor) keeps it a vertical slice with a visible
  payoff, and unblocks Slice 7.
- **Context / data:** Omega II (level-2, balanced) — `2,3,7 → +1`,
  `4,5,6 → +2`, `8,A → 0`, `9 → −1`, `10,J,Q,K → −2`. Full deck sums to **0**.
- **Scope:**
  - Widen `CountValue` in `counting-system.model.ts` (e.g. to a wider integer
    union or `number`) and update any validation that assumed `-1 | 0 | 1`.
  - Keep behavior **identical** for Hi-Lo and KO.
  - Add the Omega II descriptor + registry entry + UI wiring.
  - Tests: balanced sum 0, per-rank values, engine over multi-level values,
    true-count math still correct, existing systems unchanged.
- **Files:** `src/app/core/models/counting-system.model.ts`,
  `src/app/core/services/counting-engine.service.ts`,
  `src/app/data/counting-systems.ts`, `src/app/features/card-counting/*`, specs.
- **Out of scope:** Fractional values (Wong Halves — next slice).
- **Acceptance criteria:**
  - [ ] `CountValue` widened; Hi-Lo/KO outputs unchanged.
  - [ ] Omega II selectable and correct (running and true count).
  - [ ] Tests green.
- **Validation:** baseline.
- **Commit:** `feat: widen count values and add Omega II counting system`
- **Decision:** None (the model's own comment prescribes the widening). Note:
  this changes a core type — keep the diff tight and behavior-preserving for
  existing systems.

### Slice 7 — Wong Halves counting system

- **Phase:** B — Feature
- **Status:** Done
- **Goal:** Add the fractional level-3 Wong Halves system.
- **Why here:** Depends on Slice 6's widened value type; adds the additional
  wrinkle of fractional values.
- **Context / data:** Wong Halves (balanced) — `2,7 → +0.5`, `3,4,6 → +1`,
  `5 → +1.5`, `8 → 0`, `9 → −0.5`, `10,J,Q,K,A → −1`. Often "doubled" to
  integers (×2) to keep arithmetic integer-only.
- **Scope:** Add Wong Halves with a chosen representation; ensure the trainer's
  answer input, validation, and display handle the representation; tests.
- **Files:** `src/app/core/models/counting-system.model.ts` (if true fractions
  are stored), `src/app/data/counting-systems.ts`,
  `src/app/features/card-counting/*`, specs.
- **Out of scope:** Other systems.
- **Acceptance criteria:**
  - [ ] Wong Halves selectable and correct.
  - [ ] Representation + input convention documented.
  - [ ] Tests green.
- **Validation:** baseline.
- **Commit:** `feat: add Wong Halves counting system`
- **Decision:** **Required — representation.** Default: store **true fractional
  values** and accept the natural fractional running count, documenting the
  convention in the UI. (Alternative: store doubled integers.) Record whichever
  is chosen.

### Slice 8 — Finite-shoe live deck estimation

- **Phase:** B — Feature
- **Status:** Needs review
- **Goal:** Play through a real finite shoe and estimate decks remaining from
  observed cards, instead of picking a decks-remaining preset before each drill.
- **Why here:** Larger feature that builds on a solid, well-guarded counting
  engine.
- **Scope (high level):** a shoe model (N decks, depletion, penetration / cut
  card), wiring into the true-count trainer, and a UI to prompt and score the
  player's decks-remaining estimate.
- **Files:** new shoe model/service under `src/app/core/`, true-count feature
  components, specs.
- **Out of scope:** Showdowns (Slice 9).
- **Acceptance criteria:**
  - [ ] A finite shoe drives a drill end to end.
  - [ ] Deck-remaining estimation is prompted and scored.
  - [ ] Tests green.
- **Validation:** baseline + manual smoke.
- **Commit:** `feat: add finite-shoe live deck estimation`
- **Decision:** **Required — UX/scoring design** (how estimation is prompted and
  scored; penetration settings). No safe default. The autopilot should write a
  design sub-plan into the progress log, mark the slice **Needs review**, and
  stop without implementing until the design is approved.

### Slice 9 — Multi-hand showdowns

- **Phase:** B — Feature
- **Status:** Planned
- **Goal:** After the count drill ends, resolve multi-hand / dealer scenarios
  (showdowns).
- **Why here:** Largest feature; depends on everything above.
- **Scope (high level):** hand-resolution rules, dealer play, payouts, and the
  UI to drive a showdown after a drill.
- **Files:** new resolution engine under `src/app/core/`, feature components,
  specs.
- **Out of scope:** n/a (final planned slice).
- **Acceptance criteria:**
  - [ ] Showdown scenarios resolve correctly per documented rules.
  - [ ] Tests green.
- **Validation:** baseline + manual smoke.
- **Commit:** `feat: add post-count multi-hand showdowns`
- **Decision:** **Required — scope/rules/UX.** No safe default. Same protocol as
  Slice 8: write a design sub-plan, mark **Needs review**, and stop without
  implementing until approved.

---

## Notes on sequencing

- Slices 1–3 are mechanical and safe to run back-to-back.
- Slice 4 may pause for review depending on how much real duplication remains.
- Slice 6 must land before Slice 7 (type-widening prerequisite).
- Slices 8–9 are design-heavy; expect the autopilot to pause for a human
  decision before writing feature code.
