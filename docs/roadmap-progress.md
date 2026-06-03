# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** 1

## Prompt for next slice (slice 1)

Implement **Slice 1 — Lint & format tooling** from `docs/roadmap.md`. One slice
only: implement it, validate, make one commit, push to `origin main`, then
record the prompt for Slice 2.

**Goal:** make formatting/quality checks first-class and CI-enforced. Prettier
(`^3.8.1`) is already a dependency but nothing runs it, and there is no `lint`
script.

**Scope:**
- Add npm scripts to `package.json`: `format` → `prettier --write .`,
  `format:check` → `prettier --check .`, and `lint` → run `typecheck` **and**
  `format:check` (e.g. `npm run typecheck && npm run format:check`).
- Add `.prettierignore` covering `dist/`, `node_modules/`, `.angular/`,
  `coverage/`, `package-lock.json`, and `public/cards/` (do not reformat the
  vendored card SVGs).
- Run `npm run format` once and commit any resulting reformatting in this same
  slice so `format:check` is clean.
- Add a `npm run lint` step to `.github/workflows/ci.yml` before the
  `CI=true npm test` step.

**Files:** `package.json`, `.prettierignore` (new), `.github/workflows/ci.yml`,
plus any files Prettier reformats.

**Out of scope:** ESLint / `@angular-eslint` (deferred — do not add it).

**Acceptance criteria:**
- `npm run lint` exists and exits 0 on a clean tree.
- `npm run format:check` reports no changes.
- CI runs `npm run lint`.
- `CI=true npm test` and `npm run build` stay green.

**Validation:** `npm run lint`, `npm run format:check`, `npm run typecheck`,
`CI=true npm test`, `npm run build`.

**Commit:** `chore: add lint and format scripts and wire into CI`

**Decision:** none (ESLint intentionally deferred).

After committing and pushing, set **Next slice** to `2`, generate the
self-contained prompt for **Slice 2 — Top-level LICENSE + license
clarification** (note its required license decision; default **MIT**, copyright
the repo owner, current year — record the assumption), and append this slice's
row to the execution log.

## Execution log

| Slice | Title | Status | Commit | Validated | Date | Notes |
|------:|-------|--------|--------|-----------|------|-------|
| _(none yet — Slice 1 is next)_ | | | | | | |
