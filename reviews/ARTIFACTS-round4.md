# ARTIFACTS - round 4

Evidence for every round-4 finding: the defect present, then absent, produced by running the thing.
Baseline for every "green" claim in here: [`reviews/BASELINE-round4.md`](BASELINE-round4.md).

- Branch: `prod-readiness/round4-2026-08-12`
- Base commit: `f5e8fc8cd952751986aff69b8810cc8b86bd135d`

## P1 - the records check

Round 3's code survived six adversarial reviews. Its **records** produced 31 regressions, and this is
the finding that exists to make that class of defect impossible rather than merely discouraged.

### What it refuses

`tools/check-records.mjs`, run from `npm run lint`, over every records document: `PROD-READINESS.md`,
`LAUNCH-CHECKLIST.md` and everything under `reviews/`. The count is discovered from the filesystem and
printed by the gate, so it rises as reviews land rather than being a figure stated here.

| rule | refuses                                                                                                                                         | the round-3 defect it answers |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | a markdown link to a `#anchor` that no heading in the target file slugs to                                                                      | R3-12                         |
| 2    | a `file:line` citation that names no tracked file, runs past the end of one, or - in the ledger and the artifacts - is not pinned to a fragment | R3-20                         |
| 3    | a ```console fence printing a `NAME=` line that no `echo` in the fence could have produced                                                      | R3-15, R3-27                  |
| 4    | a round-level figure (unit-test count, coverage quadruple, pooled M2 count and rate) stated with any value but the current one                  | R3-1, R3-11, R3-18, R3-24     |

### What it does not refuse, stated because a gate's blind spots matter more than its rules

- **Closed rounds are exempt from rules 3 and 4.** A `<!-- records: historical-file -->` marker at the
  top of each closed round's record, and a `<!-- records: historical -->` marker under each closed
  round's heading in the ledger, lift the transcript and figure rules there. Those records were true
  at the commits that produced them and this round does not rewrite them. This is the explicit escape
  the brief allows, taken deliberately and at one granularity rather than sprinkled per line - and
  the census below says exactly what it is exempting.
- **Citations are not exempt anywhere.** Every citation in the ledger and the artifacts resolves, is
  in bounds, and is pinned to content, no matter which round's section it sits in. That is what found
  the nine stale ones below.

  This was weaker when it was first written: the binding requirement applied only to files
  `git diff main...HEAD` reported as changed. That set is empty the moment the branch merges and
  absent in a checkout with no `main` ref, so the rule would have gone on reporting success while
  checking nothing - the failure this gate's own header names. REVIEW-round4-stage1 F5 demonstrated it
  by breaking a binding in a repository where `main` resolved to `HEAD` and watching the gate pass.
  There is no git in rule 2 any more, at the price of pinning every citation in both documents: 65
  markers in the ledger (57 bindings, 8 historical) and 17 in this file (8 and 9). The second figure
  was published as 19, counting two lines of fenced command text as bindings - which the checker
  itself stopped doing in the same commit that this count was checked against
  (REVIEW-round4-stage3 F8).

- **Rule 2 does not demand bindings from a reviewer's file**, only from the ledger and the artifacts.
  A reviewer cites lines constantly and a binding requirement would be a tax on review, not on
  accuracy. Their citations are still resolved and bounds-checked.
- **Verbatim `console` transcripts are exempt from rule 4.** A transcript records what a run printed.
  Editing one so it agrees with a current figure would be falsifying evidence.
- **Rule 4 knows four figures**, not every number in the records. A wrong number outside that set
  passes. The set is the one the brief names, and adding to it is one line in `FIGURES`.
- **Rule 3 accepts an echo on any _command line_ in the same fence**, not only on the owning one. The
  brief's wording is stricter, and the reason for the relaxation is a real and honest form: the iOS
  gates echo their labels into a file and the file is then printed. Every one of the 105 real
  instances in the census below is still refused, because none of those fences contains the echo at
  all. Output lines are not scanned for echoes, which is the whole point - a fabricated label line
  cannot license itself.
- **Rule 3 can be fooled by a command that merely mentions a label after the word `echo`.** A
  `grep -c "echo GATE_EXIT=" /dev/null` followed by `GATE_EXIT=0` is accepted, because the rule reads
  the command text rather than executing it. Found by REVIEW-round4-stage1 F13, left as a stated blind
  spot rather than closed: the honest two-step form the rule exists to allow is nearly indistinguishable
  from it.
- **A marker counts only where a marker can be written**: not inside an inline-code span, and not
  inside a fenced block. Naming the marker in prose, as this document does two bullets up, used to
  freeze the document that named it - silently, because the marker renders as nothing. That is how
  this very file sat outside three of the four rules until REVIEW-round4-stage1 F1 found it.

  The first fix covered inline code only, and one commit later the census transcript below - which
  prints the marker's own text as part of a `node -e` command - froze three quarters of this document
  by the same mechanism (REVIEW-round4-stage2 F1). Fixing an instance rather than a class is how a
  defect comes back with a different spelling, and it came back inside the answer to the review that
  reported it.

- **Rule 3 reads a command line the way a shell would, not by counting quotes.** An unpaired
  apostrophe in a trailing `# comment` used to read as an open quote, which swallowed the rest of the
  fence as command text and stopped every output line in it from being checked - a false negative
  introduced by the fix for a different false negative (REVIEW-round4-stage2 F3). The scan now stops
  at an unquoted `#`.
- **The coverage figures are pinned with a +/-0.05 tolerance, not exactly.** The branch percentage is
  not deterministic: one run in twelve differs by a single branch. Pinning to two decimals would have
  refused records stating a figure their author had just measured (REVIEW-round4-stage2 F9).
- **`figure-historical` covers the line it is on and nothing else.** It used to reach the following
  line as well, undocumented and untested, which is how the baseline's coverage row escaped rule 4
  because of its neighbour (F4).

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

### It caught this round's own commits, twice, before either shipped

Both are recorded as regressions R4-1 and R4-2 in the ledger. The first: wiring the checker into
`npm run lint` changed `package.json`, which moved the content one of the ledger's own bindings
pinned. The gate refused it:

```console
$ node tools/check-records.mjs; echo "SELFCATCH_EXIT=$?"
records: 3 defect(s)
  PROD-READINESS.md:24: package.json:4-20 no longer contains "\"lint\": \"npm run typecheck && npm run format:check\""
  reviews/BASELINE-round4.md:42: unit-test count states 1551 where the round's unit-test count is 1585
  reviews/BASELINE-round4.md:51: unit-test count states 1551 where the round's unit-test count is 1585
SELFCATCH_EXIT=1
```

The binding was re-pinned to `"scripts": {`, and the baseline's two statements of its own measurement
were marked `figure-historical`, which is what that marker is for.

The second was K2's own fix, which inserted eight comment lines above `const PORT` and pushed two
ledger citations down - the R3-20 shape, in the round that built the gate against it, four commits
after building it:

```console
$ node tools/check-records.mjs; echo "SELFCATCH2_EXIT=$?"
records: 2 defect(s)
  PROD-READINESS.md:395: playwright.config.ts:18 no longer contains "retries: process.env.CI ? 1 : 0,"
  PROD-READINESS.md:527: playwright.config.ts:6 no longer contains "const PORT = 4200;"
SELFCATCH2_EXIT=1
```

Neither reached a commit. Set against that: the three findings the stage-1 reviewer had to catch by
reading, because they were defects **in the gate itself** - and a gate cannot be the only thing
checking the gate.

### One attack of my own, on the exemption that worries me most

The historical markers are the gate's largest concession, and the way they could go wrong quietly is
by reaching further than intended - which is exactly what F1 and F4 turned out to be. So: does the
`<!-- records: historical -->` marker under `# ROUND 3` leak past the next h1 into round 4's own
section? Injecting a superseded figure into the round-4 status section and running the gate:

```console
$ python3 -c "
p='PROD-READINESS.md'; s=open(p).read()
old='**What the re-triage changed: nothing, and that is a finding of its own.**'
new='**What the re-triage changed: nothing, and that is a finding of its own.** The suite is 1547 passed.'
assert s.count(old)==1
open(p,'w').write(s.replace(old,new))
"; echo "INJECT_EXIT=$?"; node tools/check-records.mjs; echo "LEAK_TEST_EXIT=$?"; git checkout -- PROD-READINESS.md; node tools/check-records.mjs; echo "RESTORED_EXIT=$?"
INJECT_EXIT=0
records: 1 defect(s)
  PROD-READINESS.md:672: unit-test count states 1547 where the round's unit-test count is 1600
LEAK_TEST_EXIT=1
records: 29 documents checked, no defects
RESTORED_EXIT=0
```

It does not leak. Round 4's section is inside the gate, and a figure that disagreed with the round's
own would be refused there.

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

The "after" column records where this round re-resolved each citation, and two of those targets have
moved again since: K2's comment lines and the stage-2 serve-lane fix pushed the retries line from 18
to `playwright.config.ts:29`, and the merge to `main` carried a concurrency block that shifted
`ci.yml` down five lines, so the E2E job's `E2E_SERVER: dist` now sits at
`.github/workflows/ci.yml:87-89` - re-resolved in the ledger by `2ac2a68`, and found still reading
79-81 here by the closing review (its F4).

**Two citations past the end of a file**, both deliberate and now marked: R0-2 and REVIEW-0 quote a
citation that named lines 39-41 of a 38-line file, which _is_ the defect they report.

**Eight citations marked `cite-historical` in the ledger** rather than re-pointed, because the line
they name no longer holds what the finding described - the finding was fixed, or the citation names a
location that never existed, which is itself the finding. Re-pointing those would have quietly
rewritten what round 1 found. The count was published as seven, which
REVIEW-round4-stage1 F11 corrected. The artifacts file carries nine more, all of them the "before"
column of the table above.

### Census: what the historical markers are exempting

Stripping every historical marker and re-running, purely as a measurement. The first published version
of this block showed a command that did not produce the numbers beside it (REVIEW-round4-stage1 F7);
this is one execution, and the strip is done in the live tree and then reverted with `git checkout --`.

```console
$ node -e '
const {readFileSync,writeFileSync,readdirSync}=require("fs");
for(const f of readdirSync("reviews")){if(!f.endsWith(".md"))continue;const p="reviews/"+f;
 const s=readFileSync(p,"utf8");writeFileSync(p,s.replace(/<!-- records: historical[^>]*-->/g,""));}
writeFileSync("PROD-READINESS.md",readFileSync("PROD-READINESS.md","utf8").replace(/<!-- records: historical[^>]*-->/g,""));
console.log("STRIPPED_OK=1");
'; node tools/check-records.mjs > $S/census4.txt 2>&1; echo "CENSUS_EXIT=$?"; head -1 $S/census4.txt; echo "rule 3 transcripts: $(grep -c 'block prints' $S/census4.txt)"; echo "rule 4 figures:     $(grep -cE 'unit-test count|coverage quadruple|pooled M2' $S/census4.txt)"; grep 'block prints' $S/census4.txt | sed -E 's/^  ([^:]+):.*/\1/' | sort | uniq -c | sort -rn; cp -R $S/keep2/reviews/. reviews/ && cp $S/keep2/ledger.md PROD-READINESS.md; echo "RESTORED_EXIT=$?"; node tools/check-records.mjs; echo "GATE_AFTER_RESTORE_EXIT=$?"
STRIPPED_OK=1
CENSUS_EXIT=1
records: 275 defect(s)
rule 3 transcripts: 105
rule 4 figures:     113
  25 reviews/REVIEW-round3-stage2.md
  18 reviews/ARTIFACTS-round3.md
  17 reviews/REVIEW-round2-stage2.md
  10 reviews/REVIEW-round3-stage1.md
  10 reviews/ARTIFACTS-round2.md
   8 reviews/REVIEW-round3-closing.md
   6 reviews/REVIEW-round3-stage3.md
   4 reviews/REVIEW-round3-closing2.md
   3 reviews/REVIEW-round3-final.md
   2 reviews/REVIEW-round2-stage3.md
   2 reviews/REVIEW-round2-final.md
RESTORED_EXIT=0
records: 30 documents checked, no defects
GATE_AFTER_RESTORE_EXIT=0
```

The tree is copied aside before the strip and copied back after it (`$S/keep2`), and the gate is re-run at the
end to show it came back - the first version of this census reverted with `git checkout -- reviews/`, which also
throws away uncommitted work.

The number that matters is **105**: closed-round records publish an exit label as the output of a
command that cannot print it 105 times. Round 3 found two instances of this by reading (R3-15, R3-27)
and fixed those two. It is spread across eleven files, worst in `REVIEW-round3-stage2.md` (25) and
`ARTIFACTS-round3.md` (18).

This census was published as 103 first, and that number was invalidated by this round's own rule-3 fix:
teaching the quote scan to stop at a `#` comment made two more fences legible, both in
`REVIEW-round3-stage3.md`, which goes from 4 to 6. Nobody re-measured the thing the fixed bug had been
hiding until REVIEW-round4-stage3 F2 did. That is the sharpest lesson of the round for anyone extending
this gate: **a rule change invalidates every measurement the old rule produced.** The census is a
measurement, not a fact, and so is every count in this document.

They are not fixed here, and the reason is not effort. Fixing one means writing the `echo` that
produced the label, and **nobody knows what was actually typed** - reconstructing it would be
manufacturing the transcript, which is a worse defect than the one being fixed. They are left marked,
counted, and named as finding **K4** in NEXT ROUND. The 113 figure hits are almost entirely dated,
legitimate history (round 1's `1526 tests`, round 3's baseline `1547`); they are not a defect count. <!-- figure-historical -->

One more caution, learned by running it: the first attempt reverted with
`git checkout -- PROD-READINESS.md reviews/`, which also reverted uncommitted work in those paths. The
run above copies the two paths aside first and copies them back, which is safe against a dirty tree.

### Its own tests

`tools/check-records.spec.mjs`, run by the unit gate via `angular.json`'s `../tools/**/*.spec.mjs`
include. The failure mode being guarded against is specific: a records checker whose regex stops
matching does not fail, it passes forever, and the round that trusts it gets a clean sweep that never
ran.

So the tests come in pairs. The important half of each pair is the **positive** control - a throwaway
document tree with a known defect, asserting the checker still refuses it. The other half asserts the
complement, that a correct document and each documented escape are accepted, which is what stops a
rule from being satisfied by refusing everything. Most of the suite is the first kind, and the largest
single group is one fixture per marker escape found during this round's reviews.

```console
$ npx ng test --include="../tools/check-records.spec.mjs" > $S/z-spec.txt 2>&1; echo "SPEC_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/z-spec.txt | grep -E 'Tests '
SPEC_EXIT=0
      Tests  68 passed (68)
```

Re-run whole at the stage-6 remediation tree: the parser rewrite and a stage-6 fixture had moved the
count twice while the previous paste still printed the pre-rewrite suite, unnoticed from `92c5ad0`
until the remediation swept for exactly this.

**No live count of this suite appears anywhere else in the round's records, and that is
deliberate.** Its size was published wrong five times - 34, then 41, then 47, then a partition of
20 + 21 + 1 + 5 that summed to one less than the suite and put the newest test in none of its
buckets (REVIEW-round4-stage1 F10, stage-2 F4, stage-3 F3, stage-4 F1), and then, after this
paragraph first said "four", once more in the ledger's limit section (stage-6 F3). Each correction
was written in a commit that added another test. Rule 4 does not track this figure, so nothing but a person re-running the command stood between
it and the next wrong value, and four people in a row lost that bet. The partition is gone rather than
corrected a fifth time: a number that must be re-derived by hand every time the file changes is a
defect generator, and the transcript above is the only place the size is stated.

### Gates at the stage-1 commit

The block first published here reported `records: 25 documents checked`, which is the count at the
commit _before_ this artifact file existed: the gate counts `reviews/` from the filesystem, so at the
commit the block claims to certify the command prints a larger number. REVIEW-round4-stage1 F2 caught
it. Rather than restate a figure that moves every time a review lands, the round's gates are reported
once, at the tip, in **the ledger's** "Gates at the end of round 4" section - not in this document,
which has no gate table and had none when an earlier version of this paragraph pointed here
(REVIEW-round4-stage2 F5).

## K3 (P2) - nothing asserted N4's fix

Round 3 shipped N4 - the update banner covers the drill's controls, so the shell measures the banner
and the three viewport-sized screens subtract it - and recorded that **nothing tested any of it**.
Both halves are closed here, by two different instruments, because they are two different properties.

### The finding reproduces first

K3's claim is that the reserve can be deleted outright and every gate stays green. Deleting
`min-height: calc(100dvh - var(--update-space, 0px))` (and its `100vh` fallback) from all three
screens and `padding-bottom: var(--update-space, 0px)` from `app.scss`, re-run at the round's tip
because the first version of this block was published against an earlier one and its test count no
longer reproduced (REVIEW-round4-stage2 F7):

```console
$ npm run lint > $S/pre3.txt 2>&1; echo "LINT_BEFORE_MUTATION_EXIT=$?"; python3 -c "
for p in ['src/app/features/home/home-page.component.scss','src/app/features/drill/drill-page.scss','src/app/features/card-counting/card-counting-page.component.scss']:
    s=open(p).read()
    s=s.replace('min-height: calc(100vh - var(--update-space, 0px));','min-height: 100vh;')
    s=s.replace('min-height: calc(100dvh - var(--update-space, 0px));','min-height: 100dvh;')
    open(p,'w').write(s)
p='src/app/app.scss'; s=open(p).read()
open(p,'w').write(s.replace('  padding-bottom: var(--update-space, 0px);\n',''))
print('K3 reserve deleted from all four files')
"; echo "MUTATE_EXIT=$?"; npm run lint > $S/k3f-lint.txt 2>&1; echo "K3_LINT_MUTANT_EXIT=$?"; npm test > $S/k3f-test.txt 2>&1; echo "K3_TEST_MUTANT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3f-test.txt | grep -E 'Tests '; npm run build > $S/k3f-build.txt 2>&1; echo "K3_BUILD_MUTANT_EXIT=$?"; git checkout -- src/app/app.scss src/app/features/home/home-page.component.scss src/app/features/drill/drill-page.scss src/app/features/card-counting/card-counting-page.component.scss; echo "RESTORE_EXIT=$?"
LINT_BEFORE_MUTATION_EXIT=0
K3 reserve deleted from all four files
MUTATE_EXIT=0
K3_LINT_MUTANT_EXIT=0
K3_TEST_MUTANT_EXIT=0
      Tests  1609 passed (1609)
K3_BUILD_MUTANT_EXIT=0
RESTORE_EXIT=0
```

Three gates, all green, with the entire fix removed - and the lint gate now includes the records
checker, so that is four things that do not notice. That is the finding, reproduced at the commit this
document ships at rather than taken from round 3's word.

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

`site/` is in neither ignore file, and the Pages deploy assembles the published site into it. Running
that step - which anyone verifying the workflow does - leaves built files behind.

This block **cannot** be reproduced at this commit, and saying otherwise was a defect of its own
(REVIEW-round4-stage3 F5): its first command greps the ignore files for `site` and finds nothing, which
stopped being true the moment the fix landed. It is the measurement of the defect, taken at `74fc6f7`'s
parent, and it is what a "before" transcript always is - a record of a state the tree no longer has.
The "Absent" block below it is the one that reproduces today.

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

One entry in each ignore file, each carrying the reason. Re-run at the round's tip, because the first
version of this block was published against an earlier one and its document count no longer reproduced
(REVIEW-round4-stage2 F7):

```console
$ npm run build -- --base-href /blackjack-trainer/ > $S/z-k1build.txt 2>&1; echo "K1_BUILD_EXIT=$?"; mkdir -p site && cp -R dist/blackjack-trainer/browser/. site/ && cp ios/AppStore/privacy.html ios/AppStore/support.html site/ && cp site/index.html site/404.html; echo "K1_ASSEMBLE_EXIT=$?"; echo "SITE_TOPLEVEL=$(ls site | wc -l | tr -d ' ') SITE_FILES=$(find site -type f | wc -l | tr -d ' ')"; npm run lint > $S/z-k1lint.txt 2>&1; echo "K1_LINT_WITH_IGNORE_EXIT=$?"; grep -E 'All matched files|records:' $S/z-k1lint.txt; echo "GIT_SEES_SITE=$(git status --porcelain --untracked-files=all | grep -c site/)"; rm -rf site; echo "CLEANUP_EXIT=$?"
K1_BUILD_EXIT=0
K1_ASSEMBLE_EXIT=0
SITE_TOPLEVEL=34 SITE_FILES=93
K1_LINT_WITH_IGNORE_EXIT=0
All matched files use Prettier code style!
records: 30 documents checked, no defects
GIT_SEES_SITE=0
CLEANUP_EXIT=0
```

Green **with `site/` still on disk** - 34 entries, 93 files - which is the point: the fix is that the
tree may exist, not that it was deleted. Git does not see it either, and the same command removes it
again, so the fence begins and ends with the tree in the state it found it.

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
coverage cannot see `tools/`. Re-measured here, the diagnosis is **wrong**, and this round's own work
is what disproved it.

The `json-summary` reporter is not in the committed config, so the enabling edit is part of the
transcript rather than a claim in the prose above it - the first version of this block showed only the
second half, which cannot run against the committed tree (REVIEW-round4-stage2 F11):

```console
$ sed -i '' "s/reporter: \['text-summary'\],/reporter: ['text-summary', 'json-summary'],/" vitest.config.ts; echo "REPORTER_ADDED_EXIT=$?"; npm run test:coverage > $S/cov-final2.txt 2>&1; echo "COVERAGE_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/cov-final2.txt | grep -E 'Test Files|Tests |Statements|Branches|Functions|Lines'; node -e '
const s=require("./coverage/blackjack-trainer/coverage-summary.json");
const files=Object.keys(s).filter(k=>k!=="total");
const t=files.filter(f=>f.includes("/tools/"));
console.log("FILE_COUNT="+files.length+" UNDER_TOOLS="+t.length);
for(const f of t){const m=s[f];console.log("  "+f.replace(process.cwd()+"/","")+" "+m.statements.pct+" / "+m.branches.pct+" / "+m.functions.pct+" / "+m.lines.pct);}
'; git checkout -- vitest.config.ts; echo "REPORTER_REVERTED_EXIT=$?"
REPORTER_ADDED_EXIT=0
COVERAGE_EXIT=0
 Test Files  68 passed (68)
      Tests  1600 passed (1600)
Statements   : 96.1% ( 5559/5784 )
Branches     : 93.09% ( 2521/2708 )
Functions    : 93.46% ( 958/1025 )
Lines        : 97.9% ( 4295/4387 )
FILE_COUNT=75 UNDER_TOOLS=1
  tools/check-records.mjs 95.03 / 90.28 / 100 / 96.01
REPORTER_REVERTED_EXIT=0
```

`text-summary` prints `96.1%` and `97.9%`; the tables here write them as 96.10 and 97.90 so all four
are quoted on the same basis.

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
| statements | 96.16    | **96.10** | 94    | 2.10     |
| branches   | 93.28    | **93.09** | 92    | **1.09** |
| functions  | 93.22    | **93.46** | 90    | 3.46     |
| lines      | 98.00    | **97.90** | 96    | 1.90     |

**The branch figure is not deterministic, and this round got that wrong once before recording it
properly.** REVIEW-round4-stage1 (F3) reported it moving between runs, measuring 92.29 once and 92.33
twice. This document answered with three consecutive runs at the tip that agreed to the last decimal,
and called the figure stable. REVIEW-round4-stage2 (F9) then ran it **twelve** times at one commit:
eleven printed `Branches : 92.83%` and one printed `92.87%` - a single branch out of 2695, 0.037
points. Three samples could not see a one-in-twelve event, and reporting "it reproduces" from three
samples was the same error as round 3 reporting 0-of-10 full-suite runs for a 5.5% per-execution flake.

The consequence was live: rule 4 pinned the quadruple to two decimals, so it would have refused a
record stating a figure its author had just measured, about one time in twelve, and told them their
own number was wrong. Coverage is now pinned with a **+/-0.05 tolerance**, which absorbs one-branch
jitter and still refuses the round-3 baseline quadruple - but by less than it first claimed. Against the
figures this round pins, that quadruple's nearest component is **0.06**, one hundredth of a point
outside the tolerance; 0.10 was the distance from a _superseded_ pin, published in two places
(REVIEW-round4-stage3 F7). Three tests now hold the window open against `FIGURES` itself rather than a
fixture's copy of it, so narrowing it fails loudly. Whether 0.05 is the right width, and whether a
figure this fragile should be pinned to two decimals at all, is a judgement for whoever owns the
thresholds; it is named in **K6**.

The margin was worse before the reviews than after them. The first measurement once the checker landed
was 92.33% branches, 0.33 above the floor, because the checker's own uncovered paths went straight into
the denominator. Fourteen tests added across the two remediation cycles - for the paths that decide
what gets checked at all, and then for each defect the reviewers found - took the checker from 76.77%
to 90.28% branches and the project to 93.09%. That is real coverage of a release gate rather than a
number moved for its own sake, but the headroom is still below the baseline's 1.28, and the next tool
added in-process will need the same care. Named as **K6** in NEXT ROUND.

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

Exactly the lines round 3 recorded - 65 and 55 - and `pages.yml:56` still copies both files into the
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

_Since 2026-08-18: somebody did. `3ca4716` fixed I1 in the tree - every write to the cloud now
passes through `InitialSyncGatedCloudStore` and waits for an observed initial sync, with adoption
left last-writer-wins per D5. Three of the six citations above named lines the fix moved and are
marked historical in the bindings below; what this round verified was true of the tree it read._

<!-- prettier-ignore-start -->

<!-- Citation bindings, machine-checked by tools/check-records.mjs (rule 2).
     The nine below are cite-historical because they are the "before" column of
     the stale-citation table: locations this round found wrong and moved. Pinning
     them to whatever now sits at those lines would assert the opposite of what
     the table says. -->
<!-- cite-historical: .github/workflows/pages.yml:37 - the base-href build step before this round re-resolved it to line 48. -->
<!-- cite-historical: pages.yml:41-42 - the upload step before this round re-resolved it to 55-57. -->
<!-- cite-historical: .github/workflows/pages.yml:42 - the legal-page copy before this round re-resolved it to line 53. -->
<!-- cite-historical: pages.yml:42 - the same copy step, cited a second time under P2-5. -->
<!-- cite-historical: playwright.config.ts:20 - the CI retries line before this round re-resolved it, twice: to 18, then to 26 when K2 landed; the stage-2 serve-lane fix moved it again, to 29, where the binding below pins it. -->
<!-- cite-historical: tsconfig.spec.json:9 - the spec scope before this round re-resolved it to line 14. -->
<!-- cite-historical: e2e/smoke/showdown.e2e.ts:65 - the M2 test before this round re-resolved it to line 75. -->
<!-- cite-historical: .github/workflows/ci.yml:48-50 - the CI E2E job before this round re-resolved it to 79-81; main's concurrency block later shifted it to 84-86, where the binding below pins it. -->
<!-- cite-historical: tools/serve-dist.mjs:33-34 - the path-traversal comment before this round re-resolved it to line 40. -->

<!-- cite-historical: pages.yml:56 - P2-5 cited the workflow copy step that put the legal pages beside the app; the pages now ride in the build itself (angular.json assets) and the step is gone. -->
<!-- cite: playwright.config.ts:29 "retries: process.env.CI ? 1 : 0," -->
<!-- cite: .github/workflows/ci.yml:87-89 "E2E_SERVER: dist" -->
<!-- cite-historical: CloudKeyValueStore.swift:63-72 - the seed loop as round 4 read it, quoted in the table above; the I1 fix gated it, and those lines now document the gate. -->
<!-- cite: StatsStore.swift:63-65 "private func persist() {" -->
<!-- cite: StatsStore.swift:78 "stats = value" -->
<!-- cite: PracticeDataSection.swift:16 "Button(\"Reset practice data\", role: .destructive)" -->
<!-- cite-historical: AppModel.swift:113 - `resetPracticeData()` where round 4 found it; the I1 fix added three lines above it and it is now at line 116. -->
<!-- cite-historical: AppModel.swift:49-78 - the nine-store wiring as round 4 counted it; the I1 fix wraps the store in `InitialSyncGatedCloudStore` and the range that ends with the `StatsCloudSync(cloud:stores:)` array is now 49-81. -->
<!-- cite: ios/project.yml:40 "CODE_SIGN_ENTITLEMENTS: BlackjackTrainer/BlackjackTrainer.entitlements" -->

<!-- prettier-ignore-end -->
