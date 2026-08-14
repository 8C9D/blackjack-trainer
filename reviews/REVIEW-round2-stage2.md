# REVIEW - round 2, stage 2

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

**Verdict: PASS-WITH-FINDINGS**

Range reviewed: `7010e8cda93a10aa33c19363035a0dc4741ca8a8..a3f5deecc43579043acdfa11b7d961c17e542c78`
(`e3f8cba` keep the serve lane testing a real worker and strike two claims the tree did not support,
`a3f5dee` make the dist E2E lane build what it serves and refuse an unknown lane name).

Both behavioural claims are real and I reproduced each one in both directions myself, from the running
system rather than from the committed transcripts.
All nine gates are green at the tip and every figure in the "Gates after stage 2" table of
`reviews/ARTIFACTS-round2.md` matched my own runs exactly.
The range adds no user-visible capability: it touches no file under `src/` or `ios/`, and `E2E_SERVER`
is a pre-existing developer-only variable whose accepted spellings did not grow.

The findings are: one committed reproduction that no longer reproduces at the commit that ships it
(F2-1, introduced), a record pointing at a ledger entry that does not exist (F2-2, introduced), the
fact that nothing pins any of the range's three behavioural changes (F2-3, gap pre-existing but
undisclosed for stage 2), a genuinely flaky E2E gate that is not the range's doing (F2-4,
pre-existing), the cost the new build adds (F2-5, informational and already disclosed), and a residual
N7 symptom on the serve lane that no record names as such (F2-6, introduced).

Everything ran with the tool sandbox disabled.
Nothing was listening on `127.0.0.1:4200` before any E2E run: `lsof -nP -iTCP:4200 -sTCP:LISTEN` was
checked before each one and each script aborted on a busy port.
A stray `node` holds `[::1]:4321`; no gate uses it and I left it alone.
Every scenario that touched a tracked file restored it; `git status --porcelain --untracked-files=no`
prints nothing at the end of this review, and the full `git status --porcelain` prints only
`?? .agents/` and `?? .codex/`, exactly as I found it.
`dist/` was rebuilt at the end (`ngsw-worker.js` md5 `84f509c7ab1bf74fe8cd95f1b2551768`, the same file
`reviews/REVIEW-round2-stage1.md` recorded), and `npm run export:fixtures` +
`git diff --exit-code -- ios/Fixtures` was re-run afterwards and is clean.

---

## 1. What the range claims, and whether it does it

`e3f8cba` claims two things.
First, that stage 1's N7 fix narrowed coverage by skipping the offline suite on the lane alone, and
that making the serve lane's skip conditional on the worker again restores a real case.
Second, that two completed-tense claims in `PROD-READINESS.md` (an N1 patch that "is recorded", an I1
provisioner note that "is written") described work that did not exist, and are struck.

`a3f5dee` claims two more.
That the `dist` lane served whatever `dist/` happened to hold, so the gate could report green against a
bundle built from other source, and now runs `npm run build` first.
That `E2E_SERVER` was read as `=== 'dist'`, so any other spelling silently selected the `serve` lane,
and an unrecognised value now aborts the run.

**All four do what they claim.** Verified below.

### 1.1 The two stage-2 defects reproduce at the base of the range

Reverting only the behavioural line and re-running the recorded command reproduces both "defect
present" transcripts exactly.

Lane typo, with `e2e/fixtures/lane.ts`'s validation block removed:

```console
$ E2E_SERVER=dsit npx playwright test e2e/smoke/navigation.e2e.ts
BEFORE_B_EXIT=0
  13 passed (6.2s)
```

Stale bundle, with `playwright.config.ts` reverted to `` `PORT=${PORT} node tools/serve-dist.mjs` ``,
`src/app/app.routes.ts` edited to a title no build ever produced, and a marker file dropped in `dist/`:

```console
$ sed -i '' "s/title: 'Blackjack Trainer',/title: 'STALE PROOF TITLE',/" src/app/app.routes.ts
$ echo "stale-marker" > dist/blackjack-trainer/browser/STALE-MARKER.txt
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
BEFORE_C_EXIT=0
  13 passed (3.6s)
$ ls dist/blackjack-trainer/browser/STALE-MARKER.txt
dist/blackjack-trainer/browser/STALE-MARKER.txt
```

Green, exit 0, on source the gate never compiled, with the marker still present so no build ran.
Both match `reviews/ARTIFACTS-round2.md` figure for figure.

### 1.2 The fixes bite at the tip

```console
$ E2E_SERVER=dsit npx playwright test e2e/smoke/navigation.e2e.ts
R1_EXIT=1
Error: E2E_SERVER must be one of 'dist' | 'serve', got 'dsit'. Unset it to take the default ('dist' under CI, otherwise 'serve').
    at Object.<anonymous> (/Users/arthurzhang/dev/blackjack-trainer/e2e/fixtures/lane.ts:23:9)

$ E2E_SERVER='dist ' npx playwright test e2e/smoke/navigation.e2e.ts
R1B_EXIT=1
Error: E2E_SERVER must be one of 'dist' | 'serve', got 'dist '. ...
```

The trailing-space case the comment in `lane.ts` names is real and is caught.
Both legal values still work: `E2E_SERVER=serve` gives `13 passed`, exit 0 on the navigation spec, and
`E2E_SERVER=dist npm run e2e` gives `111 passed`, exit 0.

```console
$ echo "stale-marker" > dist/blackjack-trainer/browser/STALE-MARKER.txt
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
R3_EXIT=0
  13 passed (8.2s)
$ ls dist/blackjack-trainer/browser/STALE-MARKER.txt
ls: dist/blackjack-trainer/browser/STALE-MARKER.txt: No such file or directory

$ sed -i '' "s/title: 'Blackjack Trainer',/title: 'STALE PROOF TITLE',/" src/app/app.routes.ts
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
R4_EXIT=1
    Expected pattern: /^Blackjack Trainer$/
    Received string:  "STALE PROOF TITLE"
  2 failed
  11 passed (11.5s)
```

The marker is gone, so `ng build` ran and cleaned its output directory; and an edit to source with no
manual rebuild now turns the gate red and quotes the source's actual value.
`src/app/app.routes.ts` was restored from a copy and `git diff --stat` on it is empty.

### 1.3 All four lane/worker combinations reproduce

`reviews/ARTIFACTS-round2.md` records a four-row branch table.
I ran all four rows myself, and all four match.

| lane                     | worker present?                   | recorded "after"   | my result          |
| ------------------------ | --------------------------------- | ------------------ | ------------------ |
| `dist`                   | yes                               | 111 passed, exit 0 | 111 passed, exit 0 |
| `dist`                   | no (build configured without one) | 2 failed, exit 1   | 2 failed, exit 1   |
| `serve`, `ng serve`      | no, by design                     | 2 skipped, exit 0  | 2 skipped, exit 0  |
| `serve`, on a built copy | yes                               | 2 passed, exit 0   | 2 passed, exit 0   |

Row 2 needs a note, and it is finding F2-1: I could not produce it by the recorded method.
I produced it by removing `"serviceWorker": "ngsw-config.json"` from `angular.json`'s production
configuration, so that the build genuinely emits no worker:

```console
$ grep -n serviceWorker angular.json
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts
R6_EXIT=1
    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js
  2 failed
```

`angular.json` was restored from a copy immediately afterwards and
`git status --porcelain --untracked-files=no` printed nothing.

Row 4 was run by starting `PORT=4200 node tools/serve-dist.mjs` by hand (with
`curl -o /dev/null -w '%{http_code}' http://127.0.0.1:4200/ngsw-worker.js` returning `200`) and then
running `env -u CI E2E_SERVER=serve npx playwright test e2e/smoke/offline.e2e.ts`, which gave
`2 passed`, exit 0.
The stage-1 remediation the ledger records as R2-1 is therefore real: the serve lane does exercise the
offline suite against a built bundle, and a lane-only skip would have dropped that case.

---

## 2. The nine gates, re-run by me at `a3f5dee`

| #   | gate                                                               | my result                                                          | recorded  | match |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------- | ----- |
| 1   | `npm run lint`                                                     | exit 0, `All matched files use Prettier code style!`               | 0         | yes   |
| 2   | `npm run build`                                                    | exit 0, 1 budget warning (`chart-page.component.scss`, +368 bytes) | 0, 1 warn | yes   |
| 3   | `npm test`                                                         | exit 0, 65 files, 1533 passed                                      | 1533      | yes   |
| 4   | `npm run test:coverage`                                            | exit 0, 96.11 / 93.23 / 93.28 / 97.97                              | same      | yes   |
| 5   | `E2E_SERVER=dist npm run e2e`                                      | exit 0, 111 passed (4 of 4 clean-tree runs)                        | 111       | yes   |
| 6   | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures` | exit 0, 7 fixtures, no drift                                       | no drift  | yes   |
| 7   | `swiftformat --lint .`                                             | exit 0, 0/105 files require formatting                             | 0         | yes   |
| 8   | `swiftlint lint`                                                   | exit 0, 0 violations, 0 serious in 105 files                       | 0         | yes   |
| 9   | `xcodebuild -scheme BlackjackTrainer ... build test`               | `** TEST SUCCEEDED **`, 335 tests in 38 suites                     | SUCCEEDED | yes   |

Gate 9's status was read from the `** TEST SUCCEEDED **` marker in the log, not from a piped exit code.
The `Executed 0 tests` line in that log is the empty XCTest suite; the Swift Testing summary is
`✔ Test run with 335 tests in 38 suites passed after 5.677 seconds.`

**Does any gate report green while the thing it names is broken?**
Gate 5 is more honest than before the range on two counts I measured: it now compiles the source it
tests (1.2), and an unknown lane name aborts instead of quietly swapping servers (1.2).
It remains true, and is disclosed as N5 in the ledger, that gate 5 builds the root-href bundle and not
the `--base-href /blackjack-trainer/` bundle `.github/workflows/pages.yml:37` deploys; I confirmed
`tools/serve-dist.mjs` serves only from the root (`const ROOT = .../dist/blackjack-trainer/browser`),
so that lane could never have served the deployed configuration anyway.
The narrowing gate 5 did acquire in this range is F2-1.

**Does any change to a gate make it slower, flakier, or able to fail for unrelated reasons?**
Gate 5 is slower, by design and as recorded: the navigation spec went 3.6s to 8.2s in my runs
(the record says 4.1s to 7.8s).
It can now fail for a build reason, which I checked surfaces well rather than as a timeout: appending
`export const BROKEN: number = "not a number";` to `src/app/app.routes.ts` made the run exit 1 after
3 seconds with `[WebServer] ✘ [ERROR] TS2322 ...` and
`Error: Process from config.webServer was not able to start. Exit code: 1`, nowhere near the
`timeout: 120_000` webServer budget.
A cold build (`rm -rf .angular/cache dist`) took 4 seconds here, so the added build has ample headroom
against that timeout on this machine.
The gate is flakier than the records suggest, but not because of this range: see F2-4.

---

## 3. Findings

### F2-1 - the committed non-vacuity proof for N7 does not reproduce at the commit that ships it

**Severity: medium. Introduced by the range.**

`reviews/ARTIFACTS-round2.md` presents this as the N7 fix's non-vacuity proof, under the heading
"Defect absent - and the non-vacuity proof", explicitly labelled "from the **final** code":

```console
$ rm dist/blackjack-trainer/browser/ngsw-worker.js
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts > "$TMPDIR/case2b.log" 2>&1; echo "EXIT=$?"
EXIT=1
  2 failed
```

At `a3f5dee` that exact command sequence gives the opposite result, because the lane now rebuilds and
the build puts the worker back:

```console
$ md5 -q dist/blackjack-trainer/browser/ngsw-worker.js
84f509c7ab1bf74fe8cd95f1b2551768
$ rm dist/blackjack-trainer/browser/ngsw-worker.js
$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts
R5_EXIT=0
  2 passed (6.8s)
$ ls -la dist/blackjack-trainer/browser/ngsw-worker.js
-rwxr-xr-x  1 arthurzhang  staff  84643 Aug  6 21:53 dist/blackjack-trainer/browser/ngsw-worker.js
```

Three separate statements in the same file are now unreproducible by their own stated method: that
transcript; the sentence "Only the behavioural change was mutated: the bundle is byte-identical to the
one that reported green above", which cannot be true of a lane that rebuilds; the branch-table row
`dist` / worker `no` / `2 failed, exit 1`; and the re-measured case-2 transcript further down.
`a3f5dee` re-committed `reviews/ARTIFACTS-round2.md` with 147 inserted lines
(`git show --stat a3f5dee`) while making that recipe invalid, and the diff hunks are `@@ -197,7 +197,7 @@`
and `@@ -216,3 +216,148 @@` - it never touched the N7 evidence it invalidated.

This is not only a stale transcript.
It marks a real narrowing of what gate 5 can observe.
Before the range, the offline spec's dist-lane assertion caught a served bundle missing its worker for
any reason, including one lost after the build.
After the range it can only catch a worker the _build_ declines to emit, because anything removed from
`dist/` is regenerated before the server starts.
I confirmed the fix still bites in that remaining class, by configuration rather than by file removal
(section 1.3, `R6_EXIT=1`), so N7's RESOLVED status is substantively correct; what is wrong is that the
only recorded reproduction for it is dead, and a reader following the artifact will conclude the fix
regressed.

**How I verified:** ran the recorded command verbatim at the tip against a freshly built `dist/`
(`R5_EXIT=0`, `2 passed`), then re-derived the same red result through `angular.json` (`R6_EXIT=1`,
`2 failed`), restoring `angular.json` from a copy and confirming a clean tracked tree afterwards.

### F2-2 - `reviews/ARTIFACTS-round2.md` points at an N5 re-triage the ledger does not contain

**Severity: low. Introduced by the range.**

The N8 section added by `a3f5dee` ends with:

> N5 is re-triaged and reported rather than fixed - see the ledger.

The ledger contains no re-triage of N5.

```console
$ grep -n "N5" PROD-READINESS.md
173:| **N5** | P2       | Added by REVIEW-pass6 (F6-4). No gate anywhere builds or serves the `--base-href /blackjack-trainer/` bundle ...
290:   | CI/CD workflow files | **report findings only** | N1 and N5 are reported, not applied. Round 1's prohibition is inherited unchanged. |
```

Line 173 is round 1's original row, unchanged by this range.
Line 290 is the only thing the range added about N5, and it records a decision, not a re-triage.
The ROUND 2 terminal-states table - the section whose own preamble says "Severity is re-triaged from
scratch" - contains exactly two rows, N7 and N8, and no N5.

This is the defect class the run itself names R2-2 ("completed-tense claims in this ledger about work
that did not exist yet"), reached once more: a record asserting a deliverable that is not in the tree
at the commit that asserts it.

**How I verified:** `grep -n "N8\|N5\|provisioner" PROD-READINESS.md` and read the full ROUND 2
terminal-states table at `a3f5dee`.

### F2-3 - nothing pins any of the range's three behavioural changes, and only stage 1 says so

**Severity: low. The gap is pre-existing; the missing disclosure for stage 2 is introduced.**

I restored all three changed code files to their pre-range content and ran the two gates that could
plausibly notice.

```console
$ for f in playwright.config.ts e2e/fixtures/lane.ts e2e/smoke/offline.e2e.ts; do git show 7010e8c:$f > $f; done
$ git diff --stat -- playwright.config.ts e2e/fixtures/lane.ts e2e/smoke/offline.e2e.ts
 3 files changed, 16 insertions(+), 46 deletions(-)
$ npm run lint
REVERTED_LINT_EXIT=0
$ E2E_SERVER=dist npm run e2e
REVERTED_E2E_RUN1_EXIT=0
  111 passed (34.8s)
$ E2E_SERVER=dist npm run e2e
REVERTED_E2E_RUN2_EXIT=0
  111 passed (30.3s)
$ E2E_SERVER=dsit npx playwright test e2e/smoke/navigation.e2e.ts
REVERTED_DSIT_EXIT=0
  13 passed (5.9s)
```

Every gate stays green with the entire range's behaviour removed, and the typo silently runs the wrong
lane again.
I also reverted each change individually and got the same answer for each.

Three conditional expressions are involved and in each one only a single branch is reached by any gate:
`SERVES_DIST ? build && serve : ng serve` (CI sets `E2E_SERVER: dist` at `.github/workflows/ci.yml:50`
and nothing runs the other lane), `if (SERVES_DIST) expect(...) else test.skip(...)`, and the
`LANES.includes(requested)` throw, which no gate ever triggers.

`reviews/ARTIFACTS-round2.md` discloses this honestly for stage 1: the F7 row says "A test-only fix
leaves nothing to go red on revert, and CI runs only `E2E_SERVER: dist`, so the serve branch is
exercised by no gate."
The N8 section added by `a3f5dee` carries no equivalent statement, and its "Defect absent - and the
non-vacuity proof" heading is easy to read as a standing guarantee when it is a one-off manual run.
The underlying reason the gap cannot close cheaply is the ledger's own M1, which I reproduced
independently:

```console
$ npx tsc -p tsconfig.e2e.json --noEmit
TSC_E2E_EXIT=2
error TS2688: Cannot find type definition file for 'node'.
$ grep -n '"include"' tsconfig.app.json
9:  "include": ["src/**/*.ts"],
```

M1 is recorded accurately in the ledger, so it is not a finding here, only the evidence that F2-3 has
no cheap fix inside this run's scope.

**How I verified:** the transcript above, run with a clean tree restored afterwards
(`git checkout -- <the three files>`, then `git status --porcelain --untracked-files=no` empty).

### F2-4 - gate 5 is intermittently red for a reason unrelated to anything it is meant to test

**Severity: medium. Pre-existing; the range neither caused nor touched it.**

`e2e/smoke/showdown.e2e.ts:65 post-count showdown > returning to counting keeps the drill going` fails
intermittently.
It failed in 2 of the 7 full-suite runs I made during this review, and in 1 of 24 isolated repeats:

```console
$ E2E_SERVER=dist npx playwright test e2e/smoke/showdown.e2e.ts -g "returning to counting keeps the drill going" --repeat-each=24
FLAKE_EXIT=1
  1 failed
  23 passed (23.3s)
```

The failure is always the same, and is a lost click rather than a wrong assertion:

```console
    Error: expect(locator).toBeHidden() failed
    Locator:  getByRole('region', { name: 'Showdown vs dealer' })
    Expected: hidden
    Received: visible
    Timeout:  5000ms
      - 14 × locator resolved to <section class="showdown" ... aria-label="Showdown vs dealer">…</section>
    > 74 |     await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeHidden();
```

The "Back to counting" button is clicked and the region does not go away within 5 seconds.
This matters to the range's own subject: `reviews/BASELINE-round2.md` and both gate tables in
`reviews/ARTIFACTS-round2.md` record gate 5 as a flat `111 passed`, which reads as deterministic, and
`playwright.config.ts` sets `retries: process.env.CI ? 1 : 0`, so CI will usually paper over a single
occurrence while a local run reports it as a hard failure.
A gate whose green is a coin flip at the margin is the same category of problem the round is about,
approached from the other side.

**How I verified:** the repeat run above, plus 4 clean-tree full-suite runs at `a3f5dee`
(`111 passed` each) and 2 full-suite runs with the range reverted (`111 passed` each) to establish it is
neither introduced by the range nor removed by reverting it, and 2 earlier full-suite runs in which it
failed. I did not fix or touch the test.

### F2-5 - gate 5 now duplicates gate 2, and CI builds twice

**Severity: informational. Introduced by the range and disclosed by it.**

`playwright.config.ts` runs `npm run build` inside `webServer.command`, and
`.github/workflows/ci.yml:46-48` already runs `npm run build` immediately before `npm run e2e`, so CI
builds the bundle twice per run.
`reviews/ARTIFACTS-round2.md` states this plainly under "Cost this adds", including that it is the
cheapest fix available to a run that may not edit workflow files, so I record it only for completeness.
I checked the two ways this could have gone wrong and neither did: a failing build exits fast with the
compiler error rather than hanging to the 120s webServer timeout (section 2), and a cold-cache build
takes 4 seconds here.

### F2-6 - the serve lane keeps N7's exact symptom, and no record names it as that

**Severity: low. Introduced by the range (it is the direct cost of the stage-1 remediation).**

Stage 1's remediation made the serve lane's skip conditional on the worker again.
The consequence is that a _built_ bundle served on the serve lane with no worker skips green - which is
N7's original symptom, unchanged, on that lane:

```console
$ mv dist/blackjack-trainer/browser/ngsw-worker.js "$TMPDIR/ngsw.moved"
$ PORT=4200 node tools/serve-dist.mjs &
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4200/ngsw-worker.js
404
$ env -u CI E2E_SERVER=serve npx playwright test e2e/smoke/offline.e2e.ts
SERVE_NOWORKER_EXIT=0
  2 skipped
```

`README.md` describes the _behaviour_ accurately ("On the other lane a missing worker still skips,
because there it usually means `ng serve`, which registers none by design"), and
`e2e/smoke/offline.e2e.ts`'s comment gives the same reasoning.
Neither record, nor `reviews/ARTIFACTS-round2.md`'s F1 disposition, says that the trade this makes is
to re-admit the exact defect N7 was raised for on the lane where the evidence is ambiguous.
The impact is small - no gate runs the serve lane - and the trade is defensible; what is missing is the
sentence naming it, in a run whose whole standard is that records must not overstate what the code
does.

**How I verified:** the transcript above; `dist/` was restored by moving the worker back and then
rebuilt, and `md5 -q` on the rebuilt file matches `84f509c7ab1bf74fe8cd95f1b2551768`.

---

## 4. Things I could not verify, and what blocked me

- I did not verify the range's behaviour under CI (`CI` set, `workers: 1`, `retries: 1`, `forbidOnly`).
  Everything here ran locally with `CI` unset except where a lane needed it, so my flake rate in F2-4 is
  a local, `workers: undefined` figure and CI's single retry may hide it.
- I did not verify that the `E2E_SERVER` rejection reaches the CI workflow's own invocation, because
  that requires running the workflow. I verified only that `.github/workflows/ci.yml:50` sets
  `E2E_SERVER: dist`, which is one of the two accepted values.
- I did not test `E2E_SERVER=` (set but empty), which `??` treats as present and the new check would
  therefore reject; I have not established whether any invocation in this repository produces that.
- I make no claim that the range introduces no defect anywhere outside the E2E lane. What I did
  establish is that it touches no file under `src/` or `ios/` (`git diff --stat 7010e8c..a3f5dee`), and
  that gates 1-4 and 6-9 are unchanged in both status and figures.
- F2-4's root cause in the application is not diagnosed. I established the failure mode and the rate; I
  did not read the showdown component, and I changed nothing.

---

## 5. Repository state at the end of this review

Measured after the last experiment and before this file was written:

```console
$ git status --porcelain --untracked-files=no
$ git status --porcelain
?? .agents/
?? .codex/
$ md5 -q dist/blackjack-trainer/browser/ngsw-worker.js
84f509c7ab1bf74fe8cd95f1b2551768
$ npm run export:fixtures && git diff --exit-code -- ios/Fixtures
FINAL_FIXTURES_EXIT=0
FINAL_FIXTURE_DIFF_EXIT=0
$ lsof -nP -iTCP:4200 -sTCP:LISTEN
port 4200 free
```

The only file this review wrote is `reviews/REVIEW-round2-stage2.md`, which is untracked and is the
one addition to that listing.
No tracked file was left modified.
