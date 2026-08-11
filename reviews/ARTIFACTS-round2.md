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

### Gates after stage 1

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
