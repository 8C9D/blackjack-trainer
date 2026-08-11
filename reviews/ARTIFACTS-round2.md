# ARTIFACTS - round 2

Evidence for every round-2 finding that reached a terminal state.
A finding is RESOLVED only with an artifact here showing the defect **present** and then **absent**,
produced by running the thing rather than by reading the code.
Each fix also carries a non-vacuity proof: mutate only the behavioural change and show the suite goes red.

Baseline for every "before" figure: [`reviews/BASELINE-round2.md`](BASELINE-round2.md).

---

## N7 - the offline gate skips itself on the evidence it exists to report

`e2e/smoke/offline.e2e.ts:37` (round-1 line numbering) decided whether to run from **runtime state**:

```ts
const registered = await page.waitForFunction(() => navigator.serviceWorker.controller !== null, ...)
  .then(() => true).catch(() => false);
test.skip(!registered, 'No service worker: run with E2E_SERVER=dist against a built app.');
```

"No worker took control" has two causes and this could not tell them apart:

1. the dev-server lane, which registers no worker by design (`provideServiceWorker({ enabled: !isDevMode() })`) - a legitimate skip; and
2. the production bundle having shipped **without its service worker** - the exact defect the suite exists to catch.

### Defect present

The whole offline/PWA claim goes untested, green, with the worker deleted from the bundle that
`tools/serve-dist.mjs` serves:

```console
$ mv dist/blackjack-trainer/browser/ngsw-worker.js "$TMPDIR/ngsw-worker.js.removed"
$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory

$ E2E_SERVER=dist npm run e2e
  ...
  2 skipped
  109 passed (47.6s)
$ echo $?
0
```

Exit **0**. Nothing compares `109` to the 111 recorded in `reviews/BASELINE-round2.md`, so the count
carries no signal either. This reproduces REVIEW-pass7's F7-1 independently.

### Fix

The lane decision moved to one place, `e2e/fixtures/lane.ts`, imported by both `playwright.config.ts`
and the spec, so neither can disagree with the other about which lane is running. What a missing
worker _means_ then depends on the lane, and the two readings are opposites:

```ts
if (SERVES_DIST) {
  expect(
    registered,
    'no service worker took control of the page: the built bundle must ship and register ngsw-worker.js',
  ).toBe(true);
} else {
  test.skip(!registered, 'No service worker on this lane: nothing to test.');
}
```

The first version of this fix skipped on the **lane** alone
(`test.skip(!SERVES_DIST, ...)`). REVIEW-round2-stage1 (F1) proved that narrowed coverage: the serve
lane reuses whatever already holds port 4200, so pointing it at a built bundle used to run the offline
suite for real, and the lane-only skip turned that from `2 passed` into `2 skipped`. The form above
keeps the dist lane's hard failure while leaving the serve lane opportunistic. See the remediation
section below.

### Defect absent - and the non-vacuity proof

Same mutation, same command, after the fix. Only the behavioural change was mutated: the bundle is
byte-identical to the one that reported green above.

> **This transcript stopped reproducing two commits later, and is kept only as the record of what was
> true at `e3f8cba`.** Stage 2 made the dist lane rebuild before serving, so deleting a file from
> `dist/` is undone before the suite runs: the same commands now give `2 passed`, exit 0. Found by
> REVIEW-round2-stage2 (F2-1). The proof that holds at the current tip is in
> "[Re-derived non-vacuity proof](#re-derived-non-vacuity-proof-valid-at-the-current-tip)" below;
> this one is left in place rather than quietly deleted, because a record that was accurate when
> written and later invalidated by a different change is worth being able to see.

```console
$ rm dist/blackjack-trainer/browser/ngsw-worker.js
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts > "$TMPDIR/case2b.log" 2>&1; echo "EXIT=$?"
EXIT=1

  2) [chromium] › e2e/smoke/offline.e2e.ts:88:7 › offline › the shell itself still routes offline ──

    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      55 |         registered,
      56 |         'no service worker took control of the page: the built bundle must ship and register ngsw-worker.js',
    > 57 |       ).toBe(true);
         |         ^
      58 |     } else {
      59 |       test.skip(!registered, 'No service worker on this lane: nothing to test.');
      60 |     }
        at /Users/arthurzhang/dev/blackjack-trainer/e2e/smoke/offline.e2e.ts:57:9

  2 failed
```

Exit **1**, and the message names the cause rather than leaving a 15-second timeout to be interpreted.

### Re-derived non-vacuity proof, valid at the current tip

Because the dist lane now rebuilds, the mutation has to be one the rebuild cannot undo - so it is made
in the thing that decides whether a worker is emitted at all, `angular.json`'s production
`serviceWorker` key, rather than in the build output:

```console
$ python3 -c "...delete configurations.production.serviceWorker from angular.json..."
before: ngsw-config.json
serviceWorker key removed

$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts > "$TMPDIR/n7-mut.log" 2>&1; echo "MUTANT_EXIT=$?"
MUTANT_EXIT=1
  2 failed
    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js

$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory
```

and green again once `angular.json` is restored and rebuilt:

```console
$ cp "$TMPDIR/angular.json.orig" angular.json && git status --porcelain --untracked-files=no
(no output)
$ npm run build ; echo "build exit=$?"
build exit=0
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts ; echo "GREEN_EXIT=$?"
GREEN_EXIT=0
  2 passed (4.7s)
```

**What stage 2 narrowed, stated plainly.** Gate 5 can now only catch a worker the _build declines to
emit_. A worker present at build time and lost afterwards - say by the `cp -R` in
`.github/workflows/pages.yml:41` - is no longer reachable by this gate, because the lane rebuilds
before it looks. In CI that case never existed anyway (`ci.yml` builds immediately before the E2E
step, so the bundle was always fresh there); the change makes local runs behave the way CI already
did. It is still a narrowing and is recorded as one rather than left for a reader to discover.

### Every branch exercised by hand - not by a gate

The decision keys on two inputs (which lane, whether a worker turned up), so all four reachable
combinations were run rather than only the new one - round 1's FF-2 lesson, and the case that caught
F1 below.

Read the word "exercised" strictly. Only the first two rows are pinned by a gate: CI sets
`E2E_SERVER: dist` (`.github/workflows/ci.yml:50`) and nothing runs the `serve` lane there, so rows
three and four are manual observations that no gate would reproduce. An earlier version of this
heading said "asserted", which overstated a by-hand run as a test (REVIEW-round2-stage1, F7).

| lane                     | worker present? | before (round-2 baseline)      | after                  |
| ------------------------ | --------------- | ------------------------------ | ---------------------- |
| `dist`                   | yes             | 111 passed, exit 0             | **111 passed, exit 0** |
| `dist`                   | **no**          | 109 passed + 2 skipped, exit 0 | **2 failed, exit 1**   |
| `serve`, `ng serve`      | no, by design   | 2 skipped, exit 0              | **2 skipped, exit 0**  |
| `serve`, on a built copy | yes             | 2 passed, exit 0               | **2 passed, exit 0**   |

Run one after another in this order. The exit codes printed inline by that script are `tail`'s, not
Playwright's - the same class of mistake as reading `xcodebuild` through `PIPESTATUS` in zsh - so
case 2's status was re-measured unpiped below:

```console
########## CASE 4: serve lane pointed at a BUILT bundle (worker present) ##########
--- who holds 4200 ---
node    73519 arthurzhang   12u  IPv4 ...      0t0  TCP 127.0.0.1:4200 (LISTEN)
  ✓  1 [chromium] › offline › installing caches every card, so a drill deals a readable hand offline (1.3s)
  ✓  2 [chromium] › offline › the shell itself still routes offline (1.3s)
  2 passed (2.0s)

########## CASE 3: serve lane, ng serve (no worker registered) ##########
  2 skipped

########## CASE 2: dist lane, worker DELETED ##########
  2 failed

########## CASE 1: dist lane, worker restored, FULL suite ##########
  111 passed (46.4s)
```

```console
$ rm dist/blackjack-trainer/browser/ngsw-worker.js
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts > "$TMPDIR/case2.log" 2>&1; echo $?
1
$ grep -E "^  [0-9]+ (failed|passed|skipped)" "$TMPDIR/case2.log"
  2 failed
```

### What this does not fix

A dist-lane run cannot skip this suite through the spec's own condition, because that branch asserts
instead of skipping. That is **not** the same as "impossible by construction", which is what an earlier
version of this section claimed. REVIEW-round2-stage1 (F4) showed that a one-character edit to
`e2e/fixtures/lane.ts` makes the dist lane resolve to the serve lane, after which the suite skips and
the run reports `109 passed`, exit 0, with the worker present. Nothing in this repository compares the
E2E count against an expected total, and no gate typechecks `e2e/fixtures/lane.ts` at all. Both are
recorded as open rather than claimed as covered.

### A false statement this change would otherwise have left behind

`README.md:519` described the old behaviour: the spec "runs against `E2E_SERVER=dist` and skips rather
than silently passing where no worker is registered". After the fix that is wrong - in the dist lane a
missing worker fails. The sentence was rewritten in the same commit. Round 1 shipped two records that
had drifted from the code this way (F2-2 / F4-1); this is the same class of defect caught before commit
rather than after.

### Remediation after REVIEW-round2-stage1

The reviewer returned PASS-WITH-FINDINGS on `0856b7d..7010e8c` with seven findings. Disposition, in
the reviewer's numbering:

| id  | severity               | disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | medium, **introduced** | **Regression, fixed.** The lane-only skip narrowed coverage: a `serve`-lane run against a built bundle went from `2 passed` to `2 skipped`. The skip is now conditional on the worker in the serve lane and on nothing in the dist lane, where it asserts. Re-verified as case 4 above. The false absolute claim it rested on ("the only case that skips") is struck from `README.md` and from this file.                                                           |
| F2  | medium, introduced     | **Corrected.** The ledger said an exact N1 patch "is recorded"; none existed yet. The sentence is removed; the patch is delivered in stage 4 and the ledger will say so only once it is there.                                                                                                                                                                                                                                                                      |
| F3  | medium, introduced     | **Corrected.** The ledger said the I1 provisioner note "is written where a provisioner will look"; nothing had been written. Same fix: the claim is gone, the note lands in stage 4.                                                                                                                                                                                                                                                                                |
| F4  | low                    | **Accepted, claim corrected.** "Impossible by construction" was circular. Rewritten above to say exactly what does and does not hold.                                                                                                                                                                                                                                                                                                                               |
| F5  | low, pre-existing      | **Accepted, recorded as NEXT ROUND.** `e2e/**` is outside every typechecking gate, and `lane.ts` is now the single source of truth for lane selection. Reproduced independently: `npx tsc -p tsconfig.e2e.json --noEmit` exits 2 on `error TS2688: Cannot find type definition file for 'node'` - `@types/node` is not a dependency, so the config that would check `e2e/` cannot even run. Closing it needs a dependency addition, which this run's scope forbids. |
| F6  | low                    | **Fixed.** `e2e/README.md`'s layout tree now lists `lane.ts` (and `flows.ts`, which it had also been missing).                                                                                                                                                                                                                                                                                                                                                      |
| F7  | info                   | **Accepted, no action.** A test-only fix leaves nothing to go red on revert, and CI runs only `E2E_SERVER: dist`, so the serve branch is exercised by no gate. Recorded as a limit of this fix, not repaired.                                                                                                                                                                                                                                                       |

F2 and F3 are the same defect twice: writing a completed-tense claim about work not yet done. That is
the failure mode round 2's brief names third ("never assert an incident you did not observe, or a
negative capability you did not test"), reached from the other direction - asserting a _positive_
deliverable that did not exist. Both are struck rather than back-filled, so nothing in the ledger
describes work that is not in the tree at the commit that describes it.

Two of the reviewer's "could not verify" notes are answerable and neither changes a verdict: the gate
table below was re-run after the artifacts were written (that is the ordering this section is written
in, and it is the reason R0-1 could not recur here); and the before/after bundle was byte-identical
because only `ngsw-worker.js` was moved aside and moved back, never rebuilt between the two runs.

### Gates after stage 1 (superseded by the stage 2 table below, kept as the record of this stage)

All nine, re-run **after** the artifacts above were written and after the F1 remediation (round 1's
R0-1 was caused by re-running them before):

| gate                          | round-2 BASELINE              | after stage 1                 |
| ----------------------------- | ----------------------------- | ----------------------------- |
| `npm run lint`                | 0                             | 0                             |
| `npm run build`               | 0, 1 budget warning           | 0, same 1 budget warning      |
| `npm test`                    | 1533 passed                   | 1533 passed                   |
| `npm run test:coverage`       | 96.11 / 93.23 / 93.28 / 97.97 | 96.11 / 93.23 / 93.28 / 97.97 |
| `E2E_SERVER=dist npm run e2e` | 111 passed                    | 111 passed                    |
| fixture anti-drift            | no drift                      | no drift                      |
| `swiftformat --lint`          | 0                             | 0                             |
| `swiftlint`                   | 0                             | 0                             |
| `xcodebuild build test`       | TEST SUCCEEDED, 335           | TEST SUCCEEDED, 335           |

Unit and iOS counts are unchanged because the change is confined to the E2E lane; the E2E count is
unchanged because the fix alters _when the suite refuses to run_, not what it asserts when it does.

---

## N8 - the E2E lane selection accepts a typo and never builds what it serves

Three gaps were recorded. Two are closed here; the third is deliberately kept.

| gap                                                                      | disposition                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| (a) the `serve` lane attaches to whatever holds 4200                     | **kept on purpose** - see "the gap that stays open" below             |
| (b) any `E2E_SERVER` value other than `dist` silently selects `serve`    | **closed** - the value is validated and an unknown one aborts the run |
| (c) the `dist` lane never builds what it serves, so `dist/` can be stale | **closed** - the lane builds first                                    |

### (b) Defect present: a typo silently swaps the lane

`E2E_SERVER` was read as `=== 'dist'`, so every other string meant "serve". A misspelling selects the
dev-server lane while the operator believes they are testing the production bundle - which is R0-4's
symptom (a suite green against a server it never meant to test) reached through the variable the lane
keys on. `.github/workflows/ci.yml:50` sets this value, so a typo there is a CI-wide silent lane swap.

```console
$ E2E_SERVER=dsit npx playwright test e2e/smoke/navigation.e2e.ts
N8B_BEFORE_EXIT=0
  13 passed (7.4s)
```

Green, on the wrong lane, with nothing in the output naming the lane.

### (b) Defect absent

```console
$ E2E_SERVER=dsit npx playwright test e2e/smoke/navigation.e2e.ts
N8B_AFTER_EXIT=1
Error: E2E_SERVER must be one of 'dist' | 'serve', got 'dsit'. Unset it to take the default ('dist' under CI, otherwise 'serve').
```

Exit **1**, no tests run, and the message says what the legal values are. Both legal values still work
(the other branch of the new condition, so it is not left unexercised):

```console
$ E2E_SERVER=serve npx playwright test e2e/smoke/navigation.e2e.ts
E2E_SERVER=serve EXIT=0
  13 passed (6.3s)
```

### (c) Defect present: green against a bundle built from different source

Two independent demonstrations, both at the pre-fix commit.

**A build simply never happened.** A marker file dropped into the served directory survives the run:

```console
$ echo "stale-marker" > dist/blackjack-trainer/browser/STALE-MARKER.txt
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
N8C_BEFORE_EXIT=0
  13 passed (4.1s)
$ ls -la dist/blackjack-trainer/browser/STALE-MARKER.txt
-rw-r--r--  1 arthurzhang  staff  13 Aug 11 00:16 dist/blackjack-trainer/browser/STALE-MARKER.txt
```

Present afterwards, so `ng build` (which cleans its output directory) never ran.

**And the consequence.** `src/app/app.routes.ts:10` was edited to a title no build had ever produced,
with `dist/` deliberately left alone:

```console
$ sed -i '' "s/title: 'Blackjack Trainer',/title: 'STALE PROOF TITLE',/" src/app/app.routes.ts
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
N8C_STALE_EXIT=0
  13 passed (4.7s)
```

The gate named after the production bundle reported green on source that no longer says what the gate
just verified.

### (c) Defect absent - and the non-vacuity proof

The lane now runs `npm run build && PORT=4200 node tools/serve-dist.mjs`. Same two demonstrations,
same commands, only the behavioural change mutated:

```console
$ echo "stale-marker" > dist/blackjack-trainer/browser/STALE-MARKER.txt
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
N8C_AFTER_EXIT=0
  13 passed (7.8s)
$ ls -la dist/blackjack-trainer/browser/STALE-MARKER.txt
ls: dist/blackjack-trainer/browser/STALE-MARKER.txt: No such file or directory
```

The marker is gone, so a build ran. And with the same source edit as before:

```console
$ sed -i '' "s/title: 'Blackjack Trainer',/title: 'STALE PROOF TITLE',/" src/app/app.routes.ts
$ E2E_SERVER=dist npx playwright test e2e/smoke/navigation.e2e.ts
N8C_STALE_AFTER_EXIT=1
  2 failed
  11 passed (11.4s)
    Expected pattern: /^Blackjack Trainer$/
    Received string:  "STALE PROOF TITLE"
```

`13 passed / exit 0` became `2 failed / exit 1`, and the failure quotes the source's actual value.
`src/app/app.routes.ts` was restored from a copy afterwards and
`git status --porcelain --untracked-files=no` showed only the two intended stage-2 files.

### The gap that stays open, on purpose

(a) is not a defect and is not fixed: the `serve` lane reusing a server you already have running is
the documented point of that lane, and after stage 1's remediation it is also what lets a `serve`-lane
run against a built bundle exercise the offline suite for real. Round 1 already made the **dist** lane
refuse to borrow a port (R0-4), which is the case where borrowing is wrong.

### What this does not close: N5

N5 is the separate finding that no gate builds or serves the `--base-href /blackjack-trainer/` bundle
that `.github/workflows/pages.yml:37` actually deploys. This stage makes the dist lane build **the
root-href bundle** it serves; it does not make any gate build the deployed one. N5 is not closed by
this stage and this stage records no verdict on it; its re-triage and terminal state are stage 4's
work.

### What a revert of this stage would cost - nothing that any gate reports

Reverting all three changed files leaves `npm run lint` at exit 0 and `E2E_SERVER=dist npm run e2e` at
`111 passed`, with `E2E_SERVER=dsit` silently green again (REVIEW-round2-stage2, F2-3, reproduced by
the reviewer). Both changes here are gate-hardening: they alter the conditions under which a gate
refuses, and no gate asserts those conditions. That is the same disclosure the N7 section makes, and
it applies to this stage too.

### The trade stage 1's remediation made, named

Restoring the serve lane's opportunistic behaviour re-admits N7's own symptom **on that lane**: point
the serve lane at a built bundle whose worker is missing and the suite reports `2 skipped`, exit 0
(REVIEW-round2-stage2, F2-6). The trade is deliberate and rests on one fact - the serve lane is not a
release gate. CI sets `E2E_SERVER: dist` (`.github/workflows/ci.yml:50`) and never runs the serve
lane, so the lane that can still skip is the one whose result nothing depends on, and the lane whose
result CI reads cannot skip at all. The serve lane is opportunistic, never authoritative.

### Cost this adds

Every `E2E_SERVER=dist` run now pays for a build (measured: the navigation spec went from 4.1s to
7.8s wall clock). CI already runs `npm run build` before `npm run e2e`
(`.github/workflows/ci.yml`), so CI now builds twice. That is a few seconds against a gate that
could previously report on an artifact from another commit, and it is the cheapest form of the fix
that does not require editing a workflow file this run may only report on.

### Gates after stage 2

All nine, re-run after the artifacts above were written:

| gate                          | round-2 BASELINE              | after stage 2                 |
| ----------------------------- | ----------------------------- | ----------------------------- |
| `npm run lint`                | 0                             | 0                             |
| `npm run build`               | 0, 1 budget warning           | 0, same 1 budget warning      |
| `npm test`                    | 1533 passed                   | 1533 passed                   |
| `npm run test:coverage`       | 96.11 / 93.23 / 93.28 / 97.97 | 96.11 / 93.23 / 93.28 / 97.97 |
| `E2E_SERVER=dist npm run e2e` | 111 passed                    | 111 passed                    |
| fixture anti-drift            | no drift                      | no drift                      |
| `swiftformat --lint`          | 0                             | 0                             |
| `swiftlint`                   | 0                             | 0                             |
| `xcodebuild build test`       | TEST SUCCEEDED, 335           | TEST SUCCEEDED, 335           |

The E2E gate now builds before it serves, and still reports 111 - the added build changed what the
lane is looking at, not what it asserts.

---

## N3 - nothing tested the tools that back two release gates

`tools/` held two scripts and no tests. Both back gates:

- `tools/export-parity-fixtures.ts` generates the fixtures the **iOS parity anti-drift gate** compares
  against, and that the Swift test target asserts its engines reproduce.
- `tools/serve-dist.mjs` is the server the **E2E gate** runs the production bundle on.

`tsconfig.spec.json:9` scoped specs to `src/**/*.spec.ts`, and the unit-test builder's `include`
resolves relative to `sourceRoot` (`src`), so a spec anywhere else was not merely unwritten - it could
not be discovered. Measured before the change: `npx ng test --list-tests` returned 65 files, all under
`src/`, and a probe spec at `tools/probe.spec.ts` did not appear even after `tsconfig.spec.json` was
widened. `--include="tools/**/*.spec.ts"` discovered nothing; `--include="../tools/**/*.spec.mjs"`
discovered it, which is what fixed the wiring.

### Defect present, part 1: the parity gate is blind to its own generator degrading

The gate is `npm run export:fixtures` then `git diff --exit-code -- ios/Fixtures`. It compares the
exporter against **itself**: regenerate, and if the bytes match what is checked out, pass. So it
catches an engine changing without its fixtures being regenerated - and cannot see the exporter
emitting less, once the degraded output has been committed.

Reproduced by degrading the exporter and staging the result, which is what "committed" means to
`git diff` (it compares the working tree against the index):

```console
$ perl -0pi -e "s/const systems = COUNTING_SYSTEMS\.map\(/const systems = COUNTING_SYSTEMS.slice(0, 5).map(/" tools/export-parity-fixtures.ts
174:  const systems = COUNTING_SYSTEMS.slice(0, 5).map((s) => ({

$ npm run export:fixtures && git add ios/Fixtures     # i.e. someone committed this
Wrote 7 parity fixtures to /Users/arthurzhang/dev/blackjack-trainer/ios/Fixtures

$ npm run export:fixtures >/dev/null && git diff --exit-code -- ios/Fixtures
ANTI_DRIFT_EXIT=0   (0 = the gate is green on degraded fixtures)

$ python3 -c "import json;print('systems in fixture:', json.load(open('ios/Fixtures/counting-systems.json'))['count'])"
systems in fixture: 5
```

**53 of the app's 58 counting systems stopped being checked by that gate, and the gate named after
parity reported success.**

> **Correction.** This section first continued "The Swift target would also pass, because it asserts
> against the same weakened file." That is false, and it was the load-bearing half of an argument that
> rated N3 P1. REVIEW-round2-stage3 (F3-2) found it. N3 is re-triaged back to **P2**.
>
> **A second correction, to the first one.** The evidence originally quoted here was an `xcodebuild`
> transcript reading `(file.vectors.count → 80) == 2720` and `(file.count → 1840) == 62560`. Those
> numbers cannot come from the counting-systems cut described above - under that cut the
> basic-strategy and deviation fixtures are byte-identical (`2720` and `62560`, re-measured). They came
> from the **hand-axis** cut used for R2-7, and were filed under the wrong mutation. Found by
> REVIEW-round2-final (FF-1). What the counting-systems cut actually does to the iOS gate, measured:
>
> ```console
> $ xcodebuild -scheme BlackjackTrainer -destination '...iPhone 16 Pro' build test
> BlackjackTrainer/AppModel.swift:95: Fatal error: bundled game data failed to load or validate
>   BlackjackTrainer (35713) encountered an error (Early unexpected exit, operation never finished
>   bootstrapping - no restart will be attempted...)
> $ grep -c "TEST FAILED" ; grep -c "TEST SUCCEEDED"
> 1 ; 0
> ```
>
> The app crashes at launch and the test runner never connects, so **zero tests execute** - which means
> `CountingParityTests.swift:14`'s hard-coded `58`, named here as the assertion that catches it, is
> never reached. The iOS gate does catch this cut, but by the fail-loud `preconditionFailure` on
> corrupt bundled data, not by a parity assertion.
>
> The hand-axis cut is the one the parity assertions catch:
> `BasicStrategyParityTests.swift:15` and `DeviationParityTests.swift:19` hard-code 2720 and 62560 and
> fail with the transcript quoted above. Either way parity is not silently unprotected, so the
> re-triage to P2 stands on both mutations. What these checks add is real but narrower: they run in the
> **web** CI, which has no path filter, whereas `.github/workflows/ios-ci.yml:6` runs only on changes
> under `ios/**`; and they cover dimensions the Swift totals do not pin.

### Defect absent - and the non-vacuity proof

Same degraded tree, same staged fixtures, one command later:

```console
$ npx ng test --include="../tools/**/*.spec.mjs"
TOOLS_SPEC_EXIT=1
     × exports every counting system the web app defines, in the same order
      Tests  1 failed | 12 passed (13)
```

Exit **1**, and the failing test names the property. This is the check regenerating cannot satisfy: it
compares the fixtures against `COUNTING_SYSTEMS` in `src/`, the actual source of truth, rather than
against a previous export.

Restored afterwards, with the gate green again on the real fixtures:

```console
$ cp "$TMPDIR/exporter.orig" tools/export-parity-fixtures.ts
$ git reset -q ios/Fixtures && git checkout -- ios/Fixtures
$ npm run export:fixtures >/dev/null && git diff --exit-code -- ios/Fixtures
restored anti-drift exit=0
```

### Defect present, part 2: round 1's own B1 fix was unpinned

Round 1 fixed B1 (a malformed percent-escape killing the E2E server) and verified it by hand once.
Nothing has held the line since, so a revert would ship green. `tools/serve-dist.spec.mjs` runs the
real script as a **subprocess**, because "the process is still alive afterwards" is the property, and
an in-process import cannot observe it.

Mutating only the behavioural change - deleting the `try`/`catch` round 1 added, leaving the bare
`decodeURIComponent` call:

```console
$ python3 -c "...replace the guarded parse with the unguarded one..."
  let path;
  path = normalize(decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname));

$ npx ng test --include="../tools/**/*.spec.mjs"
     × 404s a malformed percent-escape instead of dying on it (B1)
     × 404s an encoded path traversal rather than serving outside the root
     × serves the shell for an extensionless route so client-side routing works
     × 404s a missing asset rather than falling back to the shell
     × serves a real asset with its content type
Error: connect ECONNREFUSED 127.0.0.1:49877
      Tests  5 failed (5)
MUTANT_EXIT=1
```

All five fail, and the reason is `ECONNREFUSED` - which is the finding reproducing exactly: one bad
request ends the process and everything afterwards fails as a connection error, pointing nowhere near
the cause. That blast radius is why B1 was rated P1 rather than P2, and it is now visible in a test
run rather than only in a ledger entry.

The same spec also pins the claims round 1 recorded under NOT DEFECTS but left unguarded: encoded and
literal `..` traversal 404s rather than escaping the served root, an extensionless path gets the SPA
shell, a missing asset 404s instead of falling back to the shell (the failure mode that turns a
missing chunk into a blank page), and real assets come back with their content types.

### Why these two specs are JavaScript, not TypeScript

The first version of this section said a `.spec.ts` in `tools/` "fails to compile before it runs a
line", quoting real `TS2591` errors. REVIEW-round2-stage3 (F3-5) showed that does not reproduce, and
it is right. Re-checked here:

```console
$ cat > tools/typeprobe.spec.ts   # imports node:child_process, uses process.cwd()
$ npx ng test --include="../tools/typeprobe.spec.ts"
      Tests  1 passed (1)
```

The errors were real, but they came from a `tsconfig.spec.json` edit that widened `include` to
`tools/**/*.spec.ts` - and that edit was reverted before commit. Without it, `tsconfig.spec.json`
covers only `src/**`, so a spec under `tools/` is never typechecked and simply runs.

So the accurate reason is narrower and worse: a `.spec.ts` there would buy the **look** of type safety
and none of it. Making it real means putting `tools/**` into `tsconfig.spec.json`, which then fails on
`TS2591: Cannot find name 'process'` because `@types/node` is in neither `dependencies` nor
`devDependencies` and installing it needs the network, which this run may not use. `.mjs` states the
absence instead of dressing it up, and matches `tools/serve-dist.mjs`, which is plain Node already.
The cost - these two files are not typechecked - is the same gap as M1, recorded rather than hidden.

### Remediation after REVIEW-round2-stage3

| id    | severity           | disposition                                                                                                                                                                                                                                                                    |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F3-1  | P2, introduced     | **Fixed.** `**/*.test.ts` restored to the test target's `include`, which had silently replaced the builder default.                                                                                                                                                            |
| F3-2  | P1, introduced     | **Regression R2-6, fixed.** The false Swift claim struck from three places and N3 re-triaged to P2. See the correction box above.                                                                                                                                              |
| F3-3  | P1, introduced     | **Regression R2-7, fixed.** The hand axis is now pinned on both fixtures; the 97% cut that used to pass now fails with `only 1 canonical hands appear: expected 1 to be 34`.                                                                                                   |
| F3-4  | P2, introduced     | **Regression R2-8, fixed.** A `%2f`-encoded traversal case was added; with `normalize()` deleted it fails at `expected 200 to be 404`, where the three original cases all passed.                                                                                              |
| F3-5  | P2, introduced     | **Regression R2-9, fixed.** Both spec headers rewritten to the reason that reproduces.                                                                                                                                                                                         |
| F3-6  | P2, pre-existing   | **Accepted; M2 updated.** The reviewer reproduced the gate-5 flake 4 times in 60 repetitions. M2 now records two independent reproductions and my own failure to reproduce, rather than leaving the reader to weigh one transcript against three green runs.                   |
| F3-7  | P3, introduced     | **Regression R2-11, fixed.** The temp tree is removed in `afterAll`; 0 remain after a full run.                                                                                                                                                                                |
| F3-8  | P3, introduced     | **Fixed.** The "7 fixtures" check reads `ios/Fixtures` and compares the filenames, instead of measuring the literal list beside it.                                                                                                                                            |
| F3-9  | P3, introduced     | **Accepted, not fixed.** `freePort()` closes its probe before the child binds, so another process could take the port in between. Not observed in any run here, and the alternative is a retry loop around process spawn; recorded as a known race rather than claimed absent. |
| F3-10 | info, pre-existing | **Recorded as M3.** The coverage gate does not see `tools/`.                                                                                                                                                                                                                   |

### A regression this stage introduced and caught in the same stage

The first version of the fixture spec asserted per row - `expect(row).toHaveLength(width)` across
62,560 deviation rows. It passed in 1774 ms with the tools specs running alone, and **timed out at
5000 ms** under the full parallel `npm test`, taking the unit gate to `exit 1`. That is M2's defect
class, introduced by the stage that recorded M2.

Rewritten to count offenders and assert once:

```console
$ npx ng test --include="../tools/**/*.spec.mjs"
      Tests  13 passed (13)
   Duration  820ms (... tests 205ms ...)

$ for i in 1 2 3; do npm test; done
run1 exit=0   Tests  1546 passed
run2 exit=0   Tests  1546 passed
run3 exit=0   Tests  1546 passed
```

and still non-vacuous - truncating a single row out of 62,560:

```console
$ python3 -c "...drop one element from rows[0]..."
row 0 truncated to 11 of 12
     × keeps every deviation row the shape its own columns declare
AssertionError: deviation-vectors.rows: 1 rows are not 12 columns wide: expected 1 to be +0
$ git diff --exit-code -- ios/Fixtures && echo "fixture restored, no drift"
fixture restored, no drift
```

### Gates after stage 3

All nine, re-run after the artifacts above were written:

| gate                          | round-2 BASELINE              | after stage 3                 |
| ----------------------------- | ----------------------------- | ----------------------------- |
| `npm run lint`                | 0                             | 0                             |
| `npm run build`               | 0, 1 budget warning           | 0, same 1 budget warning      |
| `npm test`                    | 1533 passed (65 files)        | **1547 passed (67 files)**    |
| `npm run test:coverage`       | 96.11 / 93.23 / 93.28 / 97.97 | 96.11 / 93.23 / 93.28 / 97.97 |
| `E2E_SERVER=dist npm run e2e` | 111 passed                    | 111 passed                    |
| fixture anti-drift            | no drift                      | no drift                      |
| `swiftformat --lint`          | 0                             | 0                             |
| `swiftlint`                   | 0                             | 0                             |
| `xcodebuild build test`       | TEST SUCCEEDED, 335           | TEST SUCCEEDED, 335           |

Coverage is unchanged to two decimals, which is expected rather than suspicious: `serve-dist.mjs` runs
as a subprocess and so is not instrumented, and the fixture spec reads JSON and re-uses
`COUNTING_SYSTEMS`, which the existing suite already covers. The 14 new tests add assertions over
already-covered source, not new covered lines.

---

## Stage 4 - the findings this run reports rather than fixes

Each was re-verified at its cited line before being accepted, and re-triaged from scratch.

### N4 - the update banner covers drill controls: reproduces, with one correction

Round 1 recorded this as measured on `/drill/basic-strategy` at 375x700, with
"all six action controls intersect the banner box" and "`elementFromPoint` at the centre of the Hit
button returns a `SPAN` inside `.update`".

**Method, stated because it matters.** The banner is driven by service-worker signals that cannot be
raised on demand, so the markup `src/app/app.ts` renders for the update-ready state was injected into
the live page and the **real stylesheet** positioned it. Angular scopes component styles with an
`_ngcontent-*` attribute; a first attempt omitted it, the node got none of `.update`'s rules, and it
laid out in normal flow at `top: 700` - a measurement that proved nothing and is discarded. Copying
the attribute from a node the shell's own template rendered gives `position: fixed` and the real
geometry:

> **This measurement was wrong twice, and the second version was published. Both are corrected here.**
> The first attempt omitted the `_ngcontent-*` attribute entirely; the second stamped it on the
> `<aside>` **but not on its children**, so `.update__copy` and `.update__actions` still matched
> nothing and the banner came out 42 px short - `top: 580.22, height: 103.78`. On that geometry Hit,
> Stand and Double appeared to keep clickable centres, and this section published a "correction"
> saying round 1's Hit-button claim did not reproduce. REVIEW-round2-final (FF-2) showed it does.
> Emulated encapsulation stamps **every** styled element, so the probe now applies the attribute to
> the subtree, which reproduces the reviewer's figures exactly.

```json
{
  "position": "fixed",
  "flexDirection": "column",
  "bannerRect": { "top": 538.03, "bottom": 684, "height": 145.97 },
  "scroll": { "scrollHeight": 700, "clientHeight": 700 }
}
```

375 px is below the `@media (max-width: 34rem)` breakpoint at `app.scss:118`, so the banner stacks
into a column and is 146 px tall, not 104. The page does not scroll -
`scrollHeight === clientHeight === 700`, matching round 1 - so nothing can be scrolled out from under
it. **All six action controls intersect the banner, and all six have their centre covered**
(`elementFromPoint` at each centre returns a node inside `.update`):

| control   | top | bottom | intersects banner | centre covered by banner |
| --------- | --- | ------ | ----------------- | ------------------------ |
| Hit       | 543 | 597    | yes               | **yes**                  |
| Stand     | 543 | 597    | yes               | **yes**                  |
| Double    | 543 | 597    | yes               | **yes**                  |
| Split     | 605 | 660    | yes               | **yes**                  |
| Surrender | 605 | 660    | yes               | **yes**                  |
| Insurance | 605 | 660    | yes               | **yes**                  |

**Round 1's finding reproduces in full, including the cited example**, and the "correction" this
section briefly carried is withdrawn. The close button at the top of the screen (`top: 14`) is the
only control left reachable.

**Re-triaged P2 → P2 (unchanged), on better evidence than round 1 had.** It is a genuine user-facing
defect rather than a cosmetic overlap: while the banner is up, the drill cannot be played at all at
this viewport. It stays P2 because the update-ready state - the common one - carries a "Later" button
that dismisses it, so a trainee is blocked only until they press it; the recovery state has no
dismiss, but it only occurs when the service worker is already unrecoverable and the app is asking to
be reloaded. It is not raised further because the fix is a layout rework of either the banner or the
drill, which no finding on this work list scopes.

### N1 - a red CI does not stop the deploy

Re-verified: `.github/workflows/pages.yml:12-15` fires on push to `main`, and its `build` job
(`pages.yml:28-46`) runs `npm ci` and `npm run build --base-href /blackjack-trainer/` and nothing
else before `actions/deploy-pages@v4`. `.github/workflows/ci.yml:3-7` fires independently on the same
event. Neither references the other. Lint, unit tests, the coverage gate, the parity anti-drift gate
and E2E therefore do not guard the deploy: any failure that is not a build failure publishes.

**Re-triaged P2 → P1.** Round 1's P2 was assigned under "this run may only report it", which is a
permission, not a severity. This is a trainer whose entire value is being right about strategy charts,
and the gates that check that are exactly the ones the deploy does not run.

**Not applied.** The owner decision on editing CI/CD workflow files reached this run unsubstituted, so
it was taken at its conservative option (see ROUND 2 ASSUMPTIONS 1). The patch, ready to paste into
`.github/workflows/pages.yml`, replacing the `build` job's `- run: npm ci` / `- run: npm run build ...`
pair:

```yaml
- run: npm ci
- run: npm run lint
- run: CI=true npm run test:coverage
- name: Verify parity fixtures are up to date (anti-drift gate)
  run: |
    npm run export:fixtures
    git diff --exit-code -- ios/Fixtures
- run: npx playwright install --with-deps chromium
- run: npm run build
- run: npm run e2e
  env:
    E2E_SERVER: dist
- run: npm run build -- --base-href /blackjack-trainer/
```

This makes the deploy job run every gate CI runs, in CI's order, before the base-href build it
actually publishes. It duplicates the `validate` and `e2e` jobs' work rather than sharing it; the
alternative is `on: workflow_run` chained to CI's completion, which is DRYer but adds a second
failure mode (a `workflow_run` deploy runs against the default branch's workflow file and needs an
explicit `conclusion == 'success'` check, and a skipped CI run leaves it never firing). The
duplicated form is recommended because it cannot silently not-run.

### N5 - no gate builds the bundle that is actually deployed

Re-verified: no workflow and no test builds or serves `--base-href /blackjack-trainer/` except
`pages.yml:37`, which deploys it without testing it. Stage 2 made the dist E2E lane build what it
serves, but that is the **root-href** bundle; the deployed one is still never exercised.

**Re-triaged P2 → P1**, on the same reasoning as N1 and because this is what let W1 - an installed PWA
launching at another project's site - exist unnoticed through round 1's entire baseline.

**Not applied**, same reason as N1. The smallest patch that makes a gate look at the deployed
configuration, as a job in `.github/workflows/ci.yml`:

```yaml
pages-bundle:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v5
      with:
        node-version: 22
        cache: npm
    - run: npm ci
    - run: npm run build -- --base-href /blackjack-trainer/
    - name: The deployed bundle must be relocatable under a sub-path
      run: |
        set -e
        d=dist/blackjack-trainer/browser
        grep -q '<base href="/blackjack-trainer/">' "$d/index.html"
        # Every manifest URL must be relative, or an installed copy launches at
        # the origin root — which is a different project on this shared host.
        node -e '
          const fs = require("node:fs");
          const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
          for (const [k, v] of [["start_url", m.start_url], ["scope", m.scope]])
            if (!String(v).startsWith("./")) { console.error(k + " is " + v); process.exit(1); }
          for (const i of m.icons)
            if (String(i.src).startsWith("/")) { console.error("icon " + i.src); process.exit(1); }
        ' "$d/manifest.webmanifest"
```

> **This snippet was broken as first recorded and is corrected above.** It used
> `require("…/manifest.webmanifest")`, which Node loads through its **JavaScript** loader because the
> extension is not `.json`, so it threw `SyntaxError: Unexpected token ':'` on the manifest's first
> key - failing the step against a bundle that satisfies every property it checks. Found by
> REVIEW-round2-final (FF-3), re-confirmed here:
>
> ```console
> $ node -e 'const m = require("./dist/blackjack-trainer/browser/manifest.webmanifest");'
> SyntaxError: Unexpected token ':'
> $ node -e 'const m=JSON.parse(require("node:fs").readFileSync("./dist/.../manifest.webmanifest","utf8")); console.log("ok", m.start_url, m.scope);'
> ok ./ ./
> ```
>
> A patch that is recorded but never run is exactly where this kind of defect survives, which is an
> argument for applying it rather than filing it.

Both patches are quoted at the indentation they need **inside their job's `steps:` list** (six spaces
for `- run:`); pasting them at column 0 will not parse.

This is a check beside the gate rather than a gate that fails, which the round's brief prefers against;
it is offered because the alternative - running the whole E2E suite against a sub-path mount - means
rewriting every `page.goto('/...')` in the suite, which is scope no finding here carries. Recorded as
the honest smaller option, not as an equal one.

### N2 - `@angular/forms` is a runtime dependency nothing imports

Re-verified at this commit: `grep -rn "@angular/forms" src e2e tools` returns **0** matches, and
`npm ls @angular/forms --omit=dev` shows it in the production tree.

Round 1's claim that it does not reach the bundle also reproduces, and the one apparent
counter-example is a false positive worth recording so the next run does not re-chase it:
`grep -c NgControl dist/blackjack-trainer/browser/main-*.js` returns 1, but the match is
`NgControlFlow` - `@angular/core`'s `@if`/`@for` runtime, not `@angular/forms`. `ReactiveFormsModule`,
`FormsModule`, `NgModel`, `FormControlDirective` and `ɵNgNoValidate` are all 0, and `zod`,
`standard-schema` and `ZodError` are 0 across every emitted chunk.

**Re-triaged P2 → P3.** Nothing is at risk: not in the bundle, not in the `npm audit` advisory chain.
It is dependency hygiene.

**Not applied, and the reason is a tooling limit rather than a judgement.** Removing it means editing
`package.json` and regenerating `package-lock.json`, which requires `npm install` reaching the
registry - a non-local resource this run may not contact. Deleting the line without regenerating the
lockfile would leave the two disagreeing, which is worse than the finding. Whether removal is safe is
therefore **UNVERIFIED**: with the package still present in `node_modules`, a local build would pass
whether or not the manifest still declared it, so no local run can answer the question.

### N6 - the manifest declares no `id`

Re-verified by reading `public/manifest.webmanifest`: keys are `name`, `short_name`, `description`,
`start_url`, `scope`, `display`, `orientation`, `background_color`, `theme_color`, `icons`. No `id`,
so the PWA's application identity falls back to `start_url`.

**Re-triaged P2 → P3**, and the reason changed. Round 1 warned that an explicit `id` "would pin
identity to the broken value". That is no longer true: W1 shipped on this branch, `start_url` is now
`./`, and the computed identity resolves to the app's own path. Adding an `id` today would pin the
**correct** value.

**Not applied.** It is a new config key in a shipped asset, which the no-features rule forbids, and it
is inert until the site is published (owner action O4). The next run should take it: the moment a copy
is installed, its identity is fixed, and changing `start_url` afterwards silently orphans it.

### N9 - the review protocol defect, and what this run did instead

Round 1's structural defect: each pass reviewer was given the range containing that pass's fix, so
every remediation commit answering a reviewer was authored after its range closed - twelve of eighteen
commits unreviewed until the final pass.

Round 2's arrangement, stated so it can be checked rather than believed: **each stage's remediation is
carried into the next stage's review range, by a different fresh reviewer.**

| range              | reviewer                  | covers                              |
| ------------------ | ------------------------- | ----------------------------------- |
| `0856b7d..7010e8c` | `REVIEW-round2-stage1.md` | baseline commit + stage 1           |
| `7010e8c..a3f5dee` | `REVIEW-round2-stage2.md` | **stage 1's remediation** + stage 2 |
| `a3f5dee..7ac22db` | `REVIEW-round2-stage3.md` | **stage 2's remediation** + stage 3 |
| `7ac22db..HEAD`    | `REVIEW-round2-final.md`  | **stage 3's remediation** + stage 4 |

Every commit up to the final review's range falls inside exactly one stage range, and no remediation
commit is reviewed by the reviewer it answers. REVIEW-round2-final checked this and confirmed it:
"8 commits, 4 ranges, 2 each, exact partition; each review file's declared range matches the artifact's
table".

**The limit of the scheme, stated rather than hidden.** The last remediation in any such chain is
answered by no further reviewer - here, the commit responding to REVIEW-round2-final's own findings
(FF-1 to FF-6). What makes that acceptable is a fact rather than an argument: that commit changes
**no code**. It touches `PROD-READINESS.md` and this file only, so every source, test and
configuration change on this branch was reviewed by a fresh reviewer who did not author it. A run that
ended with a code change in its final remediation would not be able to say that, and would owe one
more review.

### D1 - the support address is still a placeholder

Re-verified at both cited lines: `ios/AppStore/privacy.html:65` and `ios/AppStore/support.html:55`
both publish `mailto:CONTACT_EMAIL_HERE`, and `pages.yml:42` copies both into the deployed site.

**DEFERRED, unchanged, and deliberately visible.** The owner decision arrived unsubstituted, so it was
taken as "still unknown" (ROUND 2 ASSUMPTIONS 1). Inventing a plausible address for a published
privacy policy would silently swallow user mail and is strictly worse than a placeholder that is
obviously a placeholder. The App Store submission needs a working support URL regardless, so this
blocks the owner either way and is already tracked as O4.

### I1 - the iCloud data-loss path

Re-verified at every cited line. `Stores/CloudKeyValueStore.swift:63` calls `cloud.synchronize()`,
which does not wait for a download; `:66-72` adopts when `cloud.data(forKey:)` is non-nil and
otherwise calls `pushToCloud()`, writing this device's state over the shared key; `StatsStore.swift:78`
replaces local state wholesale with `stats = value`; `App/AppModel.swift:49-78` wires all nine stores.
`LAUNCH-CHECKLIST.md:22` confirms provisioning turns sync on **without an app update**.

**DEFERRED at P1, and explicitly not treated as inert.** The owner decision arrived unsubstituted and
was taken as "undecided", so this run neither rewrote sync semantics on a guess nor filed the path as
harmless.

Two facts were established here that the next attempt needs, and neither was in round 1's record:

1. **The narrow fix is still wrong, for a reason now located precisely.** `StatsStore.swift:63-65`
   calls `pushToCloud()` from `persist()`, i.e. on every recorded rep - so skipping only the launch
   seed relocates the race to the first hand played.
2. **"Ignore an empty cloud value" is also wrong**, which nothing previously recorded. The app has a
   user-facing **Reset practice data** action (`Views/Flow/PracticeDataSection.swift:16` →
   `App/AppModel.swift:113`), so an empty record is a state a user can legitimately ask to propagate.
   A fix that discards empty values to protect against this race would break that feature instead.

Both are now written into `LAUNCH-CHECKLIST.md` at O2, immediately above the provisioning steps, which
is where the person who flips the switch will be reading. The ledger alone was not enough: a
provisioner has no reason to open `PROD-READINESS.md`.

### Gates after stage 4

All nine, re-run after the artifacts above were written. Stage 4 changed only records
(`LAUNCH-CHECKLIST.md`, the ledger, this file), so every figure should be - and is - identical to
stage 3's:

| gate                          | round-2 BASELINE              | after stage 4                 |
| ----------------------------- | ----------------------------- | ----------------------------- |
| `npm run lint`                | 0                             | 0                             |
| `npm run build`               | 0, 1 budget warning           | 0, same 1 budget warning      |
| `npm test`                    | 1533 passed (65 files)        | 1547 passed (67 files)        |
| `npm run test:coverage`       | 96.11 / 93.23 / 93.28 / 97.97 | 96.11 / 93.23 / 93.28 / 97.97 |
| `E2E_SERVER=dist npm run e2e` | 111 passed                    | 111 passed                    |
| fixture anti-drift            | no drift                      | no drift                      |
| `swiftformat --lint`          | 0                             | 0                             |
| `swiftlint`                   | 0                             | 0                             |
| `xcodebuild build test`       | TEST SUCCEEDED, 335           | TEST SUCCEEDED, 335           |

The `111 passed` figure is a single observation, not a claim of determinism - see M2.

---

## Closing gates - and the one that is not deterministic

Run after the stage-4 remediation, which is the last change on the branch.

| gate                          | round-2 BASELINE              | at the branch tip                                         |
| ----------------------------- | ----------------------------- | --------------------------------------------------------- |
| `npm run lint`                | 0                             | 0                                                         |
| `npm run build`               | 0, 1 budget warning           | 0, same 1 budget warning                                  |
| `npm test`                    | 1533 passed (65 files)        | 1547 passed (67 files)                                    |
| `npm run test:coverage`       | 96.11 / 93.23 / 93.28 / 97.97 | 96.11 / 93.23 / 93.28 / 97.97                             |
| `E2E_SERVER=dist npm run e2e` | 111 passed                    | **111 passed in 5 of 7 runs; 110 passed + 1 failed in 2** |
| fixture anti-drift            | no drift                      | no drift                                                  |
| `swiftformat --lint`          | 0                             | 0                                                         |
| `swiftlint`                   | 0                             | 0                                                         |
| `xcodebuild build test`       | TEST SUCCEEDED, 335           | TEST SUCCEEDED, 335                                       |

**Gate 5 is not reported as green, because it is not reliably green.** The closing gate run failed:

```console
  ✘   90 [chromium] › e2e/smoke/showdown.e2e.ts:65:7 › post-count showdown › returning to counting keeps the drill going (6.5s)
    Error: expect(locator).toBeHidden() failed
    > 74 |     await expect(page.getByRole('region', { name: 'Showdown vs dealer' })).toBeHidden();
  1 failed
  110 passed (38.8s)
exit=1
```

Three further full-suite runs immediately afterwards, at the same commit:

```console
run1 exit=0   111 passed (37.4s)
run2 exit=0   111 passed (40.8s)
run3 exit=1   1 failed / 110 passed (39.2s)
```

This is **M2**, pre-existing, in a spec this run never touched, and it is the fourth independent
reproduction: the stage-2 reviewer saw it 2 times in 7 full-suite runs, the stage-3 reviewer 4 in 60
repetitions, the final reviewer 1 in 30, and this run 2 in 7. An earlier version of the ledger recorded
that I could not reproduce it. I can, and the row is corrected rather than left standing.

Two things follow, and both are stated rather than smoothed over:

1. **Every `111 passed` in this run's records is one observation.** None of them establishes that gate
   5 is deterministic, and the stage tables above should be read that way.
2. **The run does not end with all nine gates green**, and saying otherwise would be the exact defect
   this round was convened to remove. Eight are green. The ninth is a coin at the margin: red about
   one run in four here, and masked in CI by `retries: 1` (`playwright.config.ts:20`). M2 is raised to
   **P1** and should be the first item of the next round.
