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

This transcript is from the **final** code, after the F1 remediation below - not from the first
version of the fix, which this file previously quoted here:

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
root-href bundle** it serves; it does not make any gate build the deployed one. N5 is re-triaged and
reported rather than fixed - see the ledger.

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
