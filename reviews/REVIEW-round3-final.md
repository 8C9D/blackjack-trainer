# REVIEW - round 3, final

**Verdict: PASS-WITH-FINDINGS**

Range reviewed: `d502bfb..076d49d` (two commits - `d1eea82`, the remediation answering
REVIEW-round3-stage3, and `076d49d`, the round's closing records).

**Every published figure in this range reproduces at the tip.** All nine gates are green, the unit
count, the coverage quadruple, the E2E count and the iOS marker are exact, and the N4 correction that
this range's code change exists for is right in a real browser to the pixel, in both directions: with
`afterRenderEffect` the reserve is 183 px and 196 px with no forced change detection, and with a
plain `effect` restored it is 162 px in both states, short by 21 and 34. The artifact's own admission
that the fourth unit test cannot tell the two primitives apart is also true, measured.

What does not hold is in the records, and three of the ten findings are the range re-committing the
exact defect the row above them claims to have closed. R3-18 says the disproved M2 rate was corrected
everywhere and that "completeness was verified by grep rather than asserted"; two present-tense
sentences in the same artifact section still carry the superseded rate (F1). R3-18 also says the M2
heading "no longer contains a rate at all"; it contains one, and the anchor moved with the number in
this very commit (F2). R3-21 says two composed transcripts were "replaced with commands that were
run"; both replacements are composed, and one of them cannot execute at all (F5, F6). Against that,
the closing paragraph asserts that one of the 30-run blocks in its own gate-5 distribution was
corrupted, which contradicts the round's own record of what the killed server cost and would impeach
the very table it sits under (F3), and the ledger says N4 added three tests in the commit that added
the fourth (F4).

None of this is a code defect and none of it moves a terminal state on the evidence I could take. But
the round should not close on these records as written: F1 through F5 are all in the closing text
itself.

## Does this range touch code, and is a further review needed?

**Yes, it touches code.** `d1eea82` changes four tracked non-record files:

```console
$ git diff --stat d502bfb 076d49d
 PROD-READINESS.md               | 150 +++++++---
 e2e/smoke/showdown.e2e.ts       |   4 +-
 reviews/ARTIFACTS-round3.md     | 200 +++++++++++--
 reviews/REVIEW-round3-stage3.md | 629 ++++++++++++++++++++++++++++++++++++++++
 src/app/app.scss                |   6 +-
 src/app/app.spec.ts             |  45 ++-
 src/app/app.ts                  |  10 +-
 7 files changed, 979 insertions(+), 65 deletions(-)
$ git show --stat 076d49d | tail -4
 PROD-READINESS.md           | 43 +++++++++++++++++++++++++++++++++++++++++++
 reviews/ARTIFACTS-round3.md | 19 +++++++++++++++++++
 2 files changed, 62 insertions(+)
```

The behavioural change is one line in `src/app/app.ts` (`effect` -> `afterRenderEffect`) plus a
fourth test in `src/app/app.spec.ts`. The other two are comment-only: `src/app/app.scss` and
`e2e/smoke/showdown.e2e.ts` change no rule and no argument. `076d49d` is records only. The ledger's
"Every gate re-run at `d1eea82`, the last commit that touches code" (`PROD-READINESS.md:550`) is
therefore accurate.

**A further review is needed only if the remediation touches code.** Nine of my ten findings are
record-only and can be answered by editing `PROD-READINESS.md` and `reviews/ARTIFACTS-round3.md`,
which needs no further code review - only a re-run of gates 1 and 3 if a code fence is edited in a way
prettier notices. F8 is the exception: it is a shipped comment in `src/app/app.scss`, so correcting it
edits a source file, and under this round's own rule (no remediation reviewed by the reviewer it
answers) that edit would want a reviewer who is not me. It changes no CSS rule, so the gates that
would need re-running are lint, build and unit.

## What I ran, and where

Everything below was run in the live checkout at `076d49d` with the tool sandbox disabled, except the
three mutation experiments, which ran in `git archive 076d49d` exports under my scratch directory with
`node_modules` symlinked, so no mutant ever touched the working tree. Nothing else of mine was running
during the E2E block; port 4200 was free before it (`lsof -nP -iTCP:4200 -sTCP:LISTEN` exit 1) and
free after. The browser probes were built to my own output directory and served on ports 4577, 4578
and 4579, never on `dist/` + 4200. `npm run export:fixtures` was run and
`git diff --exit-code -- ios/Fixtures` checked afterwards. I never ran the workflow's assemble step,
so no `site/` tree was created.

**Every citation below is to the committed tree at `076d49d`, and should be read there rather than in
the working tree.** `git status --porcelain` printed only `.agents/` and `.codex/` throughout my
measurements. After the last of them, while this file was being written, another session began editing
`PROD-READINESS.md`, `reviews/ARTIFACTS-round3.md` and `src/app/app.scss` in place, and those edits
answer several of the findings below (F1, F2, F3, F5, F6, F7, F8, F9, F10 all have uncommitted text
against them). I left them alone - they are not mine to touch, and killing another session's work in
progress is the mistake K2 exists to record. The consequence for a reader is that some line numbers
below will have moved in the working copy; `git show 076d49d:<path>` resolves them all. I have not
reviewed those uncommitted edits and this verdict says nothing about them.

### The nine gates, re-run at the tip

| #   | gate              | command                                                                                                   | exit | result at `076d49d`                            | published                                      |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------- | ---------------------------------------------- |
| 1   | lint              | `npm run lint`                                                                                            | 0    | 3 tsc projects + `All matched files...`        | matches                                        |
| 2   | build             | `npm run build`                                                                                           | 0    | 1 chart-page budget warning                    | matches                                        |
| 3   | unit tests        | `npm test`                                                                                                | 0    | 67 files, **1551 passed**                      | 67 files, 1551 passed                          |
| 4   | coverage gate     | `npm run test:coverage`                                                                                   | 0    | **96.16 / 93.28 / 93.22 / 98**                 | 96.16 / 93.28 / 93.22 / 98.00                  |
| 5   | E2E               | `E2E_SERVER=dist npm run e2e` x5                                                                          | 0x5  | **`111 passed`** on all five, 0 skipped        | `111 passed`                                   |
| 6   | parity anti-drift | `npm run export:fixtures` + `git diff --exit-code -- ios/Fixtures`                                        | 0    | 7 fixtures written, no drift                   | matches                                        |
| 7   | swiftformat       | `swiftformat --lint .`                                                                                    | 0    | 0/105 files require formatting                 | matches                                        |
| 8   | swiftlint         | `swiftlint lint`                                                                                          | 0    | 0 violations, 0 serious in 105 files           | matches                                        |
| 9   | iOS build + test  | `xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test` | -    | `** TEST SUCCEEDED **`, 335 tests in 38 suites | `** TEST SUCCEEDED **`, 335 tests in 38 suites |

Raw output for the four gates whose figures the ledger publishes:

```console
$ npm test
 Test Files  67 passed (67)
      Tests  1551 passed (1551)
   Duration  6.56s

$ npm run test:coverage
=============================== Coverage summary ===============================
Statements   : 96.16% ( 5310/5522 )
Branches     : 93.28% ( 2363/2533 )
Functions    : 93.22% ( 922/989 )
Lines        : 98% ( 4078/4161 )
================================================================================

$ for i in 1 2 3 4 5; do E2E_SERVER=dist npm run e2e > e2e-run$i.txt 2>&1; echo "run$i exit=$?"; done
run1 exit=0   111 passed (39.7s)
run2 exit=0   111 passed (36.7s)
run3 exit=0   111 passed (37.5s)
run4 exit=0   111 passed (37.1s)
run5 exit=0   111 passed (35.3s)

$ grep -E "\*\* TEST (SUCCEEDED|FAILED) \*\*|Test run with .* tests in .* suites" g9-ios.txt | sort -u
✔ Test run with 335 tests in 38 suites passed after 5.514 seconds.
** TEST SUCCEEDED **
```

Gate 9's status is read from the marker, not from `PIPESTATUS`. Gate 6 left no drift: `git diff
--exit-code -- ios/Fixtures` exited 0 and `git status --porcelain` still printed only `.agents/` and
`.codex/`.

The coverage gate's file list also reproduces, which is what M3's DEFERRED rests on:

```console
$ npx ng test --coverage --coverage-reporters=json-summary; echo "COV_EXIT=$?"
COV_EXIT=0
$ node -e '...Object.keys(coverage-summary.json)...'
files in report: 74 | under tools/: 0
statements 96.16 branches 93.28 functions 93.22 lines 98
```

Five more full-suite runs is a small sample and I say so: it is five further observations of a test
whose before-rate was 5.5% per execution, so `0.945^5 = 0.75` - green five times running is the
expected outcome either way. The per-test instrument is the one that carries weight, and it also
reproduces at the tip:

```console
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=30
M2_REPEAT_EXIT=0
  30 passed (17.2s)
```

---

## F1 - R3-18 says the disproved M2 rate was corrected everywhere and that completeness was verified by grep; two present-tense sentences in the same section still carry it

`PROD-READINESS.md:499`, the resolution column of R3-18:

> All corrected to the three-sample pooled 5.5% (33/600), the section heading rewritten so it no
> longer contains a rate at all - the anchor stops moving with the number - and completeness verified
> by grep rather than asserted.

`reviews/ARTIFACTS-round3.md:183-184` states the round's rate:

> The rate used everywhere in this round is therefore **5.5%, about one run in eighteen**
> (`1 / 0.055 = 18.2`)

One hundred lines later, in the same M2 section:

```console
$ grep -n "one run in twenty\|one in twenty\|1 run in 20\|20 / 400\|20/400\|5% per execution\|5%-per-execution\|5\.0%\|0\.97\^10\|3% per execution" reviews/ARTIFACTS-round3.md
152:| the one test, `--repeat-each=200`, independent  | `d502bfb`, fix reverted | **13 / 200** | 6.5% per execution     |
186:measured again; the pooled figure moved from 5.0% to 5.5% and its interval tightened.)
285:release gate that is red roughly one run in four". The rate is 5% per execution, not 25% per run, and
289:where a 5%-per-execution flake would become a deploy that fails for no reason about one run in
```

`:152` and `:186` are legitimate - the first is a sample row the round deliberately keeps, the second
is narrative about the change itself. `:285` and `:289` are not:

- `reviews/ARTIFACTS-round3.md:285` - "The rate is 5% per execution, not 25% per run" is a flat
  present-tense assertion of the two-sample pooled figure the round replaced with 5.5%.
- `reviews/ARTIFACTS-round3.md:289` - "a 5%-per-execution flake would become a deploy that fails for
  no reason about one run in twenty" is the same figure again, plus the "one run in twenty" phrasing
  that REVIEW-round3-stage3 F5 listed as survivals 4 and 5 and that this range corrected at
  `:12`, `:183` and `:517`.

`:285` is also exactly the sentence the previous remediation edited: REVIEW-round3-stage2 F3 caught it
reading "The rate is 3% per execution" and it was corrected to 5%, then left there when the pool moved
to 5.5%. A grep for `5.0%` does not find `5% per execution`, and a grep for the old `3%` does not find
it either, which is how a completeness check by grep misses it.

A related survival, lower confidence because the row is a historical record rather than a live claim:
`PROD-READINESS.md:484` (R3-3) resolves as "460, with the power recomputed against the pooled
before-rate: `0.95^460 = 5.7e-11`". `0.95` is the superseded rate; the artifact now publishes
`0.945^460 = 5.0e-12` for the same quantity (`reviews/ARTIFACTS-round3.md:246`). Both arithmetic
statements are individually correct - I checked them:

```console
$ python3 -c 'import math; print("0.95^460 =", math.pow(0.95,460)); print("0.945^460 =", math.pow(0.945,460))'
0.95^460 = 5.66054741891586e-11
0.945^460 = 4.996109108854475e-12
```

This is the fourth consecutive stage at which "corrected everywhere" has been published about this
number and has not been true (R3-1, R3-11, R3-18, and now).

## F2 - R3-18 says the M2 heading no longer contains a rate and that the anchor stops moving; it contains one, and the anchor moved in this commit

`PROD-READINESS.md:499` (quoted in F1): "the section heading rewritten so it no longer contains a rate
at all - the anchor stops moving with the number".

```console
$ sed -n '12p' reviews/ARTIFACTS-round3.md
## M2 - the E2E gate fails on one test about one run in eighteen, and it is the test that is wrong
$ sed -n '439p' PROD-READINESS.md | grep -o 'ARTIFACTS-round3.md#[a-z0-9-]*'
ARTIFACTS-round3.md#m2---the-e2e-gate-fails-on-one-test-about-one-run-in-eighteen-and-it-is-the-test-that-is-wrong
```

"about one run in eighteen" is a rate, and it is in the anchor. The anchor did move with the number in
this range - the ledger link had to be rewritten in the same commit that rewrote the heading:

```console
$ git diff d502bfb 076d49d -- PROD-READINESS.md | grep -E "^[-+].*#m2---"
-| M2  | P1               | **P1**     | RESOLVED - artifact in [`reviews/ARTIFACTS-round3.md`](reviews/ARTIFACTS-round3.md#m2---the-e2e-gate-is-red-about-one-run-in-twenty-and-it-is-the-test-that-is-wrong)
+| M2  | P1               | **P1**     | RESOLVED - artifact in [`reviews/ARTIFACTS-round3.md`](reviews/ARTIFACTS-round3.md#m2---the-e2e-gate-fails-on-one-test-about-one-run-in-eighteen-and-it-is-the-test-that-is-wrong)
```

The link itself is fine - I checked all eleven of the ledger's references against the artifact's own
headings and every one resolves (see "Reproduced and held"). What is wrong is the claim about the
heading: the anchor is still a function of the rate, so the next time the pool moves the link breaks
again, which is precisely the failure R3-12 recorded and this row claims to have made structurally
impossible.

## F3 - the closing paragraph says one of the 30-run blocks in its own distribution was corrupted; the round's own records say the casualty was a different run

`PROD-READINESS.md:587-589`, added by `076d49d`:

> A caveat this round earned the hard way: two E2E runs cannot share this machine. Both lanes bind
> `127.0.0.1:4200`, the dist lane refuses a port it did not start, and one of the 30-run blocks above
> was corrupted when a reviewer killed a live server it took for an orphan. That is finding K2.

That is not what K2 says, four hundred lines earlier in the same file:

```console
$ sed -n '513p' PROD-READINESS.md | cut -c1-416
| **K2** | P3       | `playwright.config.ts:6` hardcodes `const PORT = 4200`, so two E2E runs cannot coexist on one machine: the dist lane refuses to reuse a port it did not start, and a second run either fails to start or - as happened twice in this round - has its server killed by whoever mistakes it for an orphan. It cost this run one invalidated CI-mode transcript and the stage-1 reviewer twelve aborted runs.
```

and it is not what the artifact says either:

```console
$ sed -n '607,611p' reviews/ARTIFACTS-round3.md
**Step 9's failure in that run is not a result and is recorded so nobody reads it as one.** It is
`net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4200/` from test 85 onward - the web server
disappeared mid-run. The stage-1 reviewer was working in the same checkout at the time and reports
killing a `serve-dist` on port 4200 that it took for its own orphan; it was this run's live server.
Re-run alone, with nothing else on the machine:
```

The killed server cost the round **one CI-mode workflow-step run** - step 9 of the N1 verification -
which was then re-run alone and reported `111 passed (2.7m)`. Neither 30-run block was affected: the
first is published as 29 green and 1 red with the red one identified as M4
(`reviews/ARTIFACTS-round3.md:317-321`), the second as 30 of 30
(`reviews/ARTIFACTS-round3.md:495-512`).

The sentence is worse than merely wrong about attribution. It sits two paragraphs under a table that
offers 82 runs as the round's closing evidence for gate 5, and it tells the reader that 30 of those 82
are corrupted. If it were true, the distribution above it could not be published as it is. It is not
true, and the fix is to delete the clause and name the CI-mode run instead.

## F4 - the ledger says N4 added three tests, in the commit that adds the fourth

`PROD-READINESS.md:528`, in "What round 3 actually changed":

```console
$ sed -n '528p' PROD-READINESS.md
| `src/app/app.spec.ts`                                                              | N4: three tests pinning the measurement and its return to zero                                                                                      |
```

The same document, twenty-nine lines later:

```console
$ sed -n '557p' PROD-READINESS.md
| 3   | unit tests        | 0    | 67 files, 1551 passed (baseline 1547; four added for N4)               |
```

There are four, and the fourth is added by the same commit that publishes the "three":

```console
$ grep -n "it(" src/app/app.spec.ts | sed -n '5,8p'
171:    it('is zero while no banner is up', () => {
179:    it('is the banner height plus the gap it floats above, once one is up', () => {
209:    it('follows the banner when only its copy grows', () => {
231:    it('goes back to zero when the offer is dismissed', () => {
$ git show d502bfb:PROD-READINESS.md | grep -c "N4: three tests"
0
$ git log --oneline -1 -S "N4: three tests pinning the measurement" -- PROD-READINESS.md
d1eea82 measure the banner after the DOM refreshes, and bound the claim to the viewports that hold it
```

The row did not exist at `d502bfb`; `d1eea82` introduced it, and `d1eea82` is the commit whose
`app.spec.ts` diff adds `follows the banner when only its copy grows`. The baseline-to-tip delta
confirms four: 1551 - 1547 = 4. The artifact gets it right
(`reviews/ARTIFACTS-round3.md:1159`, "four unit tests"); the ledger's summary table does not.

## F5 - the N6 mutation command this range publishes as R3-21's fix cannot run

`PROD-READINESS.md:502` (R3-21) resolves: "Replaced with commands that were run: a lockfile grep for
the first, the actual edit for the second." The "actual edit" is
`reviews/ARTIFACTS-round3.md:1243-1245`, added by `d1eea82`:

```console
$ sed -n '1243,1245p' reviews/ARTIFACTS-round3.md
$ python3 -c 'p="public/manifest.webmanifest"; s=open(p).read();
    open(p,"w").write(s.replace(chr(34)+"id"+chr(34)+": "+chr(34)+"./"+chr(34),
                                chr(34)+"id"+chr(34)+": "+chr(34)+"/blackjack-trainer/"+chr(34)))'
```

Extracted byte-for-byte from the artifact, with only the leading `$ ` stripped, and executed in a
`git archive 076d49d` export:

```console
$ sed -n '1243,1245p' reviews/ARTIFACTS-round3.md | sed '1s/^\$ //' > n6cmd.sh
$ cd <export> && sh n6cmd.sh; echo "EXIT=$?"
  File "<string>", line 2
    open(p,"w").write(s.replace(chr(34)+"id"+chr(34)+": "+chr(34)+"./"+chr(34),
IndentationError: unexpected indent
EXIT=1
$ grep -n '"id"' <export>/public/manifest.webmanifest
5:  "id": "./",
```

The continuation lines carry their display indentation into the Python source, so `python3 -c` rejects
it and the manifest is left untouched. The block that follows it reports `id is /blackjack-trainer/`
and `CHECK_EXIT=1`, which this command cannot have produced.

**The property itself is true, and I checked it so the finding is not overstated.** Applying the same
mutation with a command that runs, rebuilding, and running the check verbatim from
`.github/workflows/ci.yml:49-56`:

```console
$ python3 -c 'p="public/manifest.webmanifest"; s=open(p).read()
open(p,"w").write(s.replace("\"id\": \"./\"","\"id\": \"/blackjack-trainer/\""))'
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
$ npx ng build --base-href /blackjack-trainer/ --output-path <out>; echo "BUILD_EXIT=$?"
BUILD_EXIT=0
$ node -e '...the check, copied from ci.yml:49-56...' <out>/browser/manifest.webmanifest
id is /blackjack-trainer/
CHECK_EXIT=1
```

So N6's non-vacuity holds. What does not hold is R3-21's claim that the applying command shown is one
that was run: it is a reformatted paraphrase, which is the same class of defect as the block it
replaced.

## F6 - the N2 transcript this range publishes as R3-21's other fix carries the same annotation defect it was written to remove

`PROD-READINESS.md:502` (R3-21) describes the defect as "an `npm ls` output with a trailing `#`
comment npm never prints". The replacement, added by `d1eea82`
(`reviews/ARTIFACTS-round3.md:1265-1266`):

```console
$ sed -n '1265,1266p' reviews/ARTIFACTS-round3.md
$ git show b09470d:package-lock.json | grep -n '"@angular/forms"'
14:        "@angular/forms": "^22.1.0",     # one occurrence: the root dependency
```

Actual:

```console
$ git show b09470d:package-lock.json | grep -n '"@angular/forms"'; echo "exit=$?"
14:        "@angular/forms": "^22.1.0",
exit=0
```

`grep -n` does not print the trailing comment. The substance is right - there is exactly one
occurrence and it is the root dependency - but the transcript shows output the command does not
produce, which is the property R3-21 exists to enforce.

Three lines below, in the same block and pre-existing rather than added by this range, is a second
one (`reviews/ARTIFACTS-round3.md:1286-1287`):

```console
$ sed -n '1286,1287p' reviews/ARTIFACTS-round3.md
$ ls -d node_modules/@angular/forms
node_modules/@angular/forms is gone
$ ls -d node_modules/@angular/forms; echo "ls exit=$?"
ls: node_modules/@angular/forms: No such file or directory
ls exit=1
```

I flag it as context for the finding rather than as a separate one, since it is outside this range.

## F7 - "short by 20px" in the N4 re-measurement is 21 px on the convention the paired line and the component both use

`reviews/ARTIFACTS-round3.md:1138-1142`:

```console
$ sed -n '1138,1142p' reviews/ARTIFACTS-round3.md
EFFECT offer then a failed reload   after updateFailed    reserve=162px banner={top:517.84,height:166.16}  short by 20px
EFFECT offer then the worker breaks after recoveryNeeded  reserve=162px banner={top:504.03,height:179.97}  short by 34px

FIXED  offer then a failed reload   after updateFailed    reserve=183px banner={top:517.84,height:166.16}  short by 0
FIXED  offer then the worker breaks after recoveryNeeded  reserve=196px banner={top:504.03,height:179.97}  short by 0
```

`src/app/app.ts:144-145` reserves `Math.ceil(window.innerHeight - rect.top)`, so at 375x700 the correct
reserve for `top: 517.84` is `ceil(182.16) = 183`, which is exactly what the FIXED line above reports.
The deficit the layout actually carries is therefore `183 - 162 = 21`, not 20. The recovery line in the
same block uses the ceiling convention (`196 - 162 = 34`); the failed-reload line uses the raw
difference (`182.16 - 162 = 20.16`), so two adjacent lines in one four-line block are computed on
different bases. REVIEW-round3-stage3 F2, which this block answers, said 21:

> The banner grew from 145.97 px to 166.16 px and the reserve stayed at 162 px - 21 px short.

Measured here, with a plain `effect` restored in a `git archive 076d49d` export, built development and
served on my own port 4578, no `applyChanges` anywhere - the "short by" column is
`ceil(innerHeight - top) - reserve`:

```console
$ BUILD_DIR=<effbuild>/browser PROBE_PORT=4578 node probe.mjs
B offer                                        reserve= 162px banner={"top":538.03,"height":145.97,"bottom":684} short by 0
B offer then a failed reload (updateFailed)    reserve= 162px banner={"top":517.84,"height":166.16,"bottom":684} short by 21
reset (no banner)                              reserve=   0px banner=null short by null
C offer                                        reserve= 162px banner={"top":538.03,"height":145.97,"bottom":684} short by 0
C offer then the worker breaks (recovery)      reserve= 162px banner={"top":504.03,"height":179.97,"bottom":684} short by 34
```

This is a one-pixel discrepancy in a document that made R3-13 out of the difference between 1.8x and
1.87x, in the block whose whole subject is that the previous figures were taken on the wrong basis.

## F8 - the new `app.scss` comment states a quantity the artifact's own table contradicts

`src/app/app.scss:9-16`, added by `d1eea82` as R3-17's fix:

```console
$ sed -n '9,16p' src/app/app.scss
  // every computed value below is unchanged in the ordinary case. Here it lets a
  // screen that scrolls scroll its last control out from under the banner; the
  // three viewport-sized screens subtract it from their own height instead, so
  // no scrolling is needed wherever the layout has room to give — measured, that
  // is 375x700 and up. Below that the drill's own content (~499px) is already at
  // its minimum, `min-height` cannot shrink past it, and this reserve makes the
  // page scrollable by exactly the banner's height instead: reachable by
  // scrolling rather than not reachable at all.
```

"this reserve makes the page scrollable by exactly the banner's height" is false at one of the two
short viewports the same commit measures, and the artifact's own table
(`reviews/ARTIFACTS-round3.md:1097`) publishes the contradicting number: 320x568 gets 93 px of scroll
against a 162 px reserve. Measured here at the tip build, banner raised by setting the signal, served
on my own port 4579:

```console
$ BUILD_DIR=<devbuild>/browser PROBE_PORT=4579 node probe2.mjs
AFTER  375x700   usv= 162px scrollable=   0px  covered@top=0/7  -> scrolled to 0: covered=0/7
AFTER  1280x800  usv=  91px scrollable=   0px  covered@top=0/7  -> scrolled to 0: covered=0/7
AFTER  700x375   usv=  91px scrollable= 205px  covered@top=0/7  -> scrolled to 205: covered=0/7
AFTER  320x568   usv= 162px scrollable=  93px  covered@top=3/7  -> scrolled to 93: covered=0/7
        covered@top: SplitP | SurrenderR | InsuranceI
AFTER  375x500   usv= 162px scrollable= 161px  covered@top=6/7  -> scrolled to 161: covered=0/7
        covered@top: HitH | StandS | DoubleD | SplitP | SurrenderR | InsuranceI
```

At 320x568 the reserve is 162 px and the page becomes scrollable by 93 px; at 375x500 it is 161 px
against a 162 px reserve. The correct statement is that the reserve makes the page scrollable by **at
most** the banner's height, and by exactly as much of it as the content's own minimum forces past the
viewport. The functional claim in the same sentence is sound - I confirmed every control clears the
banner at maximum scroll on both short viewports, which is the table's last column - so this is a
precision defect in a shipped comment, not a defect in the fix. It is the same shape as R3-17: a
source comment asserting more than the measurement under it.

## F9 - "62 further repeats by two reviewers" is one reviewer, and half of it is not full-suite runs

`PROD-READINESS.md:583-584`, added by `076d49d`:

> and **0 in 460** after, plus 62 further repeats by two reviewers at the shipping commits.

The 62 is 50 + 12, from `reviews/ARTIFACTS-round3.md:248` ("Neither reviewer's own repeats at the
shipping commit (50 and 12 full-suite runs) are counted in that 460"). Both numbers are the stage-1
reviewer's, and the 50 is not full-suite runs:

```console
$ sed -n '289,292p' reviews/REVIEW-round3-stage1.md
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=50
EXIT=0
  50 passed (45.3s)
$ sed -n '447,448p' reviews/REVIEW-round3-stage1.md
12 of 12, `111 passed` every time, zero skipped in every run, and both tests this range touches
passed in all twelve:
```

Fifty executions of one test in 45.3 s cannot be fifty full-suite runs; the full suite takes 35-40 s
per run on this machine. So the ledger's sentence attributes to two reviewers what one reviewer
measured, and describes as full-suite runs an instrument that was `--repeat-each`. The artifact
sentence it derives from predates this range (`d502bfb`); the ledger sentence does not, which is why
it is filed here.

## F10 - "82 full-suite runs in this round" undercounts the round's own records

`PROD-READINESS.md:580`. The four blocks sum correctly:

```console
$ python3 -c 'print(10+30+30+12)'
82
```

But the round's records contain full-suite runs outside those four blocks, and the sentence says "in
this round", not "in the table above":

```console
$ grep -n "111 passed" reviews/ARTIFACTS-round3.md | grep -vE "run[0-9]+ exit"
512:(Two columns for width; the loop ran them in order.) 30 of 30, `111 passed` every time, zero skipped.
618:  111 passed (2.7m)
624:The reviewer re-ran the same extracted script independently and got `111 passed (2.8m)`, 1 worker.
952:| 5 E2E (`CI=true`)   | exit 0, `111 passed`, 1 worker                    |
1453:| 5   | E2E               | `E2E_SERVER=dist npm run e2e`                                                                             | 0    | `111 passed (37.2s)`                           |
```

`:512` is the summary of a counted block and `:624` is a reviewer's run, so neither is an extra.
`:1453` is the gate-5 entry of the stage-3 remediation's own gate table, taken at `d1eea82` - the same
commit as the twelve-run block - and its duration (37.2 s) appears in none of the twelve
(38.1, 37.3, 38.2, 35.9, 40.0, 36.2, 30.3, 37.6, 38.2, 37.0, 38.1, 38.9). `:618` and `:952` are two
more. The true total is at least 85, every extra run is green, and so the direction is conservative:
this is a precision defect, the mildest of the ten, and I record it only because the same section
elsewhere insists on exact denominators.

---

## Reproduced and held

Everything below is a claim from this range that I tried to break and could not.

**The N4 correction is right in a real browser, and the figures are exact.** Built development from a
`git archive 076d49d` export to my own output directory, served on port 4577, Chromium at 375x700,
banner raised by setting the signal and then waiting for the DOM - no `window.ng.applyChanges`
anywhere:

```console
$ BUILD_DIR=<devbuild>/browser PROBE_PORT=4577 node probe.mjs
B offer                                        reserve= 162px banner={"top":538.03,"height":145.97,"bottom":684} short by 0
B offer then a failed reload (updateFailed)    reserve= 183px banner={"top":517.84,"height":166.16,"bottom":684} short by 0
reset (no banner)                              reserve=   0px banner=null short by null
C offer                                        reserve= 162px banner={"top":538.03,"height":145.97,"bottom":684} short by 0
C offer then the worker breaks (recovery)      reserve= 196px banner={"top":504.03,"height":179.97,"bottom":684} short by 0
```

183 px and 196 px, both exact, with the banner geometry matching
`reviews/ARTIFACTS-round3.md:1141-1142` to the hundredth of a pixel. The counterfactual in F7 above -
the same probe against a tree with `afterRenderEffect` reverted to `effect` - gives 162 px in both
states, so the measurement is not vacuous and the primitive is the thing that fixes it.

**The claim that the fourth unit test cannot distinguish the two primitives is true.**
`reviews/ARTIFACTS-round3.md:1190-1194` says so; measured, in an export with the revert applied:

```console
$ cd <export-with-effect> && npx ng test; echo "EFFECT_TEST_EXIT=$?"
 Test Files  67 passed (67)
      Tests  1551 passed (1551)
EFFECT_TEST_EXIT=0
```

This is an admission against interest and it is accurate: the ordering property is guarded by no local
gate, which is what the artifact and K3 both say.

**The fourth test's non-vacuity mutation reproduces exactly.**
`reviews/ARTIFACTS-round3.md:1176-1186` publishes it; run in an export with the two signal reads
deleted from the `afterRenderEffect`:

```console
$ cd <export-with-deps-dropped> && npx ng test; echo "DEPMUT_TEST_EXIT=$?"
DEPMUT_TEST_EXIT=1
      Tests  1 failed | 1550 passed (1551)
 Test Files  1 failed | 66 passed (67)
AssertionError: expected '162px' to be '183px' // Object.is equality
```

**The viewport table's "after" columns reproduce at all five viewports**, including the "covered at
max scroll" column that is new in this range - see the probe output in F8. 375x700 and 1280x800 are
0 of 6 covered with no scroll; 700x375 scrolls; 320x568 is 3 of 6 at rest and 0 of 6 at 93 px;
375x500 is 6 of 6 at rest and 0 of 6 at 161 px. The three viewport-sized screens do carry the
subtraction (`drill-page.scss:8-9`, `home-page.component.scss:7-8`,
`card-counting-page.component.scss:11-12`) and the shell does carry the padding
(`src/app/app.scss:17`).

**Every arithmetic figure in the closing text checks out.**

```console
$ python3 -c 'import math
print("0.945^10 =", round(math.pow(0.945,10),4)); print("1/0.055 =", round(1/0.055,3))
print("6+14+13 =", 6+14+13); print("10+30+30+12 =", 10+30+30+12); print("200+30+200+30 =", 200+30+200+30)'
0.945^10 = 0.568
1/0.055 = 18.182
6+14+13 = 33
10+30+30+12 = 82
200+30+200+30 = 460
$ python3 <clopper-pearson, bisection on the regularized incomplete beta>
CP95 33/600 = 5.50% [3.82%, 7.64%]
CP95 20/400 = 5.00% [3.08%, 7.62%]
CP95 6/200 = 3.00% [1.11%, 6.42%]
CP95 14/200 = 7.00% [3.88%, 11.47%]
CP95 13/200 = 6.50% [3.51%, 10.86%]
```

The ledger's `[3.82%, 7.64%]` for 33/600 is exact, `0.945^10 = 0.57` is right, `1 / 0.055 = 18.2` is
right, the three samples do pool to 33/600, and 460 is the sum of the four after-instruments.

**All eleven of the ledger's links into the artifact resolve**, against anchors derived from the
artifact's own headings:

```console
$ python3 <slugify every heading in ARTIFACTS-round3.md, match every ARTIFACTS-round3.md#... in the ledger>
refs: 11
unresolved: 0
```

**The transcripts corrected by R3-20 and R3-22 reproduce verbatim.**

```console
$ awk 'NR==53' .github/workflows/pages.yml
          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
$ sed -n '49,54p' .github/workflows/pages.yml
      - name: Assemble the site (app + legal pages + SPA fallback)
        run: |
          mkdir -p site
          cp -R dist/blackjack-trainer/browser/. site/
          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
          cp site/index.html site/404.html
$ git show 9aaac6b -- package-lock.json | grep -B3 '^+      "dev": true,' | grep -E '"resolved"|"dev": true'
       "resolved": "https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz",
+      "dev": true,
       "resolved": "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz",
+      "dev": true,
$ grep -rn "omit=dev\|--production" .github/ package.json; echo "exit=$?"
exit=1
$ grep -c "ReactiveFormsModule\|FormsModule\|NgModel" dist/blackjack-trainer/browser/main-*.js
0
```

D1's `awk 'NR==53'` is the line R3-20 corrected it to, K1's `pages.yml:49-54` is the assemble step,
the two lockfile entries R3-22 names are the ones that move, and nothing runs `npm ci --omit=dev`.

**Every source citation I checked resolves.**

```console
$ sed -n '1319,1321p' src/app/features/card-counting/showdown.component.ts
  protected returnToCounting(): void {
    if (this.countCheck() && this.dealt.length > 0 && this.phase() !== 'player-turn') {
      this.countVerdict.set(null);
$ sed -n '60,69p' src/app/core/services/app-update.service.ts
    try {
      // VERSION_READY means the complete update is already cached. Reloading
      // lets the service worker move this client to that version atomically.
      // Do not call activateUpdate(): Angular warns that force-activating before
      // the reload can mix an old app shell with newly named lazy chunks.
      this.reloadPage();
    } catch {
      this.reloading.set(false);
      this.updateFailed.set(true);
    }
$ sed -n '6p' playwright.config.ts
const PORT = 4200;
```

`showdown.component.ts:1319-1326` is the guard the M2 diagnosis rests on, `app-update.service.ts:60-69`
is the try/catch the fourth test drives, and K2's `playwright.config.ts:6` is the hardcoded port.

**"Round 2 ended eight of nine and said so" is true.** `reviews/ARTIFACTS-round2.md:991-994`: "The run
does not end with all nine gates green ... Eight are green."

**The two PATCH-READY findings draw the line where they claim to.** `PROD-READINESS.md:441-442` marks
N1 and N5 PATCH-READY with the orchestration UNVERIFIED, and the M2 re-triage paragraph
(`reviews/ARTIFACTS-round3.md:289-293`) explicitly restricts its deploy claim to "what item 2 does once
it lands", naming ASSUMPTION 2. I found no sentence in this range asserting that a failing step blocks
the deploy as a present fact. The one thing I would have called out - a present-tense deploy claim - is
the same sentence F1 flags, and its defect is the rate, not the tense.

**The M2 fix and its comment are consistent at the tip.** `e2e/smoke/showdown.e2e.ts:73-74` now reads
"33 of 600 unseeded runs across three independent samples (6/200, 14/200, 13/200)", which matches the
artifact's instrument table and the ledger, and `:77` passes seed 1.

**The gate table's own accounting is right.** Coverage moved from the baseline's
96.11 / 93.23 / 93.28 / 97.97 to 96.16 / 93.28 / 93.22 / 98.00 and the artifact attributes it to this
round's additions to `app.ts` and `app.spec.ts`; the file count is unchanged at 74 with 0 under
`tools/`; unit tests are 1547 + 4; the iOS gates reproduce the baseline exactly.

## Method notes and limits

- I did not re-run the twelve-run closing block or either 30-run block. Five full-suite runs and one
  `--repeat-each=30` are what I took, and I have reported them as the small samples they are.
- The mutation experiments ran in `git archive 076d49d` exports with `node_modules` symlinked from the
  checkout. No mutant was ever written into the working tree, and `git status --porcelain` printed only
  `.agents/` and `.codex/` before, during and after.
- I could not falsify the ledger's "Nothing else was running on the machine" for the published gate
  runs; that is not checkable after the fact.
- `dist/` was rebuilt by gate 2 and by the E2E lane and is gitignored. `site/` was never created. The
  three probe ports (4577, 4578, 4579) and 4200 were confirmed free after my last run.
