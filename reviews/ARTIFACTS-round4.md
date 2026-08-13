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

## K1 (P3) - the deploy's own assemble step takes lint red locally

### Present

`site/` is in neither ignore file, and the Pages deploy assembles the published site into it at the
repository root. Running that step - which anyone verifying the workflow does - leaves built files
behind. The whole thing, reproduced at this commit:

```console
$ grep -n 'site' .gitignore .prettierignore; echo "IGNORE_GREP_EXIT=$?"; npm run build -- --base-href /blackjack-trainer/ > $S/k1-build.txt 2>&1; echo "K1_BUILD_EXIT=$?"; mkdir -p site && cp -R dist/blackjack-trainer/browser/. site/ && cp ios/AppStore/privacy.html ios/AppStore/support.html site/ && cp site/index.html site/404.html; echo "K1_ASSEMBLE_EXIT=$?"; ls site | wc -l
IGNORE_GREP_EXIT=1
K1_BUILD_EXIT=0
K1_ASSEMBLE_EXIT=0
      34
$ npm run lint > $S/k1-lint-before.txt 2>&1; echo "K1_LINT_BEFORE_EXIT=$?"; grep -c '^\[warn\]' $S/k1-lint-before.txt; grep -c '^\[warn\] site/' $S/k1-lint-before.txt; grep '^\[warn\]' $S/k1-lint-before.txt | tail -3; git status --porcelain | grep '^??'
K1_LINT_BEFORE_EXIT=1
29
28
[warn] site/styles-KH7BOXCE.css
[warn] site/support.html
[warn] Code style issues found in 28 files. Run Prettier with --write to fix.
?? .agents/
?? .codex/
?? site/
```

`IGNORE_GREP_EXIT=1` is grep finding no match in either ignore file. Exit 1 from the lint gate, 29
`[warn]` lines of which 28 are `site/*` (the 29th is prettier's summary) - and `?? site/`, one
`git add -A` from being committed, which is how `.agents/` and `.codex/` got committed last round.

### Absent

One entry in each ignore file, each carrying the reason:

```console
$ npm run lint > $S/k1-lint-after.txt 2>&1; echo "K1_LINT_AFTER_EXIT=$?"; tail -2 $S/k1-lint-after.txt; git status --porcelain | grep '^??'; echo "GIT_SEES_SITE=$(git status --porcelain | grep -c 'site/')"
K1_LINT_AFTER_EXIT=0
All matched files use Prettier code style!
records: 26 documents checked, no defects
?? .agents/
?? .codex/
GIT_SEES_SITE=0
```

Green **with `site/` still on disk**, which is the point: the fix is that the tree may exist, not that
it was deleted. It was removed afterwards with `rm -rf site` - a directory this run created.

**RESOLVED.**

## K2 (P3) - one hardcoded port meant one E2E run per machine

`playwright.config.ts` hardcoded `const PORT = 4200`. The port is now `E2E_PORT`, defaulting to 4200,
and it is passed through to `tools/serve-dist.mjs` so both halves of the dist lane agree.

The experiment holds everything constant but the port: the same two greps, the same lane, run
concurrently, twice.

**Same port - one of the pair dies:**

```console
$ ( E2E_PORT=4501 E2E_SERVER=dist npx playwright test --grep "key hints are visible at desktop width" > $S/k2-same-a.txt 2>&1; echo "SAME_PORT_A_EXIT=$?" > $S/k2-same-a-exit.txt ) & ( E2E_PORT=4501 E2E_SERVER=dist npx playwright test --grep "the shell reserves the same space" > $S/k2-same-b.txt 2>&1; echo "SAME_PORT_B_EXIT=$?" > $S/k2-same-b-exit.txt ) & wait; cat $S/k2-same-a-exit.txt $S/k2-same-b-exit.txt
SAME_PORT_A_EXIT=1
SAME_PORT_B_EXIT=0
$ sed 's/\x1b\[[0-9;]*m//g' $S/k2-same-a.txt | grep -E 'EADDRINUSE|Error:|address already'
[WebServer] Error: listen EADDRINUSE: address already in use 127.0.0.1:4501
[WebServer]   code: 'EADDRINUSE',
Error: Process from config.webServer was not able to start. Exit code: 1
```

**Different ports - both green:**

```console
$ ( E2E_PORT=4501 E2E_SERVER=dist npx playwright test --grep "key hints are visible at desktop width" > $S/k2-run-4501.txt 2>&1; echo "RUN_4501_EXIT=$?" > $S/k2-4501-exit.txt ) & ( E2E_PORT=4502 E2E_SERVER=dist npx playwright test --grep "the shell reserves the same space" > $S/k2-run-4502.txt 2>&1; echo "RUN_4502_EXIT=$?" > $S/k2-4502-exit.txt ) & wait; cat $S/k2-4501-exit.txt $S/k2-4502-exit.txt; sed 's/\x1b\[[0-9;]*m//g' $S/k2-run-4501.txt | tail -2; sed 's/\x1b\[[0-9;]*m//g' $S/k2-run-4502.txt | tail -2
RUN_4501_EXIT=0
RUN_4502_EXIT=0

  1 passed (6.0s)

  1 passed (6.0s)
```

Ports 4501 and 4502 were confirmed free first. An earlier attempt used 4300 and failed with
`http://127.0.0.1:4300 is already used`, because another agent's probe server was on it - which is the
operational rule working exactly as intended: **that listener was left alone, not killed.**

### What the fix does not buy, measured rather than assumed

Two `dist`-lane runs still share `dist/`: the lane builds what it serves, so both write the same
output directory even on different ports. The concurrent pair above passed, but one observation is not
a guarantee, and the note in `e2e/README.md` says so and tells the next person to stagger the starts
or give one run the `serve` lane.

**RESOLVED**, with that limit stated.

## M3 (P3) - the coverage gate and `tools/`

Round 3 deferred this with "74 files in the report, 0 of them under `tools/`" and the diagnosis that
coverage cannot see `tools/`. Re-measured here with a `json-summary` reporter added temporarily to
`vitest.config.ts` (added, measured, reverted with `git checkout --`), the diagnosis is **wrong**, and
this round's own work is what disproved it:

```console
$ npm run test:coverage > $S/m3-cov2.txt 2>&1; echo "COVERAGE_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/m3-cov2.txt | grep -E 'Tests |Statements|Branches|Functions|Lines'; node -e '
const s=require("./coverage/blackjack-trainer/coverage-summary.json");
const files=Object.keys(s).filter(k=>k!=="total");
const tools=files.filter(f=>f.includes("/tools/"));
console.log("FILE_COUNT="+files.length+" UNDER_TOOLS="+tools.length);
for(const f of tools){const m=s[f];console.log("  "+f.replace(process.cwd()+"/","")+"  stmts="+m.statements.pct+" branch="+m.branches.pct+" funcs="+m.functions.pct+" lines="+m.lines.pct);}
'
COVERAGE_EXIT=0
      Tests  1594 passed (1594)
Statements   : 96.07% ( 5535/5761 )
Branches     : 92.89% ( 2497/2688 )
Functions    : 93.41% ( 951/1018 )
Lines        : 97.89% ( 4278/4370 )
FILE_COUNT=75 UNDER_TOOLS=1
  tools/check-records.mjs  stmts=94.14 branch=86.45 funcs=100 lines=95.69
```

**75 files, 1 under `tools/`.** What decides whether a tool is in the report is not where it lives but
how a test reaches it:

| tool                              | in the report | why                                                                                                                                       |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/check-records.mjs`         | **yes**       | its spec imports it in-process, like any other module                                                                                     |
| `tools/serve-dist.mjs`            | no            | runs as a child process; v8 coverage in this process cannot see it                                                                        |
| `tools/export-parity-fixtures.ts` | no            | calls `main()` at the bottom of the file, so importing it would rewrite tracked files under `ios/Fixtures` as a side effect of `npm test` |

So M3 is narrower than it was filed as, and what remains needs two things this round did not build:
coverage collected from a child process and merged into the in-process report, and a guard on the
exporter's `main()` so it can be imported at all. The second is a refactor of an 879-line generator
whose output feeds a release gate, taken on a P3 finding; it is not worth the risk here.

**DEFERRED**, with the blind spot re-measured and `vitest.config.ts`'s comment - which stated round
3's now-false 74/0 - corrected to say what actually decides it.

### A consequence worth naming: the coverage gate lost margin

Adding a covered tool to the report moved every percentage, and the branches floor is the tight one:

| figure     | baseline | now       | floor | headroom |
| ---------- | -------- | --------- | ----- | -------- |
| statements | 96.16    | **96.07** | 94    | 2.07     |
| branches   | 93.28    | **92.89** | 92    | **0.89** |
| functions  | 93.22    | **93.41** | 90    | 3.41     |
| lines      | 98.00    | **97.89** | 96    | 1.89     |

<!-- figure-historical -->

The first measurement after the checker landed was worse - 92.33% branches, 0.33 above the floor -
because the checker's own uncovered paths went straight into the denominator. Eight more tests for the
paths that decide what gets checked at all (`recordsDocs`, `changedOnBranch` and its failure, the
ambiguous-basename refusal, the frozen-document exemption, the `transcript-literal` escape) took the
checker from 76.77% to 86.45% branches and the project back to 92.89%. That is real coverage of a
release gate, not a number moved for its own sake, but the headroom is thinner than it was and the
next tool added in-process will need the same care. Named as **K6** in NEXT ROUND.

## N1 and N5 (P1, PATCH-READY) - not touched, not re-filed

The owner decision authorising a push arrived unsubstituted, so the conservative branch applies: this
round pushed nothing, opened no PR, and observed no GitHub run. N1 and N5 stay **PATCH-READY** with
round 3's status copied forward verbatim, and the five UNVERIFIED claims named under N1 in
`reviews/ARTIFACTS-round3.md` remain UNVERIFIED for the same reason they were: a GitHub runner is the
only thing that can settle them.

Re-filing a PATCH-READY finding as new work is what round 3 was told not to do with round 2's patches,
so nothing here re-derives them. The one thing this round did touch nearby was `pages.yml`'s
**citations**, not `pages.yml`: three ledger references to line 37 pointed at content N1's own patch
had moved to line 48. That is a records defect, recorded under the records check above, not a change
to the workflow.

## D1 (P1) - the support address is still a placeholder, fourth round running

Re-verified at both cited lines at this commit:

```console
$ grep -n 'CONTACT_EMAIL_HERE' ios/AppStore/privacy.html ios/AppStore/support.html; echo "GREP_EXIT=$?"; sed -n '53p' .github/workflows/pages.yml
ios/AppStore/privacy.html:65:  <a href="mailto:CONTACT_EMAIL_HERE">CONTACT_EMAIL_HERE</a>.</p>
ios/AppStore/support.html:55:    <a href="mailto:CONTACT_EMAIL_HERE">CONTACT_EMAIL_HERE</a> and I'll get back to you.
GREP_EXIT=0
          cp ios/AppStore/privacy.html ios/AppStore/support.html site/
```

Exactly the lines round 3 recorded - 65 and 55 - and `pages.yml:53` still copies both files into the
published site. The address was UNANSWERED again, so nothing was invented and the placeholder is left
visible.

**DEFERRED**, for the fourth consecutive round. It is at the top of this round's report rather than in
a table because it is now the only thing between a fully gated deploy and a publishable one.

## I1 (P1) - the iCloud data-loss path, re-verified line by line

The decision on the entitlement arrived unsubstituted, so it stays declared: that is the conservative
branch and it is also what respects launch decision D2 (ship the binary with the capability inert;
provisioning later turns sync on with no app update). Nothing was changed.

Round 3 verified the `LAUNCH-CHECKLIST.md` O2 warning at five citations and recorded that any drift
means someone edited the store. All five re-verified here, plus the sixth the warning names inline:

```console
$ cd ios/BlackjackTrainer; sed -n '63,72p' Stores/CloudKeyValueStore.swift; sed -n '63,65p' Stores/StatsStore.swift; sed -n '78p' Stores/StatsStore.swift; sed -n '16p' Views/Flow/PracticeDataSection.swift; sed -n '113p' App/AppModel.swift
        cloud.synchronize()
        // At launch, adopt an existing cloud value; otherwise seed the cloud with
        // whatever was stored locally (e.g. before iCloud was enabled).
        for store in stores {
            if cloud.data(forKey: store.cloudKey) != nil {
                store.adoptFromCloud()
            } else {
                store.pushToCloud()
            }
        }
    private func persist() {
        StatsPersistence.save(stats, key: key, defaults: defaults)
        pushToCloud()
        stats = value
            Button("Reset practice data", role: .destructive) { confirmingReset = true }
    func resetPracticeData() {
```

| citation                         | what the warning says is there                                  | found |
| -------------------------------- | --------------------------------------------------------------- | ----- |
| `CloudKeyValueStore.swift:63-72` | `synchronize()`, then adopt-or-seed with no wait for a download | yes   |
| `StatsStore.swift:63-65`         | `persist()` calls `pushToCloud()` on every recorded rep         | yes   |
| `StatsStore.swift:78`            | `stats = value`, last-writer-wins adoption                      | yes   |
| `PracticeDataSection.swift:16`   | the user-facing **Reset practice data** action                  | yes   |
| `AppModel.swift:113`             | `func resetPracticeData()`, its handler                         | yes   |
| `AppModel.swift:49-78`           | the wiring, live for all nine stores                            | yes   |

The last one is the only one that needs counting rather than reading. The range ends with the
`StatsCloudSync(cloud:stores:)` call, and the array holds exactly nine: `basicStrategyStats`,
`runningCountStats`, `trueCountStats`, `deviationStats`, `deckEstimationStats`, `flowPrefs`,
`practiceHistory`, `missTally`, `countDrift`.

No drift at any of the six. The entitlement is still declared in
`ios/BlackjackTrainer/BlackjackTrainer.entitlements`, wired from `ios/project.yml:40`, with the comment
explaining that the app degrades to local-only until the capability is provisioned.

**DEFERRED at P1**, carried forward unchanged. Nobody edited the store.
