# REVIEW - round 3, closing

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

**Verdict: REJECT**

Range reviewed: `076d49d..4f39478`, one commit - "correct the closing records the final review
disproved and take the number out of the anchor". It answers `reviews/REVIEW-round3-final.md` and
claims to fix all ten of that review's findings. It touches four files: `PROD-READINESS.md`,
`reviews/ARTIFACTS-round3.md`, `src/app/app.scss` (a comment) and the final review itself.

Two things force the verdict, and only two:

1. **This commit takes `npm run lint` red.** Gate 1 exits 0 at `076d49d` and 1 at `4f39478`.
   `prettier --check` rejects `PROD-READINESS.md` because the M2 link was shortened without
   re-padding its table cell. Every other developer's lint run is red until it is fixed (F1).
2. **One of the ten findings is not fixed at all.** `final-F4` - the ledger crediting N4 with three
   unit tests where there are four - is untouched, while a new row added by this very commit records
   it as "Corrected to four" (F2). That is the fifth time in this round that a remediation row has
   published a correction it did not make.

Seven of the ten do hold, and the code half is clean: the `app.scss` comment is now true of the
measurements under it and changes no rule. But the round cannot close on this commit.

**Naming.** The findings of the review under answer are cited as `final-F1` .. `final-F10`. My own
findings are `F1` .. `F12`.

## The gates

Run in the live checkout at `4f39478` with the tool sandbox disabled. `git status --porcelain`
printed only `.agents/` and `.codex/` before and after.

| #   | gate       | command         | exit  | result                                                 |
| --- | ---------- | --------------- | ----- | ------------------------------------------------------ |
| 1   | lint       | `npm run lint`  | **1** | **RED** - `prettier --check` on this commit's own edit |
| 2   | build      | `npm run build` | 0     | the inherited chart-page budget warning, unchanged     |
| 3   | unit tests | `npm test`      | 0     | 67 files, 1551 passed                                  |

```console
$ npm run lint
> npm run typecheck && npm run format:check
> tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json && tsc --noEmit -p tsconfig.e2e.json
> prettier --check .
Checking formatting...
[warn] PROD-READINESS.md
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
LINT_EXIT=1

$ npm run build
                    | Initial total                       | 289.00 kB |                76.65 kB
Application bundle generation complete. [2.927 seconds]
▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget.
  Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.
BUILD_EXIT=0

$ npm test
 Test Files  67 passed (67)
      Tests  1551 passed (1551)
   Duration  4.64s
TEST_EXIT=0
```

The three typecheck projects pass; the only lint failure is the formatter, and it is this commit's.

**I did not run E2E, deliberately.** The commit's only non-record change is a comment block in
`src/app/app.scss`, and it changes no declaration:

```console
$ git diff 076d49d 4f39478 -- src/app/app.scss | grep -E "^[-+]" | grep -v "^[-+][-+]" | grep -vE "^[-+][[:space:]]*//"
(no output)
exit=1
```

No `.ts`, no `e2e/`, no config, no fixture is touched. Gate 5's inputs are byte-identical to
`076d49d`, where the final reviewer ran the dist lane five times and got `111 passed` on each. A
sixth run would measure the same tree and only risk the port. `lsof -nP -iTCP:4200 -sTCP:LISTEN`
exited 1 before and after my work; I never bound 4200, never created `site/`, and did not run
`npm run export:fixtures` (nothing in range can move a fixture - `git diff --exit-code --
ios/Fixtures` exits 0 regardless).

## Did each of final-F1 .. final-F10 get fixed?

| final finding | verdict            | why                                                                |
| ------------- | ------------------ | ------------------------------------------------------------------ |
| final-F1      | **fixed**          | both survivals corrected; the completeness grep is clean           |
| final-F2      | **fixed**          | heading carries no number; all 11 ledger anchors resolve           |
| final-F3      | **fixed**          | closing text now matches K2 and disclaims the table                |
| final-F4      | **NOT FIXED**      | `PROD-READINESS.md:535` still says "three tests" (F2)              |
| final-F5      | **partially**      | the command runs now; two output lines still are not output (F7)   |
| final-F6      | **fixed**          | transcript is byte-identical to the real output                    |
| final-F7      | **fixed**          | 21 px, on the component's own `Math.ceil` convention               |
| final-F8      | **fixed**          | comment restated and true of both measured viewports               |
| final-F9      | **fixed in place** | but the artifact sentence it derives from now contradicts it (F10) |
| final-F10     | **fixed**          | wording bounded to the table; enumeration is short by five (F11)   |

The bar the brief set was that the _new_ text be true, not that it say it is. Below, each one, with
the check re-run.

### final-F1 - the M2 rate survived in two present-tense sentences

Fixed. The final review's own completeness grep, re-run at the tip:

```console
$ grep -n "one run in twenty\|one in twenty\|1 run in 20\|20 / 400\|20/400\|5% per execution\|5%-per-execution\|5\.0%\|0\.97\^10\|3% per execution" reviews/ARTIFACTS-round3.md
152:| the one test, `--repeat-each=200`, independent  | `d502bfb`, fix reverted | **13 / 200** | 6.5% per execution     |
186:measured again; the pooled figure moved from 5.0% to 5.5% and its interval tightened.)
285:release gate that is red roughly one run in four". The rate is 5.5% per execution, not 25% per run, and
289:where a 5.5%-per-execution flake would become a deploy that fails for no reason about one run in
exit=0
```

`:285` and `:289` - the two the review named - now read 5.5% and "one run in eighteen". `:152` and
`:186` are the sample row and the narrative the review already excused. The related survival the
review flagged at lower confidence is still there; see F5.

### final-F2 - the M2 heading contained a rate and the anchor moved with it

Fixed, structurally.

```console
$ sed -n '12p' reviews/ARTIFACTS-round3.md
## M2 - the E2E gate fails on one test, and it is the test that is wrong
$ sed -n '439p' PROD-READINESS.md | grep -o 'ARTIFACTS-round3.md#[a-z0-9-]*'
ARTIFACTS-round3.md#m2---the-e2e-gate-fails-on-one-test-and-it-is-the-test-that-is-wrong
```

No number in the heading, so none in the anchor. All eleven ledger references resolve against the
artifact's own headings, slugified GitHub-style:

```console
$ python3 <slugify every heading in ARTIFACTS-round3.md; match every ARTIFACTS-round3.md#... reference>
headings: 55
PROD-READINESS.md: refs=11 unresolved=0
reviews/REVIEW-round3-final.md: refs=3 unresolved=3
reviews/REVIEW-round3-stage2.md: refs=5 unresolved=1
```

The four unresolved are all inside `console` fences in review prose - they are transcripts of the
dead anchors being discussed (`REVIEW-round3-final.md:218,226,227`), not live links. No live link is
broken. This is the one place the fix is structurally sound rather than merely restated: the next
time the pooled rate moves, the anchor no longer moves with it.

The cost is F1: shortening the link left the table cell 27 characters short of the width prettier
computes for it.

### final-F3 - the closing paragraph impeached its own gate-5 table

Fixed. `PROD-READINESS.md:597-601`:

> and each of us in turn killed a live server we took for an orphan. It cost one invalidated CI-mode
> transcript (re-run alone, recorded under N1) and a reviewer twelve aborted runs. **No block in the
> table above is one of those casualties.**

against K2, `PROD-READINESS.md:520`:

```console
$ grep -n '\*\*K2\*\*' PROD-READINESS.md | cut -c1-420
520:| **K2** | P3       | `playwright.config.ts:6` hardcodes `const PORT = 4200`, so two E2E runs cannot coexist on one machine: the dist lane refuses to reuse a port it did not start, and a second run either fails to start or - as happened twice in this round - has its server killed by whoever mistakes it for an orphan. It cost this run one invalidated CI-mode transcript and the stage-1 reviewer twelve aborted runs.
```

Same two casualties, same count ("twice in this round" / "each of us in turn"), and the sentence that
contradicted the table is gone and replaced with its negation. The table itself is unchanged and
still attributes its single failure to M4.

### final-F4 - the ledger credits N4 with three tests

**Not fixed.** See F2.

### final-F5 - the N6 mutation command could not run

Partially. The `python3 -c` block that raised `IndentationError` is gone. Its replacement is a `sed`,
and the `sed` does run - I executed it verbatim on a copy of the tree's manifest:

```console
$ sed -i '' 's|"id": "./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest
SED_EXIT=0
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
```

Byte-identical to the two lines published at `reviews/ARTIFACTS-round3.md:1244-1246`. The remaining
two lines of that block are still not output of the commands above them - F7.

### final-F6 - the `npm ls` transcript carried a `#` comment grep never prints

Fixed, byte-for-byte:

```console
$ git show b09470d:package-lock.json | grep -n '"@angular/forms"' > actual.txt
$ sed -n '1267p' reviews/ARTIFACTS-round3.md > published.txt
$ diff actual.txt published.txt
IDENTICAL
```

R3-27's description of how it was fixed is wrong, though - F9.

### final-F7 - "short by 20px" is 21 on the component's own convention

Fixed.

```console
$ sed -n '1139p' reviews/ARTIFACTS-round3.md
EFFECT offer then a failed reload   after updateFailed    reserve=162px banner={top:517.84,height:166.16}  short by 21px
$ grep -n "Math.ceil\|innerHeight" src/app/app.ts
144:    const space = rect.height === 0 ? 0 : window.innerHeight - rect.top;
145:    this.bannerSpace.set(Math.max(0, Math.ceil(space)));
$ python3 -c "import math; print(math.ceil(700-517.84)-162, math.ceil(700-504.03)-162)"
21 34
```

Both lines of the pair are now on the `Math.ceil` basis `App.measureBanner` uses, which is what the
finding asked for, and 21 is the figure `reviews/REVIEW-round3-stage3.md:125` gave originally. No
"short by 20" survives anywhere except inside the two documents that quote the defect.

### final-F8 - the shipped `app.scss` comment overstated the scroll

Fixed, and this is the one source file the commit touches. `src/app/app.scss:13-17`:

```console
$ sed -n '13,17p' src/app/app.scss
  // is 375x700 and up. Below that the drill's own content (~499px) is already at
  // its minimum, `min-height` cannot shrink past it, and the page becomes
  // scrollable by however much of the reserve the content forces past the
  // viewport instead — 161px of 162 at 375x500, 93 of 162 at 320x568 — which
  // makes the controls reachable by scrolling rather than not reachable at all.
```

The false quantity ("scrollable by exactly the banner's height") is gone, and the two figures now in
the comment are the ones the artifact's own table publishes:

```console
$ sed -n '1096,1097p' reviews/ARTIFACTS-round3.md
| 320x568  | 6 / 6           | **0 px**           | 3 / 6                  | 93 px             | **0 / 6**                    |
| 375x500  | 6 / 6           | **0 px**           | 6 / 6                  | 161 px            | **0 / 6**                    |
```

They also reproduce from the comment's own stated model, which is the check that matters: with a
~499 px content minimum and a 162 px reserve, `499 + 162 - 568 = 93` and `499 + 162 - 500 = 161`.
Both exact. The same figures were measured independently in a browser by the final reviewer
(`REVIEW-round3-final.md:462,464`), and the CSS the comment describes is unchanged by this commit, so
that measurement still applies to this tree. I did not re-probe a browser for a comment-only edit.

One observation, not a finding: "of 162" is the offer-banner state. In the failed-reload state the
reserve is 183 and the scroll at 320x568 would be 114, not 93. The comment does not say which state
its two examples are in. The general clause preceding them is correct for every state, so the comment
is not false - it is exemplary rather than exhaustive.

### final-F9 - "62 further repeats by two reviewers"

Fixed in the ledger. `PROD-READINESS.md:592-593` now reads "plus the stage-1 reviewer's own 50
repeats of that one test and its 12 full-suite runs at the shipping commit", and both attributions
check out:

```console
$ sed -n '287,292p' reviews/REVIEW-round3-stage1.md
$ E2E_SERVER=dist npx playwright test \
    --grep "returning to counting keeps the drill going" --repeat-each=50
EXIT=0
  50 passed (45.3s)
$ sed -n '447,448p' reviews/REVIEW-round3-stage1.md
12 of 12, `111 passed` every time, zero skipped in every run, and both tests this range touches
$ grep -n "repeat-each=" reviews/REVIEW-round3-stage2.md
319:$ E2E_SERVER=dist npx playwright test --grep "returning to counting keeps the drill going" --repeat-each=200
```

One reviewer, one `--repeat-each=50` and 12 full-suite runs; the stage-2 reviewer's instrument is a
different one (200), so it is not half of the 62. The sentence is now exact. What it left behind is
F10.

### final-F10 - "82 full-suite runs in this round"

Fixed. `PROD-READINESS.md:587-589` now bounds the claim to the table and says so explicitly ("82 is
the table's total, not the round's"). The extras it names are real:

```console
$ grep -n "111 passed" reviews/ARTIFACTS-round3.md | grep -vE "run[0-9]+ exit"
512:(Two columns for width; the loop ran them in order.) 30 of 30, `111 passed` every time, zero skipped.
618:  111 passed (2.7m)
624:The reviewer re-ran the same extracted script independently and got `111 passed (2.8m)`, 1 worker.
952:| 5 E2E (`CI=true`)   | exit 0, `111 passed`, 1 worker                    |
1454:| 5   | E2E               | `E2E_SERVER=dist npm run e2e`                                                                             | 0    | `111 passed (37.2s)`                           |
```

`:618` is the CI-mode step run under N1 and `:952`/`:1454` are stage gate checks, exactly as the new
sentence says. Its enumeration is short by the five runs the same commit adds - F11.

---

## Findings

### F1 - this commit takes `npm run lint` red for the whole repository

`PROD-READINESS.md:439`. Gate 1 is green at the parent and red at the tip:

```console
$ git show 076d49d:PROD-READINESS.md > /tmp/prod-076d49d.md
$ npx prettier --check --parser markdown /tmp/prod-076d49d.md
Checking formatting...
All matched files use Prettier code style!
PRETTIER_AT_076d49d_EXIT=0

$ npx prettier --check PROD-READINESS.md
Checking formatting...
[warn] PROD-READINESS.md
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
PRETTIER_EXIT=1
```

The whole disagreement is one line, and it is the line this commit rewrote to fix `final-F2`:

```console
$ npx prettier PROD-READINESS.md > /tmp/pr-formatted.md; diff PROD-READINESS.md /tmp/pr-formatted.md
439c439
< | M2  | P1               | **P1**     | RESOLVED - artifact in [...#m2---the-e2e-gate-fails-on-one-test-and-it-is-the-test-that-is-wrong)                                                                                                                                          |
---
> | M2  | P1               | **P1**     | RESOLVED - artifact in [...#m2---the-e2e-gate-fails-on-one-test-and-it-is-the-test-that-is-wrong)                                                                                                                                                                    |
```

Shortening the anchor by 27 characters shortened the cell's content without re-padding it to the
column width prettier computes from the widest row, so the trailing spaces are now wrong. The
remediation for `final-F2` was correct in substance and was committed without re-running the gate it
breaks. `reviews/ARTIFACTS-round3.md`, `reviews/REVIEW-round3-final.md` and `src/app/app.scss` all
pass (`OTHER_FILES_PRETTIER_EXIT=0`); `PROD-READINESS.md` is the only file, and
`npx prettier --write PROD-READINESS.md` is the whole fix.

This is a live gate regression, not a records defect, and it is the reason the verdict is REJECT
rather than PASS-WITH-FINDINGS. The round's own definition of a green gate 1 is false at the tip.

### F2 - `final-F4` is not fixed, and a new row in the same commit says it is

`PROD-READINESS.md:535` and `:564`, unchanged by this commit:

```console
$ grep -n "N4: three tests\|four added for N4" PROD-READINESS.md
535:| `src/app/app.spec.ts`                                                              | N4: three tests pinning the measurement and its return to zero                                                                                      |
564:| 3   | unit tests        | 0    | 67 files, 1551 passed (baseline 1547; four added for N4)               |
```

There are four (`1551 - 1547 = 4`, and the final review located all four `it(` blocks). The row at
`:535` still says three. The commit's own new row, `PROD-READINESS.md:507`, records it as done:

> **R3-26** (FF-4) ... "What round 3 actually changed" credited N4 with three unit tests, in the
> commit that added the fourth. The gate table nineteen lines below says four. | **Corrected to
> four.**

Nothing was corrected. `git diff 076d49d 4f39478 -- PROD-READINESS.md` contains three hunks - the M2
link at 436, the regression table at 477, and the closing text at 577 - and line 528/535 falls in
none of them. This is the same class of defect as `final-F1`, `final-F2`, `final-F5` and `final-F6`:
a remediation row asserting a fix it did not make. It is the fifth instance in this round and the
first where the claimed edit is absent entirely rather than incomplete.

### F3 - R3-26's "nineteen lines below" is twenty-nine

`PROD-READINESS.md:507`. The two rows are at 535 and 564:

```console
$ python3 -c "print(564-535)"
29
```

The final review said "twenty-nine lines later" and gave both line numbers. Minor on its own; it
matters because it is the only part of R3-26 that could have been checked against the file, and it
was not.

### F4 - R3-24's "R3-18's row no longer claims finality" is false; the row was not edited

`PROD-READINESS.md:505` (R3-24) closes with "R3-18's row no longer claims finality". R3-18 is at
`:499` and is byte-identical across the commit:

```console
$ for c in 076d49d 4f39478; do git show "${c}:PROD-READINESS.md" | grep '\*\*R3-18\*\*' | tr -s ' ' > r318-${c}.txt; done
$ wc -c r318-076d49d.txt r318-4f39478.txt
     534 r318-076d49d.txt
     534 r318-4f39478.txt
$ diff r318-076d49d.txt r318-4f39478.txt
IDENTICAL - the row was not edited
```

Its resolution column still reads, in full:

> All corrected to the three-sample pooled 5.5% (33/600), the section heading rewritten so it no
> longer contains a rate at all - the anchor stops moving with the number - and completeness verified
> by grep rather than asserted. R3-1 and R3-11's resolution columns no longer claim finality.

"All corrected" and "completeness verified by grep rather than asserted" are exactly the finality
claims `final-F1` disproved, and they are still there unqualified. The only sentence in that row that
disclaims finality disclaims it for _other_ rows. R3-24 describes an edit to R3-18 that this commit
did not make.

### F5 - R3-24's "the fourth and last time this number needed correcting", with a superseded rate still in the table

`PROD-READINESS.md:505`. Two problems in one clause.

It is a prediction, and the round has published this prediction three times already - R3-1 ("wrong
twice more ... which is where it finally was"), R3-11 and R3-18 each asserted completeness for the
same number and each was wrong. "Last" is not a checkable statement about the tree and does not
belong in a resolution column that the round's own rules require to be evidence.

And a superseded form of the number is still in the same table, twenty-one rows above, at
`PROD-READINESS.md:484` (R3-3):

```console
$ grep -n '0\.95\^460\|0\.945\^460' PROD-READINESS.md reviews/ARTIFACTS-round3.md
PROD-READINESS.md:484:... 460, with the power recomputed against the pooled before-rate: `0.95^460 = 5.7e-11`.
reviews/ARTIFACTS-round3.md:246:chance of 460 consecutive passes is `0.945^460 = 5.0e-12`; at the low end of the pooled interval
$ python3 -c 'import math; print(math.pow(0.95,460), math.pow(0.945,460))'
5.66054741891586e-11 4.996109108854475e-12
```

Both are arithmetically right; they are the same quantity computed from the superseded 5.0% pool and
the current 5.5% pool, and only the artifact carries the current one. The final review filed this at
lower confidence because R3-3 is a historical row. That was fair when the commit made no claim about
it. It is no longer fair now that the same table asserts the number needed correcting for the last
time.

### F6 - R3-1's row is falsified by R3-24, in the same table

`PROD-READINESS.md:482`, also byte-identical across this commit (`diff` on the whitespace-normalised
row: `IDENTICAL`, 640 bytes both sides):

> This row's claim that the rate was corrected everywhere was wrong twice more - see R3-11 and R3-18,
> which is where it finally was.

R3-24, added twenty-three rows below it by this commit, records a third failure and puts the actual
correction at R3-24. So "wrong twice more" is now three, and "R3-18 ... is where it finally was" is
now false by the commit's own account. This is the cross-record contradiction the brief asked me to
look for: correcting the record in one place and leaving the pointer to it stale in another.

### F7 - the N6 block still publishes two lines neither command produces

`reviews/ARTIFACTS-round3.md:1244-1251`, rewritten by this commit as R3-27's fix:

```console
$ sed -n '1244,1251p' reviews/ARTIFACTS-round3.md
$ sed -i '' 's|"id": "./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null && bash -e step05.sh
id is /blackjack-trainer/
CHECK_EXIT=1
$ # manifest restored from the copy taken before the edit, rebuilt
$ bash -e step05.sh
RESTORED_EXIT=0
```

I ran it. In a `git archive 4f39478` export with `node_modules` symlinked, with `step05.sh`
reconstructed mechanically from the `run:` block of the relocatability step in
`.github/workflows/ci.yml:42-56` - which is what the artifact says the scratch runner writes
(`reviews/ARTIFACTS-round3.md:585`):

```console
$ sed -i '' 's|"id": "./"|"id": "/blackjack-trainer/"|' public/manifest.webmanifest
$ grep -n '"id"' public/manifest.webmanifest
5:  "id": "/blackjack-trainer/",
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null && bash -e step05.sh
(build exit=0)
id is /blackjack-trainer/
(bash -e step05.sh exit=1)

$ cp manifest.bak public/manifest.webmanifest
$ npm run build -- --base-href /blackjack-trainer/ > /dev/null
(rebuild exit=0)
$ bash -e step05.sh
(bash -e step05.sh exit=0)  <-- printed nothing above this line
```

The property is real and the first output line is exact. But `bash -e step05.sh` prints
`id is /blackjack-trainer/` and nothing else, then exits 1. It does not print `CHECK_EXIT=1`. After
the restore it prints nothing at all and exits 0. It does not print `RESTORED_EXIT=0`. Both exit
labels are the author's own `echo "...=$?"`, and that `echo` is not in the block.

The artifact's own record proves the same thing internally: the identical mechanism is shown printing
three different labels for three different scripts.

```console
$ grep -n "CHECK_EXIT\|RESTORED" reviews/ARTIFACTS-round3.md
685:STEP6_EXIT_RESTORED=0
762:CHECK_EXIT=1
775:CHECK_EXIT=1
785:CHECK_EXIT=1
789:CHECK_EXIT=0
1248:CHECK_EXIT=1
1251:RESTORED_EXIT=0
```

`out/step06.sh` cannot print `STEP6_EXIT_RESTORED=` and `out/step05.sh` `CHECK_EXIT=` if both are
verbatim copies of a workflow `run:` block. And within the new block, one command - `bash -e
step05.sh` - is shown printing `CHECK_EXIT=1` at `:1248` and `RESTORED_EXIT=0` at `:1251`. One script
cannot emit two variable names.

The four occurrences at `:762`-`:789` are pre-existing and outside this range; I record them as
context, as the final review did for the `ls -d node_modules/@angular/forms` line. `:1248` and
`:1251` are this commit's. `:1251` is worse than what it replaced: `076d49d` had `$ # restored` above
it, an honest marker that no command was being quoted, and this commit put a real command line under
that marker and attached the invented label to it. R3-27's "Both re-run and transcribed" is true of
the `sed` and false of the two exit lines - the third consecutive remediation of this block to carry
the defect it was written to remove.

### F8 - the N6 block cites `step05.sh` where the same document establishes `out/step05.sh`

`reviews/ARTIFACTS-round3.md:1247` and `:1250` against `:760`, `:773`, `:784`, `:788`:

```console
$ grep -n "bash -e" reviews/ARTIFACTS-round3.md
585:script to a file, and executes it with `bash -e`, which is the documented default shell for `run:` on
616:$ CI=true E2E_SERVER=dist bash -e out/step09.sh   # out/step09.sh is one line: npm run e2e
674:$ bash -e out/step06.sh       # the anti-drift step, verbatim from pages.yml
684:$ bash -e out/step06.sh
760:$ bash -e out/step05.sh
773:$ bash -e out/step05.sh
784:$ bash -e out/step05.sh
788:$ bash -e out/step05.sh
1246:$ npm run build -- --base-href /blackjack-trainer/ > /dev/null && bash -e step05.sh
1250:$ bash -e step05.sh
```

Every other invocation in the document, including the four for this same script, writes `out/`. The
runner is a scratch tool that is not committed, so a reader cannot resolve either path - which makes
the inconsistency the only signal available about whether the block was transcribed from a run or
retyped. Low severity on its own; it corroborates F7.

### F9 - R3-27's "the grep's annotation moved out of the block" - it was deleted

`PROD-READINESS.md:508`. The annotation is not anywhere in either record file:

```console
$ grep -rn "one occurrence" reviews/ARTIFACTS-round3.md PROD-READINESS.md
exit=1
```

The substance it carried ("one occurrence: the root dependency") is not restated in the prose around
`reviews/ARTIFACTS-round3.md:1266` either. Deleting it was the right call - it is what `final-F6`
asked for - but "moved out of the block" describes an edit that was not made.

### F10 - the artifact half of `final-F9` is untouched and now contradicts the corrected ledger

`reviews/ARTIFACTS-round3.md:247-248`, unchanged by this commit:

```console
$ sed -n '247,248p' reviews/ARTIFACTS-round3.md
(3.82%) it is `0.9618^460 = 1.7e-8`, about 1 in 60 million. Neither reviewer's own repeats at the
shipping commit (50 and 12 full-suite runs) are counted in that 460.
```

against `PROD-READINESS.md:592-593`, which this commit rewrote:

> plus the stage-1 reviewer's own 50 repeats of that one test and its 12 full-suite runs at the
> shipping commit.

The ledger now says one reviewer and distinguishes the two instruments; the artifact still says
"neither reviewer" and calls both "full-suite runs". They are the same 50 and the same 12. The ledger
is right (see the final-F9 walkthrough above) and the artifact is wrong, and R3-30's resolution
column says "Both restated exactly."

This is precisely the "corrected in one document, left standing in the other" pattern that R3-1,
R3-11, R3-18 and R3-24 all record about the M2 rate, applied to a new number.

### F11 - R3-30's replacement enumeration is short by the five runs this commit adds

`PROD-READINESS.md:588-589`: "The round's records contain a handful more outside the table - the
CI-mode step run under N1, each stage's own gate check - all green".

The same commit adds `reviews/REVIEW-round3-final.md`, which records five more full-suite runs at
`076d49d`:

```console
$ grep -n "run[0-9] exit=0" reviews/REVIEW-round3-final.md
117:run1 exit=0   111 passed (39.7s)
118:run2 exit=0   111 passed (36.7s)
119:run3 exit=0   111 passed (37.5s)
120:run4 exit=0   111 passed (37.1s)
121:run5 exit=0   111 passed (35.3s)
```

They are neither the CI-mode step run nor a stage's gate check. "A handful more" is loose enough to
absorb them; the two-item enumeration after the dash is not. All five are green, so the direction is
still conservative. Lowest-severity finding here, and I record it only because `final-F10` was
recorded on the same basis.

### F12 - the new rows cite finding ids that exist nowhere

`PROD-READINESS.md:505-511` label the seven new rows `(FF-1)` .. `(FF-10)`. The review they answer
numbers its findings `F1` .. `F10`:

```console
$ grep -c "FF-[0-9]" reviews/REVIEW-round3-final.md
0
```

The stage rows use `(S2-F1)`, `(S3-F8)` and so on, so the intent is legible, but a reader following
`R3-27 (FF-5, FF-6)` into `REVIEW-round3-final.md` will not find `FF-5`. A nit, recorded for
completeness.

---

## Checked and held

- **The regression table's seven new rows are seven, not eight.** `grep -c` on the `R3-2[4-9]|R3-30`
  pattern returns 7. The brief said eight; the commit added R3-24 through R3-30.
- **The artifact's "superseded version is kept and marked, not deleted" policy
  (`reviews/ARTIFACTS-round3.md:7-8`) is not violated** by the in-place edits to `:285`, `:289`,
  `:1139`, `:1244-1251` and `:1267`. The policy governs invalidated _proofs_; these are corrected
  figures and transcripts, and the R3-24 .. R3-30 rows are the marking the round uses for them.
- **The regression table's intro claim** that every regression "is listed here as well as in the
  artifact where it was corrected" is not true of the new rows - but `grep -c "R3-1[0-9]\|R3-2[0-3]"
reviews/ARTIFACTS-round3.md` returns 0, so it is equally untrue of every earlier row and predates
  this commit. Not filed against this range.
- **`ios/Fixtures` is clean** (`git diff --exit-code -- ios/Fixtures`, exit 0) and nothing in range
  can move a fixture.
- **No `site/` directory exists**, and I did not run the workflow's assemble step.
- **Working tree left as found**: `git status --porcelain` prints `?? .agents/`, `?? .codex/` and
  this file. All mutation work ran in a `git archive 4f39478` export under my scratch directory with
  `node_modules` symlinked; no mutant was written into the checkout.
- **Port 4200 was free before and after** (`lsof -nP -iTCP:4200 -sTCP:LISTEN` exit 1) and I never
  bound it.

## Does the round close here?

**No, and the next round is small and does not need a code reviewer.**

Every one of F1 .. F12 is fixed by editing `PROD-READINESS.md` and `reviews/ARTIFACTS-round3.md`. The
commit's one source edit - the `src/app/app.scss` comment - is correct, changes no declaration, and
needs nothing further. The gates that must be re-run after the records fix are **gate 1 only**, and
F1 makes that mandatory rather than optional: `npm run lint` is red right now.

Concretely, what has to happen before this round can close:

1. `npx prettier --write PROD-READINESS.md`, then `npm run lint` back to exit 0 (F1). Non-negotiable.
2. `PROD-READINESS.md:535`: three tests to four (F2), and R3-26's "nineteen" to "twenty-nine" (F3).
3. R3-24 must stop claiming an edit to R3-18 that was not made (F4) and stop predicting finality
   (F5); R3-18's own row needs the forward pointer R3-1 and R3-11 already have.
4. R3-1's "wrong twice more ... R3-18 ... is where it finally was" needs to become three and point at
   R3-24 (F6).
5. The N6 block's two exit labels need either the `echo` that produced them or removal (F7, F8), and
   R3-27 needs to stop saying the N2 annotation was "moved" (F9).
6. `reviews/ARTIFACTS-round3.md:247-248` needs the same correction the ledger got (F10), and R3-30's
   enumeration needs the five review runs (F11).
7. The `FF-n` ids need to match the review they cite, or the review needs those ids (F12).

Because that remediation touches no code, the review that closes it can be a records-and-gate-1 check
rather than another full round. Under this round's own rule that no reviewer reviews the remediation
of their own findings, it should not be me.
