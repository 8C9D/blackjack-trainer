# REVIEW - round 4, stage 3

<!-- records: historical-file - an answered review. Its figures and transcripts were true at the commit it reviewed and were checked by this gate when it was written; the remediation it prompted has since moved several of them, and rewriting a reviewer's evidence to match a later tree would destroy the record. Citations here are still resolved and bounds-checked. -->

Adversarial review of `f538ad6..4ad4d24` on `prod-readiness/round4-2026-08-12`: `3834053` (two published
counts made measurable), `60128a5` (the marker-leak attack), `470659d` (the second self-catch), `0fbe138`
(the baseline's three marked lines), `152aee2` (the closing gate section), and `4ad4d24` (the answer to
the stage-2 REJECT).
Every figure, transcript, citation and claim in the changed files was treated as unverified and re-derived
here.
`reviews/REVIEW-round4-stage1.md` and `reviews/REVIEW-round4-stage2.md` were read, and each of stage 2's
fourteen findings was re-tested against the tree rather than against the record that says it is closed.

- Date: 2026-08-12
- Reviewed at: `4ad4d24`

## Method

The main session was committing to this checkout while this review was written, so every measurement was
taken in private worktrees created with `git worktree add --detach`, with `node_modules` symlinked from the
main checkout: one at `4ad4d24` (the tip), one at `0fbe138` (the commit the closing gate table names), and
one at `5967002` (to reconstruct a refusal the artifact publishes).
Nothing in the live checkout was modified except to add this file.

Each fenced block below is one execution: the `$` line and the lines under it happened together, and the
scratch directory is written out in full on the command line rather than abbreviated, so no substitution
stands between what ran and what is printed here.

Line references into `PROD-READINESS.md`, `reviews/ARTIFACTS-round4.md` and `reviews/BASELINE-round4.md`
are given as plain text rather than as backticked citations, because the main session is rewriting those
files and a pinned line number would be stale before anyone read it.

E2E ran on port 4900 only, checked free with `lsof` first. Port 4200 was occupied throughout by the main
session's measurement and was never touched.

## What reproduced exactly

Re-run at `4ad4d24`, not taken on the record's word. This is a substantial range and most of the hard
things in it are genuinely done.

- The fenced-marker fix binds on the real document. The injection stage 2 used to demonstrate F1 - a
  fabricated exit label appended below the census fence, which the checker at `f538ad6` accepted - is
  refused now, at line 778, and the tree restores to `records: 28 documents checked, no defects`.
- Rule 3's `#` fix works and matches a shell: an apostrophe in a trailing comment no longer opens a quote,
  a genuine open quote still continues, and a `#` inside single quotes is still not a comment. Both halves
  have tests in the spec.
- The serve lane now takes the port. Stage 2's F6 is fixed in code and green on a real run (below).
- The coverage figures are the tree's. `FIGURES.unitTests` is 1599 and the tip prints 1599 over 68 files;
  `FIGURES.coverage` is within measurement jitter of what three consecutive runs print; the checker's own
  per-file quadruple published in M3 (94.94 / 89.94 / 100 / 95.92) reproduces exactly.
- The M3 block, republished for stage-2 F11 with the enabling reporter edit inside the transcript, is
  reproducible and its numbers match to the last digit.
- The K1 "Absent" block and the K3 mutant block, republished for stage-2 F7, both reproduce exactly,
  including `SITE_TOPLEVEL=34 SITE_FILES=93`, `records: 28 documents checked, no defects`, and three green
  gates with the whole banner reserve deleted from four files.
- The suite is 47 and the buckets partition it. I classified all 47 test bodies independently and got
  20 refusal-only, 21 acceptance-only, 1 both-ways, 5 helpers.
- The second self-catch the artifact publishes is real, and reproduces line for line (below).
- Gate 6 reproduces: `npm run export:fixtures` writes 7 fixtures and `git diff --exit-code -- ios/Fixtures`
  is clean. `find ios -name '*.swift'` is 105 files, the number gates 7 and 8 report.
- The E2E suite really is 115 tests in 14 files (`npx playwright test --list`).
- Stage 2's F8, F10 and F13 are answered correctly: the ledger's preamble now says "once" and points at the
  second out-of-bounds citation in `reviews/REVIEW-0.md`, which carries its own marker there; the spec's
  header sentence is rewritten; and the M2 paragraph now answers the re-triage question about M2 instead of
  about a table with no M2 row (round 3 did close M2, so the framing is right).

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && python3 -c "
p='reviews/ARTIFACTS-round4.md'; s=open(p).read().split('\n')
b=['','\`\`\`console','\$ ls','FABRICATED_EXIT=0','\`\`\`','']
open(p,'w').write('\n'.join(s+b))
"; echo "INJECT_BELOW_EXIT=$?"; node tools/check-records.mjs 2>&1 | grep FABRICATED || echo "  (accepted: no defect reported)"; git checkout -- reviews/ARTIFACTS-round4.md; node tools/check-records.mjs; echo "RESTORED_EXIT=$?"
INJECT_BELOW_EXIT=0
  reviews/ARTIFACTS-round4.md:778: a ```console block prints `FABRICATED_EXIT=` as output of `ls` (line 777), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
records: 28 documents checked, no defects
RESTORED_EXIT=0
````

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && E2E_PORT=4900 npx playwright test --grep "the space the update banner stands in front of" > $S/serve4900.txt 2>&1; echo "SERVE_LANE_4900_EXIT=$?"; grep -E 'passed|failed|Error|listen|Local:' $S/serve4900.txt | head -8
SERVE_LANE_4900_EXIT=0
  4 passed (6.3s)
```

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wtk2 && echo "WORKTREE_AT=$(git rev-parse --short HEAD)"; git show 74fc6f7:playwright.config.ts > playwright.config.ts; echo "COPY_EXIT=$?"; grep -n 'const PORT' playwright.config.ts; node tools/check-records.mjs; echo "SELFCATCH2_RECONSTRUCTED_EXIT=$?"
WORKTREE_AT=5967002
COPY_EXIT=0
14:const PORT = Number(process.env.E2E_PORT ?? 4200);
records: 2 defect(s)
  PROD-READINESS.md:395: playwright.config.ts:18 no longer contains "retries: process.env.CI ? 1 : 0,"
  PROD-READINESS.md:527: playwright.config.ts:6 no longer contains "const PORT = 4200;"
SELFCATCH2_RECONSTRUCTED_EXIT=1
```

That worktree is `5967002`, the commit before K2's fix, with the one file that fix changed copied in over it
and nothing else touched. It is the R4-2 refusal the artifact publishes, reconstructed: same two defects,
same two ledger lines, same order, same exit.

The findings below should be read against that list.

## F1 - the closing gate table names a commit that produces none of the numbers in two of its rows

**Claimed.** `PROD-READINESS.md` opens its new "Gates at the end of round 4" section with "Every gate re-run
at `0fbe138`", then reports gate 3 as 68 files and a count of 1599, gate 4 as 96.10 / 93.07 / 93.44 / 97.90,
and gate 1 as "27 documents, no defects", and concludes "**Nine of nine green**".
`reviews/ARTIFACTS-round4.md` tells the reader, in its answer to stage-2 F5, that "the round's gates are
reported once, at the tip, in **the ledger's** \"Gates at the end of round 4\" section".

**Checked.** I built a worktree at `0fbe138` and ran the four cheap gates there in one execution.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt0f && echo "COMMIT=$(git rev-parse --short HEAD)"; npm test > $S/of-t.txt 2>&1; echo "UNIT_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/of-t.txt | grep -E 'Test Files|Tests '; npm run test:coverage > $S/of-c.txt 2>&1; echo "COVERAGE_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/of-c.txt | grep -E 'Statements|Branches|Functions|Lines'; node tools/check-records.mjs; echo "GATE_EXIT=$?"
COMMIT=0fbe138
UNIT_EXIT=0
 Test Files  68 passed (68)
      Tests  1593 passed (1593)
COVERAGE_EXIT=0
Statements   : 96.06% ( 5547/5774 )
Branches     : 92.83% ( 2502/2695 )
Functions    : 93.43% ( 954/1021 )
Lines        : 97.89% ( 4286/4378 )
records: 27 documents checked, no defects
GATE_EXIT=0
```

Then I compared the table as it was written when it was measured with the table as it stands now.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && git show 152aee2:PROD-READINESS.md | grep -nE '^Every gate re-run|^\| [0-9] +\| (lint|unit tests|coverage gate) ' ; echo "AT_152aee2_EXIT=$?"; grep -nE '^Every gate re-run|^\| [0-9] +\| (lint|unit tests|coverage gate) ' PROD-READINESS.md; echo "AT_4ad4d24_EXIT=$?"
564:Every gate re-run at `d1eea82`, the last commit that touches code. Nothing else was running on the
569:| 1   | lint              | 0    | `tsc` x3 projects (app, spec, e2e) + prettier: clean                   |
571:| 3   | unit tests        | 0    | 67 files, 1551 passed (baseline 1547; four added for N4)               |
572:| 4   | coverage gate     | 0    | 96.16 / 93.28 / 93.22 / 98.00 (baseline 96.11 / 93.23 / 93.28 / 97.97) |
735:Every gate re-run at `0fbe138`. Gate 5's two measurements ran while the stage-2 reviewer was working in
742:| 1   | lint              | 0    | `tsc` x3 projects + prettier + the records gate: 27 documents, no defects |
744:| 3   | unit tests        | 0    | 68 files, 1593 passed                                                     |
745:| 4   | coverage gate     | 0    | 96.06 / 92.83 / 93.43 / 97.89                                             |
AT_152aee2_EXIT=0
564:Every gate re-run at `d1eea82`, the last commit that touches code. Nothing else was running on the
569:| 1   | lint              | 0    | `tsc` x3 projects (app, spec, e2e) + prettier: clean                   |
571:| 3   | unit tests        | 0    | 67 files, 1551 passed (baseline 1547; four added for N4)               |
572:| 4   | coverage gate     | 0    | 96.10 / 93.07 / 93.44 / 97.90                                             |
748:Every gate re-run at `0fbe138`. Gate 5's two measurements ran while the stage-2 reviewer was working in
755:| 1   | lint              | 0    | `tsc` x3 projects + prettier + the records gate: 27 documents, no defects |
757:| 3   | unit tests        | 0    | 68 files, 1599 passed                                                     |
758:| 4   | coverage gate     | 0    | 96.10 / 93.07 / 93.44 / 97.90                                             |
```

At `152aee2`, the commit that wrote the section, rows 3 and 4 stated exactly what `0fbe138` prints. At
`4ad4d24` they state the tip's values instead, and the sentence naming `0fbe138` is unchanged. Only the
records spec changed in `4ad4d24`, adding six tests, which is precisely the 1593-to-1599 difference.

**Why it is a defect.** The round's closing evidence - the table a reader consults to know what state the
branch was last measured in - is now a mixture: gate 1's document count and gates 2 and 5 to 9 are
`0fbe138`'s, gates 3 and 4 are a different tree's, and no commit was ever observed in the state the table
describes. "Nine of nine green" is therefore not a measurement of anything.
The mechanism is worth naming, because it is the round's own thesis running backwards: `4ad4d24` moved
`FIGURES` to the tip, rule 4 then refused the ledger for stating the numbers it had actually measured, and
the numbers were edited to satisfy the gate while the sentence recording where they came from was left
alone. That is the R3-1 shape ("corrected everywhere") produced by the machine built to prevent it, and it
is invisible to rule 4 by construction, since rule 4 only ever checks that a figure equals the current one.
The artifact's answer to stage-2 F5 compounds it: it sends the reader to this section for gates "at the
tip", and the section says it was run two commits before the tip, where the gate prints 27 documents and
the tip prints 28.

## F2 - the census no longer reproduces, and K4 carries the pre-fix number into the next round

**Claimed.** `reviews/ARTIFACTS-round4.md` publishes a census fence printing `records: 273 defect(s)`,
`rule 3 transcripts: 103`, `rule 4 figures: 113` and eleven per-file counts, of which
`reviews/REVIEW-round3-stage3.md` is 4. The prose beneath says "The number that matters is **103**". The
ledger's NEXT ROUND row K4 states the finding as "an exit label as the output of a command that cannot
print it **103 times**, across eleven files".

**Checked.** I re-ran the census command exactly as published, at the tip.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && node -e '
const {readFileSync,writeFileSync,readdirSync}=require("fs");
for(const f of readdirSync("reviews")){if(!f.endsWith(".md"))continue;const p="reviews/"+f;
 const s=readFileSync(p,"utf8");writeFileSync(p,s.replace(/<!-- records: historical[^>]*-->/g,""));}
writeFileSync("PROD-READINESS.md",readFileSync("PROD-READINESS.md","utf8").replace(/<!-- records: historical[^>]*-->/g,""));
console.log("STRIPPED_OK=1");
'; node tools/check-records.mjs > $S/census2.txt 2>&1; echo "CENSUS_EXIT=$?"; head -1 $S/census2.txt; echo "rule 3 transcripts: $(grep -c 'block prints' $S/census2.txt)"; echo "rule 4 figures:     $(grep -cE 'unit-test count|coverage quadruple|pooled M2' $S/census2.txt)"; grep 'block prints' $S/census2.txt | sed -E 's/^  ([^:]+):.*/\1/' | sort | uniq -c | sort -rn; git checkout -- PROD-READINESS.md reviews/; node tools/check-records.mjs; echo "CENSUS_RESTORED_EXIT=$?"
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
records: 28 documents checked, no defects
CENSUS_RESTORED_EXIT=0
```

The cause is this range's own rule-3 fix, not a change in the documents. Running the same stripped tree
through the checker as it stood at `f538ad6` and through the checker at the tip:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && git show f538ad6:tools/check-records.mjs > $S/old-check.mjs; echo "EXTRACT_EXIT=$?"; node -e '
const {readFileSync,writeFileSync,readdirSync}=require("fs");
for(const f of readdirSync("reviews")){if(!f.endsWith(".md"))continue;const p="reviews/"+f;
 const s=readFileSync(p,"utf8");writeFileSync(p,s.replace(/<!-- records: historical[^>]*-->/g,""));}
writeFileSync("PROD-READINESS.md",readFileSync("PROD-READINESS.md","utf8").replace(/<!-- records: historical[^>]*-->/g,""));
console.log("STRIPPED_OK=1");
'; node --input-type=module -e "
import { checkRecords, recordsDocs } from '$S/old-check.mjs';
const root='$S/wt3';
const bad = checkRecords({ root, docs: recordsDocs(root) });
const t = bad.filter(b=>b.includes('block prints'));
console.log('OLD_CHECKER_TOTAL=' + bad.length + ' OLD_RULE3=' + t.length);
const per={}; for(const b of t){const f=b.split(':')[0]; per[f]=(per[f]??0)+1;}
console.log('OLD_STAGE3_HITS=' + (per['reviews/REVIEW-round3-stage3.md']??0));
"; echo "OLD_RUN_EXIT=$?"; node --input-type=module -e "
import { checkRecords, recordsDocs } from '$S/wt3/tools/check-records.mjs';
const root='$S/wt3';
const bad = checkRecords({ root, docs: recordsDocs(root) });
const t = bad.filter(b=>b.includes('block prints'));
console.log('NEW_CHECKER_TOTAL=' + bad.length + ' NEW_RULE3=' + t.length);
for (const b of t.filter(x=>x.startsWith('reviews/REVIEW-round3-stage3.md'))) console.log('  ' + b.slice(0,150));
"; echo "NEW_RUN_EXIT=$?"; git checkout -- PROD-READINESS.md reviews/; echo "RESTORE_EXIT=$?"
EXTRACT_EXIT=0
STRIPPED_OK=1
OLD_CHECKER_TOTAL=278 OLD_RULE3=103
OLD_STAGE3_HITS=4
OLD_RUN_EXIT=0
NEW_CHECKER_TOTAL=275 NEW_RULE3=105
  reviews/REVIEW-round3-stage3.md:383: a ```console block prints `CHECK_EXIT=` as output of `npm run build -- --base-href /blackjack-trainer/ && bash -e
  reviews/REVIEW-round3-stage3.md:536: a ```console block prints `APP_EXIT_OLD=` as output of `# tsconfig.app.json reverted to b09470d's exclude, same f
  reviews/REVIEW-round3-stage3.md:541: a ```console block prints `SPEC_WITH_ERROR=` as output of `# and a real type error in the same file is caught by
  reviews/REVIEW-round3-stage3.md:556: a ```console block prints `CHECK_EXIT=` as output of `npm run build -- --base-href /blackjack-trainer/ && bash -e
  reviews/REVIEW-round3-stage3.md:558: a ```console block prints `RESTORED_CHECK_EXIT=` as output of `# restored` (line 557), which cannot print it: an
  reviews/REVIEW-round3-stage3.md:561: a ```console block prints `NO_ID_CHECK_EXIT=` as output of `# and with b09470d's manifest, which has no id at all
NEW_RUN_EXIT=0
RESTORE_EXIT=0
````

The two extra instances are the two `# comment` fences stage 2 identified in its F3 as being hidden by the
apostrophe bug. Fixing the bug exposed them; nobody re-ran the measurement the bug had distorted.

**Why it is a defect.** K4's whole content is a number, it is being handed to the next round as the size of
a class of defect, and it is understated by exactly the amount this round's own fix corrected. The artifact
states the same number twice and calls it "the number that matters", the census fence beneath it prints a
total and a per-file table that no longer reproduce, and the fence carries no commit label to excuse them -
the neighbouring K1, K3 and M3 blocks were re-run at the tip for precisely this reason (stage-2 F7, F11) and
this one was not. Rule 4 does not know the figure, which is the honest reason nothing caught it.

## F3 - the transcript that is supposed to settle the suite's size still prints 34

**Claimed.** `reviews/ARTIFACTS-round4.md`, under "Its own tests", says "`tools/check-records.spec.mjs`,
47 tests" and gives a breakdown introduced with "Counted from the file at this commit, in buckets that do
partition it". The ledger's R4-5 row says stage-2 F4 is answered with "a suite of 47 partitioned in buckets
that add up". Stage-2 F4 was in two halves: the counts, and the transcript published under them that
printed a number the command no longer produced.

**Checked.** The counts are right - I classified all 47 test bodies and got the published partition. The
transcript is not.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && npx ng test --include="../tools/check-records.spec.mjs" > $S/spec.txt 2>&1; echo "SPEC_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/spec.txt | grep -E 'Test Files|Tests '; echo "IT_BLOCKS=$(grep -c '^  it(' tools/check-records.spec.mjs)"
SPEC_EXIT=0
 Test Files  1 passed (1)
      Tests  47 passed (47)
IT_BLOCKS=47
```

The fence in the artifact, four lines below the paragraph that says 47, still shows that command printing
`Tests  34 passed (34)`.

**Why it is a defect.** This is stage-2 F4, unfixed in the half that was about evidence, in the commit whose
message answers it, in the section arguing that the gate cannot silently rot. A reader who does the one
thing the section invites - look at what the command printed - is shown 34 under a sentence claiming 47 was
counted "at this commit", and both numbers are in the same document.
Two smaller things in the same paragraph: the five tests it calls "unit tests of the slug and anchor
helpers" include two that exercise `recordsDocs`, and rule 4 knows none of these numbers, so the only thing
standing between this suite's published size and the next wrong value is a human counting again.

## F4 - the marker-leak attack is published with numbers the attack no longer produces

**Claimed.** `reviews/ARTIFACTS-round4.md`, under "One attack of my own, on the exemption that worries me
most", shows an injection into the round-4 status section and the gate answering with
`unit-test count states 1547 where the round's unit-test count is 1593`, followed by
`records: 27 documents checked, no defects`. There is no commit label on the block, and the surrounding
prose presents it as the current behaviour ("It does not leak").

**Checked.** I ran the same injection at the tip.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && python3 -c "
p='PROD-READINESS.md'; s=open(p).read()
old='**What the re-triage changed: nothing, and that is a finding of its own.**'
new='**What the re-triage changed: nothing, and that is a finding of its own.** The suite is 1547 passed.'
assert s.count(old)==1
open(p,'w').write(s.replace(old,new))
"; echo "INJECT_EXIT=$?"; node tools/check-records.mjs; echo "LEAK_TEST_EXIT=$?"; git checkout -- PROD-READINESS.md; node tools/check-records.mjs; echo "RESTORED_EXIT=$?"
INJECT_EXIT=0
records: 1 defect(s)
  PROD-READINESS.md:672: unit-test count states 1547 where the round's unit-test count is 1599
LEAK_TEST_EXIT=1
records: 28 documents checked, no defects
RESTORED_EXIT=0
```

**Why it is a defect.** The conclusion holds - the marker does not leak - but two of the three numbers in
the evidence do not. It is the same shape as stage-1 F2 and stage-2 F7, in a block added by this range, and
it is the only place left in the round's live records that states a superseded unit-test count. It is also
the block where staleness matters most: the whole point of the section is to show what the gate says about
this round's own figures today.

## F5 - the K1 "Present" block is introduced as "reproduced at this commit" and cannot be

**Claimed.** `reviews/ARTIFACTS-round4.md` introduces K1's first block with "The whole thing, reproduced at
this commit", and the block's first output line is `IGNORE_GREP_EXIT=1`, grep finding no mention of `site`
in either ignore file.

**Checked.**

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && grep -n 'site' .gitignore .prettierignore; echo "IGNORE_GREP_EXIT=$?"; echo "SITE_TOPLEVEL=$(ls site | wc -l | tr -d ' ') ROOT_ENTRIES_ADDED=$(git status --porcelain --untracked-files=normal | grep -c '^??')"
.prettierignore:7:site/
.gitignore:8:# The Pages deploy assembles the published site here (.github/workflows/pages.yml,
.gitignore:9:# the "Assemble the site" step). On a runner the checkout is fresh so it never
.gitignore:14:/site
IGNORE_GREP_EXIT=0
SITE_TOPLEVEL=34 ROOT_ENTRIES_ADDED=0
```

**Why it is a defect.** The block records a pre-fix state, which is legitimate and necessary - "Present"
means the defect present - but it is published under a sentence saying it was reproduced at this commit,
and its very first command contradicts that here. The "Absent" block immediately below it was re-run at the
tip in answer to stage-2 F7 and had its intro rewritten to say so; the "Present" block above kept the claim
that is now false. Either it needs the commit it was taken at, or the sentence needs to say the ignore
entries were removed to produce it.

## F6 - "a marker counts only where a marker can be written" is not the class that was fixed

**Claimed.** The ledger's R4-5 row: "F1 is fixed as a class rather than an instance: a directive counts only
where a directive can be written, which is neither inline code nor a fence, and the same filter now governs
every marker the file reads." The artifact's blind-spot list states the same rule, and the comment above
`markersIn` in `tools/check-records.mjs` calls it "the rule stated as a class rather than patched per
instance".

**Checked.** Fixtures, one execution, against the checker at the tip. Each line is a throwaway document; the
number is how many defects the checker returns.

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; rm -rf $S/probe && mkdir -p $S/probe/reviews && printf 'const x = 1;\n' > $S/probe/foo.ts && node --input-type=module -e '
import { checkRecords } from "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/wt3/tools/check-records.mjs";
import { writeFileSync } from "node:fs";
const root = "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/probe";
const n = (rel, body, tracked) => { writeFileSync(root + "/" + rel, body); return checkRecords({ root, docs: [rel], tracked: new Set(tracked) }).length; };
const A = ["reviews/A.md"], B = ["reviews/ARTIFACTS-x.md", "foo.ts"];
const M = "<!-- records: historical-file -->", stale = "A live figure: 1547 passed.\n";
console.log("DEFECTS_WITH_NO_MARKER=" + n("reviews/A.md", "# A\n\n" + stale, A));
console.log("MARKER_AS_A_MARKER=" + n("reviews/A.md", "# A\n\n" + M + "\n\n" + stale, A));
console.log("MARKER_IN_BACKTICK_FENCE=" + n("reviews/A.md", "# A\n\n```console\n$ cat m\n" + M + "\n```\n\n" + stale, A));
console.log("MARKER_IN_DOUBLE_BACKTICK_SPAN=" + n("reviews/A.md", "# A\n\nProse quoting `` " + M + " `` inline.\n\n" + stale, A));
console.log("MARKER_IN_TILDE_FENCE=" + n("reviews/A.md", "# A\n\n~~~console\n$ cat m\n" + M + "\n~~~\n\n" + stale, A));
console.log("MARKER_IN_INDENTED_CODE_BLOCK=" + n("reviews/A.md", "# A\n\n    " + M + "\n\n" + stale, A));
console.log("FAKE_LABEL_WITH_NO_MARKER=" + n("reviews/A.md", "# A\n\n```console\n$ ls\nFAKE_EXIT=0\n```\n", A));
console.log("FAKE_LABEL_UNDER_TRANSCRIPT_LITERAL_IN_PROSE=" + n("reviews/A.md", "# A\n\nThe `<!-- transcript-literal -->` marker is named here.\n\n```console\n$ ls\nFAKE_EXIT=0\n```\n", A));
console.log("UNPINNED_CITATION=" + n("reviews/ARTIFACTS-x.md", "# A\n\nThe code is at `foo.ts:1`.\n", B));
console.log("PINNED_BY_A_BINDING_INSIDE_A_FENCE=" + n("reviews/ARTIFACTS-x.md", "# A\n\nThe code is at `foo.ts:1`.\n\n```console\n$ echo hi\n<!-- cite: foo.ts:1 \"const x = 1;\" -->\n```\n", B));
console.log("PINNED_BY_A_BINDING_IN_INLINE_CODE=" + n("reviews/ARTIFACTS-x.md", "# A\n\nThe code is at `foo.ts:1`.\n\nQuoted in prose: `<!-- cite: foo.ts:1 \"const x = 1;\" -->`.\n", B));
'; echo "PROBE_EXIT=$?"
DEFECTS_WITH_NO_MARKER=1
MARKER_AS_A_MARKER=0
MARKER_IN_BACKTICK_FENCE=1
MARKER_IN_DOUBLE_BACKTICK_SPAN=0
MARKER_IN_TILDE_FENCE=0
MARKER_IN_INDENTED_CODE_BLOCK=0
FAKE_LABEL_WITH_NO_MARKER=1
FAKE_LABEL_UNDER_TRANSCRIPT_LITERAL_IN_PROSE=0
UNPINNED_CITATION=1
PINNED_BY_A_BINDING_INSIDE_A_FENCE=0
PINNED_BY_A_BINDING_IN_INLINE_CODE=0
PROBE_EXIT=0
````

Five results are the fix working. Six are the class still open:

- A `records:` marker inside a double-backtick inline span freezes the document. `applied()` strips
  single-backtick spans with a regex that pairs the first backtick with the second, so in a span delimited
  by two backticks at each end the strip consumes the two opening backticks as an empty span and the two
  closing ones as another, and the marker between them survives untouched. A double-backtick span is inline
  code by definition, which is the thing the rule claims to exclude.
- A marker inside a `~~~` fence, and inside a four-space indented code block, freezes the document. `lines()`
  only knows backtick fences, so "not inside a fenced block" means "not inside a backtick-fenced block".
- Of the five markers the file reads, only two are filtered. `cite:` and `cite-historical:` are matched with
  `body.matchAll` over the raw document with no fence and no inline-code filter, so a binding written inside
  a `console` fence, or quoted inside backticks in prose, satisfies rule 2's pinning requirement for a
  citation it does not bind - in a binding document, which is where rule 2 has teeth.
- `transcript-literal` is matched with `previous.includes(...)` on the last non-empty line above a fence,
  also unfiltered. A document that documents the escape - naming the marker in prose immediately above an
  example - turns rule 3 off for that fence. That is stage-1 F1's mechanism exactly, for a different marker,
  still live.

Nothing in the records exploits any of this today:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && node --input-type=module -e '
import { readFileSync } from "node:fs";
import { recordsDocs } from "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/wt3/tools/check-records.mjs";
const root = "/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad/wt3";
function lines(md){let f=null;return md.split("\n").map((text,i)=>{const o=/^\s*```+ *([A-Za-z0-9_-]*)/.exec(text);if(o&&f===null){f=o[1]||"plain";return{text,no:i+1,fenced:true};}if(o&&f!==null){f=null;return{text,no:i+1,fenced:true};}return{text,no:i+1,fenced:f!==null};});}
let applied=0, inlineCode=0, fenced=0, tilde=0, doubled=0;
for (const doc of recordsDocs(root)) for (const l of lines(readFileSync(root + "/" + doc, "utf8"))) {
  if (/^\s*~~~/.test(l.text)) tilde++;
  if (!/<!-- records: (historical-file|historical)\b/.test(l.text)) continue;
  if (/``[^`]*<!-- records:/.test(l.text)) doubled++;
  if (l.fenced) fenced++;
  else if (/<!-- records: (historical-file|historical)\b/.test(l.text.replace(/`[^`]*`/g, ""))) applied++;
  else inlineCode++;
}
console.log("MARKERS_APPLIED=" + applied + " IN_INLINE_CODE=" + inlineCode + " IN_A_FENCE=" + fenced);
console.log("MARKERS_IN_A_DOUBLE_BACKTICK_SPAN=" + doubled + " TILDE_FENCE_LINES_ANYWHERE=" + tilde);
'; echo "ENUMERATE_EXIT=$?"
MARKERS_APPLIED=25 IN_INLINE_CODE=4 IN_A_FENCE=2
MARKERS_IN_A_DOUBLE_BACKTICK_SPAN=0 TILDE_FENCE_LINES_ANYWHERE=0
ENUMERATE_EXIT=0
````

**Why it is a defect.** The claim is not that a hole was left; it is that the class was closed, stated in
three places, and used in the ledger to explain why two reviewers were needed. What was actually done is a
second instance fix plus a class-shaped sentence. The two markers that carry the most authority - the ones
that satisfy rule 2, the only rule that binds unconditionally in the two binding documents - got no filter
at all, and one of them can be applied by a document merely describing it, which is the original defect
verbatim. "It hides nothing today" is exactly what was true of stage-1 F1 and stage-2 F1 at the moment each
was reported.

## F7 - the tolerance's stated safety margin is measured against a figure the round no longer pins

**Claimed.** The `COVERAGE_TOLERANCE` comment in `tools/check-records.mjs` says the tolerance "absorbs that
jitter and still refuses the round-3 baseline quadruple, whose nearest component differs by 0.10". The
artifact repeats it: "still refuses the round-3 baseline quadruple, whose nearest component differs by
0.10".

**Checked.** The pinned quadruple is 96.10 / 93.07 / 93.44 / 97.90 and the round-3 baseline quadruple is
96.16 / 93.28 / 93.22 / 98.00. <!-- figure-historical -->
The line above carries a `figure-historical` marker in the source of this file: it states a closed round's
figure on purpose, and rule 4 refused this review until it did.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && node -e '
const pin=[96.1,93.07,93.44,97.9], base=[96.16,93.28,93.22,98.00];
const d=pin.map((p,i)=>Math.abs(base[i]-p).toFixed(4));
console.log("DIFFS=" + d.join(" "));
console.log("NEAREST=" + Math.min(...d.map(Number)).toFixed(4));
'; echo "ARITHMETIC_EXIT=$?"
DIFFS=0.0600 0.2100 0.2200 0.1000
NEAREST=0.0600
ARITHMETIC_EXIT=0
```

0.10 is the distance from the _superseded_ pinned quadruple - the one the spec's own fixture hard-codes as
`coverage: [96.06, 92.83, 93.43, 97.89]` - not from the round's figures. Against what is actually pinned the
nearest component is 0.06, one hundredth of a point outside a tolerance of 0.05.

**Why it is a defect.** The refusal still holds, so this is not a hole; it is a wrong number in the
justification for how wide a gate's blind spot should be, in the two places that justify it, in the round
convened about wrong numbers. It also has a live consequence for the next person who moves `FIGURES`: the
test that pins "still refuses the superseded quadruple" builds its own `figures` object instead of using
`FIGURES`, so nothing checks the margin against the values the gate actually enforces, and the margin is
now one jitter-width from vanishing.

## F8 - the replacement for "48 further bindings" counts two lines of command text as bindings

**Claimed.** `reviews/ARTIFACTS-round4.md` replaces stage-2 F14's uncounted "48 further bindings" with a
count: "at the price of pinning every citation in both documents: 65 markers in the ledger (57 bindings, 8
historical) and 19 in this file (10 and 9)".

**Checked.** The ledger's half is right - 57 bindings and 8 historical markers. The artifact's is not.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && node -e '
const {readFileSync}=require("fs");
const b=readFileSync("reviews/ARTIFACTS-round4.md","utf8");
const bindings=[...b.matchAll(/<!-- cite: (\S+):(\d+(?:-\d+)?) "((?:[^"\\]|\\.)*)" -->/g)];
const hist=[...b.matchAll(/<!-- cite-historical: ([^\s]+):(\d+(?:-\d+)?)/g)];
const openers=[...b.matchAll(/<!-- cite: /g)];
console.log("BINDINGS_THE_GATE_PARSES=" + bindings.length);
console.log("CITE_OPENERS_ANYWHERE=" + openers.length);
console.log("CITE_HISTORICAL=" + hist.length);
'; echo "COUNT_EXIT=$?"
BINDINGS_THE_GATE_PARSES=8
CITE_OPENERS_ANYWHERE=10
CITE_HISTORICAL=9
COUNT_EXIT=0
```

The two extra openers are on one line inside the rule-2 non-vacuity fence, where the marker's text is an
argument to a `python3` replacement; they carry escaped quotes and are not bindings by any reading. The
artifact's binding block holds 8. The correct total for that file is 17.

**Why it is a defect.** It is the same defect stage-2 F14 reported - a stated measurement in the round about
records arithmetic that no measurement produces - with a smaller error, published in the commit that
corrects it. It is also this range's own thesis failing in miniature: the two miscounted items are
directives written inside a fence, and the sentence they inflate sits three bullets above the one declaring
that a directive inside a fence is not a directive.

## F9 - the two rows answering the stage-2 REJECT are not part of any table

**Claimed.** `PROD-READINESS.md` records this range's answer to stage 2 as rows R4-5 and R4-6 of the
"ROUND 4 regressions introduced and fixed inside this run" table, and the prose above them reads "R4-3 to
R4-6 did reach one".

**Checked.** The two rows sit after three paragraphs of prose, separated from the table's header by blank
lines and text. GitHub-flavoured Markdown starts a table at a header row followed by a delimiter row;
pipe-delimited lines with neither are a paragraph. Prettier's markdown parser agrees, and its behaviour is
visible either way:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; mkdir -p $S/md && printf '| id | what |\n| --- | ---- |\n| R4-1 | first |\n\nA paragraph in between.\n\n| **R4-5** | 2 (review) | orphan |\n' > $S/md/orphan.md && printf '| id | what |\n| --- | ---- |\n| R4-1 | first |\n| **R4-5** | 2 (review) | attached |\n' > $S/md/attached.md && cd $S/wt3 && echo "SEPARATED_BY_A_PARAGRAPH=1"; npx prettier $S/md/orphan.md; echo "ATTACHED_TO_THE_TABLE=1"; npx prettier $S/md/attached.md; echo "PRETTIER_EXIT=$?"
SEPARATED_BY_A_PARAGRAPH=1
| id   | what  |
| ---- | ----- |
| R4-1 | first |

A paragraph in between.

| **R4-5** | 2 (review) | orphan |
ATTACHED_TO_THE_TABLE=1
| id       | what       |
| -------- | ---------- |
| R4-1     | first      |
| **R4-5** | 2 (review) | attached |
PRETTIER_EXIT=0
```

A row attached to the table is absorbed into it and re-padded; separated rows are left exactly as typed.
The ledger shows the same signature: R4-1 to R4-4 are padded to a common column width by prettier, and
R4-5 and R4-6 are not padded at all, because prettier never saw them as table rows. `npx prettier --check
PROD-READINESS.md` passes for the same reason.

**Why it is a defect.** The round's answer to a fourteen-finding REJECT renders as two long lines of literal
pipe characters below an unrelated paragraph, in the document that is the deliverable. The same edit left
the section's own introduction saying "Defects this run put into its own output. Four: two the gate refused
before they reached a commit, and two the stage-1 reviewer found in commits that had already landed", which
is now wrong in the count and in the attribution - there are six, and the last two came from stage 2.

## F10 - the corrected `.gitignore` comment still puts the files in the wrong place

**Claimed.** The comment above `/site` now reads: "run that step locally to verify the workflow and it
leaves 34 entries at the repository root (93 files in all), one `git add -A` from being committed. 28 is a
different count - what prettier then flags - and was the number this comment first gave."

**Checked.** I ran the workflow's four assemble commands and counted. The counts are right: 34 entries and
93 files, and 28 is indeed prettier's tally. The location is not - all 34 entries are inside `site/`, and
what the step leaves at the repository root is one directory, which git does not see because of the rule the
comment is attached to. The `ROOT_ENTRIES_ADDED=0` in F5's transcript above is that check, taken with the
assembled tree on disk.

**Why it is a defect.** Stage-2 F12 was about this sentence stating a measured quantity it had not measured.
The number was fixed and the claim it modifies was not re-read, so the sentence still says the deploy step
scatters 34 entries into the repository root. It is small, but it is the second wrong statement in one
comment about one command, and it is in a tracked config file where it is the only justification for an
ignore rule.

## F11 - two `figure-historical` markers exempt nothing

**Claimed.** `reviews/ARTIFACTS-round4.md` carries a `figure-historical` marker alone on a line under the
first self-catch transcript, and `PROD-READINESS.md` carries one at the end of the "unit tests 1551 -> 1599"
bullet in the new gates section. The marker's documented meaning is "this line states a superseded figure on
purpose", and stage-2 F2 already reported one of these as marking nothing.

**Checked.** I deleted both and re-ran the gate.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S/wt3 && python3 -c "
import io
p='reviews/ARTIFACTS-round4.md'; s=open(p).read().split('\n')
assert s[189]=='<!-- figure-historical -->', s[189]
del s[189]
open(p,'w').write('\n'.join(s))
q='PROD-READINESS.md'; t=open(q).read()
old='- unit tests 1551 -> 1599: 47 for the records gate\'s own spec, 1 for K3\'s ordering test. <!-- figure-historical -->'
assert t.count(old)==1
open(q,'w').write(t.replace(old, old.replace(' <!-- figure-historical -->','')))
print('DEAD_MARKERS_REMOVED=1')
"; echo "REMOVE_EXIT=$?"; node tools/check-records.mjs; echo "WITHOUT_MARKERS_EXIT=$?"; git checkout -- reviews/ARTIFACTS-round4.md PROD-READINESS.md; echo "RESTORE_EXIT=$?"
DEAD_MARKERS_REMOVED=1
REMOVE_EXIT=0
records: 28 documents checked, no defects
WITHOUT_MARKERS_EXIT=0
RESTORE_EXIT=0
```

The first sits between a `console` fence, which rule 4 already skips, and prose containing no figure. The
second is on a line whose numbers do not match any sweep pattern.

**Why it is a defect.** An exemption marker is a statement that the gate would otherwise object here, and
both of these say it where it is not true. That is misleading in the direction that matters: a reader
auditing which figures the gate is actually watching will subtract lines it never watched, and a later edit
that moves a real figure onto one of these lines will be silently exempted by a marker nobody placed for it -
which is stage-1 F4 with the roles reversed.

## What I could not verify

Gate 5's distribution table (10 full-suite runs and 200 two-spec executions at each of `f5e8fc8` and
`0fbe138`) is not reproducible inside this review without twenty full E2E runs on a machine already carrying
the main session's own ten-run measurement, so I did not attempt it. The suite's size is confirmed at 115
tests in 14 files, and a four-test subset ran green on my own port. Gates 7 to 9 (swiftformat, swiftlint,
xcodebuild) were not re-run either; the file count they report, 105 Swift files, is correct.

## Verdict

**REJECT.**

The code in this range is good and I want that recorded first. The fenced-marker fix genuinely binds, proved
by re-running stage 2's own injection against the real document. The rule-3 quote scan now behaves the way a
shell does, in both directions, with tests. Both E2E lanes take the port, and the serve lane runs green on a
port of my choosing, which is the thing stage-2 F6 said did not work. The coverage tolerance is a sound
answer to a real non-determinism. `FIGURES` matches the tree. The M3, K1 and K3 blocks that stage 2 found
stale were genuinely re-executed, not edited. The second self-catch is real and reconstructs exactly. Nothing
in `src/` is wrong here, and the gate itself is measurably stronger than it was two commits ago.

It is rejected on four findings, all of them records defects of the class this round exists to end.

F1: the round's closing evidence, the table that says nine of nine gates are green, names a commit that
produces neither the unit-test count nor the coverage quadruple printed in two of its rows - and the reason
it does is that rule 4 forced those two numbers to the tip while the sentence recording where they were
measured stayed put. A gate that makes a record wrong to make itself green is the most serious thing in this
review.

F2: the census the round publishes, and the `103` that K4 carries into the next round as its entire content,
were invalidated by this range's own rule-3 fix. At the tip the same command prints 105 and a different
per-file table. Nobody re-measured the thing the fixed bug had been hiding.

F3: the transcript under "Its own tests" still prints 34 where the command prints 47, four lines below a
paragraph that says the 47 was counted at this commit. That is the evidence half of stage-2 F4, in the commit
that reports F4 as answered.

F6: "a directive counts only where a directive can be written" is asserted in three places as a class fix. It
is a second instance fix. Double-backtick inline code, tilde fences and indented blocks still apply markers,
and three of the five markers the file reads - including both citation markers, which drive the only rule
that binds unconditionally in the ledger - are matched against the raw document with no filter at all. One of
them, `transcript-literal`, can still be applied by a document that merely names it above a fence, which is
stage-1 F1 unchanged.

F4, F5, F8, F9, F10 and F11 are the same pattern at lower stakes: an attack published with the numbers it
produced two commits ago, a block introduced as reproduced at a commit where its first command prints the
opposite, a corrected count that counts command text, an answer to a REJECT that no renderer will show as a
table, a corrected number attached to a location that is still wrong, and two markers that exempt nothing.

The pattern I would name for the next round is narrower than "carelessness". Every finding above except F6
is a number or a claim that a human copied while the thing it described was re-measured by a machine, and
`tools/check-records.mjs` cannot see any of them: a figure in a table cell, a count of markers, a document
count inside a transcript, a table row's rendering, a sentence naming the commit a measurement came from.
The gate has made this round's records much better than round 3's, and it has also concentrated attention on
the four figures it checks. The cheapest structural answer is not another rule - it is that any table or
transcript stating a gate result should be produced by re-running the gate at the commit that publishes it,
and that a record which states the commit its numbers came from should be checkable against that commit.
