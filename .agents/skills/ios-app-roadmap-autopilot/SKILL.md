---
name: ios-app-roadmap-autopilot
description: One-shot autopilot that implements the entire iOS App roadmap (docs/ios-app-roadmap.md) in a single invocation, advancing one phase at a time (Phase 0 → 5), one slice at a time within each phase. For every slice it implements the smallest correct change, validates with the right baseline (npm for the web-repo exporter, xcodebuild + parity vectors for the Swift app), makes one commit, pushes to main, and records progress in docs/ios-app-roadmap-progress.md. It does NOT stop after each phase — it continues until the roadmap is complete or it hits a genuine pause (a Decision with no safe default, a human/account/device/App-Store-gated step, a missing toolchain, or a validation failure it cannot fix in scope). Use only when the user explicitly asks to run the iOS roadmap autopilot or auto-implement the iOS app plan.
disable-model-invocation: true
---

# iOS App Roadmap Autopilot (one-shot)

Implement the **whole** iOS App roadmap in
[`docs/ios-app-roadmap.md`](../../../docs/ios-app-roadmap.md) in a single run,
**phase by phase**, committing and pushing each slice to `main`.

This is the **one-shot** sibling of
[`roadmap-slice-autopilot`](../roadmap-slice-autopilot/SKILL.md): where that
skill does exactly one slice and stops, this skill **loops** — it finishes every
slice of a phase, advances to the next phase, and keeps going until the roadmap
is complete or a stop/pause condition is reached. It does not wait for approval
between slices or between phases.

Autonomy is not recklessness. Each slice stays small, preserves behavior outside
its scope, is validated before it is committed, gets exactly one commit, and is
pushed. The bar that keeps `main` green is the same per-slice gate the
single-slice autopilot uses — applied in a loop.

## What "one phase at a time" means

- Process phases in order: **0 → 1 → 2 → 3 → 4 → 5**.
- Within a phase, implement its slices in roadmap order. One commit + push per
  slice.
- Only advance to the next phase once every slice in the current phase is **Done**
  (or explicitly **Skipped** with a recorded reason).
- After each phase boundary, append a phase summary to the progress log and
  continue automatically. Report phase boundaries; do not pause at them.

## This roadmap spans two codebases

The roadmap is **not** purely a Swift project — read this before running:

- **Phase 0, Slice 0.2 (the parity-fixture exporter) lives in THIS web repo**
  (`tools/export-parity-fixtures.ts`, `package.json`, CI). Validate it with the
  web baseline (`npm run lint`, `CI=true npm test`, `npm run build`).
- **Phases 0.3 and 1–5 are the Swift/Xcode app.** Per decision **D1** the
  default layout is a **monorepo `ios/` directory** in this same repo. Validate
  with the Swift baseline (`xcodebuild build`/`test`, `swiftformat --lint`,
  `swiftlint`) **plus the parity-vector tests**.
- If decision D1 was resolved to a **separate repo**, the Swift slices run there;
  honor whatever the progress log records as the iOS project location.

Use the **right baseline for the slice's codebase**. Never validate a Swift
slice with npm or vice-versa.

## Environment & toolchain precheck (before any Swift slice)

Run once at startup and record the result in the progress log:

```bash
command -v xcodebuild && xcodebuild -version
command -v swift && swift --version
command -v swiftformat; command -v swiftlint
sw_vers   # confirm macOS host
```

- If `xcodebuild`/`swift` are **absent**, you can still do the **web-repo**
  work (Slice 0.2 and the doc/decision parts of 0.1). After that, **pause** with
  a clear handoff: the Swift toolchain is required for Phases 0.3–5. Do not fake
  Swift validation.
- If `swiftformat`/`swiftlint` are absent, note it; either install per the
  project's documented setup if the roadmap/slice calls for it, or treat those
  lint gates as "not available" and rely on `xcodebuild build/test` — but record
  the gap, don't silently skip a gate you could run.

## Human-gated steps — prepare, then PAUSE (do not fake)

Parts of this roadmap **cannot** be done by an autonomous agent. For each, do the
automatable preparation, write exactly what the human must do into the progress
log, set the slice to **Needs review**, and **pause** (see *Pause vs stop*). Do
**not** claim a human-gated step is Done.

- **Apple Developer Program enrollment** (Slice 0.1) — account creation/payment
  is human-only. It gates *signing, entitlement provisioning, TestFlight, and
  submission* — **not** building/testing in the simulator. So: record the
  decision parts (D1 repo layout), write the enrollment checklist, and **keep
  going** with the automatable build/test slices. Only pause for the account at
  the first step that truly needs it (entitlements in Phase 4, submission in
  Phase 5).
- **Capability/entitlement provisioning** — iCloud (KVS) for Slice 4.2, the App
  Group for the widget in Slice 4.3, and push/notification capabilities. Write
  the code and entitlement files, but enabling capabilities in the Apple
  Developer portal / signing them needs the account. Prepare + pause.
- **On-device & multi-device verification** — Slice 4.2's two-device iCloud sync
  check, widget-on-home-screen, notification delivery, and any "device check"
  acceptance criterion. Simulator coverage is fine to automate; real-device and
  two-device checks are human. Prepare + pause where the acceptance criterion
  demands hardware.
- **App Store Connect & review** (all of Phase 5) — metadata text,
  export-compliance flag, and draft privacy/age-rating answers can be prepared
  as files/notes, but creating screenshots from a near-final build, filling the
  App Store Connect web UI, uploading TestFlight builds, and submitting for
  review are human/Apple actions. Prepare the artifacts, write the submission
  checklist, and pause. **Never represent the app as submitted or approved.**

The honest end state of a fully successful one-shot run on a machine without an
Apple account is: **Phases 0–3 (and the code of Phase 4) implemented, validated,
committed, and pushed; the account/device/App-Store-gated steps prepared and
paused for the human.** Say so plainly.

## Non-negotiable safety rules

- Work directly on `main`. Do not create, switch to, or rename branches. Do not
  delete branches.
- One commit per slice (the slice's code/files **plus** the
  `docs/ios-app-roadmap.md` status update and `docs/ios-app-roadmap-progress.md`
  cursor/log update). Never bundle unrelated slices.
- **Stage files by explicit path only.** Never `git add -A`, `git add .`, or
  `git add -u`. This repo intentionally keeps `docs/repo-current-state.md`
  **untracked** — never stage or commit it. After staging, confirm it is still
  `??` in `git status --short`.
- Do not force push, amend, squash, or rebase. No destructive git. Do not delete
  user work.
- Do not start if there are unrelated uncommitted changes to **tracked** files.
  Untracked files are allowed (we only ever stage by explicit path).
- Preserve behavior outside each slice's stated *Scope* / *Files* / *Out of
  scope*. Keep diffs tight.
- Do not introduce frameworks or major dependencies unless a slice's *Scope*
  explicitly calls for it (e.g. an SVG renderer in Slice 2.3, WidgetKit in 4.3).
- Engine slices (Phase 1) are **not Done until their parity vectors pass.** A
  Swift engine that compiles but fails the exported golden vectors is a failed
  slice — fix it or stop; never weaken/skip the vector assertions to go green.
- For a Decision with **no safe default**, or any human-gated step, follow the
  decision/pause protocol — do not guess.
- If unsure whether a change is safe, pause and report rather than guessing.

## Startup checks

```bash
pwd
git status --short
git status --porcelain --untracked-files=no   # tracked-file changes only
git branch --show-current
git remote -v
```

- Not a git repo → stop.
- Judge cleanliness from **tracked** files only. If
  `git status --porcelain --untracked-files=no` is non-empty, stop and report.
  Untracked files (notably `docs/repo-current-state.md`, and the roadmap progress
  scaffold on first run) are fine.
- Confirm the branch is `main`. If not, switch to existing local `main`, or
  create a tracking branch from `origin/main` if only the remote exists:

  ```bash
  git show-ref --verify --quiet refs/heads/main && git switch main \
    || (git ls-remote --exit-code --heads origin main && git switch --track origin/main)
  ```

  Re-check; if still not exactly `main`, stop. Never create a non-`main` branch.
- Confirm `docs/ios-app-roadmap.md` exists. If it is missing, **stop** — there is
  nothing to drive this skill; do not invent a roadmap.
- Confirm a remote exists. With no remote you may implement and commit, but
  report that pushes were skipped.

## Resume logic (bootstrap or continue)

This skill is resumable: a paused run continues where it left off on
re-invocation.

1. If `docs/ios-app-roadmap-progress.md` is **missing**, bootstrap it (see
   *Progress file format*): set the cursor to **Phase 0 / Slice 0.1**, leave the
   execution log empty.
2. Otherwise read the cursor (**Current phase**, **Next slice**) and resume from
   the first not-Done slice.
3. If **Next slice** is `none (roadmap complete)`, report completion and stop.
4. Backfill a `pending` commit hash on the most recent log row if the previous
   run left one (match by the slice's conventional commit message via
   `git log --oneline -n 15`); include the fix in this run's next commit.

## The per-slice loop

For each slice, in roadmap order, until the phase (then the roadmap) is done:

1. **Select** the slice; read its full spec from `docs/ios-app-roadmap.md`
   (*Goal / Scope / Out of scope / Acceptance criteria / Validation / Commit /
   Decision*). The roadmap is authoritative for *what* the slice is.
2. **Decision gate.** If the slice is marked **Decision: Required**:
   - **Safe default given in the roadmap** (e.g. D1 monorepo, D2 bundled JSON,
     D3 iOS 17, D4 UserDefaults, D5 iCloud KVS, D7 educational positioning):
     proceed with the default; record the assumption in the slice's log row and
     the final report.
   - **No safe default, or a human-gated step** (Apple account, provisioning,
     on-device/two-device verification, App Store Connect/TestFlight/review):
     prepare what is automatable, write a concise sub-plan / handoff into the
     progress log, set the slice's roadmap status to **Needs review**, make one
     `docs:` commit with just the doc updates, push, and **pause** the loop
     (record where to resume). Do not advance past it.
3. **Implement** the smallest change that satisfies *Scope* + *Acceptance
   criteria*, staying within *Files* and honoring *Out of scope*. Match existing
   conventions (web: co-located `*.spec.ts`; Swift: the project's chosen test
   framework, SwiftFormat/SwiftLint style).
4. **Validate** with the slice's codebase baseline:
   - Web-repo slice (0.2): `npm run lint`, `CI=true npm test`, `npm run build`.
   - Swift slice (0.3, 1–5): `xcodebuild ... build`, `xcodebuild ... test`,
     `swiftformat --lint .`, `swiftlint` — **and** the parity-vector tests for
     any engine slice. Confirm every box in *Acceptance criteria*.
   - If validation fails because of this slice, fix it in scope. If it cannot be
     fixed in scope, **revert the uncommitted slice work** and stop.
5. **Bookkeep:** set the slice's status to **Done** in `docs/ios-app-roadmap.md`;
   in `docs/ios-app-roadmap-progress.md` advance the cursor (next slice, or next
   phase, or `none (roadmap complete)`) and append an execution-log row.
6. **Commit** (explicit paths) and **push** (see *Commit & push rules*).
7. **Continue** to the next slice. At a phase boundary, append a phase-summary
   note and proceed to the next phase automatically.

## Validation baselines (reference)

```bash
# Web repo (Slice 0.2 exporter, and the web side of any anti-drift check):
npm run lint
CI=true npm test
npm run build

# Swift app (Slices 0.3, 1–5) — use the project's real scheme/destination:
xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16' test
swiftformat --lint .
swiftlint
```

Engine slices additionally require the **exported parity vectors to pass** — the
roadmap's whole "mirror" guarantee. If the fixtures are stale (engine sources in
the web repo changed), re-run the exporter (`npm run export:fixtures`) and
include the regenerated fixtures with the slice that depends on them, per the
roadmap's anti-drift gate.

## Commit & push rules

- One commit per slice. Use the slice's suggested **Commit:** message from the
  roadmap (conventional style, e.g. `feat(ios): port basic-strategy engine
  (parity-verified)`).
- Before committing:

  ```bash
  git branch --show-current   # must be exactly: main
  git diff --check            # no whitespace errors / conflict markers
  git diff --stat
  ```

- Stage by explicit path — list every file, including the two doc files:

  ```bash
  git add <slice files...> docs/ios-app-roadmap.md docs/ios-app-roadmap-progress.md
  git status --short          # docs/repo-current-state.md must remain "??"
  ```

- End every commit message with:

  ```text
  Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>
  ```

- Push after each commit:

  ```bash
  git push origin main        # or: git push -u origin main if no upstream
  ```

  Never force push. If a push is rejected because the remote moved, **stop and
  report** — do not rebase/merge/force.

## Pause vs stop

- **Pause** (resumable, expected): a Decision with no safe default, a human/
  account/device/App-Store-gated step, or a missing Swift toolchain. Record the
  resume point + handoff in the progress log, leave the tree clean, and report.
  Re-invoking the skill continues from there.
- **Stop** (problem): not a git repo / no `main`; unrelated tracked changes at
  startup; `docs/ios-app-roadmap.md` missing; validation failure that can't be
  fixed in scope; push rejected / force-push required; merge conflict; a slice
  whose scope is too ambiguous or too broad to implement safely. Leave the tree
  clean if possible (revert partial uncommitted work) and report.

In both cases, do not advance the cursor past the unfinished slice.

## Progress file format

`docs/ios-app-roadmap-progress.md`, maintained by this skill:

```markdown
# iOS App Roadmap Progress

_Maintained by the `ios-app-roadmap-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/ios-app-roadmap.md](ios-app-roadmap.md)
**iOS project location:** <e.g. ./ios (monorepo, D1 default) | path/URL if separate>
**Toolchain:** <xcodebuild/swift/swiftformat/swiftlint presence + versions, or "Swift toolchain unavailable">
**Current phase:** <0–5 | "complete">
**Next slice:** <e.g. 1.3 | "none (roadmap complete)">

## Decisions applied
| ID | Decision | Value | Source |
|----|----------|-------|--------|
| D1 | Repo layout | monorepo ./ios | default |
| ... | ... | ... | ... |

## Pending human actions (handoffs)
- [ ] <Apple Developer enrollment / capability provisioning / device test / App Store Connect step, with which slice it unblocks>

## Execution log
| Phase | Slice | Title | Status | Commit | Validated | Date | Notes |
|------:|------:|-------|--------|--------|-----------|------|-------|
| 0 | 0.2 | Parity fixture exporter | Done | abc1234 | npm lint+test+build | YYYY-MM-DD | ... |
```

## Final response format

When the loop ends (complete, paused, or stopped), report:

- How far it got: the last **Done** slice and the current **Next slice** /
  phase.
- Per-phase summary: which slices landed, which were skipped/needs-review.
- For each commit: hash + message (real hashes, even where a log row still shows
  `pending`). Total commits + push status.
- Validation evidence: which baselines ran (web vs Swift) and that parity
  vectors passed for engine slices.
- **Pending human actions** (the handoff list): enrollment, provisioning,
  device/two-device tests, screenshots, App Store Connect, TestFlight,
  submission — explicitly, so the user knows what only they can do.
- Decisions/defaults applied (D1–D7 and any per-slice assumptions).
- Pause/stop reason if it did not complete, and how to resume (re-invoke to
  continue from the recorded cursor).
- Current `git status --short`.
- An honest one-liner on overall state — e.g. "Phases 0–3 implemented and
  pushed; Phase 4 code in place; account/device/App-Store steps prepared and
  awaiting the human. The app is **not** submitted."
