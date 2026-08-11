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
and the spec, so neither can disagree with the other about which lane is running. The skip now keys
on the lane; a missing worker in the dist lane is an assertion failure, not a skip:

```ts
test.skip(!SERVES_DIST, 'Offline behaviour needs the built app: run with E2E_SERVER=dist.');
...
expect(
  registered,
  'no service worker took control of the page: the built bundle must ship and register ngsw-worker.js',
).toBe(true);
```

### Defect absent - and the non-vacuity proof

Same mutation, same command, after the fix. Only the behavioural change was mutated: the bundle is
byte-identical to the one that reported green above.

```console
$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory

$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts
  2) [chromium] › e2e/smoke/offline.e2e.ts:79:7 › offline › the shell itself still routes offline

    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js

    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false

      49 |       registered,
      50 |       'no service worker took control of the page: the built bundle must ship and register ngsw-worker.js',
    > 51 |     ).toBe(true);

  2 failed
$ echo $?
1
```

Exit **1**, and the message names the cause rather than leaving a 15-second timeout to be interpreted.

### Both branches asserted

The change made a previously-unconditional decision conditional, so both branches were run, not just
the new one (round 1's FF-2 lesson):

| lane                          | worker present?      | before                         | after                  |
| ----------------------------- | -------------------- | ------------------------------ | ---------------------- |
| `dist`                        | yes                  | 111 passed, exit 0             | **111 passed, exit 0** |
| `dist`                        | **no**               | 109 passed + 2 skipped, exit 0 | **2 failed, exit 1**   |
| `serve` (no `E2E_SERVER` set) | n/a, none registered | 2 skipped, exit 0              | **2 skipped, exit 0**  |

The restored-worker run:

```console
$ mv "$TMPDIR/ngsw-worker.js.removed" dist/blackjack-trainer/browser/ngsw-worker.js
$ E2E_SERVER=dist npm run e2e
  111 passed (31.4s)
$ echo $?
0
```

And the serve lane, which must still stand down rather than fail:

```console
$ lsof -nP -iTCP:4200 -sTCP:LISTEN ; echo $?
1
$ npx playwright test e2e/smoke/offline.e2e.ts
  -  1 [chromium] › e2e/smoke/offline.e2e.ts:59:7 › offline › installing caches every card, ...
  -  2 [chromium] › e2e/smoke/offline.e2e.ts:79:7 › offline › the shell itself still routes offline
  2 skipped
$ echo $?
0
```

### What this does not fix

A skip in the dist lane is now impossible by construction, so no count check is needed to detect one.
But nothing stops a future edit from reverting the skip condition to runtime state; that is inherent
to test code and is not claimed as covered.

### A false statement this change would otherwise have left behind

`README.md:519` described the old behaviour: the spec "runs against `E2E_SERVER=dist` and skips rather
than silently passing where no worker is registered". After the fix that is wrong - in the dist lane a
missing worker fails. The sentence was rewritten in the same commit. Round 1 shipped two records that
had drifted from the code this way (F2-2 / F4-1); this is the same class of defect caught before commit
rather than after.

### Gates after stage 1

All nine, re-run **after** the artifacts above were written (round 1's R0-1 was caused by re-running
them before):

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
