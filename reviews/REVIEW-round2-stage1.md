# REVIEW - round 2, stage 1

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

**Verdict: PASS-WITH-FINDINGS**

Range reviewed: `0856b7df98d2b3f87788fe7d28ec6a5823878c4c..7010e8cda93a10aa33c19363035a0dc4741ca8a8`
(`5e954f8` capture the round-2 baseline for every gate, `7010e8c` make the offline gate fail when the
built bundle has no service worker).

The behavioural claim is real and I reproduced it independently, in both directions, from a clone of
the base commit rather than from the committed transcripts.
All nine gates are green at the tip and every figure in `reviews/BASELINE-round2.md` and
`reviews/ARTIFACTS-round2.md` matched my own runs exactly.
The findings below are about records that overstate what the code does, one small coverage narrowing
the range introduces, and residual risk the artifact's stated reasoning does not actually cover.

Everything I ran used the tool sandbox disabled.
Nothing was listening on `127.0.0.1:4200` before any E2E run (`lsof -nP -iTCP:4200 -sTCP:LISTEN`
exit 1, checked before each one).
A stray `node` holds `[::1]:4321`; no gate uses it and I left it alone.
The repository is exactly as I found it: `git status --porcelain` prints only `?? .agents/` and
`?? .codex/`, and `dist/blackjack-trainer/browser/ngsw-worker.js` is byte-identical to the freshly
built file (md5 `84f509c7ab1bf74fe8cd95f1b2551768`) after I staged and unstaged the deletion.
All mutation experiments ran in a throwaway `git clone` under the scratchpad, never in the repo.

---

## 1. What the range claims, and whether it does it

`5e954f8` adds `reviews/BASELINE-round2.md` (a from-scratch measurement of all nine gates at the base
commit) and opens a ROUND 2 section in `PROD-READINESS.md`.

`7010e8c` claims to close N7: `e2e/smoke/offline.e2e.ts` used to decide whether to run from runtime
state (`test.skip(!registered, ...)` in `beforeEach`), which could not distinguish "the dev server
registers no worker by design" from "the production bundle shipped without its worker".
The fix extracts the lane predicate into `e2e/fixtures/lane.ts`, imported by both
`playwright.config.ts` and the spec, skips on the lane, and turns a missing worker in the `dist` lane
into an assertion failure.

**It does what it claims.** Verified end to end below.

### 1.1 The defect reproduces at the base commit

I cloned the repo into the scratchpad, checked out the base commit, symlinked `node_modules`, copied
in the same `dist/` the tip run used, and deleted the worker.

```console
$ git clone -q /Users/arthurzhang/dev/blackjack-trainer "$SCR/base-clone"
$ cd "$SCR/base-clone" && git checkout -q 0856b7df98d2b3f87788fe7d28ec6a5823878c4c
$ git log --oneline -1
0856b7d record the final adversarial review
$ grep -n "test.skip" e2e/smoke/offline.e2e.ts
37:    test.skip(!registered, 'No service worker: run with E2E_SERVER=dist against a built app.');
$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: .../base-clone/dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory

$ E2E_SERVER=dist npx playwright test
exit=0
  -   67 [chromium] > e2e/smoke/offline.e2e.ts:45:7 > offline > installing caches every card, ...
  -   68 [chromium] > e2e/smoke/offline.e2e.ts:65:7 > offline > the shell itself still routes offline

  2 skipped
  109 passed (31.8s)
```

Exactly the `109 passed, 2 skipped`, exit 0 that `reviews/ARTIFACTS-round2.md` and the spec comment
claim.
The defect is real and the artifact's "defect present" transcript reproduces.

### 1.2 The fix reproduces at the tip

Same bundle, same mutation, at `7010e8c`, running the whole suite rather than just the one spec:

```console
$ mv dist/blackjack-trainer/browser/ngsw-worker.js "$SCR/ngsw-worker.js.removed"
$ E2E_SERVER=dist npm run e2e
e2e exit=1
    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js
    expect(received).toBe(expected) // Object.is equality
    Expected: true
    Received: false
      at /Users/arthurzhang/dev/blackjack-trainer/e2e/smoke/offline.e2e.ts:51:7

  2 failed
    [chromium] > e2e/smoke/offline.e2e.ts:59:7 > offline > installing caches every card, ...
    [chromium] > e2e/smoke/offline.e2e.ts:79:7 > offline > the shell itself still routes offline
  109 passed (32.2s)
```

Exit 1, with the cause named.
Because I used one byte-identical bundle for both 1.1 and 1.2, the only difference between the green
run and the red run is the range itself: the fix is non-vacuous.

### 1.3 The other two rows of the artifact's branch table

`dist` lane with the worker present, at the tip: `111 passed`, exit 0, run twice.

`serve` lane at the tip (`env -u E2E_SERVER -u CI npx playwright test e2e/smoke/offline.e2e.ts`):
`2 skipped`, exit 0.
It still stands down rather than failing where there is genuinely nothing to test.

`reviews/BASELINE-round2.md`'s own gate-5 figure also reproduces at the base commit: with the worker
restored, `E2E_SERVER=dist npx playwright test` gave `111 passed`, exit 0, zero skipped.

---

## 2. The nine gates, re-run by me at `7010e8c`

| #   | gate                                                               | my result                                                      | recorded  | match |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------- | --------- | ----- |
| 1   | `npm run lint`                                                     | exit 0, `All matched files use Prettier code style!`           | 0         | yes   |
| 2   | `npm run build`                                                    | exit 0, 1 budget warning (`chart-page.component.scss`, +368 B) | 0, 1 warn | yes   |
| 3   | `npm test`                                                         | exit 0, 65 files, 1533 passed                                  | 1533      | yes   |
| 4   | `npm run test:coverage`                                            | exit 0, 96.11 / 93.23 / 93.28 / 97.97                          | same      | yes   |
| 5   | `E2E_SERVER=dist npm run e2e`                                      | exit 0, 111 passed (twice)                                     | 111       | yes   |
| 6   | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures` | exit 0, 7 fixtures, no drift                                   | no drift  | yes   |
| 7   | `swiftformat --lint .`                                             | exit 0, 0/105 files require formatting                         | 0         | yes   |
| 8   | `swiftlint lint`                                                   | exit 0, 0 violations, 0 serious in 105 files                   | 0         | yes   |
| 9   | `xcodebuild -scheme BlackjackTrainer ... build test`               | `** TEST SUCCEEDED **`, 335 tests in 38 suites                 | SUCCEEDED | yes   |

Gate 9's status was read from the `** TEST SUCCEEDED **` marker, not from a piped exit code.

**Does any gate report green while the thing it names is broken?**
Gate 5 is now honest about the specific thing it names: a bundle without `ngsw-worker.js` fails it
(1.2 above), where before the range it did not.
The one remaining hole I found is F4: gate 5 still cannot prove it ran against the built bundle at
all.
That hole is pre-existing, not introduced here.

---

## 3. Findings

### F1 - the `serve` lane now skips a testable worker, and two records deny that this can happen

**Severity: medium. Introduced by the range.**

`README.md:520` says the offline spec skips only where no worker exists:

> the dev-server lane registers none by design and is the only case that skips.

`reviews/ARTIFACTS-round2.md:101` says the same in its branch table: the `serve` lane is
`n/a, none registered`.

Both are false in a configuration the repository explicitly documents and supports.
`playwright.config.ts:45` sets `reuseExistingServer: !process.env.CI && !SERVES_DIST`, and
`e2e/README.md` states the rationale: "The `serve` lane still reuses, because there the server you
have running _is_ the thing under test."
So the `serve` lane's server is not necessarily `ng serve`.
When it is `tools/serve-dist.mjs`, a real service worker registers, the offline behaviour is fully
testable, and before the range the spec tested it.
Now it stands down.

Before, at `0856b7d`:

```console
$ PORT=4200 node tools/serve-dist.mjs &
$ curl -sS -o /dev/null -w "ngsw-worker.js HTTP %{http_code}\n" http://127.0.0.1:4200/ngsw-worker.js
ngsw-worker.js HTTP 200
$ env -u E2E_SERVER -u CI npx playwright test e2e/smoke/offline.e2e.ts
exit=0
  OK  2 [chromium] > e2e/smoke/offline.e2e.ts:45:7 > offline > installing caches every card, ... (1.6s)
  OK  1 [chromium] > e2e/smoke/offline.e2e.ts:65:7 > offline > the shell itself still routes offline (1.7s)
  2 passed (2.3s)
```

After, at `7010e8c`, identical setup, identical served bundle:

```console
$ curl -sS -o /dev/null -w "ngsw-worker.js HTTP %{http_code}\n" http://127.0.0.1:4200/ngsw-worker.js
ngsw-worker.js HTTP 200
$ env -u E2E_SERVER -u CI npx playwright test e2e/smoke/offline.e2e.ts
exit=0
  -  1 [chromium] > e2e/smoke/offline.e2e.ts:59:7 > offline > installing caches every card, ...
  -  2 [chromium] > e2e/smoke/offline.e2e.ts:79:7 > offline > the shell itself still routes offline
  2 skipped
```

How I verified: started `tools/serve-dist.mjs` on 4200 by hand in each tree, confirmed the worker was
served (HTTP 200), ran the spec with `E2E_SERVER` and `CI` unset so the `serve` lane and
`reuseExistingServer` both applied, and killed the server afterwards (port confirmed free again).

This costs no release gate, since CI runs `E2E_SERVER: dist` (`.github/workflows/ci.yml:50`), and it
is a defensible trade for the much larger gain in 1.2.
The finding is that two committed records state it as impossible rather than as a trade.
"the only case that skips" is an absolute claim, and a green run cannot support it because a green
run in the `serve` lane is exactly the case where it is wrong.

### F2 - the ledger says an N1 patch is recorded; no patch exists in the range

**Severity: medium. Introduced by the range (`5e954f8`).**

`PROD-READINESS.md:290`:

> N1 is reported with an exact patch, not applied.

and `:295`:

> The full patch is recorded so applying it is one paste.

Both are present tense, and at `7010e8c` there is no such patch anywhere in the repository.

```console
$ grep -n "pages.yml" reviews/ARTIFACTS-round2.md reviews/BASELINE-round2.md
(no output)
$ sed -n '259,316p' PROD-READINESS.md | grep -n "pages.yml"
(no output)
$ git grep -ln "N1" -- reviews/ PROD-READINESS.md
PROD-READINESS.md
reviews/REVIEW-final.md
```

How I verified: N1 is the round-1 finding that `.github/workflows/pages.yml` deploys after only
`npm ci` and `npm run build`, so a patch for it must mention `pages.yml`.
The only two files matching `N1` are round-1 records that describe the finding, not a patch.
I also read the whole ROUND 2 section of the ledger (lines 259-316); it contains no diff, no
workflow YAML and no pointer to one.

This may be intended for a later stage of the run, but the sentence as committed asserts the patch
exists now, and the ledger's own ROUND 2 status table lists no state for N1 at all.

### F3 - the ledger says an I1 provisioner note is written; the range wrote none

**Severity: medium. Introduced by the range (`5e954f8`).**

`PROD-READINESS.md:289`:

> I1 stays DEFERRED at P1; the provisioner note is written where a provisioner will look.

The range touches seven files (`git diff --stat`): `PROD-READINESS.md`, `README.md`,
`e2e/fixtures/lane.ts`, `e2e/smoke/offline.e2e.ts`, `playwright.config.ts`,
`reviews/ARTIFACTS-round2.md`, `reviews/BASELINE-round2.md`.
No `ios/` file, no `docs/` file and not `LAUNCH-CHECKLIST.md`.

`LAUNCH-CHECKLIST.md` is where the provisioning actions live (`:65`,
"**O2/O11 (optional, post-1.0):** provision iCloud KVS and verify on two devices"), and it carries no
warning that provisioning turns on a data-loss path:

```console
$ grep -n -i "I1\|last-writer\|overwrite\|data loss\|KVS" LAUNCH-CHECKLIST.md
23:      The `com.apple.developer.ubiquity-kvstore-identifier` entitlement is declared but the capability is not provisioned, so sync is inert today.
65:9. **O2/O11 (optional, post-1.0):** provision iCloud KVS and verify on two devices, then switch the store description to variant B.
119:      ... the iCloud KVS trust boundary ...
215:      ... last-writer-wins by design ...
$ git log --oneline -2 -- LAUNCH-CHECKLIST.md
fc7d0c3 close the agent lane with the final gate and the owner handoff
28d87a0 version both platforms as 1.0 and draft the release notes
```

How I verified: read the range's file list, grepped the checklist for every I1-adjacent term, and
confirmed the file's last commit predates this branch.
The only place the warning exists is `PROD-READINESS.md:144`, which is round-1 text in the ledger
itself, not "where a provisioner will look".
Round 1's own framing (`:144`) is that "whoever provisions iCloud must fix this first", which is
precisely the note this assumption claims to have placed and did not.

### F4 - "a skip in the dist lane is now impossible by construction" is tautological, and the reason given for skipping a count check does not hold

**Severity: low as written (record overstatement). The underlying risk is pre-existing, not
introduced.**

`reviews/ARTIFACTS-round2.md:128`:

> A skip in the dist lane is now impossible by construction, so no count check is needed to detect
> one.

The lane is defined by the same expression that decides the skip, so the statement can only be read
as "when `SERVES_DIST` is true the suite does not skip", which is true but circular.
From the operator's side, `E2E_SERVER=dist npm run e2e` can still skip the offline spec and report
exit 0.
I changed one character of `e2e/fixtures/lane.ts` in the clone (`'dist'` to `'DIST'`), left the
worker in place, and ran the gate command:

```console
$ tail -1 e2e/fixtures/lane.ts
export const SERVES_DIST = requested === 'DIST';
$ E2E_SERVER=dist npx playwright test
exit=0
  2 skipped
  109 passed (39.5s)
```

The whole suite ran against `ng serve` rather than the built bundle (because `playwright.config.ts`
reads the same predicate) and reported `109 passed`, exit 0, with the offline claim untested.
That is the N7 shape again, reached through a different door.

How I verified: mutated only `e2e/fixtures/lane.ts` in the scratchpad clone at `7010e8c`, ran the
gate command, then `git checkout -- .`.

Two things follow, and I want to be precise about which is a defect of the range and which is not.
The range does **not** introduce this: the same typo in the old inline predicate in
`playwright.config.ts` would have launched `ng serve`, the spec would have found no worker, and the
old runtime skip would have produced the same `109 passed, 2 skipped`, exit 0.
Centralising the predicate is a real improvement, because it removes the case where the config and
the spec disagree.
What does not hold is the stated consequence: "so no count check is needed".
A count check, or a positive assertion that the suite is talking to `serve-dist.mjs`, is still the
only thing that would catch a run that silently changed lanes, and the artifact's reasoning for
omitting one rests on the circular claim above.
The artifact's "What this does not fix" section discloses the adjacent risk (a future edit reverting
to runtime state) but not this one.

### F5 - the new single source of truth for lane selection is outside every typechecking gate

**Severity: low. Pre-existing gap; the range moves load-bearing logic into it.**

`npm run lint` is `tsc --noEmit -p tsconfig.app.json && prettier --check .`, and that tsconfig
includes only `src/**/*.ts`:

```console
$ npx tsc --noEmit -p tsconfig.app.json --listFiles | grep -E "/e2e/|playwright\.config" | wc -l
       0
$ npx tsc --noEmit -p tsconfig.app.json --listFiles | wc -l
     354
```

Playwright transpiles without typechecking, so nothing else covers it.
Demonstrated in the clone by planting an outright type error in the new file:

```console
$ tail -2 e2e/fixtures/lane.ts
const brokenTypes: number = requested === 'dist';
export const SERVES_DIST = brokenTypes;
$ npm run lint
Checking formatting...
All matched files use Prettier code style!
lint exit=0
```

How I verified: the `--listFiles` counts were run read-only in the repository; the type error was
planted only in the scratchpad clone and reverted with `git checkout -- .`.

The repository documents this as deliberate (`e2e/README.md`, last line: specs stay "invisible to the
Vitest unit run ... and the app typecheck"), so I am recording it as known context rather than as a
regression.
It is worth stating because F4's failure mode is exactly a wrong value in this file, and no gate
reads it as typed code.

### F6 - `e2e/README.md`'s layout listing was not updated for the new fixture

**Severity: low. Pre-existing staleness that the range extends by one entry.**

`e2e/README.md` presents an explicit tree of `e2e/`.
It lists `fixtures/` as containing `app.fixture.ts` and `viewports.ts` only, and enumerates 6 specs.
The directory actually holds four fixtures and fourteen specs:

```console
$ ls e2e/fixtures
app.fixture.ts
flows.ts
lane.ts
viewports.ts
$ git log --oneline --diff-filter=A -- e2e/fixtures/flows.ts
c100293 fix: raise the showdown key hint's contrast to meet WCAG AA
$ git log --oneline -3 -- e2e/README.md
ca17a2e document the dist lane's refusal and record the pass 7 findings
b9f97ac feat: add a light theme, adaptive weak-spot practice, and seeded sessions
c7f7646 test: add a Playwright E2E smoke suite
```

How I verified: listed the directory, read the tree in `e2e/README.md`, and traced when the missing
entries were added.

The staleness predates this range (`flows.ts` and eight specs were already missing), so this is not a
defect the range introduces.
I raise it because `reviews/ARTIFACTS-round2.md:132-138` claims this exact discipline for this exact
commit ("A false statement this change would otherwise have left behind ... this is the same class of
defect caught before commit rather than after"), while the same commit adds a file to a directory
whose committed listing enumerates its contents.

### F7 - no gate fails if the range is reverted, and one branch of the new conditional is ungated

**Severity: informational. Inherent to a test-only fix; partly disclosed.**

The change is entirely test and test-configuration code, so there is nothing that a revert would turn
red.
I verified the base commit passes gate 5 (`111 passed`, exit 0, section 1.3), and the diff touches no
input to gates 1, 2, 3, 4, 6, 7, 8 or 9 other than markdown that prettier accepts in both states.
`reviews/ARTIFACTS-round2.md:126-130` discloses the same thing in weaker terms.

Separately, the new conditional `test.skip(!SERVES_DIST, ...)` has one branch pinned and one not.
The `dist` branch is pinned by gate 5 (section 1.2 proves the gate goes red when that branch runs and
the worker is absent).
The `serve` branch is exercised by no gate at all: `.github/workflows/ci.yml:50` sets
`E2E_SERVER: dist` and nothing runs the `serve` lane in CI.
I exercised it by hand (section 1.3) and it behaves as documented, but that is a manual observation,
not an assertion, and `reviews/ARTIFACTS-round2.md:92` heads that table "Both branches asserted",
which overstates a by-hand run as a test.

---

## 4. Checked and cleared

**No new user-visible capability.**
`git diff --stat` over the range shows no change under `src/`, `ios/` or `tools/`, no new endpoint,
screen, command, table, column or config key.
`E2E_SERVER` predates the range (it is read at `playwright.config.ts` in the base commit and set in
`.github/workflows/ci.yml`), so the range introduces no new knob.
`e2e/fixtures/lane.ts` is a new file but an internal test module; it is not matched by
`testMatch: '**/*.e2e.ts'`, and the E2E count is unchanged at 111.

**The 15 s wait is not too tight.**
The new `expect(registered).toBe(true)` converts a 15 s `waitForFunction` timeout into a hard
failure, and `provideServiceWorker` uses `registrationStrategy: 'registerWhenStable:30000'`, whose
fallback is longer than the wait.
Rather than assert a flake risk I did not measure, I measured it: against the built bundle on this
machine the worker takes control in

```console
run 1: controller non-null after 147 ms
run 2: controller non-null after 104 ms
run 3: controller non-null after 101 ms
```

roughly a hundredfold margin, so I am not raising it.

**The spec's own claims about the old behaviour are accurate.**
`e2e/smoke/offline.e2e.ts:36-37` cites `109 passed, 2 skipped`; that is exactly what the base commit
produced under the mutation (section 1.1).
`reviews/ARTIFACTS-round2.md:14` cites `e2e/smoke/offline.e2e.ts:37` for the old skip; that is the
correct line at the base commit.

**`reviews/BASELINE-round2.md` reproduces.**
Every one of its nine figures matched my own runs at the tip, and its gate-5 figure also matched a
re-run at the base commit.
Its remark that the `Executed 0 tests` line belongs to the empty XCTest bundle while the 335 come
from swift-testing is consistent with the `xcodebuild` output I got.

**The ledger's anchor link resolves.**
`PROD-READINESS.md:316` points at
`reviews/ARTIFACTS-round2.md#n7---the-offline-gate-skips-itself-on-the-evidence-it-exists-to-report`,
which matches the heading at `reviews/ARTIFACTS-round2.md:12`.

---

## 5. What I could not verify

- **That the "Gates after stage 1" table in `reviews/ARTIFACTS-round2.md:140-155` was produced after
  the artifacts were written**, as it claims.
  Ordering of past runs is not observable from the repository.
  I can only confirm the figures are correct now, which I did.
- **That the before/after bundle in the authors' own run was byte-identical**, as
  `reviews/ARTIFACTS-round2.md:65-66` claims.
  I established that property for my own reproduction by using one bundle for both directions, which
  is what makes my non-vacuity result sound; it says nothing about theirs.
- **Gates 1, 2, 3, 4, 6, 7, 8 and 9 at the base commit.**
  I ran all nine at the tip and gate 5 at the base.
  For the rest I reasoned from the diff (the range changes no input to them beyond markdown) rather
  than re-running them in the clone, which would have needed a separate iOS project generation.
  Treat `reviews/BASELINE-round2.md`'s figures for those eight as unreproduced-but-unchallenged.
- **Whether the round-2 work list beyond N7 is on track.**
  The ROUND 2 status table lists only N7, and the run declares a work list of N1-N9 plus D1 and I1.
  That is consistent with a stage-1 commit, so I am not treating the missing rows as a finding; F2
  and F3 are about claims that are stated as already done, not about work not yet done.
