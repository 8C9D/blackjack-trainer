---
name: roadmap-slice-autopilot
description: Implement the next slice from docs/roadmap.md — exactly one slice per invocation. Read the slice spec and the recorded prompt, implement the smallest correct change, validate, make one commit, push to GitHub on main, then generate and record the prompt for the following slice in docs/roadmap-progress.md so the next invocation can continue. Accepts an optional slice number; defaults to the next pending slice. Use only when the user explicitly asks to advance the roadmap, implement the next/Nth slice, or run the slice autopilot.
disable-model-invocation: true
---

# Roadmap Slice Autopilot Skill

Implement the project roadmap **one vertical slice at a time**, driven by
[`docs/roadmap.md`](../../../docs/roadmap.md), committing and pushing each slice
to GitHub on `main`.

This skill is autonomous **for a single slice**. It does not loop through the
whole roadmap. Each invocation does exactly one slice, records the prompt for
the following slice, and stops. The user re-invokes it to continue.

Autonomy does not mean reckless changes. Keep each slice small, preserve
behavior outside the slice's scope, validate every change, make exactly one
commit per slice, and push it.

This skill works directly on `main`. Do not create, switch to, or rename
branches.

## The one-slice contract

1. Determine the target slice (from the argument, or the next pending slice).
2. Implement **only** that slice.
3. Validate.
4. Generate the **next** slice's self-contained prompt.
5. Update `docs/roadmap.md` (slice status) and `docs/roadmap-progress.md`
   (advance the cursor, write the next prompt, append a log row).
6. Make **one** commit containing the slice's code plus those two doc updates.
7. Push to `origin main`.
8. Report and **stop**. Do not start the next slice.

## Inputs

- **Optional slice number.** The skill is invoked with an optional argument:
  a bare number (`3`), `--slice 3`, or `slice 3`. All mean "implement Slice 3".
- **No argument** → implement the **next pending slice**:
  - Read `docs/roadmap-progress.md`, take its **Next slice** value.
  - If `docs/roadmap-progress.md` does not exist, bootstrap it (see *Bootstrap*)
    and use **Slice 1**.
  - If **Next slice** is `none (roadmap complete)`, stop and report that the
    roadmap is complete.

Parse the argument leniently. If an explicit slice number is given that does
not exist in the roadmap, stop and report the valid range.

## Files this skill reads and writes

- **Reads:** `docs/roadmap.md` (slice specs), `docs/roadmap-progress.md` (the
  cursor + the recorded prompt for the current slice), plus whatever source
  files the slice touches.
- **Writes:** the slice's source/test/config files, `docs/roadmap.md` (status
  of the implemented slice), and `docs/roadmap-progress.md` (advance cursor,
  next prompt, log row).

If `docs/roadmap.md` does not exist, stop — there is nothing to drive this
skill. Do not invent a roadmap.

## Non-negotiable safety rules

- Work directly on `main`. Do not create, switch to, or rename branches.
- Do exactly **one** slice per invocation. Never chain into the next slice.
- Make exactly **one** commit per slice (code + the two doc updates).
- **Stage files by explicit path only.** Never `git add -A`, `git add .`, or
  `git add -u`. This repo intentionally keeps `docs/repo-current-state.md`
  **untracked** — never stage or commit it.
- Do not force push. Do not amend, squash, or rebase. Do not use destructive
  git commands. Do not delete user work.
- Do not continue if there are unrelated uncommitted changes to **tracked**
  files at startup. Untracked files are allowed (we only ever stage by explicit
  path) — in particular `docs/repo-current-state.md` is intentionally untracked.
- Do not continue if validation fails and cannot be fixed within the slice's
  scope.
- Preserve behavior outside the slice's stated scope. Keep the diff tight.
- Do not introduce new frameworks or major dependencies unless the slice's
  scope explicitly calls for it.
- For slices that need a human decision with **no safe default**, do not guess
  — follow the *Pause-for-decision protocol*.
- If unsure whether a change is safe, stop and report rather than guessing.

## Startup checks

Run safe checks before doing anything else:

```bash
pwd
git status --short
git status --porcelain --untracked-files=no   # tracked-file changes only
git branch --show-current
git remote -v
```

- If this is not a git repository, stop.
- Judge cleanliness from **tracked** files only: if
  `git status --porcelain --untracked-files=no` is non-empty, stop and report
  the staged/modified tracked files. **Untracked files are fine** and expected —
  `docs/repo-current-state.md` is intentionally untracked, and the roadmap
  scaffold may be untracked on the first run. Never stage or commit untracked
  files that are not part of the slice.
- Confirm the branch is `main`:

  ```bash
  git branch --show-current
  ```

  If it is not `main`, check for an existing local `main` and switch to it; if
  only `origin/main` exists, create the tracking branch from it:

  ```bash
  git show-ref --verify --quiet refs/heads/main && git switch main \
    || (git ls-remote --exit-code --heads origin main && git switch --track origin/main)
  ```

  Re-check `git branch --show-current`. If it is still not exactly `main`, stop.
  Never create a non-`main` branch.
- Confirm a remote exists. If there is no remote, you may still implement and
  commit, but report that the push step was skipped.

## Backfill the previous slice's commit hash

The execution log records each slice's commit hash. A slice's own commit cannot
contain its own hash, so the hash is written as `pending` and backfilled on the
next run.

At startup, if the log's most recent row has `pending` as its commit hash, find
that commit and fill it in:

```bash
git log --oneline -n 10
```

Match the previous slice's commit by its conventional message, replace `pending`
with the short hash in `docs/roadmap-progress.md`, and include that fix in this
run's single commit. If you cannot confidently identify it, leave it as-is and
note it in the report.

## Bootstrap (only if the progress file is missing)

If `docs/roadmap-progress.md` does not exist:

1. Create it using the format in *Progress file format* below.
2. Set **Next slice** to `1`.
3. Generate Slice 1's self-contained prompt from `docs/roadmap.md` and record it.
4. Leave the execution log empty.

Then proceed to implement Slice 1. (The bootstrap edits to the progress file are
part of this run's single commit.)

## Selecting the slice

1. Resolve the target slice number (argument, else **Next slice**, else `1`).
2. Read that slice's full spec from `docs/roadmap.md`.
3. Read the recorded prompt for it in `docs/roadmap-progress.md` (the prompt a
   previous run generated). The roadmap spec is authoritative for *what* the
   slice is; the recorded prompt is the actionable, self-contained restatement
   plus any decisions/assumptions carried forward.
4. If the slice's status in the roadmap is already **Done**, stop and report,
   unless the user explicitly asked to redo that number.

## Pause-for-decision protocol

Some slices are marked **Decision: Required** in the roadmap.

- **If the roadmap gives a safe default** (e.g. Slice 2 → MIT; Slice 5 →
  running-count-only for KO; Slice 7 → fractional representation): proceed using
  that default. Record the assumption in the slice's log entry and in the final
  report so the user can override later.
- **If the roadmap says there is no safe default** (e.g. Slice 8 finite-shoe
  UX; Slice 9 showdown rules; Slice 4 if the extraction is non-mechanical):
  **do not implement feature code.**
  1. Write a concise design sub-plan into `docs/roadmap-progress.md` under the
     slice (options, recommendation, open questions).
  2. Set the slice's status in `docs/roadmap.md` to **Needs review**.
  3. Make one `docs:` commit with just those two doc updates and push it.
  4. Report that the slice needs a human decision, and stop. Do **not** advance
     **Next slice** past it.

## Implementation phase

1. Confirm the branch is `main`.
2. Re-read the files the slice will touch.
3. Make the **smallest** change that satisfies the slice's *Scope* and
   *Acceptance criteria*. Stay within *Files* / honor *Out of scope*.
4. Follow existing conventions in the codebase (style, naming, test layout —
   specs are co-located `*.spec.ts`).

## Validation phase

Use the project's actual commands (from `package.json`):

```bash
npm run typecheck
CI=true npm test
npm run build
```

Once Slice 1 has landed, also run `npm run lint`. Prefer running the most
relevant check first, then the full baseline.

- If validation fails because of this slice's change, fix it within scope.
- If it fails for a clearly pre-existing, unrelated reason, document that and
  decide whether targeted validation is sufficient; if not, stop.
- If you cannot confidently validate, **revert the uncommitted change** and stop
  without committing.

Confirm every box in the slice's *Acceptance criteria* before committing.

## Bookkeeping (before the commit)

1. **`docs/roadmap.md`** — set the implemented slice's **Status** to **Done**
   (or **Needs review** / **Skipped** with a reason).
2. **`docs/roadmap-progress.md`:**
   - Set **Next slice** to the following slice number, or
     `none (roadmap complete)` if this was the last slice.
   - Replace the **Prompt for next slice** section with a freshly generated,
     **self-contained** prompt for that following slice (see *Writing the next
     prompt*). If the roadmap is complete, state that instead.
   - Append a row to the **Execution log** for the slice just finished:
     number, title, status, commit hash (`pending` — backfilled next run),
     validation result, date, and any assumptions/decisions made.

## Writing the next prompt

The recorded prompt must let a **fresh** invocation act with no extra context.
Derive it from the next slice's roadmap entry and include:

- The slice number and title, and a one-line goal.
- The concrete scope (what to add/change) and the files likely touched.
- The acceptance criteria and the validation commands.
- The exact suggested commit message.
- Any decision/default to apply, and any assumption carried forward from the
  slice just completed (e.g. "KO is running-count-only; true-count stays
  Hi-Lo-only").
- A reminder that this is governed by the one-slice contract: implement only
  this slice, one commit, push, then record the prompt for the slice after it.

Keep it tight and actionable — a prompt, not a copy of the whole roadmap.

## Commit rules

One commit per slice, containing the slice's code **and** the `docs/roadmap.md`
+ `docs/roadmap-progress.md` updates (and any hash backfill).

Before committing, verify and inspect:

```bash
git branch --show-current   # must be exactly: main
git status --short
git diff --check            # no whitespace errors / conflict markers
git diff --stat
```

Stage by explicit path only — list every file. For example:

```bash
git add <slice source/test/config files> docs/roadmap.md docs/roadmap-progress.md
```

Never `git add -A` / `git add .` / `git add -u` (protects the untracked
`docs/repo-current-state.md`). Confirm the untracked scratch file is still
untracked after staging:

```bash
git status --short    # docs/repo-current-state.md must remain "??", not staged
```

Use the slice's suggested commit message from the roadmap. End the commit
message with:

```text
Co-Authored-By: Codex Opus 4.8 <noreply@anthropic.com>
```

## Push rules

```bash
git push origin main
```

If `main` has no upstream but `origin` exists, use `git push -u origin main`.
Never force push. If the push is rejected because the remote has new commits,
**stop and report** — do not rebase, merge, or force. (Re-running later, after
the user reconciles, is fine.)

## Stop conditions

Stop immediately if:

- The branch is not `main` and cannot be safely switched to existing `main`.
- The working tree had unrelated changes at startup.
- `docs/roadmap.md` is missing.
- The requested slice number does not exist, or its status is already **Done**
  (and no redo was requested).
- The roadmap is complete (**Next slice** is `none`).
- A slice needs a human decision with no safe default (pause protocol).
- Validation fails and cannot be fixed within the slice's scope.
- The push is rejected, or a force push would be required.
- The slice would require broad changes across many unrelated files, or its
  scope is too ambiguous to implement safely.

When stopping, leave the working tree clean if possible (revert any partial,
uncommitted slice work).

## Progress file format

`docs/roadmap-progress.md` is maintained by this skill. Keep this shape:

```markdown
# Roadmap Progress

_Maintained by the `roadmap-slice-autopilot` skill. The cursor below is the
source of truth for what runs next. Manual edits are fine if you keep the
format._

**Roadmap:** [docs/roadmap.md](roadmap.md)
**Next slice:** <N | "none (roadmap complete)">

## Prompt for next slice (slice <N>)

<self-contained prompt the next invocation will consume>

## Execution log

| Slice | Title | Status | Commit | Validated | Date | Notes |
|------:|-------|--------|--------|-----------|------|-------|
| ...   | ...   | Done   | abc1234 | typecheck+test+build | YYYY-MM-DD | ... |
```

## Final response format

When finished (or stopped), report:

- Slice number and title attempted.
- What changed (files), or why nothing was implemented (pause/stop reason).
- Validation commands run and their result.
- Commit hash and message (the real hash, even though the log shows `pending`).
- Push status.
- The new **Next slice** value and a one-line preview of its recorded prompt.
- Any decisions/assumptions made (e.g. license chosen, KO running-count-only).
- Current `git status --short`.
- A reminder that this was one slice; re-invoke to continue.
