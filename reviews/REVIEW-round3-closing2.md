# REVIEW - round 3, closing, remediation cycle 1

**Verdict: PASS-WITH-FINDINGS**

Range reviewed: `4f39478..fb9392c`, one commit - "unbreak the gate the last commit reddened and answer the twelve record defects the closing review found".
It answers `reviews/REVIEW-round3-closing.md` (REJECT, findings F1-F12), which I cite below as `closing-F1` .. `closing-F12`.
My own findings are `F1` .. `F5`.

The two things that forced the REJECT are both gone.
`npm run lint` exits 0 at the tip and 1 at the parent, and `closing-F2` - the N4 test count the previous remediation recorded as corrected without correcting - is corrected.
Eleven of the twelve are fully fixed; the twelfth (`closing-F5`) is fixed on the point the previous review's remediation list actually demanded, with its secondary half still open (my F2).

The commit is records-only and touches three files, not two: `PROD-READINESS.md`, `reviews/ARTIFACTS-round3.md`, and `reviews/REVIEW-round3-closing.md`, the review it answers, added whole.
That last one is the same practice `4f39478` used for `reviews/REVIEW-round3-final.md`, so I record it as scope information rather than a finding.

```console
$ git show --name-only --format="" fb9392c
PROD-READINESS.md
reviews/ARTIFACTS-round3.md
reviews/REVIEW-round3-closing.md

$ git diff --stat 4f39478 fb9392c
 PROD-READINESS.md                |  73 ++---
 reviews/ARTIFACTS-round3.md      |  10 +-
 reviews/REVIEW-round3-closing.md | 640 +++++++++++++++++++++++++++++++++++++++
 3 files changed, 683 insertions(+), 40 deletions(-)
```

## The gates

Run in the live checkout at `fb9392c` with the tool sandbox disabled.
`git status --porcelain` printed only `.agents/` and `.codex/` before and after.

| #   | gate       | command         | exit  | result                                                |
| --- | ---------- | --------------- | ----- | ----------------------------------------------------- |
| 1   | lint       | `npm run lint`  | **0** | **GREEN** - the regression `closing-F1` filed is gone |
| 2   | build      | `npm run build` | 0     | the inherited chart-page budget warning, unchanged    |
| 3   | unit tests | `npm test`      | 0     | 67 files, 1551 passed                                 |

```console
$ npm run lint > /tmp/claude/lint.out 2>&1; echo "LINT_EXIT=$?"
LINT_EXIT=0
$ tail -6 /tmp/claude/lint.out
> blackjack-trainer@1.0.0 format:check
> prettier --check .

Checking formatting...
All matched files use Prettier code style!

$ npm run build > /tmp/claude/build.out 2>&1; echo "BUILD_EXIT=$?"
BUILD_EXIT=0
                    | Initial total                       | 289.00 kB |                76.65 kB
Application bundle generation complete. [2.687 seconds]
▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget. Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.

$ npm test > /tmp/claude/test.out 2>&1; echo "TEST_EXIT=$?"
TEST_EXIT=0
 Test Files  67 passed (67)
      Tests  1551 passed (1551)
   Duration  5.46s
```

**I did not run E2E, deliberately.**
The commit changes three `.md` files and nothing else - no `.ts`, no `e2e/`, no config, no fixture, no workflow - so gate 5's inputs are byte-identical to `4f39478`, where the closing reviewer made the same call for the same reason and `076d49d` before it was measured five times at `111 passed`.
`lsof -nP -iTCP:4200 -sTCP:LISTEN` exited 1 before and after my work and I never bound the port.
`git diff --exit-code -- ios/Fixtures` exits 0, I did not run `npm run export:fixtures`, and no `site/` directory exists or was created.
All mutation work ran in a `git archive fb9392c` export under my scratch directory with `node_modules` symlinked; nothing was written into the checkout.

## Scope: no round-1 or round-2 record was touched

`# ROUND 3` starts at `PROD-READINESS.md:394`, and every hunk in the commit is below it.

```console
$ git diff 4f39478 fb9392c -- PROD-READINESS.md | grep -E "^@@"
@@ -436,7 +436,7 @@ unreachable resource). Severity is re-triaged from scratch.
@@ -477,38 +477,38 @@ Defects this run put into its own output. Per the run's rules these are regressi
@@ -532,7 +532,7 @@ Findings discovered after round 3's work list froze. Not fixed in this run.
@@ -585,8 +585,9 @@ distinguish a fixed gate from a lucky one.

$ for c in 4f39478 fb9392c; do git show "$c:PROD-READINESS.md" | sed -n '1,393p' > pre-$c.md; done
$ diff pre-4f39478.md pre-fb9392c.md; echo "PRE_ROUND3_DIFF_EXIT=$?"
PRE_ROUND3_DIFF_EXIT=0
```

Everything before `# ROUND 3` is byte-identical, which covers the round-2 `FF-n` rows at `:105`-`:112`, `N9` at `:177`, the `FF-5` citation at `:308` and every `R2-n` row at `:369`-`:382`.

The commit widens the round-3 regression table's `id` column, which re-pads all thirty rows.
Compared cell by cell, only five bodies changed and only the seven `final` rows were renamed:

```console
$ python3 <split every "| **R3-n**" row into cells at both commits and compare>
ids at parent: 30
ids at tip   : 30
only at parent: []
only at tip   : []
R3-1    BODY CHANGED
R3-18   BODY CHANGED
R3-24   BODY CHANGED  ID CHANGED  **R3-24** (FF-1, FF-2) -> **R3-24** (round3-final F1, round3-final F2)
R3-25   SAME          ID CHANGED
R3-26   BODY CHANGED  ID CHANGED
R3-27   BODY CHANGED  ID CHANGED
R3-28   SAME          ID CHANGED
R3-29   SAME          ID CHANGED
R3-30   SAME          ID CHANGED
```

`R3-2` .. `R3-17` and `R3-19` .. `R3-23` are untouched apart from padding.

## Anchors

Every `reviews/ARTIFACTS-round3.md#...` reference in the ledger resolves against a real heading, slugified GitHub-style.

```console
$ python3 <slugify every heading in ARTIFACTS-round3.md; match every ARTIFACTS-round3.md#... reference>
headings: 52
PROD-READINESS.md: refs=11 unresolved=0 []
reviews/REVIEW-round3-closing.md: refs=1 unresolved=0 []
reviews/REVIEW-round3-final.md: refs=3 unresolved=3 [...]
reviews/REVIEW-round3-stage2.md: refs=5 unresolved=1 [...]
```

The four unresolved are the same ones the closing review cleared: they are inside `console` fences in review prose, transcripts of the dead anchors under discussion, not live links.

## Did each of closing-F1 .. closing-F12 get fixed?

| closing finding | verdict            | why                                                                                |
| --------------- | ------------------ | ---------------------------------------------------------------------------------- |
| closing-F1      | **fixed**          | `npm run lint` exits 0 at the tip, 1 at the parent                                 |
| closing-F2      | **fixed**          | `:535` says four, and there are four                                               |
| closing-F3      | **fixed**          | the false distance is gone, replaced by a true vaguer one                          |
| closing-F4      | **fixed**          | R3-18's row was actually edited this time and no longer claims finality            |
| closing-F5      | **fixed in part**  | the prediction is gone; the superseded rate in R3-3 is not (F2)                    |
| closing-F6      | **fixed**          | R3-1 now says three and points at R3-24                                            |
| closing-F7      | **fixed**          | I reconstructed `out/step05.sh` and ran the block; every published line reproduces |
| closing-F8      | **fixed**          | `out/step05.sh`, and it really is step 5 of `ci.yml`'s `pages-bundle` job          |
| closing-F9      | **fixed**          | "deleted, not moved", and the annotation is absent                                 |
| closing-F10     | **fixed**          | the artifact now matches the ledger; both attributions verified against stage 1    |
| closing-F11     | **fixed, widened** | the five runs are named and real; the widened category is not all green (F1)       |
| closing-F12     | **fixed**          | `round3-final Fn`, and the final review numbers its findings `F1` .. `F10`         |

Each one below, with the check re-run.

### closing-F1 - the commit took `npm run lint` red

Fixed, and this is the gate that mattered.
The parent's `PROD-READINESS.md` still fails the formatter on its own; the tip's passes, and so does the whole repository.

```console
$ git show 4f39478:PROD-READINESS.md > /tmp/claude/prod-parent.md
$ npx prettier --check --parser markdown /tmp/claude/prod-parent.md
[warn] ../../../../tmp/claude/prod-parent.md
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
PARENT_PRETTIER_EXIT=1

$ npx prettier --check PROD-READINESS.md reviews/ARTIFACTS-round3.md reviews/REVIEW-round3-closing.md
Checking formatting...
All matched files use Prettier code style!
TIP_PRETTIER_EXIT=0
```

The whole repair is the padding on `PROD-READINESS.md:439`: the M2 cell's text is unchanged, only its trailing spaces moved.
The commit also re-padded the regression table's `id` column, which the `FF-n` rename widened, so both edits landed formatter-clean.

### closing-F2 - the ledger credited N4 with three unit tests

Fixed, and the replacement text is true rather than merely different.

```console
$ grep -n "N4: four tests\|four added for N4\|N4: three tests" PROD-READINESS.md
535:| `src/app/app.spec.ts` | N4: four tests pinning the measurement, its dependency list and its return to zero |
564:| 3   | unit tests | 0 | 67 files, 1551 passed (baseline 1547; four added for N4) |
```

There are four, they are the four in one `describe`, and the three-way split the new sentence claims is the split the file itself uses.

```console
$ grep -n "it(\|describe(" src/app/app.spec.ts | sed -n '/the space the update banner/,/reloads into/p'
140:  describe('the space the update banner stands in front of', () => {
171:    it('is zero while no banner is up', () => {
179:    it('is the banner height plus the gap it floats above, once one is up', () => {
209:    it('follows the banner when only its copy grows', () => {
231:    it('goes back to zero when the offer is dismissed', () => {
```

`:209` is the dependency-list one - its own comment at `:198`-`:201` says "What this pins is the dependency", and `:231` is the return to zero.
The count also reconciles against history: `app.spec.ts` went 13 -> 16 at `9aaac6b` (N4's own commit) and 16 -> 17 at `d1eea82`, which is the fourth test and the commit `closing-F2` said added it.

```console
$ for c in 9ffd5b9 9aaac6b d1eea82 fb9392c; do printf '%s it=' "$c"; git show "$c:src/app/app.spec.ts" | grep -c 'it('; done
9ffd5b9 it=13
9aaac6b it=16
d1eea82 it=17
fb9392c it=17
```

### closing-F3 - R3-26's "nineteen lines below" is twenty-nine

Fixed by deletion: `PROD-READINESS.md:507` now reads "The gate table further down the same file says four".
Vaguer, and true - the two rows are at `:535` and `:564`, and `:564` is further down.
An unfalsifiable phrase in place of a false number is the right trade in a row whose only job is to describe an edit.

### closing-F4 - R3-24 claimed an edit to R3-18 that was not made

Fixed.
This is the one that mattered most, because `closing-F4` was an instance of the round's recurring failure - a resolution column reporting an edit that is not in the diff.
This time the edit is in the diff.
R3-18's resolution column across the two commits:

```console
$ git show 4f39478:PROD-READINESS.md | grep -m1 -F '**R3-18**' | awk -F'|' '{print $5}'
All corrected to the three-sample pooled 5.5% (33/600), the section heading rewritten so it no
longer contains a rate at all - the anchor stops moving with the number - and completeness verified
by grep rather than asserted. R3-1 and R3-11's resolution columns no longer claim finality.

$ git show fb9392c:PROD-READINESS.md | grep -m1 -F '**R3-18**' | awk -F'|' '{print $5}'
Corrected to the three-sample pooled 5.5% (33/600). This row's own claims - that the heading no
longer contained a rate, and that completeness had been verified by grep - were both wrong: the
heading still read "about one run in eighteen" and two live sentences still said 5%. See R3-24,
which is the correction that held.
```

"All corrected" and "completeness verified by grep" - the two finality claims `closing-F4` named - are gone, so R3-24's "R3-18's row no longer claims finality" is now true of the tree.
The new self-description is also true: the heading really did still carry the rate at the commit R3-18 describes.

```console
$ for c in 9aaac6b d502bfb d1eea82 076d49d 4f39478 fb9392c; do printf '%s  ' "$c"; git show "$c:reviews/ARTIFACTS-round3.md" | grep -m1 '^## M2'; done
9aaac6b  ## M2 - the E2E gate is red about one run in twenty, and it is the test that is wrong
d502bfb  ## M2 - the E2E gate is red about one run in twenty, and it is the test that is wrong
d1eea82  ## M2 - the E2E gate fails on one test about one run in eighteen, and it is the test that is wrong
076d49d  ## M2 - the E2E gate fails on one test about one run in eighteen, and it is the test that is wrong
4f39478  ## M2 - the E2E gate fails on one test, and it is the test that is wrong
fb9392c  ## M2 - the E2E gate fails on one test, and it is the test that is wrong
```

`d1eea82` is R3-18's commit, and its heading contains "about one run in eighteen".
The row's account of itself is accurate.

### closing-F5 - "the fourth and last time this number needed correcting"

Fixed on the prediction, which is what the closing review's remediation list demanded.
`PROD-READINESS.md:505` now ends: "This is the fourth correction of this number; whether it is the last is not something this row can assert, and R3-1, R3-11 and R3-18 each asserted it and were wrong."

That last clause is itself checkable, and it checks out - each of the three did assert completeness in its original form:

```console
$ git show 772e4a7:PROD-READINESS.md | grep -m1 -F '**R3-1**'   # R3-1 as written
... the rate is corrected in the artifact, the ledger and `showdown.e2e.ts`.
$ git show d502bfb:PROD-READINESS.md | grep -m1 -F '**R3-11**'  # R3-11 as written
All three corrected, and the rate is now the three-sample pooled 5.5% rather than the two-sample 5.0%.
$ git show d1eea82:PROD-READINESS.md | grep -m1 -F '**R3-18**'  # R3-18 as written
All corrected ... and completeness verified by grep rather than asserted.
```

The second half of `closing-F5` - the superseded pooled rate still in R3-3 - is untouched.
It is now load-bearing in a way it was not before, because two rows in the same table newly assert that R3-24 "is the correction that held".
That is my F2.

### closing-F6 - R3-1 was falsified by R3-24 in the same table

Fixed.
`PROD-READINESS.md:482` now reads "This row's claim that the rate was corrected everywhere was wrong three times more: R3-11, R3-18 and R3-24. R3-24 is the correction that held, and the claim is not repeated here."
Three, not two, and the pointer is at R3-24 rather than at R3-18.
The counting is right: R3-11 found three survivors, R3-18 found seven, R3-24 found two - three subsequent falsifications of R3-1's original "corrected in the artifact, the ledger and `showdown.e2e.ts`".

The disproved rate itself no longer survives in a live sentence anywhere.
The closing review's own completeness grep, re-run over the tree with the review documents that quote the defect excluded:

```console
$ grep -rn "one run in twenty\|one in twenty\|1 run in 20\|20 / 400\|20/400\|5% per execution\|5%-per-execution\|5\.0%\|0\.97\^10\|3% per execution" --include="*.md" --include="*.ts" --include="*.scss" --include="*.yml" . | grep -v node_modules | grep -v "reviews/REVIEW-round3"
PROD-READINESS.md:482:  ... Both samples pooled: 20/400 = **5.0%** ...              (R3-1, describing its own history)
PROD-READINESS.md:505:  ... still said 5% and "one run in twenty" ...                (R3-24, quoting the defect)
reviews/ARTIFACTS-round3.md:152:  ... 6.5% per execution                            (a sample row)
reviews/ARTIFACTS-round3.md:186:  ... the pooled figure moved from 5.0% to 5.5% ...  (the narrative of the move)
reviews/ARTIFACTS-round3.md:286:  The rate is 5.5% per execution ...
reviews/ARTIFACTS-round3.md:290:  ... a 5.5%-per-execution flake ...
```

Four of the six are the current rate or an explicitly historical statement; the other two are a row describing its own superseded claim and a row quoting the defect it fixed.
No present-tense sentence asserts the old rate.

### closing-F7 - the N6 block published two lines neither command produced

Fixed, and this is the one I re-derived from scratch rather than read.

`reviews/ARTIFACTS-round3.md:1244-1253` is now:

```console
$ sed -n '1244,1253p' reviews/ARTIFACTS-round3.md
$ sed -i '' 's|"id": "./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null
$ bash -e out/step05.sh; echo "CHECK_EXIT=$?"
id is /blackjack-trainer/
CHECK_EXIT=1
$ # manifest restored from the copy taken before the edit, rebuilt
$ bash -e out/step05.sh; echo "RESTORED_EXIT=$?"
RESTORED_EXIT=0
```

Both exit labels now come from an `echo` the block shows, which is exactly what `closing-F7` asked for.
I reconstructed `out/step05.sh` mechanically - parse `.github/workflows/ci.yml`, find the `run: |` block of the step whose `name:` contains "relocatable", dedent it - and confirmed the extraction against the raw YAML:

```console
$ python3 <extract the run: block of the relocatability step from ci.yml>
$ sed -n '44,56p' .github/workflows/ci.yml | sed 's/^          //' > step05.ref
$ diff out/step05.sh step05.ref; echo "EXTRACTION_MATCHES_YAML exit=$?"
EXTRACTION_MATCHES_YAML exit=0
```

Then I ran the published block end to end in a `git archive fb9392c` export with `node_modules` symlinked:

```console
$ cp public/manifest.webmanifest manifest.bak
$ sed -i '' 's|"id": "./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest; echo "sed exit=$?"
sed exit=0
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null; echo "build exit=$?"
build exit=0
$ bash -e out/step05.sh; echo "CHECK_EXIT=$?"
id is /blackjack-trainer/
CHECK_EXIT=1
$ cp manifest.bak public/manifest.webmanifest
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null 2>&1; echo "rebuild exit=$?"
rebuild exit=0
$ bash -e out/step05.sh; echo "RESTORED_EXIT=$?"
RESTORED_EXIT=0
```

Every published line reproduces byte for byte, including the `5:` prefix on the grep and the absence of any output above `RESTORED_EXIT=0`.
The `#` comment about the restore is load-bearing and honest: without the rebuild the check still reads the mutated bundle and exits 1, so the block would not be reproducible without it.

One line of the block is still not what the terminal shows - the build line, which emits 196 bytes on stderr that `> /dev/null` does not suppress.
That is my F3, and it is a smaller thing than what `closing-F7` filed: an omission, not an invented label.

### closing-F8 - the block cited `step05.sh` where the document establishes `out/step05.sh`

Fixed, and the name is right on the merits, not just consistent.
The four other `bash -e out/step05.sh` invocations, at `reviews/ARTIFACTS-round3.md:762`, `:775`, `:785` and `:789`, are the N5 non-vacuity mutations, and the artifact's own runner summary at `:736`-`:743` shows that this script is step 5 of `ci.yml`'s `pages-bundle` job:

```console
$ sed -n '736,743p' reviews/ARTIFACTS-round3.md
$ ruby run-workflow-steps.rb .github/workflows/ci.yml pages-bundle out/ "npm ci"
 1  not-a-run-step               actions/checkout@v5
 2  not-a-run-step               actions/setup-node@v5
 3  SKIPPED (non-local resource) npm ci
 4  PASS                         npm run build -- --base-href /blackjack-trainer/
 5  PASS                         The deployed bundle must be relocatable under a sub-path
```

Counting the same steps in `.github/workflows/ci.yml:32-56` gives the relocatability check as step 5 of that job, so `out/step05.sh` is the same file the N5 blocks run - which is correct, because N6 extends the same check.

### closing-F9 - R3-27 said the grep annotation was "moved"

Fixed.
`PROD-READINESS.md:508` now says "The grep's trailing `#` annotation was deleted, not moved", and it is absent:

```console
$ grep -rn "one occurrence" reviews/ARTIFACTS-round3.md PROD-READINESS.md
exit=1
```

The N2 block at `reviews/ARTIFACTS-round3.md:1267-1275` carries no annotation on any line.
The rest of R3-27's rewritten resolution is true too: the mutation is a `sed` that was executed (verified under `closing-F7`), each exit label is shown as the `echo` that prints it, and the script is named as the rest of the document names it.

### closing-F10 - the artifact contradicted the corrected ledger

Fixed.
`reviews/ARTIFACTS-round3.md:247-249` now reads "The stage-1 reviewer's own repeats at the shipping commit - 50 executions of this one test via `--repeat-each`, and 12 full-suite runs - are not counted in that 460."
One reviewer, and the two instruments distinguished, which is what the ledger at `:592`-`:593` says.
Both attributions check out against stage 1 directly:

```console
$ sed -n '287,292p' reviews/REVIEW-round3-stage1.md
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=50
EXIT=0
  50 passed (45.3s)
$ sed -n '447p' reviews/REVIEW-round3-stage1.md
12 of 12, `111 passed` every time, zero skipped in every run, and both tests this range touches
```

And "not counted in that 460" is true of the arithmetic it qualifies: the 460 is the four instruments in the artifact's own table at `:222`-`:226` (200 + 30 + 200 + 30), none of which is the reviewer's.
The two probabilities in the same paragraph also hold: `0.945^460 = 4.996e-12` and `0.9618^460 = 1.656e-8`, published as `5.0e-12` and `1.7e-8`.

### closing-F11 - R3-30's enumeration was short by five runs

Fixed on the count.
`PROD-READINESS.md:588-590` now names them, and they are real:

```console
$ sed -n '117,121p' reviews/REVIEW-round3-final.md
run1 exit=0   111 passed (39.7s)
run2 exit=0   111 passed (36.7s)
run3 exit=0   111 passed (37.5s)
run4 exit=0   111 passed (37.1s)
run5 exit=0   111 passed (35.3s)
```

The fix widened the enumerated category from two named items to "the reviewers' own runs", and the "all green" predicate went with it.
That is my F1.

### closing-F12 - the rows cited finding ids that exist nowhere

Fixed.
The seven `final` rows now cite `round3-final Fn`, and the final review numbers its findings `F1` .. `F10`:

```console
$ grep -nE "^#+ +F[0-9]+" reviews/REVIEW-round3-final.md
156:## F1 - R3-18 says the disproved M2 rate was corrected everywhere ...
209:## F2 - R3-18 says the M2 heading no longer contains a rate ...
236:## F3 - the closing paragraph says one of the 30-run blocks ...
273:## F4 - the ledger says N4 added three tests ...
308:## F5 - the N6 mutation command this range publishes as R3-21's fix cannot run
359:## F6 - the N2 transcript this range publishes as R3-21's other fix ...
397:## F7 - "short by 20px" in the N4 re-measurement is 21 px ...
435:## F8 - the new `app.scss` comment states a quantity ...
476:## F9 - "62 further repeats by two reviewers" is one reviewer ...
503:## F10 - "82 full-suite runs in this round" undercounts ...
$ grep -c "FF-[0-9]" reviews/REVIEW-round3-final.md
0
```

Every mapping is correct: F1/F2 to R3-24, F3 to R3-25, F4 to R3-26, F5/F6 to R3-27, F7 to R3-28, F8 to R3-29, F9/F10 to R3-30.
The new form diverges from round 2's `(FF-n)` convention at `:380`-`:382` and from round 3's own `(S2-F1)` / `(S3-F8)` form, but it is the only one of the three that a reader can follow without guessing, so I record the inconsistency and file nothing.

---

## Findings

### F1 - "the reviewers' own runs ... all green" is contradicted by K2, in the same file

`PROD-READINESS.md:587-590`, rewritten by this commit to fix `closing-F11`:

> 82 full-suite runs in the four blocks above, one failure, and that failure is a second defect this round then fixed.
> The round's records contain more outside the table - the CI-mode step run under N1, each stage's own gate check, and the reviewers' own runs, including five at `076d49d` in `reviews/REVIEW-round3-final.md` - **all green**; 82 is the table's total, not the round's.

The old sentence enumerated two things and said all green of those two.
The new one adds an open-ended third, "the reviewers' own runs", and keeps the predicate.
The round's records contain twelve reviewer full-suite runs that were not green, and the ledger itself is where they are recorded:

```console
$ grep -n '\*\*K2\*\*' PROD-READINESS.md | cut -c1-420
520:| **K2** | P3 | `playwright.config.ts:6` hardcodes `const PORT = 4200` ... a second run either fails to start or - as happened twice in this round - has its server killed by whoever mistakes it for an orphan. It cost this run one invalidated CI-mode transcript and the stage-1 reviewer twelve aborted runs.

$ sed -n '549,556p' reviews/REVIEW-round3-stage1.md
One operational note, since it cost me a whole twelve-run loop. My first attempt at the final loop
returned `exit=1` twelve times in a row, in seconds each, with no test summary at all:

$ tail -3 final-run1.txt
Error: http://127.0.0.1:4200 is already used, make sure that nothing is running
on the port/url or set reuseExistingServer:true in config.webServer.
```

Those twelve were `E2E_SERVER=dist npm run e2e` attempts at a shipping commit and they exited 1.
They are reviewer runs, they are in the round's records, and they were not green - K2 is sixty-seven lines above the sentence that now says otherwise.
Separately, the reviewers' `--repeat-each` measurements with the fix reverted (14/200 at stage 1, 13/200 at stage 2) are also reviewer runs and also not green, though the paragraph's "full-suite" framing arguably excludes them.

The narrow fix `closing-F11` asked for was to add the five runs.
Adding them inside a category widened to all reviewer runs is the over-correction: it trades a true undercount for a false completeness claim, which is the failure mode this round has now recorded four times for the M2 rate.
Naming the five and stopping - or writing "the reviewers' own full-suite runs at the shipping commits" - would be true.

### F2 - the superseded pooled rate is still in R3-3, and two rows now assert the correction "held"

`PROD-READINESS.md:484`, unchanged by this commit, against `reviews/ARTIFACTS-round3.md:246`:

```console
$ grep -rn "0\.95\^460\|0\.945\^460" PROD-READINESS.md reviews/ARTIFACTS-round3.md
PROD-READINESS.md:484: | **R3-3** ... | 460, with the power recomputed against the pooled before-rate: `0.95^460 = 5.7e-11`. |
reviews/ARTIFACTS-round3.md:246: chance of 460 consecutive passes is `0.945^460 = 5.0e-12`; at the low end of the pooled interval

$ python3 -c 'import math; print(math.pow(0.95,460), math.pow(0.945,460))'
5.66054741891586e-11 4.996109108854475e-12
```

Both are arithmetically correct.
They are the same quantity computed from two different pools - 5.0%, superseded, and 5.5%, current - and the two documents disagree about it by an order of magnitude.
R3-3's phrase is present tense and unqualified: "the pooled before-rate" is 5.5%, not 5%.

This was filed twice before at low confidence, both times on the ground that R3-3 is a historical row making no live claim.
That ground is weaker now, for two reasons this commit created.
First, `PROD-READINESS.md:482` (R3-1) and `:499` (R3-18) both newly assert "R3-24 is the correction that held" - a completeness claim about the same number, relocated into the two rows that were just cleaned of exactly that claim, while R3-24 itself carefully declines to make it.
Second, this is the identical shape as `closing-F10`, which this commit did fix: a number corrected in the artifact and left standing in the ledger.

By my grep under `closing-F6` the rate itself has held everywhere it is asserted in the present tense, so "held" is currently true on the narrow reading.
On the reading a reader will take - the number is right everywhere now - `PROD-READINESS.md:484` is the counterexample, and it has survived four corrections.
Either qualify R3-3 ("against the then-pooled 5.0%") or recompute it.

### F3 - the N6 block's build line shows no output; the command emits 196 bytes on stderr

`reviews/ARTIFACTS-round3.md:1247`, a line this commit wrote (the parent chained the same build into `step05.sh` with `&&`):

```console
$ sed -n '1247,1248p' reviews/ARTIFACTS-round3.md
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null
$ bash -e out/step05.sh; echo "CHECK_EXIT=$?"
```

Nothing is published between the two prompts, but `> /dev/null` redirects stdout only, and this build writes the chart-page budget warning to stderr.
Measured in the same `git archive fb9392c` export the block reproduces in:

```console
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null 2> stderr.txt; echo "exit=$?"
exit=0
$ sed 's/\x1b\[[0-9;]*m//g' stderr.txt
▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget. Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.

$ wc -c < stderr.txt
     196
```

This is the fourth consecutive remediation of this block, and it is much closer than the previous three: everything else in it is byte-exact, and this is an omission rather than a fabrication.
The published warning is also the same one gate 2 has carried all round, so nothing is hidden by it.
Recorded because the block's whole purpose is to be a transcript, and because the previous reviewer's own re-run annotated the line `(build exit=0)` rather than showing what it prints - so this is the first time it has been looked at.
Either append ` 2>&1` to the published command, or show the warning.

### F4 - R3-24's resolution column contains a comma splice that swallows a sentence boundary

`PROD-READINESS.md:505`:

> R3-18's row no longer claims finality, This is the fourth correction of this number; whether it is the last is not something this row can assert, and R3-1, R3-11 and R3-18 each asserted it and were wrong.

The parent read "...no longer claims finality, and this is the fourth and last time this number needed correcting."
The remediation replaced the trailing clause with a new sentence and left the comma, producing a capitalised `This` after a comma.
Purely editorial, no claim is affected, but it is in a cell this commit rewrote for truthfulness and it reads as an unproofread edit.
The fix is a full stop.

### F5 - the closing paragraph's inserted text is 114 characters in a file wrapped at 100

`PROD-READINESS.md:588`:

```console
$ awk 'NR>=587 && NR<=592 {printf "%d len=%d\n", NR, length($0)}' PROD-READINESS.md
587 len=98
588 len=114
589 len=75
590 len=91
591 len=101
592 len=99
```

`.prettierrc` sets `printWidth: 100`, and the paragraph around it is wrapped to that.
Prettier's `proseWrap` default is `preserve`, so this does not fail the formatter and gate 1 stays green - I am filing it as a nit, not a gate issue.
It is the same carelessness that produced `closing-F1` though: text edited in place inside a formatted block without re-wrapping the block.
This time the formatter does not care; last time it took the repository red.

---

## Checked and held

- **The `closing-F7` block reproduces end to end**, from a `step05.sh` reconstructed from `ci.yml` rather than taken on trust, with the extraction diffed against the raw YAML.
  Every published line matches except the omitted stderr (F3).
- **`ios/Fixtures` is clean** (`git diff --exit-code -- ios/Fixtures`, exit 0), and nothing in range can move a fixture.
  I did not run `npm run export:fixtures`.
- **No `site/` directory** exists or was created (`ls -d site` exits 1).
- **Port 4200 was free before and after** (`lsof -nP -iTCP:4200 -sTCP:LISTEN` exit 1); I never bound it and never touched the stray listener on `[::1]:4321`.
- **The npm registry was never contacted.** The export symlinks the checkout's `node_modules`.
- **Working tree left as found**: `git status --porcelain` prints `?? .agents/`, `?? .codex/` and this file.
- **The `RESTORED_EXIT=0` half of the N6 block genuinely needs its rebuild.** Skipping the rebuild leaves the mutated manifest in `dist/` and the check exits 1, so the `#` comment is not decoration.
- **The four older `CHECK_EXIT=` lines in the N5 section** (`reviews/ARTIFACTS-round3.md:763`, `:776`, `:786`, `:790`) still show `bash -e out/step05.sh` printing a label the script does not emit.
  They are pre-existing, outside this range, and the closing review recorded them as context rather than filing them; I do the same.
  The one consequence of fixing only the N6 copy is that the same command now appears in the document in two mutually inconsistent forms.
- **The commit adds `reviews/REVIEW-round3-closing.md` whole**, which is a third file rather than the two the range description names.
  It is the review being answered, added by the commit that answers it, exactly as `4f39478` added `reviews/REVIEW-round3-final.md`.
  Not a scope violation; recorded so the file count is not a surprise.
- **The M2 anchor fix from `closing-F2`'s predecessor still holds.** The heading carries no number, so the next time the pooled rate moves the anchor will not move with it.

## Does the round close here?

**Yes.**
The two blocking conditions are discharged: `npm run lint` exits 0 at the tip, and `closing-F2` - the finding the previous commit recorded as fixed without fixing - is fixed and verified against the source rather than against the ledger's own account of it.
Eleven of the twelve are fully fixed, the twelfth on the point the remediation list demanded, and I re-ran each check rather than reading the resolution column.
Nothing in this range touches code, tests, config, workflows or fixtures; gates 1, 2 and 3 are green and gate 5's inputs are byte-identical to the commit where it was last measured.

My five findings are all records defects in `PROD-READINESS.md` and `reviews/ARTIFACTS-round3.md`.
None of them takes a gate red, none contradicts a measurement, and none of them is the "a resolution column claims an edit that is not in the diff" pattern that justified the REJECT.
F1 and F2 are the two worth fixing if a second cycle happens for any other reason: F1 because it is a false completeness claim of the exact kind the round keeps recording against itself, and F2 because it is a number the ledger and the artifact still disagree about after four corrections.
F3, F4 and F5 are one-line repairs.

If the round closes on `fb9392c` as it stands, the honest summary is that its records carry one over-broad "all green", one stale power computation, one elided stderr line, one comma splice and one long line - and that every substantive claim about the code, the gates and the measurements checks out.

**Gate check on this file**, since a formatting failure here is the defect that caused the review I am answering:

```console
$ npx prettier --check reviews/REVIEW-round3-closing2.md
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0
```
