# REVIEW-pass7 - Pass 7 (TESTS)

Independent adversarial review of `0ed9a807f81c6a85845718f4b0f56e489bdb9ab2..3417bfbeebf337e73c128d710b9612c507175a9e`.
Subject: the single commit `3417bfb` "make the dist E2E lane run the server it names", which claims finding **R0-4** RESOLVED.

- Reviewed at `3417bfbeebf337e73c128d710b9612c507175a9e`, branch `prod-readiness/2026-08-10`.
- Stage diff: 3 files, +80/-6 - `playwright.config.ts` (the fix), `reviews/ARTIFACTS.md` (+64, one new entry), `PROD-READINESS.md` (one status row).
- Every transcript below was produced by this reviewer. Nothing in `reviews/ARTIFACTS.md` was accepted as evidence. The "before" half was reconstructed by replaying commit `0ed9a80`'s `webServer` semantics from a temporary config of my own, never by editing the tracked file.
- Sandbox disabled for every gate, per `reviews/BASELINE.md`. Port 4200 was checked with `lsof -nP -iTCP:4200 -sTCP:LISTEN` before and after every server I started, and everything I started I stopped.

## VERDICT: PASS-WITH-FINDINGS

The fix is real, it is the smallest thing that closes R0-4, and it reproduces in both directions.
With `ng serve` holding 127.0.0.1:4200 I got `13 passed` / exit 0 under the pre-fix semantics and a hard exit 1 naming the port under this commit, with the dev server still holding the port and `serve-dist` never started in the first case.
It does not break CI (`CI=true` already disabled reuse, and I re-ran the dist lane in CI mode: green), it does not break the documented local path (`npm run e2e` and `E2E_SERVER=serve` still attach to a running dev server: `13 passed` each), and it does not false-fail on the one machine-local quirk that could have made it do so (a foreign listener on `[::1]:4200` while 127.0.0.1 is free: the dist lane starts its own server and passes).
All nine `reviews/BASELINE.md` gates are green at this commit, five of them beyond what the stage claimed.
No feature was smuggled in, no prohibited action was taken, and the row marked RESOLVED has an artifact that reproduces line for line.

It is not a clean pass for four reasons.

The gate this stage repaired can still report green without exercising what it names, by a second route the stage did not look for: with the built service worker missing from the bundle, `E2E_SERVER=dist npm run e2e` exits 0 with `109 passed, 2 skipped` and the offline claim untested (F7-1, P1, pre-existing, NEXT ROUND).
The stage's gate claim covers four of BASELINE's nine gates - the exact defect `REVIEW-pass6` raised as F6-2 and whose correction is written into the section immediately above this one in the same file (F7-2, P2, introduced here).
The new hard failure is explained only in a code comment, in a repository whose E2E README never mentions `E2E_SERVER` at all, while the message the developer actually sees recommends the one edit that re-opens R0-4 (F7-3, P2, introduced here).
And the mirror of R0-4 is untouched by design and reachable by typo (F7-4, P2, pre-existing, NEXT ROUND), as is the fact that the dist lane never builds what it serves (F7-5, P2, pre-existing, NEXT ROUND).

Nothing in the shipped behaviour needs to change, and I am not asking for the fix to be altered.

---

## Part 1 - The fix, re-verified from both sides

### 1.1 The two servers really are distinguishable, and the "before" really is green

`ng serve --host 127.0.0.1` started by hand, confirmed on the port and confirmed to be the dev server:

```
COMMAND   PID        USER   FD   TYPE   NAME
node    75820 arthurzhang   17u  IPv4   TCP 127.0.0.1:4200 (LISTEN)
vite markers: 1
```

The production bundle's `dist/blackjack-trainer/browser/index.html` contains `@vite/client` 0 times.
That matches `reviews/ARTIFACTS.md:294-296` exactly, and it is the only reason either run below is readable.

Pre-fix semantics (`reuseExistingServer: !process.env.CI`, copied from `git show 0ed9a80:playwright.config.ts`) against that dev server, invoked as the `dist` lane:

```
$ E2E_SERVER=dist npx playwright test --config pw-prefix-review.config.ts e2e/smoke/navigation.e2e.ts
Running 13 tests using 6 workers
  ✓ ... 13 tests ...
  13 passed (8.3s)
BEFORE_DIST_EXIT=0
--- port holder after run ---
node    75820 ... TCP 127.0.0.1:4200 (LISTEN)      # unchanged: still ng serve
vite markers: 1                                    # the suite talked to the dev server
```

The failure R0-4 describes is real and I reproduced it independently, including the specific `13 passed` count in `reviews/ARTIFACTS.md:304`.

### 1.2 The "after" is the failure the artifact records, verbatim

Same dev server still holding the port, this commit's tracked config:

```
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
Error: http://127.0.0.1:4200 is already used, make sure that nothing is running on the
port/url or set reuseExistingServer:true in config.webServer.
AFTER_DIST_EXIT=1
```

Character for character the message at `reviews/ARTIFACTS.md:316-317`.

### 1.3 Could the fix fail where it should pass?

This is the question I was asked to press hardest on. Six configurations, all measured here:

| configuration                                               | result at `3417bfb`            | correct?                        |
| ----------------------------------------------------------- | ------------------------------ | ------------------------------- |
| dist lane, port free                                        | `111 passed (39.2s)`, exit 0   | yes - the release gate is green |
| dist lane, foreign `ng serve` on 127.0.0.1:4200             | exit 1, message names the port | yes - this is the finding       |
| dist lane, foreign listener on `[::1]:4200`, 127.0.0.1 free | `13 passed (9.4s)`, exit 0     | yes - **no false failure**      |
| dist lane in CI mode (`CI=true`), port free                 | `13 passed (13.1s)`, exit 0    | yes - CI unaffected             |
| `E2E_SERVER=serve` with a dev server up                     | `13 passed (27.8s)`, exit 0    | yes - convenience preserved     |
| default lane (no `E2E_SERVER`) with a dev server up         | `13 passed (6.5s)`, exit 0     | yes - convenience preserved     |

The third row is the one that mattered most and it is the one nobody had checked.
This machine's documented port quirk (`ng serve` binding only `[::1]:4200` when another project holds the IPv4 address) could plausibly have turned this fix into a permanent local failure.
It does not, and the reason is in the runner rather than in luck: because `webServer.url` is set rather than `webServer.port`, Playwright's availability probe is an HTTP GET against that exact URL (`node_modules/playwright/lib/runner/index.js:979` → `isURLAvailable`, `node_modules/playwright-core/lib/coreBundle.js:8514-8522`), so a listener on a different interface is invisible to it and `serve-dist`, which binds 127.0.0.1 explicitly, starts normally.

The one configuration where the lane now fails and previously passed is a hand-started `tools/serve-dist.mjs` already on the port - the correct artifact, refused:

```
$ PORT=4200 node tools/serve-dist.mjs &            # vite markers from held server: 0
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
Error: http://127.0.0.1:4200 is already used, ...
DIST_WITH_SERVEDIST_HELD_EXIT=1
```

The refusal is identity-blind, which is inherent: an HTTP probe cannot tell `serve-dist` from anything else answering 200.
I do not count this as a defect. No document in this repository tells anyone to start that server by hand, the failure is loud and names the port, and the alternative is the bug the stage was sent to remove.
It has a cost, it is real, and it is unrecorded: F7-3.

### 1.4 Can the lane still report green without exercising what it names?

Yes, three ways. One of them is serious enough to write up as P1 (F7-1) and all three are pre-existing.
The relevant measurement here, because it is what the fix's own code comment asserts:

```
# whole suite against the dev server, i.e. exactly what a stray `ng serve` bought you
$ E2E_SERVER=serve npm run e2e
  2 skipped
  109 passed (47.5s)
FULL_SUITE_ON_DEV_SERVER_EXIT=0
```

So `playwright.config.ts:43-44` ("would let the whole suite pass green having never started serve-dist or loaded a built file") is accurate: exit 0, no failures.
The only trace the wrong server leaves is `109 passed, 2 skipped` where the right one prints `111 passed`, and nothing in this repository compares those two numbers.
Hold that signature - F7-1 is the same one, arrived at from the other direction.

### 1.5 Does the changed path still fail loudly when it should?

The fix removes a silent success; a fix that swapped it for a silent failure would be worse.
It does not. With the bundle's entry point removed (`dist/` is gitignored; restored byte-identical afterwards, md5 `7f228eeb...` before and after):

```
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
[WebServer]   path: '/Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer/browser/index.html'
[WebServer] Node.js v24.15.0
Error: Process from config.webServer was not able to start. Exit code: 1
MISSING_DIST_EXIT=1
```

Also checked, because `reviews/ARTIFACTS.md:341-343` rests on it: Playwright still does not pipe `webServer` **stdout** without `stdout: 'pipe'` (`node_modules/playwright/lib/runner/index.js:894-896`), while **stderr** is forwarded by default (`:898-901`).
`tools/serve-dist.mjs:67` prints its identifying `serving <root> at ...` line to stdout, so the artifact's statement that no run log distinguishes the two servers is precise as written, and the transcript above is stderr, not a contradiction of it.

---

## Part 2 - Findings

### F7-1 - the repaired gate can still report green without testing what it names

**P1 | pre-existing, NOT a regression from this stage - NEXT ROUND, not the frozen work list | evidence: transcript below, `e2e/smoke/offline.e2e.ts:37` | why the builder missed it: R0-4 was read as a statement about which _server_ answers, and the fix answers that exactly; the suite's other route to a green-but-vacuous run is a conditional skip inside a spec, which no part of the finding pointed at.**

`e2e/smoke/offline.e2e.ts:37` skips both offline tests when no service worker controls the page:

```ts
test.skip(!registered, 'No service worker: run with E2E_SERVER=dist against a built app.');
```

The guard is conditioned on runtime state, not on the lane, so it cannot tell "serve lane, expected" from "dist lane, the built worker is broken".
I removed `ngsw-worker.js` from the built bundle (gitignored; restored afterwards, md5 `84f509c7...` identical) and ran the release gate exactly as `.github/workflows/ci.yml:48-50` runs it:

```
$ E2E_SERVER=dist npm run e2e
  2 skipped
  109 passed (28.7s)
FULL_SUITE_BROKEN_SW_EXIT=0
```

Exit 0. The suite reports success on a production bundle whose service worker never registered - which is the app's headline offline/installable claim, the subject of this run's own W2, and a claim no unit test can reach (the spec's own comment says so).
Note the output is `109 passed, 2 skipped`: byte-identical in shape to what a stray `ng serve` produced in Part 1.4.
The comment at `e2e/smoke/offline.e2e.ts:27-28` ("Skipped, never silently passed") is true of the test and false of the suite: at the level anyone reads - the exit code and the summary line - a skip is a pass.

I rate this P1 on the ledger's own precedent: R0-4 was rated P1 for being an undiagnosable release gate that fails green, and this is the same gate failing green for a different reason. Restored and re-verified: `2 passed (2.3s)` with the worker back.
The counter-argument for P2 is that it needs a wholesale registration failure rather than a subtle one; I record it and still say P1, because a wholesale registration failure is precisely the regression nobody would catch any other way.

### F7-2 - the stage's gate claim covers four of nine, one section after the same correction was accepted

**P2 | introduced by this stage | evidence: `reviews/ARTIFACTS.md:348` against `reviews/ARTIFACTS.md:279-284` and `reviews/REVIEW-pass6.md:214-226` | why the builder missed it: the correction was applied to the artifact under review at the time rather than to the practice, and nothing in the ledger carries a review's instruction forward to the next stage.**

This stage's artifact ends: "Gates: lint 0, build 0 (same single inherited budget warning), 1533 unit tests, E2E 111." Four gates.
`reviews/BASELINE.md:229-237` defines "not worse than baseline" over nine, including the coverage floors and the fixture anti-drift gate that CI enforces.

The entry immediately above it in the same file - W1's, the previous stage's - closes at `:279-280` with: "All nine BASELINE gates were re-run with the fix in place, **not only the four the first version of this entry listed (REVIEW-pass6 F6-2)**".
So the identical finding was raised last pass, accepted, and written into this very file - and the next artifact appended below it repeats the original four-gate claim.

I ran the five unclaimed gates. All green (Part 4), so the omission cost nothing again.
It is still a gap, and it is a worse gap than F6-2 was, because this time the record shows the author had already been told.

### F7-3 - the failure the stage installs is documented only where the person hitting it will not look

**P2 | introduced by this stage | evidence: `e2e/README.md:13-25`, `playwright.config.ts:40-47`, plus the refusal transcript in Part 1.3 | why the builder missed it: the reasoning was written into the config comment, which is the right place for _why_ the line is what it is, and the question of what the developer sees at the moment it fires was never asked.**

`e2e/README.md` is the repository's only how-to-run-E2E document, and it does not contain the string `E2E_SERVER` anywhere.
Lines 22-25 tell a developer the config "reuses a dev server you already have running locally" and that the production bundle is used "In CI (`CI` set)" - a description that never mentions the local dist lane, and therefore never mentions the one lane whose behaviour just changed.

What that developer sees instead is Playwright's canned text: "make sure that nothing is running on the port/url or **set reuseExistingServer:true in config.webServer**".
That instruction, followed literally, restores R0-4 exactly - and the fix's own comment (`playwright.config.ts:40-47`), which explains why not to, is in the file the message just told them to edit but is not in the message.
The situations that trigger it are ordinary: an interrupted dist run leaving `serve-dist` orphaned, a second dist run in another terminal, a `playwright test --ui` session holding the port, or this machine's documented foreign 4200 listener.

Nothing in the code needs to change. One sentence in `e2e/README.md` naming `E2E_SERVER=dist`, saying the port must be free for it, and saying not to set `reuseExistingServer` would close it; recording it as an accepted cost in the artifact would also close it. Silence is what I object to.

### F7-4 - the mirror of R0-4 is untouched, and one keystroke routes you into it

**P2 | pre-existing, NOT a regression - NEXT ROUND | evidence: transcript below, `playwright.config.ts:9` | why the builder missed it: the finding named the dist lane and the fix closed the dist lane; the deliberate decision to leave the serve lane reusing is stated in the comment, but the two ways a dist-lane _intent_ still lands in the serve lane are not.**

The serve lane still attaches to whatever answers, including the production server:

```
$ PORT=4200 node tools/serve-dist.mjs &            # vite markers: 0
$ E2E_SERVER=serve npx playwright test e2e/smoke/navigation.e2e.ts
  13 passed (4.4s)                                  SERVE_LANE_ON_DIST_EXIT=0
```

`ng serve` never started; the lane named `serve` ran against the production bundle. That is R0-4 with the servers swapped, and it is a deliberate trade - the fix's comment says the serve lane is "where the thing you have running is the thing under test", which is exactly the assumption that is false here.

The sharper edge is the selector. `playwright.config.ts:9` is `(process.env.E2E_SERVER ?? (...)) === 'dist'` with no validation and no rejected-value branch, so `E2E_SERVER=Dist`, `E2E_SERVER=dist ` or `E2E_SERVER=production` silently select the **serve** lane, which reuses, which is R0-4's symptom reached by typo in the very variable the gate keys on.
The expression is character-identical to the pre-fix one, so this is not a regression; the refactor into a named constant neither introduced nor addressed it.

### F7-5 - the dist lane serves a bundle it never builds

**P2 | pre-existing, NOT a regression - NEXT ROUND | evidence: `package.json:16`, `.github/workflows/ci.yml:46-48`, mtime observation below | why the builder missed it: R0-4's phrasing is "never running the production bundle", and after the fix a green dist run does prove `serve-dist` ran - it does not prove what `serve-dist` served was built from the working tree.**

`"e2e": "playwright test"` has no build step, and the dist `webServer` command is `node tools/serve-dist.mjs`, which reads whatever is in `dist/`.
CI builds first (`.github/workflows/ci.yml:46-47`), so the release gate proper is sound; locally nothing enforces it.
`dist/blackjack-trainer/browser/index.html` kept the 20:45 mtime of my one explicit `npm run build` across every E2E run in this review, so no run rebuilt anything.

The consequence is narrower than R0-4 and I rate it P2 for that reason: a stale local green describes a real production bundle, just possibly last week's.
It is worth recording because it is what remains of "a gate reporting on an artifact it did not run": the artifact is now guaranteed to have been served by a server Playwright started, and still not guaranteed to be the current build.
It also overlaps `PROD-READINESS.md:168` N5 (no base-href lane) - whoever picks either up should read them together.

---

## Part 3 - The checks I was required to make

**Fabricated or unreproducible findings.** None found. Every load-bearing number in the new artifact reproduced here: `13 passed` / exit 0 before, the verbatim refusal and exit 1 after, `13 passed` for the serve lane, `111 passed` for the full dist lane, 1 vs 0 `@vite/client` markers, and 1533 unit tests. The timings differ (mine are slower); nothing else does.

**Evidence citations that do not say what they are claimed to say.** None. I checked the three that carry weight. `reviews/ARTIFACTS.md:337` ("CI is unaffected: `CI=true` already disabled reuse for both lanes") is true by inspection of `!process.env.CI && !SERVES_DIST` and confirmed by running the dist lane with `CI=true`. `reviews/ARTIFACTS.md:341-343` (stdout not piped) is true of stdout specifically, which is where `serve-dist`'s identifying line goes. `reviews/ARTIFACTS.md:344-346` ("if a dist run succeeded, Playwright started serve-dist itself") holds under adversarial reading: a foreign server answering 2xx-3xx triggers the refusal, and one answering 4xx/5xx or nothing lets Playwright launch `serve-dist`, which then dies on `EADDRINUSE` and surfaces as the loud startup error in Part 1.5. The sentence is about the process, not the bytes - F7-5 is the gap it leaves, not a misquotation.

**Severity inflation or deflation.** The one status change is R0-4, whose P1 rating was set in Review 0 and is not touched here; my own Part 1.4 measurement (`109 passed, 2 skipped`, exit 0 against the dev server) confirms the "fails green" characterisation that P1 rested on, so it was not inflated. Of my findings, F7-1 is the only one above P2 and I have stated the counter-argument for P2 in it.

**Features smuggled in under the no-features rule.** None. The diff changes one boolean expression and hoists an existing one into a named constant. No new env var (`E2E_SERVER` predates the run and is read by `.github/workflows/ci.yml:50`), no new flag, script, endpoint, screen, table or column. `package.json` is untouched.

**Prohibited actions.** None. `git diff --name-only 0ed9a80..3417bfb` returns three files, none of them a workflow, deploy, infrastructure, dependency or lockfile - `git diff --stat 0ed9a80..3417bfb -- package.json package-lock.json .github/` is empty. `playwright.config.ts` is test configuration consumed by CI but not a CI definition, and Review 0 ruled a fix there permitted; I confirmed the change is a no-op under `CI=true` in both directions, so nothing about it "takes effect on merge". `git branch -vv` shows `prod-readiness/2026-08-10` with no upstream and `main` still at `fc7d0c3` `[origin/main: ahead 24]`, which predates the run - nothing was pushed. Every `commit (amend)` and `reset` in `git reflog` is dated 2026-08-06 or earlier; every entry from `b43f9ba` forward is a plain `commit:`. Both tags survive. No file was deleted except two I created. Every URL touched by this review is 127.0.0.1 or `[::1]`.

**Fixes that relocated a bug rather than removed it.** No, with one qualification I have written up rather than swallowed. For the dist lane the silent reuse is removed, not moved: there is no fallback, no retry, no alternate port. The serve lane keeps it, which is the same behaviour it always had and is stated in the comment - F7-4 records that the decision leaves a reachable path to the same symptom, but the fix did not put it there.

**Error handling that hides errors.** No - the change converts a silent success into a hard error, and I verified the neighbouring failure mode did not become silent in exchange (Part 1.5: a broken bundle still exits 1 with the server's own stderr attached). The diff adds no `catch`.

**Verification that does not actually exercise the changed path.** The stage's own verification does exercise it: the refusal, the free-port dist run and the serve lane are the three branches of the changed expression, and the fourth (`CI=true`) is a no-op the artifact reasons about correctly. I re-ran all four plus the IPv6 case. Against the wider question - does the gate exercise what it names - the honest answer is F7-1 and F7-5.

**Anything marked resolved without an artifact.** No. R0-4 is the only status change (`PROD-READINESS.md:210`, `pending` → `RESOLVED`), its artifact is `reviews/ARTIFACTS.md:288-348`, and it reproduces. The frozen work-list row at `PROD-READINESS.md:101` still cites `playwright.config.ts:37`, which after the fix is a different line; that is correct behaviour, not a defect - the row records the pre-fix state and `REVIEW-pass4` (F4-6) established that rewriting the frozen list is the thing to avoid.

---

## Part 4 - Gates re-run by this reviewer at `3417bfb`

Sandbox disabled for all of them. Port 4200 confirmed free before each E2E run and after each server I started.

| Gate                        | Result at `3417bfb`                                               | BASELINE                 | Verdict           |
| --------------------------- | ----------------------------------------------------------------- | ------------------------ | ----------------- |
| Web lint                    | `LINT_EXIT=0`, "All matched files use Prettier code style!"       | 0                        | same              |
| Web build                   | `BUILD_EXIT=0`, one budget warning on `chart-page.component.scss` | 0, same single warning   | same              |
| Web unit tests              | 65 files, 1533 passed                                             | 1526 passed              | better (+7)       |
| Web coverage gate           | `COV_EXIT=0`, stmts 96.11 / br 93.23 / fn 93.28 / lines 97.97     | floors 94 / 92 / 90 / 96 | above every floor |
| Web E2E (`E2E_SERVER=dist`) | `FULL_DIST_EXIT=0`, 111 passed (39.2s), port confirmed free       | 111 passed               | same              |
| Parity fixture anti-drift   | `EXPORT_EXIT=0`, `FIXTURE_DIFF_EXIT=0`                            | 0 / 0                    | same              |
| iOS format lint             | `SWIFTFORMAT_EXIT=0`, 0/105 files require formatting              | 0/105                    | same              |
| iOS lint                    | `SWIFTLINT_EXIT=0`, no output                                     | no violations            | same              |
| iOS build + test            | `** TEST SUCCEEDED **`, 335 tests in 38 suites                    | 335 tests                | same              |

iOS status read from the `** TEST SUCCEEDED **` marker, not from a `PIPESTATUS` variable, as BASELINE instructs.
`git diff fc7d0c3..HEAD -- ios/` is empty for the whole run, so the three iOS gates could not have moved; I ran them anyway.

Experiments and their restoration, disclosed in full:

- Two temporary Playwright configs of my own, both deleted. The first was written under `test-results/`, which Playwright wipes as its output directory at the start of a run - it deleted my config mid-run and produced one garbage transcript, which I discarded and re-ran from the repository root. Nothing tracked was touched either time.
- Two files inside the gitignored `dist/` tree were moved aside and moved back: `ngsw-worker.js` (md5 `84f509c7ab1bf74fe8cd95f1b2551768` before and after) and `index.html` (md5 `7f228eebbf83bb039dd5871017d97ebc` before and after). The tree was rebuilt at the start of this review with `npm run build`, and after restoration `e2e/smoke/offline.e2e.ts` passes 2/2 and the full dist suite passes 111.
- Servers started and stopped by me: `ng serve` twice, `tools/serve-dist.mjs` once, one throwaway `[::1]:4200` listener. `lsof -nP -iTCP:4200 -sTCP:LISTEN` is empty at the end of this review.

Working tree at the end: `git status --short` shows only the untracked `.agents/` and `.codex/` that were there at BASELINE, plus this file.

---

## Part 5 - For NEXT ROUND, not this run's work list

**F7-1 | P1 | the dist lane exits 0 with the offline claim untested when the built service worker does not register.**
Reproduced above (`109 passed, 2 skipped`, exit 0). Pre-existing: the skip guard predates this run and this stage did not touch it.
Closing it means making the skip conditional on the lane rather than on runtime state, which is a change to test code beyond any frozen finding.
It should be read next to `PROD-READINESS.md:168` N5 and F7-5: three different ways the same suite can be green about something it did not do.

**F7-4 | P2 | the serve lane still borrows any server, and any `E2E_SERVER` value that is not exactly `dist` silently selects it.**
Evidence in the finding. Pre-existing and unchanged by this stage.

**F7-5 | P2 | the dist lane never builds what it serves, so a local green can describe a stale bundle.**
Evidence in the finding. Pre-existing; CI is not affected because it builds first.

---

## Part 6 - What must happen before this stage can be called closed

1. Nothing in `playwright.config.ts` needs to change. The fix is correct, minimal, verified in six configurations, and it does not fail anywhere it should pass.
2. Extend `reviews/ARTIFACTS.md:348` to the full BASELINE set, or name in one clause which gates were not run and why (F7-2). The correction is already written into the entry above it at `:279-280`; this is the second time it has been asked for.
3. Record the cost of the refusal somewhere a developer will meet it - one sentence in `e2e/README.md` naming `E2E_SERVER=dist`, the free-port precondition, and "do not set `reuseExistingServer`" - or state in the artifact that the cost is accepted and undocumented on purpose (F7-3).
4. Add F7-1, F7-4 and F7-5 to NEXT ROUND. None of them belongs in the frozen work list: all three are pre-existing, and none is a regression from this stage's own changes.
5. Do not act on F7-1 in this run. Making the offline skip lane-aware is test-infrastructure work beyond any frozen finding, and rushing it into a stage that is otherwise clean would repeat the pattern the ledger has been rejecting since Review 0.
