# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 2

## Prompt for next slice (slice 2)

Implement **Slice 2 — Top-level LICENSE + license clarification** from
`docs/roadmap.md`. One slice only: implement it, validate, make one commit, push
to `origin main`, then record the prompt for Slice 3.

**Goal:** state the reuse terms for the **application code**, kept distinct from
the bundled **card art**. Open question from `docs/repo-current-state.md`: the
card SVGs carry LGPL/GPL notices, but the app code has no license; `private:
true` blocks publishing but does not state reuse terms.

**Scope:**

- Add a top-level `LICENSE` file.
- Update the README license section to distinguish **application code** (the new
  license) from the **bundled card SVGs** (LGPL/GPL — keep the existing
  `public/cards/AUTHORS.txt` / `COPYING*.txt` references intact).

**Files:** `LICENSE` (new), `README.md`.

**Out of scope:** changing or relicensing the card assets; removing
`private: true`.

**Acceptance criteria:**

- `LICENSE` present at repo root.
- README clearly separates app-code license from card-asset license.
- Card-asset attribution files (`public/cards/AUTHORS.txt`, `COPYING*.txt`)
  unchanged.
- Build/tests stay green (effectively a docs-only change).

**Validation:** `npm run lint`, `npm run format:check`, `npm run typecheck`,
`CI=true npm test`, `npm run build`. A `LICENSE` file with no extension is not
picked up by Prettier, but `README.md` is — keep its edits prettier-clean (run
`npm run format` if needed).

**Commit:** `docs: add LICENSE and clarify app vs card-asset licensing`

**Decision — REQUIRED (which license).** Default: **MIT**, copyright the repo
owner, current year (**2026**). Proceed with MIT but record the assumption in the
log and final report. For the copyright line, the git author is `Arthur Zhang`
and the GitHub owner/org is `8C9D`; use `Arthur Zhang` unless the owner says
otherwise, and note the assumption. If a different license is wanted, edit this
recorded prompt before running.

After committing and pushing, set **Next slice** to `3`, generate the
self-contained prompt for **Slice 3 — Chart correctness golden-file guards**, and
append Slice 2's row to the execution log.

One-slice contract: implement only Slice 2, make exactly one commit (the new
`LICENSE` + `README.md` plus the two doc updates), push to `origin main`, then
record the prompt for Slice 3. Do not start Slice 3.

## Execution log

| Slice | Title                 | Status | Commit  | Validated                              | Date       | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ----: | --------------------- | ------ | ------- | -------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Lint & format tooling | Done   | pending | typecheck+test+build+lint+format:check | 2026-06-03 | Added `format`/`format:check`/`lint` scripts + `.prettierignore`. Replaced the standalone CI `typecheck` step with `lint` (= typecheck + format:check, so typecheck still runs). Ran one repo-wide `prettier --write .` pass — reformatted many existing files. Ignored the untracked `docs/repo-current-state.md` scratch file in `.prettierignore`. ESLint deferred. |
