# ARTIFACTS - round 4

Evidence for every round-4 finding: the defect present, then absent, produced by running the thing.
Baseline for every "green" claim in here: [`reviews/BASELINE-round4.md`](BASELINE-round4.md).

- Branch: `prod-readiness/round4-2026-08-12`
- Base commit: `f5e8fc8cd952751986aff69b8810cc8b86bd135d`

## P1 - the records check

Round 3's code survived six adversarial reviews. Its **records** produced 31 regressions, and this is
the finding that exists to make that class of defect impossible rather than merely discouraged.

### What it refuses

`tools/check-records.mjs`, run from `npm run lint`, over 25 documents: `PROD-READINESS.md`,
`LAUNCH-CHECKLIST.md` and everything under `reviews/`.

| rule | refuses                                                                                                                                            | the round-3 defect it answers |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | a markdown link to a `#anchor` that no heading in the target file slugs to                                                                         | R3-12                         |
| 2    | a `file:line` citation that names no tracked file, runs past the end of one, or - for a file this branch has changed - is not pinned to a fragment | R3-20                         |
| 3    | a ```console fence printing a `NAME=` line that no `echo` in the fence could have produced                                                         | R3-15, R3-27                  |
| 4    | a round-level figure (unit-test count, coverage quadruple, pooled M2 count and rate) stated with any value but the current one                     | R3-1, R3-11, R3-18, R3-24     |

### What it does not refuse, stated because a gate's blind spots matter more than its rules

- **Closed rounds are exempt from rules 3 and 4.** A `<!-- records: historical-file -->` marker at the
  top of each closed round's record, and a `<!-- records: historical -->` marker under each closed
  round's heading in the ledger, lift the transcript and figure rules there. Those records were true
  at the commits that produced them and this round does not rewrite them. This is the explicit escape
  the brief allows, taken deliberately and at one granularity rather than sprinkled per line - and
  the census below says exactly what it is exempting.
- **Citations are not exempt anywhere.** The ledger is read as one document, so every citation in it
  resolves, is in bounds, and - where the file has changed on this branch - is pinned to content, no
  matter which round's section it sits in. That is what found the nine stale ones below.
- **Rule 2 does not demand bindings from a reviewer's file**, only from the ledger and the artifacts.
  A reviewer cites lines constantly and a binding requirement would be a tax on review, not on
  accuracy. Their citations are still resolved and bounds-checked.
- **Verbatim `console` transcripts are exempt from rule 4.** A transcript records what a run printed.
  Editing one so it agrees with a current figure would be falsifying evidence.
- **Rule 4 knows four figures**, not every number in the records. A wrong number outside that set
  passes. The set is the one the brief names, and adding to it is one line in `FIGURES`.
- **Rule 3 accepts an echo anywhere in the same fence**, not only on the owning command line. The
  brief's wording is stricter, and the reason for the relaxation is a real and honest form: the iOS
  gates echo their labels into a file and the file is then printed. Every one of the 105 real
  instances in the census below is still refused, because none of those fences contains the echo at
  all.

### Proof that each rule is non-vacuous

Each of round 3's four defect shapes, reintroduced one at a time into the real records at `00b4abb`,
then reverted with `git checkout --`. Every block below is one execution, and every exit label is
printed by the `echo` on its own command line.

**A - rule 1, the R3-12 shape.** Round 3 renamed the M2 artifact heading and killed the ledger link to
it. Renaming it again:

```console
$ python3 -c "
p='reviews/ARTIFACTS-round3.md'; s=open(p).read()
old='## M2 - the E2E gate fails on one test, and it is the test that is wrong'
new='## M2 - the flaky E2E test, and why it is the test that is wrong'
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
"; echo "RENAME_EXIT=$?"; node tools/check-records.mjs; echo "A_MUTANT_EXIT=$?"; git checkout -- reviews/ARTIFACTS-round3.md; node tools/check-records.mjs; echo "A_RESTORED_EXIT=$?"
RENAME_EXIT=0
records: 1 defect(s)
  PROD-READINESS.md:445: no heading in reviews/ARTIFACTS-round3.md slugs to #m2---the-e2e-gate-fails-on-one-test-and-it-is-the-test-that-is-wrong
A_MUTANT_EXIT=1
records: 25 documents checked, no defects
A_RESTORED_EXIT=0
```

**B - rule 2, the R3-20 shape.** Round 3 published `awk 'NR==42' pages.yml` with line 53's content
because its own patch had pushed the file down eleven lines. Putting the base-href citation back to
the line it used to sit on:

```console
$ python3 -c "
p='PROD-READINESS.md'; s=open(p).read()
for a,b in [('\`.github/workflows/pages.yml:48\`','\`.github/workflows/pages.yml:37\`'),('<!-- cite: .github/workflows/pages.yml:48 \"--base-href /blackjack-trainer/\" -->','<!-- cite: .github/workflows/pages.yml:37 \"--base-href /blackjack-trainer/\" -->')]:
    assert a in s, a; s=s.replace(a,b)
open(p,'w').write(s)
"; echo "MOVE_CITATION_EXIT=$?"; node tools/check-records.mjs; echo "B_MUTANT_EXIT=$?"; git checkout -- PROD-READINESS.md; node tools/check-records.mjs; echo "B_RESTORED_EXIT=$?"
MOVE_CITATION_EXIT=0
records: 3 defect(s)
  PROD-READINESS.md:98: .github/workflows/pages.yml:37 no longer contains "--base-href /blackjack-trainer/"
  PROD-READINESS.md:136: .github/workflows/pages.yml:37 no longer contains "--base-href /blackjack-trainer/"
  PROD-READINESS.md:175: .github/workflows/pages.yml:37 no longer contains "--base-href /blackjack-trainer/"
B_MUTANT_EXIT=1
records: 25 documents checked, no defects
B_RESTORED_EXIT=0
```

Three, not one. That is the point of the rule: the same stale citation had been copied to three places
and a reader correcting one by hand would have left two.

**C - rule 3, the R3-15/R3-27 shape.** The block appended here is copied verbatim from
`reviews/ARTIFACTS-round3.md`, where it is exempt as a closed round's record, into a round-4 record
where the rule binds:

````console
$ python3 -c "
p='reviews/BASELINE-round4.md'
open(p,'a').write('\n\`\`\`console\n\$ E2E_SERVER=dist npx playwright test \\\\\n    --grep \"returning to counting keeps the drill going\" --repeat-each=10\nEXIT=1\n  10 failed\n\`\`\`\n')
"; echo "APPEND_EXIT=$?"; node tools/check-records.mjs; echo "C_MUTANT_EXIT=$?"; git checkout -- reviews/BASELINE-round4.md; node tools/check-records.mjs; echo "C_RESTORED_EXIT=$?"
APPEND_EXIT=0
records: 1 defect(s)
  reviews/BASELINE-round4.md:252: a ```console block prints `EXIT=` as output of `E2E_SERVER=dist npx playwright test \` (line 250), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
C_MUTANT_EXIT=1
records: 25 documents checked, no defects
C_RESTORED_EXIT=0
````

**D - rule 4, the R3-1/R3-11/R3-18/R3-24 shape.** The pooled M2 rate was "corrected everywhere" four
times and was wrong each time. Putting one of its superseded values back into a live record:

```console
$ python3 -c "
p='reviews/BASELINE-round4.md'; s=open(p).read()
old='the M2 test of 5.5% per execution'; new='the M2 test of 5.0% per execution (20 of 600)'
assert s.count(old)==1; open(p,'w').write(s.replace(old,new))
"; echo "STALE_FIGURE_EXIT=$?"; node tools/check-records.mjs; echo "D_MUTANT_EXIT=$?"; git checkout -- reviews/BASELINE-round4.md; node tools/check-records.mjs; echo "D_RESTORED_EXIT=$?"; git status --porcelain --untracked-files=no; echo "TREE_CLEAN_EXIT=$?"
STALE_FIGURE_EXIT=0
records: 2 defect(s)
  reviews/BASELINE-round4.md:124: pooled M2 failure count states 20 of 600 where the pooled M2 sample is 33 of 600
  reviews/BASELINE-round4.md:124: pooled M2 rate states 5.0% on a line about the pooled M2 sample, whose rate is 5.5%
D_MUTANT_EXIT=1
records: 25 documents checked, no defects
D_RESTORED_EXIT=0
TREE_CLEAN_EXIT=0
```

`TREE_CLEAN_EXIT=0` with no output above it is `git status --porcelain --untracked-files=no` printing
nothing: all four mutations are gone and the tree is the commit again.

### It caught this round's own commit, once, before it shipped

Wiring the checker into `npm run lint` changed `package.json`, which moved the content one of the
ledger's own bindings pinned. The gate refused it:

```console
$ node tools/check-records.mjs; echo "SELFCATCH_EXIT=$?"
records: 3 defect(s)
  PROD-READINESS.md:24: package.json:4-20 no longer contains "\"lint\": \"npm run typecheck && npm run format:check\""
  reviews/BASELINE-round4.md:42: unit-test count states 1551 where the round's unit-test count is 1585
  reviews/BASELINE-round4.md:51: unit-test count states 1551 where the round's unit-test count is 1585
SELFCATCH_EXIT=1
```

<!-- figure-historical -->

The binding was re-pinned to `"scripts": {`, and the baseline's two statements of its own measurement
were marked `figure-historical`, which is what that marker is for.

### What it found on the real records, unprompted

**Nine stale citations in the ledger, at eleven places.** Every one points at content that has moved,
and three of them - the `--base-href` build step - had been wrong since N1's patch in round 3, which
is the same patch R3-20 was filed about. Round 3 corrected the two it noticed.

| citation, before                      | after    | what the ledger claims is there                        |
| ------------------------------------- | -------- | ------------------------------------------------------ |
| `.github/workflows/pages.yml:37` (x3) | `:48`    | builds with `--base-href /blackjack-trainer/`          |
| `pages.yml:41-42`                     | `:55-57` | publishes that bundle as the site root                 |
| `.github/workflows/pages.yml:42`      | `:53`    | copies the two legal pages into the deployed site      |
| `pages.yml:42`                        | `:53`    | the same copy step, cited again under P2-5             |
| `playwright.config.ts:20`             | `:18`    | sets `retries: 1` under CI                             |
| `tsconfig.spec.json:9`                | `:14`    | scopes specs to `src`                                  |
| `e2e/smoke/showdown.e2e.ts:65`        | `:75`    | the M2 test                                            |
| `.github/workflows/ci.yml:48-50`      | `:79-81` | the CI job where `CI=true` disables reuse              |
| `tools/serve-dist.mjs:33-34`          | `:40`    | the comment asserting `normalize()` cannot escape ROOT |

**Two citations past the end of a file**, both deliberate and now marked: R0-2 and REVIEW-0 quote a
citation that named lines 39-41 of a 38-line file, which _is_ the defect they report.

**Seven citations describing pre-fix code**, marked `cite-historical` rather than re-pointed, because
the line they name no longer holds what the finding described - the finding was fixed. Re-pointing
those would have quietly rewritten what round 1 found.

### Census: what the historical markers are exempting

Stripping every historical marker and re-running, purely as a measurement:

```console
$ node -e '...strip every historical marker from reviews/*.md and PROD-READINESS.md...'; node tools/check-records.mjs > $S/census.txt 2>&1; echo "CENSUS_EXIT=$?"; head -1 $S/census.txt
CENSUS_EXIT=1
records: 241 defect(s)
$ echo "rule 3 transcripts: $(grep -c 'block prints' $S/census.txt)"; echo "rule 2 bindings:    $(grep -c 'cites a file this branch changed' $S/census.txt)"; echo "rule 4 figures:     $(grep -cE 'unit-test count|coverage quadruple|pooled M2' $S/census.txt)"; echo "rule 1+bounds:      $(grep -cE 'no heading in|is past the end|names no tracked' $S/census.txt)"
rule 3 transcripts: 105
rule 2 bindings:    27
rule 4 figures:     109
rule 1+bounds:      0
```

The number that matters is **105**: closed-round records publish an exit label as the output of a
command that cannot print it 105 times. Round 3 found two instances of this by reading (R3-15, R3-27)
and fixed those two. It is spread across eleven files, worst in `REVIEW-round2-stage2.md` (25) and
`ARTIFACTS-round3.md` (18).

They are not fixed here, and the reason is not effort. Fixing one means writing the `echo` that
produced the label, and **nobody knows what was actually typed** - reconstructing it would be
manufacturing the transcript, which is a worse defect than the one being fixed. They are left marked,
counted, and named as finding **K4** in NEXT ROUND. The 109 figure hits are almost entirely dated,
legitimate history (round 1's `1526 tests`, round 3's baseline `1547`); they are not a defect count.

### Its own tests

`tools/check-records.spec.mjs`, 34 tests, run by the unit gate via `angular.json`'s
`../tools/**/*.spec.mjs` include. Every one is a positive control: it builds a throwaway document tree
with a known defect and asserts the checker still refuses it. The failure mode being guarded against
is specific - a records checker whose regex stops matching does not fail, it passes forever, and the
round that trusts it gets a clean sweep that never ran.

```console
$ npx ng test --include="../tools/check-records.spec.mjs" > $S/records-spec2.txt 2>&1; echo "SPEC_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/records-spec2.txt | grep -E 'Test Files|Tests '
SPEC_EXIT=0
 Test Files  1 passed (1)
      Tests  34 passed (34)
```

### Gates at the stage-1 commit

```console
$ npm run lint > $S/lint-s1.txt 2>&1; echo "LINT_EXIT=$?"; tail -3 $S/lint-s1.txt; npm test > $S/test-s1c.txt 2>&1; echo "TEST_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/test-s1c.txt | grep -E 'Test Files|Tests '
LINT_EXIT=0
Checking formatting...
All matched files use Prettier code style!
records: 25 documents checked, no defects
TEST_EXIT=0
 Test Files  68 passed (68)
      Tests  1585 passed (1585)
```

The unit gate moves from 67 files / 1551 tests to 68 / 1585: one file, 34 tests, all of them the
checker's. <!-- figure-historical -->

## K3 (P2) - nothing asserted N4's fix

Round 3 shipped N4 - the update banner covers the drill's controls, so the shell measures the banner
and the three viewport-sized screens subtract it - and recorded that **nothing tested any of it**.
Both halves are closed here, by two different instruments, because they are two different properties.

### The finding reproduces first

K3's claim is that the reserve can be deleted outright and every gate stays green. Deleting
`min-height: calc(100dvh - var(--update-space, 0px))` (and its `100vh` fallback) from all three
screens and `padding-bottom: var(--update-space, 0px)` from `app.scss`:

```console
$ npm run lint > $S/k3-lint-mutant.txt 2>&1; echo "K3_LINT_MUTANT_EXIT=$?"; npm test > $S/k3-test-mutant.txt 2>&1; echo "K3_TEST_MUTANT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-test-mutant.txt | grep -E 'Tests '; npm run build > $S/k3-build-mutant.txt 2>&1; echo "K3_BUILD_MUTANT_EXIT=$?"
K3_LINT_MUTANT_EXIT=0
K3_TEST_MUTANT_EXIT=0
      Tests  1586 passed (1586)
K3_BUILD_MUTANT_EXIT=0
```

Three gates, all green, with the entire fix removed. That is the finding, reproduced at this commit
rather than taken from round 3's word.

### The CSS half: `e2e/smoke/responsive.e2e.ts`, four tests, real Chromium

The banner cannot be raised against a production bundle - the debug API is stripped and a real
`VERSION_READY` needs a second deployed build - and that is what round 3 concluded blocked this. But
the CSS half does not need the banner. `--update-space` is a plain custom property the shell
publishes; a test can publish it instead and ask the layout whether it is listening. Each test sets
it to 200px and reads `getComputedStyle().minHeight` before and after.

Present, then absent:

```console
$ E2E_SERVER=dist npx playwright test --grep "the space the update banner stands in front of" > $S/k3-css-pass.txt 2>&1; echo "CSS_PASS_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-css-pass.txt | tail -3
CSS_PASS_EXIT=0
  ✓  4 [chromium] › e2e/smoke/responsive.e2e.ts:137:9 › the space the update banner stands in front of › the card-counting drill screen gives back the space it is told about (318ms)

  4 passed (5.9s)
$ E2E_SERVER=dist npx playwright test --grep "the space the update banner stands in front of" > $S/k3-css-mutant.txt 2>&1; echo "CSS_MUTANT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-css-mutant.txt | grep -E '✘|failed'
CSS_MUTANT_EXIT=1
  ✘  2 [chromium] › e2e/smoke/responsive.e2e.ts:137:9 › the space the update banner stands in front of › the card-counting drill screen gives back the space it is told about (494ms)
  ✘  3 [chromium] › e2e/smoke/responsive.e2e.ts:156:7 › the space the update banner stands in front of › the shell reserves the same space at the bottom of the page (494ms)
  ✘  4 [chromium] › e2e/smoke/responsive.e2e.ts:137:9 › the space the update banner stands in front of › the basic-strategy drill screen gives back the space it is told about (1.3s)
  ✘  1 [chromium] › e2e/smoke/responsive.e2e.ts:137:9 › the space the update banner stands in front of › the home screen gives back the space it is told about (1.3s)
$ git checkout -- src/app/app.scss src/app/features/home/home-page.component.scss src/app/features/drill/drill-page.scss src/app/features/card-counting/card-counting-page.component.scss; E2E_SERVER=dist npx playwright test --grep "the space the update banner stands in front of" > $S/k3-css-restored.txt 2>&1; echo "CSS_RESTORED_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-css-restored.txt | tail -2
CSS_RESTORED_EXIT=0

  4 passed (9.0s)
```

Four for four: one per screen, plus the shell's own `padding-bottom`. Deleting the reserve from all
four files turns all four red, and restoring turns all four green.

**What this half does not cover**, stated so nobody reads more into it: it proves the layout answers
a reserve it is told about. It does not prove the number it is told is right, and it does not raise a
real banner. The first is the ordering half below; the second still needs a second deployed build,
and is still open.

### The ordering half: `src/app/app.spec.ts`, one test, in jsdom

Round 3 shipped a plain `effect` for one commit, which measures the banner _before_ the DOM refreshes
and therefore returns the height the banner had before its copy grew - 21px short of a grown banner in
a real browser. The unit tests could not tell the two apart, and said so in a comment.

What makes it observable without layout is not measuring harder; it is making the stub behave the way
a real element does. The existing tests install a fixed rect before triggering the change, so the stub
answers the same whichever moment it is read at. The new test installs a stub that reports a height
**derived from what is inside the element when it is asked**:

```ts
banner.getBoundingClientRect = () => (banner.querySelector('.update__error') ? withError : offer);
```

A measurement taken before the DOM refreshes does not see the failed-reload line yet, and gets the
old height back. Present, then absent:

```console
$ npx ng test --include="**/app.spec.ts" > $S/k3-order-pass.txt 2>&1; echo "ORDER_TEST_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-order-pass.txt | grep -E 'Test Files|Tests '
ORDER_TEST_EXIT=0
 Test Files  1 passed (1)
      Tests  18 passed (18)
$ python3 -c "
p='src/app/app.ts'; s=open(p).read()
s=s.replace('  afterRenderEffect,\n','  effect,\n',1)
assert s.count('    afterRenderEffect(() => {')==1
s=s.replace('    afterRenderEffect(() => {','    effect(() => {',1)
open(p,'w').write(s)
"; echo "MUTATE_EXIT=$?"; npx ng test --include="**/app.spec.ts" > $S/k3-order-mutant.txt 2>&1; echo "ORDER_MUTANT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-order-mutant.txt | grep -E 'Test Files|Tests |×|expected'
MUTATE_EXIT=0
ORDER_MUTANT_EXIT=1
       × measures the banner after the DOM refreshes, not before 9ms
AssertionError: expected '162px' to be '183px' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
$ git checkout -- src/app/app.ts; npx ng test --include="**/app.spec.ts" > $S/k3-order-restored.txt 2>&1; echo "ORDER_RESTORED_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3-order-restored.txt | grep -E 'Test Files|Tests '
ORDER_RESTORED_EXIT=0
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

`162px` where `183px` is wanted is exactly the 21px round 3 measured in a real Chromium, arrived at
independently here by a different instrument. **One test failed and seventeen passed**, which is the
part worth reading twice: the seventeen include all three of round 3's own banner tests, so this is
also the measurement that round 3's comment was right - they genuinely could not see the ordering.

### Both halves, stated plainly

| half     | what fails when it breaks                                                                  | where                                                  | closed                    |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------- |
| CSS      | the reserve stops being subtracted from any of the three screens, or reserved by the shell | `e2e/smoke/responsive.e2e.ts` (4 tests, real Chromium) | yes                       |
| ordering | the measurement moves back before the render                                               | `src/app/app.spec.ts` (1 test, jsdom)                  | yes                       |
| neither  | the banner is never raised against a production bundle at all                              | -                                                      | **no, and it stays open** |

The third row is what is left of K3, and it is smaller than what K3 described: raising a real banner
needs a service-worker `VERSION_READY` against a second deployed build. It is carried to NEXT ROUND as
**K5** rather than claimed.
