# REVIEW - round 4, stage 4

<!-- records: historical-file - an answered review. Its figures and transcripts were true at the commit it reviewed and were checked by this gate when it was written; the remediation it prompted has since moved several of them, and rewriting a reviewer's evidence to match a later tree would destroy the record. Citations here are still resolved and bounds-checked. -->

Adversarial review of `4ad4d24..aadd4b5` on `prod-readiness/round4-2026-08-12`: `77f75fa` (gate 5 re-measured and
pooled into three blocks), `501343a` (the gate section says which commit it measures), `c024fec` (the marker
escape closed "as a class", everything the rule change invalidated re-measured, and the stage-3 review
committed), and `aadd4b5` (the gate section names `c024fec`, and the figure treadmill becomes K8).

Every figure, transcript, citation and claim in the changed files was treated as unverified and re-derived here.
`reviews/REVIEW-round4-stage1.md`, `-stage2.md` and `-stage3.md` were read, and each of stage 3's eleven
findings was re-tested against the tree rather than against the record that says it is closed.

- Date: 2026-08-12
- Reviewed at: `aadd4b5`

## Method

Every measurement was taken in private worktrees created with `git worktree add --detach`, with `node_modules`
symlinked from the main checkout: one at `aadd4b5` (the tip) and one at `c024fec` (the commit the gate table
names). Mutations were made in those worktrees only, always after copying the affected paths aside, and always
copied back in the same execution; `node tools/check-records.mjs` is re-run after each restore and printed, so
the fence itself shows the tree came back. Nothing in the live checkout was modified except to add this file.

Each fenced block below is one execution: the `$` line and the lines under it happened together, and the scratch
directory is written out in full on the command line rather than abbreviated.

References into `PROD-READINESS.md`, `reviews/ARTIFACTS-round4.md` and `LAUNCH-CHECKLIST.md` are given as plain
text with a line number rather than as backticked citations, and references into `tools/check-records.mjs` and
`tools/check-records.spec.mjs` name the function, constant or test rather than a line. The main session was
editing all five files in the live checkout while this review was being written - `tools/check-records.mjs`
changed under me mid-review - so a pinned line number would be stale before anyone read it. Every measurement
below is from a worktree pinned to `aadd4b5` or `c024fec`, never from the live checkout.

E2E ran on port 4950 only, checked free with `lsof` first. Port 4200 was never touched.

## What reproduced exactly

Re-run at `aadd4b5`, not taken on the record's word. Most of this range is genuinely done: seven of stage 3's
eleven findings are properly closed (its F1, F4, F5, F8, F9, F10 and F11), and four are not (F2, F3, F6, F7),
which is what F1 to F8 below are about.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt4 && echo "COMMIT=$(git rev-parse --short HEAD)"; npm test > $S/f1-test.txt 2>&1; echo "UNIT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/f1-test.txt | grep -E 'Test Files|Tests '; npm run test:coverage > $S/f1-cov.txt 2>&1; echo "COVERAGE_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/f1-cov.txt | grep -E 'Statements|Branches|Functions|Lines'; node tools/check-records.mjs; echo "GATE_EXIT=$?"; npx ng test --include="../tools/check-records.spec.mjs" > $S/f1-spec.txt 2>&1; echo "SPEC_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/f1-spec.txt | grep -E 'Tests '; echo "IT_BLOCKS=$(grep -c '^  it(' tools/check-records.spec.mjs)"
COMMIT=aadd4b5
UNIT_EXIT=0
 Test Files  68 passed (68)
      Tests  1600 passed (1600)
COVERAGE_EXIT=0
Statements   : 96.1% ( 5559/5784 )
Branches     : 93.13% ( 2522/2708 )
Functions    : 93.46% ( 958/1025 )
Lines        : 97.9% ( 4295/4387 )
records: 29 documents checked, no defects
GATE_EXIT=0
SPEC_EXIT=0
      Tests  48 passed (48)
IT_BLOCKS=48
```

- `FIGURES` matches the tree. The unit count is 1600 over 68 files. Coverage ran four times in all during this
  review: three printed the pinned quadruple exactly, and the fourth printed the branch figure one branch
  higher, which is the jitter the tolerance exists for and is inside it.
- Gate 5 is real. `npx playwright test --list` is `Total: 115 tests in 14 files`, and a full dist-lane run on my
  own port finished `115 passed (37.1s)`, exit 0.
- Gate 6 is real: `npm run export:fixtures` printed `Wrote 7 parity fixtures`, and the anti-drift check over
  `ios/Fixtures` exited 0. `find ios -name '*.swift'` is 105 files, the number gates 7 and 8 report.
- Gates 1, 3 and 4 in the closing table are the tree's: 29 documents, 68 files / 1600 passed, and <!-- figure-historical -->
  96.10 / 93.09 / 93.46 / 97.90. Stage 3's F1 - a table naming one commit while two rows carried another tree's
  numbers - is fixed for the numbers themselves.
- All six leaks stage 3's F6 probe found are closed. A `records:` marker in a double-backtick span, in a `~~~`
  fence and in a four-space indented block no longer freezes a document; `cite:`, `cite-historical:` and
  `transcript-literal` all go through the same `directiveText` filter now, so a binding written inside a
  transcript no longer satisfies rule 2 and a `transcript-literal` named in prose no longer disarms rule 3.
- The marker-leak attack block (stage-3 F4) was genuinely re-run. Injecting the superseded count into the
  round-4 status section reproduces the same one-line refusal naming 1600 as the round's count, then
  `records: 29 documents checked, no defects` on restore, line for line.
- The M3 coverage block was genuinely re-run and reproduces to the last digit, including its file counts and
  the per-file quadruple 95.03 / 90.28 / 100 / 96.01 for `tools/check-records.mjs`.
- The K1 "Present" block's introduction (stage-3 F5) is properly rewritten: it now says the block cannot be
  reproduced at this commit and why.
- The `.gitignore` comment (stage-3 F10) is now correct. I ran the workflow's four assemble commands: the step
  leaves one directory holding 34 entries and 93 files, and `git status --porcelain` adds nothing at the
  repository root.
- The binding count (stage-3 F8) is correct: the ledger parses 57 bindings and 8 historical markers, and the
  artifact 8 and 9, which is the 65 and 17 published.
- Every live `figure-historical` marker is load-bearing (stage-3 F11). Deleting all five from
  `PROD-READINESS.md`, `LAUNCH-CHECKLIST.md` and the artifact turns the gate red with exactly five defects, one
  per marker.
- The rows answering stage 2 (stage-3 F9) are inside the table now, padded by prettier along with the rest, and
  `npx prettier --check PROD-READINESS.md` passes.
- D1 reproduces exactly: both placeholder lines at 65 and 55, and `pages.yml:53` still copying both files.

The unit count in that list carries a `figure-historical` marker in the source of this file. It was measured at
`aadd4b5` and it is what the closing table states there; the fixes for the findings below have since added
tests and moved the pinned figure, so rule 4 refused this report until the line said it was a record rather
than a current value. That is the treadmill named in the verdict, arriving on the review that named it.

The findings below should be read against that list. None of them is in `src/`.

## F1 - the transcript re-run to close stage-3 F3 was stale in the commit that re-ran it, and so is the paragraph above it

**Claimed.** `reviews/ARTIFACTS-round4.md` line 322 says "`tools/check-records.spec.mjs`, 47 tests"; line 331
gives the partition "20 assert only a refusal, 21 assert only an acceptance ..., 1 asserts both, and 5 are unit
tests of the slug and anchor helpers that assert neither - 47", introduced as "Counted from the file at this
commit"; and the fence at lines 340-345 publishes `Tests 47 passed (47)`. `PROD-READINESS.md` line 727 says
"new: the records gate and its 47 tests". The ledger's R4-7 resolution column says of stage-3 F3: "**F3
re-run.**"

**Checked.** The fence at the top of this review is that command, at this commit.

**Observed.**

```text
SPEC_EXIT=0
      Tests  48 passed (48)
IT_BLOCKS=48
```

The suite is 48. `c024fec` - the commit whose message is "close the marker escape as a class and re-measure
everything the rule change invalidated", and whose ledger row says F3 was re-run - is the commit that added the
48th test - `keeps a margin between the jitter it absorbs and the figure it refuses`, in
`tools/check-records.spec.mjs` - and, in the same commit, edited that transcript from 34 to 47.

**Why it is a defect.** This is stage-2 F4 and stage-3 F3 for the third time, in the third commit that claims to
close it, and it is now wrong in four places instead of two: the prose count, the partition, the transcript, and
the ledger's summary of what the round built. The partition is broken twice over - 20 + 21 + 1 + 5 is 47, and
the 48th test belongs to none of those four buckets, since it asserts neither a refusal nor an acceptance of any
document and is not a helper unit test. The paragraph directly under the fence says "nothing but a person
re-running it stands between this number and the next wrong one - which is the honest reason it was wrong
twice". It was wrong three times, and the third was written in the same commit as the sentence.

## F2 - K4 hands the next round 103, in a document whose own resolution column says K4 carries 105

**Claimed.** The ledger's R4-7 row states, as the answer to stage-3 F2: "F2 re-measured: 105, not 103, with
`REVIEW-round3-stage3.md` going from 4 to 6 - the two extra are exactly the fences the rule-3 bug had hidden,
**and K4 carries 105**."

**Checked.** I read K4, twenty-one lines below that sentence in the same file, and the artifact's blind-spot
list.

**Observed.** `PROD-READINESS.md` line 717:

```text
| **K4** | P3       | Closed-round records publish an exit label as the output of a command that cannot print it **103 times**, across eleven files, worst in `REVIEW-round3-stage2.md` (25) and `ARTIFACTS-round3.md` (18). ...
```

`reviews/ARTIFACTS-round4.md` line 59:

```text
  gates echo their labels into a file and the file is then printed. Every one of the 103 real
  instances in the census below is still refused, because none of those fences contains the echo at
```

**Why it is a defect.** Stage-3 F2's entire point was that K4's content is a number and that the number is what
the next round inherits. The census in the artifact was corrected to 105 by the same commit; K4 was not; and the
ledger's own resolution column asserts the opposite of what its own row says. The artifact's blind-spot list carries the same
superseded number in a sentence that quantifies what the rule still refuses. Rule 4 does not know this figure,
which is the honest reason nothing caught it - and that is exactly the finding the round has just written down
as K8, one row below the one it failed to update.

## F3 - the corrected census does not reproduce, and one line of it was edited by hand

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 272-296 publish a census fence printing `records: 276
defect(s)`, `rule 3 transcripts: 105`, `rule 4 figures: 114` and eleven per-file counts, of which
`reviews/REVIEW-round3-stage3.md` is 6. The block carries no commit label, and the prose above it says "this is
one execution".

**Checked.** I re-ran the published command in two worktrees - the tip, and `c024fec`, the commit that published
the corrected numbers - copying the two paths aside first so the restore is safe, and re-running the gate after
each restore to show the tree came back.

**Observed.**

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; rm -rf $S/keep && mkdir -p $S/keep && for w in wt4 wtc0; do cd $S/$w && cp -R reviews $S/keep/$w-reviews && cp PROD-READINESS.md $S/keep/$w-ledger.md; done; echo "SAVED_EXIT=$?"; for w in wt4 wtc0; do cd $S/$w && echo "TREE=$w COMMIT=$(git rev-parse --short HEAD)"; node -e '
const {readFileSync,writeFileSync,readdirSync}=require("fs");
for(const f of readdirSync("reviews")){if(!f.endsWith(".md"))continue;const p="reviews/"+f;
 const s=readFileSync(p,"utf8");writeFileSync(p,s.replace(/<!-- records: historical[^>]*-->/g,""));}
writeFileSync("PROD-READINESS.md",readFileSync("PROD-READINESS.md","utf8").replace(/<!-- records: historical[^>]*-->/g,""));
console.log("STRIPPED_OK=1");
'; node tools/check-records.mjs > $S/f2-$w.txt 2>&1; echo "CENSUS_EXIT=$?"; head -1 $S/f2-$w.txt; echo "rule 3 transcripts: $(grep -c 'block prints' $S/f2-$w.txt)"; echo "rule 4 figures:     $(grep -cE 'unit-test count|coverage quadruple|pooled M2' $S/f2-$w.txt)"; grep 'block prints' $S/f2-$w.txt | sed -E 's/^  ([^:]+):.*/\1/' | sort | uniq -c | sort -rn | head -7; cp -R $S/keep/$w-reviews/. reviews/ && cp $S/keep/$w-ledger.md PROD-READINESS.md; echo "RESTORED_EXIT=$?"; node tools/check-records.mjs; echo "GATE_AFTER_RESTORE_EXIT=$?"; done
SAVED_EXIT=0
TREE=wt4 COMMIT=aadd4b5
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
RESTORED_EXIT=0
records: 29 documents checked, no defects
GATE_AFTER_RESTORE_EXIT=0
TREE=wtc0 COMMIT=c024fec
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
RESTORED_EXIT=0
records: 29 documents checked, no defects
GATE_AFTER_RESTORE_EXIT=0
```

The totals are 275 and 113, not 276 and 114, at the commit that published them and at the tip. Only the middle
number, 105, is right.

There is direct evidence that the block was edited rather than re-executed. `uniq -c` right-pads every count to
the same width, so all ten single-digit and double-digit counts must align. In the published block they do not:

```text
   8 reviews/REVIEW-round3-closing.md
    6 reviews/REVIEW-round3-stage3.md
   4 reviews/REVIEW-round3-closing2.md
```

The `6` line carries four leading spaces where `8` and `4` carry three. `uniq -c` cannot emit that. The line was
retyped over the old `4`.

The block's own account of itself is also incoherent three ways. Line 270, immediately above the fence: "this is
one execution, and the strip is done in the live tree and then reverted with `git checkout --`." Line 318,
immediately below it: "The run above copies the two paths aside first and copies them back, which is safe
against a dirty tree." The fence between them does neither - it strips the live tree and ends, with no revert of
any kind. Anyone who runs the published command as published is left with every historical marker deleted from
`PROD-READINESS.md` and all of `reviews/`.

**Why it is a defect.** This is the block the round holds up as the measurement behind a NEXT ROUND finding, and
the range's own stated lesson beside it is "**a rule change invalidates every measurement the old rule
produced.**" Two of its three totals were hand-corrected to values no rule and no run produced, one per-file
count was retyped, and the prose describing the method contradicts both the fence and itself.

## F4 - the K3 mutant fence prints a line before the command that prints it

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 376-396 publish the K3 mutation as one `console` execution,
introduced as "re-run at the round's tip because the first version of this block was published against an
earlier one and its test count no longer reproduced (REVIEW-round4-stage2 F7)".

**Checked.** The command in that fence is `npm run lint > $S/pre2.txt 2>&1; echo "LINT_BEFORE_MUTATION_EXIT=$?";
python3 -c "..."; echo "MUTATE_EXIT=$?"; ...`. `npm run lint`'s output is redirected to a file. The only thing in
the whole command that can print `K3 reserve deleted from all four files` is the single `print(...)` at the end
of the `python3` body, which runs once, after the `LINT_BEFORE_MUTATION_EXIT` echo. The published output has it
twice, the first time before that echo:

```text
K3 reserve deleted from all four files
LINT_BEFORE_MUTATION_EXIT=0
K3 reserve deleted from all four files
MUTATE_EXIT=0
```

I then ran the published command verbatim, with the four SCSS files copied aside and copied back instead of
`git checkout`:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt4 && mkdir -p $S/s4scss && cp src/app/app.scss src/app/features/home/home-page.component.scss src/app/features/drill/drill-page.scss src/app/features/card-counting/card-counting-page.component.scss $S/s4scss/ && echo "BACKUP_EXIT=$?"; npm run lint > $S/pre2.txt 2>&1; echo "LINT_BEFORE_MUTATION_EXIT=$?"; python3 -c "
for p in ['src/app/features/home/home-page.component.scss','src/app/features/drill/drill-page.scss','src/app/features/card-counting/card-counting-page.component.scss']:
    s=open(p).read()
    s=s.replace('min-height: calc(100vh - var(--update-space, 0px));','min-height: 100vh;')
    s=s.replace('min-height: calc(100dvh - var(--update-space, 0px));','min-height: 100dvh;')
    open(p,'w').write(s)
p='src/app/app.scss'; s=open(p).read()
open(p,'w').write(s.replace('  padding-bottom: var(--update-space, 0px);\n',''))
print('K3 reserve deleted from all four files')
"; echo "MUTATE_EXIT=$?"; npm run lint > $S/k3e-lint4.txt 2>&1; echo "K3_LINT_MUTANT_EXIT=$?"; npm test > $S/k3e-test4.txt 2>&1; echo "K3_TEST_MUTANT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/k3e-test4.txt | grep -E 'Tests '; npm run build > $S/k3e-build4.txt 2>&1; echo "K3_BUILD_MUTANT_EXIT=$?"; cp $S/s4scss/app.scss src/app/app.scss; cp $S/s4scss/home-page.component.scss src/app/features/home/home-page.component.scss; cp $S/s4scss/drill-page.scss src/app/features/drill/drill-page.scss; cp $S/s4scss/card-counting-page.component.scss src/app/features/card-counting/card-counting-page.component.scss; echo "RESTORE_EXIT=$?"; git status --porcelain
BACKUP_EXIT=0
LINT_BEFORE_MUTATION_EXIT=0
K3 reserve deleted from all four files
MUTATE_EXIT=0
K3_LINT_MUTANT_EXIT=0
K3_TEST_MUTANT_EXIT=0
      Tests  1600 passed (1600)
K3_BUILD_MUTANT_EXIT=0
RESTORE_EXIT=0
```

One occurrence, after the echo, and the tree comes back clean.

**Why it is a defect.** The finding K3 asserts is true - three gates stay green with the whole reserve deleted -
and my run confirms it. The evidence for it is not one execution. This is R3-15/R3-27 exactly: two runs pasted
together and published as one, in the artifact that exists to make that impossible, in the section whose fence
was already re-run once for stage-2 F7. Rule 3 cannot see it, because the fabricated line is not a `NAME=`
label; the gate only checks exit labels, and an ordinary output line can still be moved, duplicated or invented
freely. That is a blind spot the blind-spot list does not state.

## F5 - the "Absent" block still prints a document count the gate has not printed since `4ad4d24`

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 532-547. The introduction reads: "Re-run at the round's tip,
because the first version of this block was published against an earlier one and its document count no longer
reproduced (REVIEW-round4-stage2 F7)". The fence then prints `records: 28 documents checked, no defects`.

**Checked.** I ran the workflow's assemble step and the lint gate with the ignore entries in place, at the tip.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt4 && npm run build -- --base-href /blackjack-trainer/ > $S/s4-k1build.txt 2>&1; echo "K1_BUILD_EXIT=$?"; mkdir -p site && cp -R dist/blackjack-trainer/browser/. site/ && cp ios/AppStore/privacy.html ios/AppStore/support.html site/ && cp site/index.html site/404.html; echo "K1_ASSEMBLE_EXIT=$?"; echo "SITE_TOPLEVEL=$(ls site | wc -l | tr -d ' ') SITE_FILES=$(find site -type f | wc -l | tr -d ' ')"; echo "ROOT_ENTRIES_ADDED=$(git status --porcelain --untracked-files=normal | grep -c '^??')"; npm run lint > $S/s4-k1lint.txt 2>&1; echo "K1_LINT_WITH_IGNORE_EXIT=$?"; grep -E 'All matched files|records:' $S/s4-k1lint.txt; echo "GIT_SEES_SITE=$(git status --porcelain --untracked-files=all | grep -c site/)"; rm -rf site; echo "CLEANUP_EXIT=$?"
K1_BUILD_EXIT=0
K1_ASSEMBLE_EXIT=0
SITE_TOPLEVEL=34 SITE_FILES=93
ROOT_ENTRIES_ADDED=0
K1_LINT_WITH_IGNORE_EXIT=0
All matched files use Prettier code style!
records: 29 documents checked, no defects
GIT_SEES_SITE=0
```

**Why it is a defect.** Every other number in the block reproduces - 34, 93, prettier clean, git blind to
`site/` - and the one that does not is the one the block's own introduction says it was re-run to fix. `c024fec`
added `reviews/REVIEW-round4-stage3.md`, which took the gate from 28 documents to 29, and the same commit
updated the count in the marker-leak fence three hundred lines above (27 to 29) and left this one. That is the
"corrected everywhere" shape the round exists to end, inside a single file, in a single commit, on a single
figure. It is the third time this particular count has gone stale in this block (25, then 28, now 28 again
against 29), which is precisely why the ledger's own K8 calls the mechanism P2 - but K8 names only the
unit-test count and the coverage quadruple, and the document count is a third figure with the same behaviour
and no rule watching it.

## F6 - the `~~~` half of the "class" fix opened a rule-3 escape the previous checker refused

**Claimed.** The `lines()` helper in `tools/check-records.mjs` is taught both fence syntaxes, with the comment
"Knowing only backticks meant 'not inside a fenced block' quietly meant 'not inside a backtick fence'". The ledger's R4-7
resolution says "**F6 closed properly:** one `directiveText` filter now governs every marker, `lines()` knows
both fence syntaxes and indented blocks". The artifact's blind-spot list states the rule as "A marker counts
only where a marker can be written: not inside an inline-code span, and not inside a fenced block."

**Checked.** `lines()` closes a fence on any run of three or more backticks _or_ tildes, whichever opened it.
CommonMark closes a fence only with the same character, at least as long as the opener. So a `~~~` line printed
as _output_ inside a `console` fence ends the fence as far as the checker is concerned, while the reader still
sees one code block. I put a fabricated exit label after such a line and ran it through the checker at
`4ad4d24` and at `aadd4b5`, together with the same document without the trick and the four-backtick variant.

`````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; rm -rf $S/p7 && mkdir -p $S/p7/reviews && printf 'const x = 1;\n' > $S/p7/foo.ts && node --input-type=module -e '
import { checkRecords } from "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/wt4/tools/check-records.mjs";
import { checkRecords as old } from "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/old4ad.mjs";
import { writeFileSync } from "node:fs";
const root = "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/p7";
const T = "```";
const A = ["reviews/A.md"];
const n = (body, fn) => { writeFileSync(root + "/reviews/A.md", body); return fn({ root, docs: A, tracked: new Set(A) }).length; };
const M = "<!-- records: historical-file -->", stale = "A live figure: 1547 passed.\n";
const plain = "# A\n\n" + T + "console\n$ ls\nFAKE_EXIT=0\n" + T + "\n";
const tilde = "# A\n\n" + T + "console\n$ ls\n~~~\nFAKE_EXIT=0\n" + T + "\n";
const quad  = "# A\n\n````console\n$ ls\n" + T + "\nFAKE_EXIT=0\n````\n";
console.log("PLAIN_FAKE_LABEL_AT_4ad4d24=" + n(plain, old) + " AT_aadd4b5=" + n(plain, checkRecords));
console.log("AFTER_A_TILDE_LINE_AT_4ad4d24=" + n(tilde, old) + " AT_aadd4b5=" + n(tilde, checkRecords));
console.log("AFTER_A_TRIPLE_IN_A_QUAD_FENCE_AT_4ad4d24=" + n(quad, old) + " AT_aadd4b5=" + n(quad, checkRecords));
const mTilde = "# A\n\n" + T + "console\n$ cat m\n~~~\n" + M + "\n" + T + "\n\n" + stale;
const mQuad  = "# A\n\n````console\n$ cat m\n" + T + "\n" + M + "\n````\n\n" + stale;
console.log("MARKER_INSIDE_A_FENCE_AFTER_A_TILDE_LINE_DEFECTS=" + n(mTilde, checkRecords));
console.log("MARKER_INSIDE_A_QUAD_FENCE_AFTER_A_TRIPLE_DEFECTS=" + n(mQuad, checkRecords));
console.log("SAME_DOCUMENT_WITHOUT_THE_FENCE_TRICK_DEFECTS=" + n("# A\n\n" + stale, checkRecords));
'; echo "PROBE_EXIT=$?"
PLAIN_FAKE_LABEL_AT_4ad4d24=1 AT_aadd4b5=1
AFTER_A_TILDE_LINE_AT_4ad4d24=1 AT_aadd4b5=0
AFTER_A_TRIPLE_IN_A_QUAD_FENCE_AT_4ad4d24=0 AT_aadd4b5=0
MARKER_INSIDE_A_FENCE_AFTER_A_TILDE_LINE_DEFECTS=0
MARKER_INSIDE_A_QUAD_FENCE_AFTER_A_TRIPLE_DEFECTS=0
SAME_DOCUMENT_WITHOUT_THE_FENCE_TRICK_DEFECTS=1
PROBE_EXIT=0
`````

Line 2 is the regression: the checker at `4ad4d24` refused that document and the checker at `aadd4b5` accepts
it. Lines 4 and 5 are the class, still open in the other direction: a `records: historical-file` marker written
_inside_ a real code block, after a `~~~` line or after a three-backtick line in a four-backtick fence, freezes
the whole document - the last line shows the same document is refused without the trick. That is "a directive
counts where a directive cannot be written", which is the sentence the fix is named after.

I checked whether anything live exploits it. Comparing the checker's fence model against a CommonMark-correct
one over the 29 records documents present at `aadd4b5`, there are zero disagreements attributable to fence
delimiters today, so nothing is hidden right now.

**Why it is a defect.** The claim is not that a hole was left; it is that the class is closed, asserted in the
ledger, in the artifact and in the module comment, and used to explain why three reviewers were needed. What
was done is a third instance fix - and this one is the first of the three to make the gate strictly weaker than
the commit before it. "It hides nothing today" was true of stage-1 F1, stage-2 F1 and stage-3 F6 at the moment
each was reported.

## F7 - the indented-code rule silently exempts 127 lines of a records document from rules 1 and 2, which is the opposite of what the comment beside it claims

**Claimed.** `lines()` in `tools/check-records.mjs` gains a four-space-indent test and folds its result into
`fenced`. The comment above it justifies the choice: "Treated as code even outside a fence: the failure this
errs towards is a visible refusal, and the one it errs away from is a silent exemption."

**Checked.** Three of the four rules `continue` on `fenced`. `checkAnchors` and `checkCitations` skip such lines
entirely, so for rules 1 and 2 the new classification is a silent exemption, not a refusal. I measured how much
of the live records it removes from their scope, and re-ran the gate with the rule disabled.

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt4 && sed 's|const indented = fence === null && /\^ {4,}\\S/.test(text);|const indented = false;|' tools/check-records.mjs > $S/noindent.mjs; echo "VARIANT_BUILT_EXIT=$?"; grep -n 'const indented' $S/noindent.mjs; node --input-type=module -e '
import { readFileSync } from "node:fs";
const S = "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad";
const { recordsDocs } = await import(S + "/wt4/tools/check-records.mjs");
const CITATION = /`([A-Za-z0-9_.][A-Za-z0-9_./-]*\.(?:ts|tsx|scss|html|yml|yaml|json|mjs|js|swift|md))(:\d+(?:-\d+)?)`/g;
function model(md, useIndent) { let fence = null; return md.split("\n").map((text, i) => { const open = /^\s*(?:```+|~~~+) *([A-Za-z0-9_-]*)/.exec(text); if (open && fence === null) { fence = open[1] || "plain"; return { no: i + 1, text, fenced: true }; } if (open && fence !== null) { fence = null; return { no: i + 1, text, fenced: true }; } const indented = useIndent && fence === null && /^ {4,}\S/.test(text); return { no: i + 1, text, fenced: fence !== null || indented }; }); }
let lines = 0, cites = 0;
for (const doc of recordsDocs(S + "/wt4")) {
  const md = readFileSync(S + "/wt4/" + doc, "utf8");
  const off = model(md, false), on = model(md, true);
  off.forEach((l, i) => { if (l.fenced || !on[i].fenced) return; lines++; const c = [...l.text.matchAll(CITATION)]; cites += c.length; for (const m of c) console.log("  NOW_UNCHECKED " + doc + ":" + l.no + "  " + m[1] + m[2]); });
}
console.log("LINES_THE_INDENT_RULE_RECLASSIFIES=" + lines);
console.log("CITATIONS_IT_REMOVES_FROM_RULE_2=" + cites);
'; echo "IMPACT_EXIT=$?"; node --input-type=module -e "
import { checkRecords, recordsDocs } from '$S/noindent.mjs';
const root = '$S/wt4';
console.log('DEFECTS_WITH_THE_INDENT_RULE_OFF=' + checkRecords({ root, docs: recordsDocs(root) }).length);
"; echo "RECHECK_EXIT=$?"; sed -n '91p' LAUNCH-CHECKLIST.md | cut -c1-120; sed -n '53p;60p' src/app/features/chart/chart-page.component.ts
VARIANT_BUILT_EXIT=0
148:    const indented = false;
  NOW_UNCHECKED LAUNCH-CHECKLIST.md:90  src/app/features/drill/drill-hand.ts:242
  NOW_UNCHECKED LAUNCH-CHECKLIST.md:90  ios/BlackjackTrainer/Flow/DrillHand.swift:124
  NOW_UNCHECKED LAUNCH-CHECKLIST.md:91  chart-page.component.ts:53
  NOW_UNCHECKED LAUNCH-CHECKLIST.md:91  StrategyChart.swift:15
LINES_THE_INDENT_RULE_RECLASSIFIES=127
CITATIONS_IT_REMOVES_FROM_RULE_2=4
IMPACT_EXIT=0
DEFECTS_WITH_THE_INDENT_RULE_OFF=0
RECHECK_EXIT=0
      Both charts render hard rows through 20 (`chart-page.component.ts:53`, `StrategyChart.swift:15`), so the cell dril
  '7',
const HARD_KEYS: readonly HardKey[] = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
````

The 122 of those lines that are in `LAUNCH-CHECKLIST.md` are not code. They are the six-space continuation lines
of `- [x]` list items - `LAUNCH-CHECKLIST.md` line 85 begins `_Done 2026-08-06: reproduced first with a failing
test on each platform_`. An indented chunk cannot interrupt a paragraph in CommonMark, and every one of these
follows the item's own first line with no blank line between, so they render as prose. The checker now reads
them as a code block.

Nothing is currently hidden by it - the gate is green with the rule off - but the exemption is not theoretical.
One of the four citations it stopped looking at is wrong: `LAUNCH-CHECKLIST.md` line 91 says "Both charts render
hard rows through 20 (`chart-page.component.ts:53`, ...)" and line 53 of that file is `'7',`, an element of
`DEALER_UPCARDS`; the hard-total row list is at line 60. That drift predates this range and rule 2 would not
have caught it in a non-binding document anyway, since it only resolves and bounds-checks there. What this
range did was take the line out of the rule's sight altogether.

**Why it is a defect.** The rule is defended in the source by a claim about which way it errs, and it errs the
other way for two of the four rules. It was added to close a fixture case stage 3 raised about markers, and the
narrower fix that answers that case - excluding indented lines from `markersIn` and `directiveText` only - was
available and would not have touched rules 1 and 2. Nothing tests the interaction: the spec has a test that an
indented marker does not freeze a document, and none that an indented citation is still checked.

## F8 - the tolerance margin was "corrected" to a second wrong number, and the test written to hold it asserts the wrong thing

**Claimed.** The `COVERAGE_TOLERANCE` comment in `tools/check-records.mjs`: the tolerance "absorbs that jitter
and still refuses the round-3 baseline quadruple - but the margin is thin: at the figures pinned above, that quadruple's nearest component is
0.06, one hundredth of a point outside the tolerance. A test asserts both ends of that window against `FIGURES`
itself, so moving the pin closer to the baseline than the tolerance fails loudly rather than quietly widening
the gate's blind spot." `reviews/ARTIFACTS-round4.md` lines 673-678 repeat it and add "Three tests now hold the
window open against `FIGURES` itself rather than a fixture's copy of it, so narrowing it fails loudly."

**Checked.** The sweep accepts a quadruple only when **every** component is within tolerance, so the quadruple
is refused as long as **any** component is outside it. The binding quantity is therefore the largest
difference, not the smallest. I swept the tolerance to find where the refusal actually breaks, and then moved
the pinned statements figure onto the baseline's value - a value a future coverage run could genuinely print -
to see what each side does.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt4 && rm -rf $S/tol && mkdir -p $S/tol/reviews && printf '# A\n\nCoverage is 96.16 / 93.28 / 93.22 / 98.00.\n' > $S/tol/reviews/A.md && for t in 0.05 0.10 0.20 0.24; do sed "s/^const COVERAGE_TOLERANCE = 0.05;/const COVERAGE_TOLERANCE = $t;/" tools/check-records.mjs > $S/tol/c$t.mjs; done; echo "VARIANTS_BUILT_EXIT=$?"; node --input-type=module -e '
const S = "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad";
const arg = { root: S + "/tol", docs: ["reviews/A.md"], tracked: new Set(["reviews/A.md"]) };
const at = async (f) => (await import(S + "/tol/" + f)).checkRecords(arg).length > 0;
console.log("REFUSED_AT_TOLERANCE_0_05=" + (await at("c0.05.mjs")));
console.log("REFUSED_AT_TOLERANCE_0_10=" + (await at("c0.10.mjs")));
console.log("REFUSED_AT_TOLERANCE_0_20=" + (await at("c0.20.mjs")));
console.log("REFUSED_AT_TOLERANCE_0_24=" + (await at("c0.24.mjs")));
const pin = [96.1, 93.09, 93.46, 97.9], base = [96.16, 93.28, 93.22, 98.0];
const d = pin.map((p, i) => Math.abs(base[i] - p));
console.log("NEAREST_COMPONENT=" + Math.min(...d).toFixed(2) + " FARTHEST_COMPONENT=" + Math.max(...d).toFixed(2));
'; echo "SWEEP_EXIT=$?"; cp tools/check-records.mjs $S/cr.orig; python3 -c "
p='tools/check-records.mjs'; s=open(p).read()
old='  coverage: [96.1, 93.09, 93.46, 97.9],'
assert s.count(old)==1
open(p,'w').write(s.replace(old,'  coverage: [96.16, 93.09, 93.46, 97.9],'))
print('STATEMENTS_PIN_MOVED_ONTO_THE_BASELINE_VALUE=1')
"; echo "MOVE_EXIT=$?"; npx ng test --include="../tools/check-records.spec.mjs" > $S/f3-spec.txt 2>&1; echo "SPEC_WITH_MOVED_PIN_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/f3-spec.txt | grep -E 'Tests |FAIL ' | head -3; node --input-type=module -e '
const S = "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad";
const { checkRecords } = await import(S + "/wt4/tools/check-records.mjs?moved");
const bad = checkRecords({ root: S + "/tol", docs: ["reviews/A.md"], tracked: new Set(["reviews/A.md"]) });
console.log("GATE_STILL_REFUSES_THE_BASELINE_QUADRUPLE=" + (bad.length > 0));
'; echo "GATE_EXIT=$?"; cp $S/cr.orig tools/check-records.mjs; echo "RESTORED_EXIT=$?"; git status --porcelain; node tools/check-records.mjs
VARIANTS_BUILT_EXIT=0
REFUSED_AT_TOLERANCE_0_05=true
REFUSED_AT_TOLERANCE_0_10=true
REFUSED_AT_TOLERANCE_0_20=true
REFUSED_AT_TOLERANCE_0_24=false
NEAREST_COMPONENT=0.06 FARTHEST_COMPONENT=0.24
SWEEP_EXIT=0
STATEMENTS_PIN_MOVED_ONTO_THE_BASELINE_VALUE=1
MOVE_EXIT=0
SPEC_WITH_MOVED_PIN_EXIT=1
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL   blackjack-trainer  tools/check-records.spec.mjs > rule 4 tolerates the coverage jitter it measured > keeps a margin between the jitter it absorbs and the figure it refuses
      Tests  1 failed | 47 passed (48)
GATE_STILL_REFUSES_THE_BASELINE_QUADRUPLE=true
GATE_EXIT=0
RESTORED_EXIT=0
records: 29 documents checked, no defects
```

Three results, all against the claim:

- The refusal survives a tolerance of 0.20 and breaks at 0.24. The margin is 0.19 points of tolerance headroom,
  not "one hundredth of a point". 0.06 is the nearest component, and the nearest component has no bearing on
  whether the quadruple is refused.
- Moving one pinned component onto the baseline's value leaves the gate refusing the quadruple correctly, and
  fails the new test. `expect(nearest).toBeGreaterThan(0.05)` in that test demands a
  condition the gate does not need, so it will refuse a legitimate re-pin - the same failure mode as pinning
  coverage to two decimals, which is what the tolerance was introduced to avoid.
- `expect(0.037).toBeLessThan(0.05)`, the line above it, compares two literals. Neither is
  read from the module - `COVERAGE_TOLERANCE` is not exported - so that assertion cannot fail for any change to
  any code, and it is the half the module comment describes as asserting one end of the window.

One more number in the same place: the comment on the first test of that describe block reads "One branch of 2702
is 0.037 points." The report at this commit has 2708 branches, as the fence at the top of this review shows.
2702 is the count from before `c024fec`, carried into a comment `c024fec` rewrote.

**Why it is a defect.** Stage 3's F7 was that a number justifying the width of a gate's blind spot was wrong.
The correction replaced it with a different wrong number, derived from a misreading of the gate's own predicate,
in the same three places; and the test written to stop the margin from being narrowed quietly asserts a
stronger condition than the gate enforces on one line and nothing at all on the next.

## F9 - two different commits are called "the round's last commit" twenty lines apart

**Claimed.** `PROD-READINESS.md` line 752 opens the closing gate section with "Every gate re-run at `c024fec`,
the round's last commit that changes code or tests". Line 776's gate-5 row points at the distribution below.
Line 766 adds "The single closing run in the table above is at `c024fec`".

**Observed.** `PROD-READINESS.md` lines 796-800:

```text
| when                                | commit    | full-suite runs | failures | 2-spec executions | failures |
| ----------------------------------- | --------- | --------------- | -------- | ----------------- | -------- |
| baseline, before any change         | `f5e8fc8` | 10              | **0**    | 200               | **0**    |
| closing, before the stage-2 answer  | `0fbe138` | 10              | **0**    | 200               | **0**    |
| closing, at the round's last commit | `4ad4d24` | 10              | **0**    | 200               | **0**    |
```

`4ad4d24` is the commit _before_ this range. It is not the round's last commit by any reading, and the sentence
twenty lines above gives that title to `c024fec`. The label was written by `77f75fa`, when `4ad4d24` was the
tip; `c024fec` then changed code and `aadd4b5` renamed the anchor sentence and left the row alone. The
substance is fine - the carve-out below the table correctly says nothing touching `src/`, `e2e/` or
`playwright.config.ts` has changed since, and `git diff --name-only 4ad4d24..aadd4b5` confirms it - but the
table row is the round's headline evidence for its flakiest gate and it names the wrong tree.

Two smaller things in the same section. `reviews/ARTIFACTS-round4.md` lines 357-358 still tell the reader the
round's gates are "reported once, **at the tip**", where the ledger now says `c024fec` for gates 1 to 6 and
`4ad4d24` for gates 7 to 9. And line 763 runs two unrelated topics together into one line of 196
characters ("A table of measurements has to name the tree it measured. Gate 5's ten-run blocks ran while..."),
in a file that otherwise wraps at 100; prettier does not reflow prose, so the gate cannot see it.

**Why it is a defect.** This is stage-3 F1's shape surviving in the label after being fixed in the numbers: a
table of measurements that names a tree it was not measured at. Stage 3 named the mechanism - the anchor
sentence and the row drifting apart - and the fix moved the anchor sentence and left a second anchor behind.

## F10 - the stage-3 review committed by this range publishes a grep line the command does not print

**Claimed.** `c024fec` adds `reviews/REVIEW-round4-stage3.md`. Its F1 fence runs the same `grep -nE` over
`git show 152aee2:PROD-READINESS.md` and over the working tree at `4ad4d24`, and publishes both outputs to show
that rows 3 and 4 of the closing table had moved to the tip's values.

**Checked.** I compared what the review publishes as line 572 with what `4ad4d24` has at line 572.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt4 && echo "WHAT_THE_REVIEW_PUBLISHES_AS_LINE_572:"; grep -n '^572:' reviews/REVIEW-round4-stage3.md | cut -c1-200; echo "WHAT_4ad4d24_ACTUALLY_HAS_AT_572:"; git show 4ad4d24:PROD-READINESS.md | grep -nE '^\| [0-9] +\| coverage gate ' | cut -c1-200; echo "GREP_EXIT=$?"
WHAT_THE_REVIEW_PUBLISHES_AS_LINE_572:
132:572:| 4   | coverage gate     | 0    | 96.16 / 93.28 / 93.22 / 98.00 (baseline 96.11 / 93.23 / 93.28 / 97.97) |
141:572:| 4   | coverage gate     | 0    | 96.10 / 93.07 / 93.44 / 97.90                                             |
GREP_EXIT=0
```

The review's first block (line 132 of the file) is right. Its second block (line 141) publishes line 572 with
the content and the column padding of line 758 - the round-4 row, not the round-3 row it labels. `4ad4d24` has
the round-3 figures at 572, unchanged from `152aee2`.

**Why it is a defect.** Stage 3's F1 conclusion is not affected: rows 757 and 758 really did carry the tip's
numbers under a sentence naming `0fbe138`, which is independently verifiable and which I confirmed. But this is
a composed transcript in a records document that `c024fec` committed, and its effect is to make round 3's
closing gate table look as though it had been dragged to round 4's figures when it had not. I cannot tell from
here whether the stage-3 reviewer typed it or the commit that landed the file did; either way it is now in the
records, it is the kind of defect this round exists to end, and rule 3 cannot see it because the altered line
carries no `NAME=` label.

## What I could not verify

- Gate 5's distribution (thirty full-suite runs and three blocks of two-spec executions at three commits) is not
  reproducible inside this review. I confirmed the suite's size, ran it green once at the tip on my own port,
  and confirmed that nothing under `src/`, `e2e/` or `playwright.config.ts` has changed since the last block.
- Gates 7 to 9 (swiftformat, swiftlint, xcodebuild) were not re-run. The file count they report, 105 Swift
  files, is correct, and `git diff --name-only 4ad4d24..aadd4b5 -- ios/` is empty as the ledger says.
- The K2 concurrency blocks were taken on ports 4501 and 4502 and are a record of an experiment; I did not
  repeat them.
- Whether the artifact's claim that every instance in the census "is still refused, because none of those fences
  contains the echo at all" holds for all of them individually. I checked the count, not the reason.

## Verdict

**REJECT.**

The code is good and that should be recorded first. Nothing in `src/` is wrong here. Seven of stage 3's eleven
findings are properly closed, and the hardest single piece of work in the range is real: the six marker escapes
stage 3's F6 probe found are all shut, proved by re-running its own fixtures against the tip. The tolerance is
now exercised against `FIGURES` rather than a fixture's copy, which was the right instinct even though the
assertions are wrong. `FIGURES` matches the tree. The marker-leak block, the M3 coverage block and the assemble step all
reproduce exactly. Gates 1 and 3 to 6 are green and their numbers are the tree's. The round's honest accounting
of its own failures - seven regressions, five of them found by reviewers, and K8 naming the treadmill - is the
best thing in the range.

It is rejected on eight findings, every one of them a records defect of the class this round exists to end:

- Three transcripts published as one execution that are not, or that no longer produce their numbers (F3, F4,
  F5), one of them with typographic evidence of hand-editing.
- Two figures corrected in one place and left in another inside the same commit (F1, F2), one of which the
  ledger's own resolution column asserts was updated and was not.
- A fix that made the gate strictly weaker than the commit before it (F6), and a second half of the same fix
  that silently exempts 127 lines of a records document from two rules while its comment claims the opposite
  (F7).
- A corrected number replaced by a second wrong number derived from a misreading of the gate's predicate, plus a
  test that asserts a condition the gate does not need and another that asserts nothing at all (F8).

F9 and F10 are non-blocking but should be fixed in the same pass.

The pattern worth naming for whoever answers this: every one of F1, F2, F3 and F5 is a figure that moved because
the same commit changed the thing it counted. K8 already says this, one row below the K4 row it failed to
update. Until a transcript carries the commit it was taken at and something checks that, each remediation cycle
will keep producing the defect it is answering.
