# REVIEW - round 4, stage 1

Adversarial review of `f5e8fc8..b04d9f1` on `prod-readiness/round4-2026-08-12`: `983cc84` (round-4
baseline), `00b4abb` (the records gate), `b04d9f1` (the round-4 ledger section and its artifact).
Every figure, transcript and citation in the changed files was treated as an unverified claim and
re-derived here.

- Date: 2026-08-12
- Reviewed at: `b04d9f1`, with `00b4abb` used where a transcript names that commit

## Method, and two operational notes

While this review was running, another session was committing to the same checkout: `src/app/app.spec.ts`
appeared modified midway through, then `.gitignore`, `.prettierignore`, `playwright.config.ts`,
`vitest.config.ts`, `PROD-READINESS.md`, `tools/check-records.mjs` and `tools/check-records.spec.mjs`,
and the checkout's `HEAD` moved past `b04d9f1`.
None of that is mine and none of it was reverted.
Every gate below was therefore re-run in a private worktree created with `git worktree add --detach`
and pinned to the exact commit under review, with `node_modules` symlinked from the main checkout.
`$S` is this session's scratch directory and `$S/wt` is that worktree.
The main checkout was never modified by this review except to add this file.

Gate 5 was deliberately not re-run.
`lsof -nP -iTCP:4200 -sTCP:LISTEN` was empty every time it was checked, but the concurrent session had
`playwright.config.ts` modified in its working tree, and starting a run that binds `127.0.0.1:4200`
risked destroying a measurement in progress.
The ten full-suite runs and the 200 repeats in `reviews/BASELINE-round4.md` are consequently the one
baseline claim this review did not reproduce, and they are not counted as verified below.

Line references into files that were being rewritten concurrently are given as plain text pinned to
`b04d9f1` rather than as backticked `file:line` citations, because those files no longer hold the same
content and a citation into them would be stale before anyone read it.

Three notes on how this file itself sits under the gate it reviews, since a reviewer who quietly
routes around it would be repeating F1. First, the unit-test count recorded below is the count at
`b04d9f1` and carries a `figure-historical` marker, because the round's declared figure has since
moved on to a later commit and rule 4 knows only one value at a time; that is the marker doing its
documented job. Second, the two lines of `reviews/ARTIFACTS-round4.md` that F1 is about cannot be
quoted verbatim here, because quoting them would exempt this review, so they are shown by a scan that
reports which lines match rather than reproducing the marker text; the same applies to the commands in
F1, F6 and F7, which spell the marker in two pieces for the same reason. Third, this file was checked
with the marker regexes to confirm it is not exempting itself, and it is not.

## What reproduced exactly

These are not taken on the record's word; each was re-run at the pinned commit.

- Baseline gates 1, 2, 3, 4, 6, 7, 8 and 9 at `f5e8fc8` reproduce, including the single chart-page
  budget warning at 368 bytes over, 7 parity fixtures with a clean `git diff --exit-code`,
  `0/105 files require formatting`, `0 violations, 0 serious in 105 files`, and
  `Test run with 335 tests in 38 suites passed` with one `** TEST SUCCEEDED **` marker.
- The unit gate at `b04d9f1` is 68 files / 1585 tests, exit 0, exactly as claimed. <!-- figure-historical -->
  `tools/check-records.spec.mjs` alone is 34 tests, exit 0.
- All four non-vacuity proofs A, B, C and D in `reviews/ARTIFACTS-round4.md` reproduce byte-for-byte
  at `00b4abb`, including the three-place hit in B and the exact defect line numbers in every block.
  These are honest, and B genuinely demonstrates what the rule is for.
- All 24 `<!-- cite: ... -->` bindings in the ledger resolve to a tracked file and their fragments are
  present at the cited lines. The "nine stale citations at eleven places" table is accurate: each
  "before" citation occurred exactly the claimed number of times at `f5e8fc8` and occurs zero times
  now, and each "after" target holds the content the table describes.
- The census figure of **105** rule-3 hits is correct, it is spread across eleven files, and the claim
  that none of those 105 fences contains the echo at all holds for all 105 (checked by extracting each
  reporting fence and searching it for an `echo` that could produce that name).
- The arithmetic checks: `0.945^100` is 0.003493, one in 286; the rule-of-three 95% bound on 0 of 100
  is 3.0%; and 1551 plus 34 is 1585. <!-- figure-historical -->
- `angular.json` line 75 really does include `../tools/**/*.spec.mjs`, so the gate's own spec is inside
  the unit gate, and `.github/workflows/ci.yml` line 19 runs `npm run lint`, so the gate is in CI.
- The self-catch transcript's coordinates are real: `PROD-READINESS.md` line 24 does carry the
  `package.json:4-20` citation, and lines 42 and 51 of `reviews/BASELINE-round4.md` at `983cc84` are
  exactly the two rows that state the baseline count.

## F1 - the round's own artifact document exempts itself from three of the four rules

**Claimed.** `reviews/ARTIFACTS-round4.md` line 34 states "**Citations are not exempt anywhere.**"
Line 28 states that a `historical-file` marker sits "at the top of each closed round's record", which
this document is not. The module header of `tools/check-records.mjs` states that `historical-file`
lifts rules 2-binding, 3 and 4 for the whole file.

**Checked.** `exemptions()` computes `wholeFile` by testing the marker regex against the entire
document body, not against a marker line. Lines 28 and 29 of `reviews/ARTIFACTS-round4.md` name both
markers in prose, inside backticks, while explaining them. This review cannot quote those two lines
verbatim, because doing so would exempt this review, so the scan below reports which lines match
without reproducing the marker text:

```console
$ cd $S/wt && node -e 'const P="<"+"!-- records: historical"; require("fs").readFileSync("reviews/ARTIFACTS-round4.md","utf8").split("\n").forEach((t,i)=>{if(t.includes(P+"-file"))console.log("line "+(i+1)+": matches the whole-file freeze regex");else if(t.includes(P))console.log("line "+(i+1)+": matches the section marker regex");});'; echo "MARKER_SCAN_EXIT=$?"
line 28: matches the whole-file freeze regex
line 29: matches the section marker regex
MARKER_SCAN_EXIT=0
```

Backticks are not part of the regex, so the document declares itself frozen. There are two independent
escapes here, not one: line 28 sets `wholeFile`, which lifts rules 2-binding, 3 and 4 for the entire
document, and line 29 additionally opens a `historical` section that runs to the next h1, of which
there is none, so it covers every remaining line even if the first were fixed. Renaming both prose
mentions, changing nothing else, and re-running:

```console
$ cd $S/wt && perl -0pi -e 's/records: historical-file/records: HF/; s/records: historical -->/records: H -->/' reviews/ARTIFACTS-round4.md; echo "UNFREEZE_EXIT=$?"; node tools/check-records.mjs 2>&1 | grep 'ARTIFACTS-round4' | sed -E 's/.*(cites a file this branch changed|block prints|unit-test count).*/\1/' | sort | uniq -c; git checkout -- reviews/ARTIFACTS-round4.md; echo "RESTORE_EXIT=$?"
UNFREEZE_EXIT=0
  13 block prints
   9 cites a file this branch changed
   2 unit-test count
RESTORE_EXIT=0
```

**Why it is a defect.** The single document that carries all of this round's evidence is outside the
gate the round exists to introduce, and it is outside it by accident rather than by decision. The
nine unbound citations are the "before" column of its own stale-citation table, which names moved
content with no `cite-historical` marker: the exact R3-20 shape, published in the section reporting
that the shape has been eliminated. The two figure hits and thirteen transcript hits are covered in
F4 and F6. The escape is also undocumented in the "What it does not refuse" section, which claims to
state the gate's blind spots, and it cannot be seen by reading, because the marker renders as nothing.

## F2 - the "Gates at the stage-1 commit" transcript is not the stage-1 commit

**Claimed.** `reviews/ARTIFACTS-round4.md` line 16 says the gate runs "over 25 documents". Its final
section is headed "Gates at the stage-1 commit" and publishes `npm run lint` printing
`records: 25 documents checked, no defects` as one execution at that commit.

**Checked.** `recordsDocs()` reads `reviews/` from the filesystem. At `b04d9f1` that directory holds
24 markdown files, so with the ledger and the checklist the count is 26. In a clean worktree pinned to
`b04d9f1`:

```console
$ cd $S/wt && git rev-parse --short HEAD && npm run lint > $S/l.txt 2>&1; echo "LINT_EXIT=$?"; tail -3 $S/l.txt
b04d9f1
LINT_EXIT=0
Checking formatting...
All matched files use Prettier code style!
records: 26 documents checked, no defects
```

The two prettier lines match the published block exactly; the third does not.

**Why it is a defect.** 25 is the count at `00b4abb`, before `reviews/ARTIFACTS-round4.md` existed.
The block is labelled as the gates at the stage-1 commit, and at the stage-1 commit that command
cannot print that line, because the file containing the block is itself one of the documents counted.
It is a transcript composed from a run at an earlier tree state and published against a later one -
the R3-15/R3-27 shape, in the section that certifies the commit. Line 16's "over 25 documents" is the
same figure stated as a present-tense property of the gate. Note that this is not merely cosmetic:
the count is the gate's only self-report of what it looked at, so a reader checking whether the gate
covered the round's own artifact gets the answer "no, there were only 25".

## F3 - the round's coverage figure is the baseline's, so the gate refuses the tree's real coverage

**Claimed.** `FIGURES` in `tools/check-records.mjs` (lines 58-64 at `b04d9f1`) declares the round's
figures, with an explicit comment on `unitTests` that it is "The count at the round's tip, not at its
baseline". `coverage` is declared on the next line with no such caveat, and rule 4 refuses any live
record stating a different quadruple.

**Checked.** `unitTests` is correct at the tip. `coverage` is not. Measured in the pinned worktree:

```console
$ cd $S/wt && git checkout --detach f5e8fc8 > /dev/null 2>&1; npm run test:coverage > $S/cov-base.txt 2>&1; echo "BASE_COVERAGE_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/cov-base.txt | grep -E 'Test Files|Statements|Branches|Functions|Lines'
BASE_COVERAGE_EXIT=0
 Test Files  67 passed (67)
Statements   : 96.16% ( 5310/5522 )
Branches     : 93.28% ( 2363/2533 )
Functions    : 93.22% ( 922/989 )
Lines        : 98% ( 4078/4161 )
$ cd $S/wt && git checkout --detach b04d9f1 > /dev/null 2>&1; npm run test:coverage > $S/cov-tip.txt 2>&1; echo "TIP_COVERAGE_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/cov-tip.txt | grep -E 'Test Files|Statements|Branches|Functions|Lines'
TIP_COVERAGE_EXIT=0
 Test Files  68 passed (68)
Statements   : 95.72% ( 5515/5761 )
Branches     : 92.33% ( 2482/2688 )
Functions    : 93.02% ( 947/1018 )
Lines        : 97.5% ( 4261/4370 )
```

The baseline record is exactly right, which is to its credit. The declared figure is the baseline
value, and the round's own commits moved coverage: the gate's own source enters the coverage scope and
drops statements from 96.16 to 95.72. All four numbers move, not one. Stating the true current value
in a live record is refused:

```console
$ cd $S/wt && printf '\nCoverage at the round tip is 95.72 / 92.29 / 93.02 / 97.50 today.\n' >> reviews/BASELINE-round4.md; echo "APPEND_EXIT=$?"; node tools/check-records.mjs; echo "REAL_COVERAGE_EXIT=$?"; git checkout -- reviews/BASELINE-round4.md; echo "RESTORE_EXIT=$?"
APPEND_EXIT=0
records: 1 defect(s)
  reviews/BASELINE-round4.md:249: coverage quadruple states 95.72 / 92.29 / 93.02 / 97.50 where the round's coverage is 96.16 / 93.28 / 93.22 / 98
REAL_COVERAGE_EXIT=1
```

One further wrinkle found while re-running this three times at `b04d9f1`, all three reporting 1585
tests: branch coverage is not reproducible. It printed `2481/2688` once and `2482/2688` twice, that is
92.29 then 92.33 twice, while statements, functions and lines were identical every time. So the round
has no stable current branch figure to declare even if it wanted to, and a rule-4 entry pinned to two
decimals on that number would refuse an honest record roughly one run in three.

**Why it is a defect.** Rule 4 exists to answer R3-1, R3-11, R3-18 and R3-24, where one figure was
"corrected everywhere" four times and was wrong every time. As shipped it enforces a wrong figure and
refuses the right one, which is that defect mechanised and given the authority of a gate. No round-4
record states the tree's actual coverage anywhere, and the artifact's "Gates at the stage-1 commit"
section runs `npm run lint` and `npm test` but not `npm run test:coverage`, which is why the drift was
never seen.

## F4 - `figure-historical` silently exempts the following line, and one marker is on the wrong line

**Claimed.** The module header of `tools/check-records.mjs` documents `<!-- figure-historical -->` as
"this line states a superseded figure on purpose". The spec's only test of it is named "honours a
figure-historical marker on the same line".

**Checked.** `checkFigures` (lines 421-425 at `b04d9f1`) also returns when the _previous_ line carries
the marker, which nothing documents and nothing tests:

```console
$ cd $S/wt && printf '\nMarked: 1551 passed. <!-- figure-historical -->\nUnmarked, next line: 1547 passed.\n' >> reviews/BASELINE-round4.md; echo "APPEND_EXIT=$?"; node tools/check-records.mjs; echo "NEXT_LINE_EXIT=$?"; git checkout -- reviews/BASELINE-round4.md; printf '\nMarked: 1551 passed. <!-- figure-historical -->\n\nUnmarked, two lines below: 1547 passed.\n' >> reviews/BASELINE-round4.md; node tools/check-records.mjs; echo "TWO_BELOW_EXIT=$?"; git checkout -- reviews/BASELINE-round4.md; git status --porcelain --untracked-files=no; echo "CLEAN_EXIT=$?"
APPEND_EXIT=0
records: 26 documents checked, no defects
NEXT_LINE_EXIT=0
records: 1 defect(s)
  reviews/BASELINE-round4.md:251: unit-test count states 1547 where the round's unit-test count is 1585
TWO_BELOW_EXIT=1
CLEAN_EXIT=0
```

Two live consequences. First, the coverage row of the baseline results table, one line below the
marked unit-tests row, is exempt from rule 4 purely because of its neighbour, which is why F3's stale
figure survives there and why the mutation in F3 had to be appended elsewhere to be seen at all.
Second, the exemption runs the wrong way for the house prose style: the last sentence of
`reviews/ARTIFACTS-round4.md` is wrapped across two lines with the marker at the end of the second,
and the figure it is meant to excuse is on the first. That line is one of the two rule-4 hits in F1.

**Why it is a defect.** An exemption marker whose reach is one line wider than its documentation is
the same class of hazard as the marker in F1: it turns a rule off on a line nobody marked, invisibly,
and in this record it has already done so on the round's coverage figure.

## F5 - rule 2's binding check stops working once the branch is merged, and errors where `main` is absent

**Claimed.** `reviews/ARTIFACTS-round4.md` line 22 says rule 2 refuses a citation that, "for a file
this branch has changed", is not pinned to a fragment, and the ledger's Citation bindings section says
"the gate refuses the commit if one drifts". The "What it does not refuse" section lists the gate's
blind spots and mentions neither of the two below.

**Checked.** `changedOnBranch` (lines 169-180 at `b04d9f1`) shells out to `git diff --name-only
main...HEAD`. Extracting `b04d9f1` into a fresh repository whose only branch is the checked-out head,
which is the shape a `pull_request` checkout has:

```console
$ cd $S/nomain && git for-each-ref --format='%(refname:short)' && node tools/check-records.mjs; echo "NO_MAIN_EXIT=$?"
pr-merge
records: 1 defect(s)
  could not compute the set of files this branch changed (git diff main...HEAD failed), so citation bindings cannot be enforced
NO_MAIN_EXIT=1
```

Renaming that branch to `main`, so `main` resolves to `HEAD` as it does after a merge or on a push to
the trunk, and then deliberately breaking a binding so that it pins content which is not at the cited
line:

```console
$ cd $S/nomain && git branch -m main && perl -0pi -e 's/const PORT = 4200;/const PORT = 9999;/' PROD-READINESS.md; echo "BREAK_EXIT=$?"; grep -c 'cite: playwright.config.ts:6 "const PORT = 9999;"' PROD-READINESS.md; node tools/check-records.mjs; echo "MERGED_EXIT=$?"
BREAK_EXIT=0
1
records: 26 documents checked, no defects
MERGED_EXIT=0
```

**Why it is a defect.** The diff is empty, so the changed set is empty, so no citation ever "cites a
file this branch changed" and every binding is inert. Rule 2's content check - the whole answer to
R3-20 - is enforced only while the branch is unmerged and only in a checkout that has a `main` ref.
The moment these four rounds land on the trunk it stops checking and reports success, which is
precisely the failure the spec's own header names as the risk it was written to guard against: a
checker that stops matching does not fail, it passes forever. The `pull_request` case is the mirror
image and points the other way: `actions/checkout@v5` is used at `ci.yml` line 13 with no
`fetch-depth`, and `npm run lint` at line 19 now includes this gate. Whether a runner's checkout has a
`main` ref cannot be executed here and the round's own assumption 2 keeps every GitHub-runner claim
UNVERIFIED, so this half is a risk rather than a proven breakage - but it is a risk the round created,
did not measure, and did not record.

## F6 - "Rule 3 accepts an echo anywhere in the same fence" is false, and its own proofs are the counterexample

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 44 to 48: "**Rule 3 accepts an echo anywhere in the
same fence**, not only on the owning command line." Lines 53 to 54, introducing blocks A to D: "Every
block below is one execution, and every exit label is printed by the `echo` on its own command line."

**Checked.** `noteEchoes` is only ever called from a line beginning `$ ` or from a backslash
continuation of one. Blocks A to D open with `$ python3 -c "`, which does not end in a backslash, so
every following line including the one carrying `"; echo "RENAME_EXIT=$?"; ...` is classified as
output and the echoes on it are invisible to the rule. Thirteen of the twenty-four defects surfaced in
F1 are exactly this, for example:

````console
$ cd $S/wt && perl -0pi -e 's/records: historical-file/records: HF/; s/records: historical -->/records: H -->/' reviews/ARTIFACTS-round4.md; echo "UNFREEZE_EXIT=$?"; node tools/check-records.mjs 2>&1 | grep 'ARTIFACTS-round4.md:66'; git checkout -- reviews/ARTIFACTS-round4.md; echo "RESTORE_EXIT=$?"
UNFREEZE_EXIT=0
  reviews/ARTIFACTS-round4.md:66: a ```console block prints `RENAME_EXIT=` as output of `python3 -c "` (line 60), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
RESTORE_EXIT=0
````

**Why it is a defect.** Three separate statements collide. The documented behaviour says "anywhere in
the same fence"; the implemented behaviour is "anywhere on a command line in the same fence"; and the
gate's own error text says "on the same command line", contradicting the documentation. The blocks are
honest - they do reproduce, and their echoes are visible in the fence - but the document's description
of what the rule accepts is wrong, and the only reason the round's flagship evidence passes its own
gate is the accident in F1. Anyone writing a future transcript in the documented style, with a
multi-line command that is not backslash-continued, will be refused with a message telling them to do
what they already did.

## F7 - the census command as published does not produce the census numbers

**Claimed.** Under "Census: what the historical markers are exempting", after "Stripping every
historical marker and re-running", a ```console block whose command line reads `node -e '...strip
every historical marker from reviews/*.md and PROD-READINESS.md...'` and whose output is
`records: 241 defect(s)`, broken down as 105 transcripts, 27 bindings, 109 figures, 0 anchors/bounds.

**Checked.** The command is an ellipsis, so the only way to test it is to write the described strip.
Removing `records: historical-file`, `records: historical` and `figure-historical` markers from
exactly the named scope, at `00b4abb`, the commit the surrounding section works at:

```js
// $S/strip2.mjs - argv is a list of documents to leave alone.
// The marker opener is spelled in two pieces so this script can be quoted inside
// a records document without exempting that document from the rules it checks.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const OPEN = '<' + '!--';
const skip = new Set(process.argv.slice(2));
const files = [
  'PROD-READINESS.md',
  ...readdirSync('reviews')
    .filter((f) => f.endsWith('.md'))
    .map((f) => 'reviews/' + f),
].filter((f) => !skip.has(f));
const strip = (s, name) => s.replace(new RegExp(OPEN + ' ' + name + '[^>]*-->', 'g'), '');
for (const f of files) {
  const b = readFileSync(f, 'utf8');
  writeFileSync(
    f,
    strip(strip(strip(b, 'records: historical-file'), 'records: historical'), 'figure-historical'),
  );
}
```

```console
$ cd $S/wt && git rev-parse --short HEAD && node $S/strip2.mjs; node tools/check-records.mjs > $S/x.txt 2>&1; echo "PUBLISHED_SCOPE_EXIT=$?"; head -1 $S/x.txt; echo "figures: $(grep -cE 'unit-test count|coverage quadruple|pooled M2' $S/x.txt)"; git checkout -- .
00b4abb
PUBLISHED_SCOPE_EXIT=1
records: 243 defect(s)
figures: 111
$ cd $S/wt && git rev-parse --short HEAD && node $S/strip2.mjs reviews/BASELINE-round4.md; node tools/check-records.mjs > $S/y.txt 2>&1; echo "EXCLUDING_OWN_BASELINE_EXIT=$?"; head -1 $S/y.txt; echo "transcripts: $(grep -c 'block prints' $S/y.txt)  bindings: $(grep -c 'cites a file this branch changed' $S/y.txt)  figures: $(grep -cE 'unit-test count|coverage quadruple|pooled M2' $S/y.txt)"; git checkout -- .
00b4abb
EXCLUDING_OWN_BASELINE_EXIT=1
records: 241 defect(s)
transcripts: 105  bindings: 27  figures: 109
```

**Why it is a defect.** The published numbers are reachable, but only by a strip that also spares
`reviews/BASELINE-round4.md`, which is not a closed round's record and is inside the scope the command
line names. As written, the command produces 243 and 111. The three numbers the section actually
argues from - 105, 27 and 0 - are correct and survive; the total and the figure count are not what
that command prints. Because the command is elided, no reader can discover this, which is the reason
a records gate polices transcripts in the first place. The block is also the one place in the round
where a `console` fence's `$` line is not a runnable command at all.

## F8 - the census's worst-offender file is misnamed

**Claimed.** "It is spread across eleven files, worst in `REVIEW-round2-stage2.md` (25) and
`ARTIFACTS-round3.md` (18)."

**Checked.** Eleven files is right. The attribution of 25 is not:

```console
$ cd $S/wt && git rev-parse --short HEAD && node $S/strip2.mjs reviews/BASELINE-round4.md; node tools/check-records.mjs 2>&1 | grep 'block prints' | sed 's/^ *//' | cut -d: -f1 | sort | uniq -c | sort -rn | head -4; git checkout -- .; git status --porcelain --untracked-files=no; echo "CLEAN_EXIT=$?"
00b4abb
  25 reviews/REVIEW-round3-stage2.md
  18 reviews/ARTIFACTS-round3.md
  17 reviews/REVIEW-round2-stage2.md
  10 reviews/REVIEW-round3-stage1.md
CLEAN_EXIT=0
```

**Why it is a defect.** The worst file is `REVIEW-round3-stage2.md` with 25; `REVIEW-round2-stage2.md`
has 17 and is third. A round-2/round-3 transposition in the one sentence that tells the next round
where the 105 instances are concentrated points K4's future remediation at the wrong file.

## F9 - finding K4 does not exist

**Claimed.** "They are left marked, counted, and named as finding **K4** in NEXT ROUND."

**Checked.** `grep -n 'K4' PROD-READINESS.md LAUNCH-CHECKLIST.md` returns nothing, and the only
occurrence of the string anywhere in `reviews/` is the sentence above. The ledger's NEXT ROUND tables
carry K1, K2 and K3 only, and the ROUND 4 section contains an intro and `## ROUND 4 ASSUMPTIONS` and
nothing else - no status table, no findings table, and no entry recording P1 at all.

**Why it is a defect.** A record says a finding was filed; the ledger, which is the file that holds
findings, has never heard of it. The 105 instances are the largest single thing this round measured
and the artifact's own argument for not fixing them is that they are "left marked, counted, and named"

- the naming is the part that carries them to the next round, and it did not happen. The absent P1
  entry compounds it: at `b04d9f1` the ledger records that a records check is on the work list and
  records no outcome for it, so a reader of the ledger alone cannot tell the gate exists.

## F10 - "every one is a positive control" is false for 18 of the 34 tests

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 210 to 211: "Every one is a positive control: it
builds a throwaway document tree with a known defect and asserts the checker still refuses it." The
same sentence appears in the spec's own header comment, followed by the reason it matters: a checker
that stops matching "does not fail. It passes, on every document, forever".

**Checked.** The suite is 34 tests and 15 of them assert `toEqual([])`, that is, that the checker finds
**no** defect - the literal opposite of a positive control. Three more (`slug`, duplicate anchors,
headings inside a fence) never call `checkRecords` at all.

```console
$ cd $S/wt && echo "it blocks: $(grep -c '^  it(' tools/check-records.spec.mjs)"; echo "asserting no defects: $(grep -c 'toEqual(\[\])' tools/check-records.spec.mjs)"; echo "not calling checkRecords: $(awk '/^describe\(.slug/,/^}\);/' tools/check-records.spec.mjs | grep -c '^  it(')"
it blocks: 34
asserting no defects: 15
not calling checkRecords: 3
```

**Why it is a defect.** The claim is the round's stated evidence that the gate cannot silently rot, and
it is wrong about more than half the suite. The suite is not worthless - 16 real positive controls
would fail if `checkRecords` degraded to returning nothing - but the count as published overstates the
protection, and the negative controls it silently includes are the tests most likely to keep passing
while a regex quietly stops matching. F1, F4 and F5 are three exemption paths that the suite's 16
positive controls do not cover.

## F11 - the `cite-historical` accounting counts one marker twice

<!-- cite-historical: src/app/app.config.ts:38-41 - quoted below only to identify which of the ledger's markers is being counted twice. It names lines past the end of a 38-line file, which is the defect R0-2 records; resolving it would delete the thing being discussed. -->

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 174 to 179: "**Two citations past the end of a file**,
both deliberate and now marked", then "**Seven citations describing pre-fix code**, marked
`cite-historical`". The ledger's Citation bindings preamble says a `cite-historical` entry names "the
location a finding described before it was fixed, or - twice - a location that never existed".

**Checked.** There are exactly seven `cite-historical` entries in the ledger and one more in
`reviews/REVIEW-0.md`, and each suppresses exactly one citation occurrence. Of the ledger's seven, one
is `src/app/app.config.ts:38-41`, whose own marker text reads "R0-2 quotes a citation that pointed
past the end of a 38-line file" - which is the out-of-bounds case, not pre-fix code. The two
out-of-bounds citations are that one plus `reviews/REVIEW-0.md` line 5.

**Why it is a defect.** The ledger entry describing pre-fix code numbers six, not seven; the
out-of-bounds marker is counted in both paragraphs. Symmetrically, the ledger's "twice" is once: only
one of its own seven entries names a location that never existed, the second being in a different
document whose markers the ledger's list does not govern. Small, but this is a round whose subject is
records arithmetic, and rule 4 does not know these numbers.

## F12 - rule 1 does not look at links without an anchor, and one in the records is dead

**Claimed.** Rule 1 answers R3-12, "a ledger link died when the heading it pointed at was renamed".
The rules table describes it as refusing "a markdown link to a `#anchor` that no heading in the target
file slugs to".

**Checked.** `LINK` (line 73 at `b04d9f1`) requires a `#` in the href, so a link with no anchor is
never examined, including for whether its target exists. Sweeping every markdown link in all 26
records for a missing target finds one live case, in a file this branch edited:

```console
$ cd $S/wt && sed -n '6p' reviews/ARTIFACTS-round3.md; test -e reviews/reviews/BASELINE-round3.md; echo "TARGET_EXISTS_EXIT=$?"; node tools/check-records.mjs; echo "GATE_EXIT=$?"
Baseline for every "green" claim here: [`reviews/BASELINE-round3.md`](reviews/BASELINE-round3.md).
TARGET_EXISTS_EXIT=1
records: 26 documents checked, no defects
GATE_EXIT=0
```

The link sits inside `reviews/`, so `reviews/BASELINE-round3.md` resolves to
`reviews/reviews/BASELINE-round3.md`, which does not exist. `reviews/ARTIFACTS-round4.md` gets the
equivalent link right, with a bare `BASELINE-round4.md`.

**Why it is a defect.** A dead link from a round's artifact to its baseline is the class of defect
rule 1 was written for, it is present in the tree right now, and the gate passes it. The blind spot is
one character of regex wide and is not listed among the stated blind spots. The stale link itself is
inherited from round 3 rather than introduced here, so it is the coverage gap that is this round's
finding, not the link.

## F13 - rule 3 accepts a fabricated label from any command line that merely contains the word `echo`

**Claimed.** Rule 3 refuses "a ```console fence printing a `NAME=` line that no `echo` in the fence
could have produced".

**Checked.** `noteEchoes` splits the command text on the bare word `echo` and harvests any `NAME=` up
to the next `;`, `|` or `&&`, without regard to quoting. A command that cannot print the label but
mentions it after the word `echo` inside a quoted argument is accepted:

````console
$ mkdir -p $S/fn/reviews && printf '# F\n\n```console\n$ grep -c "echo GATE_EXIT=" /dev/null\nGATE_EXIT=0\n** TEST SUCCEEDED **\n```\n' > $S/fn/reviews/FAKE.md; node $S/fn/run.mjs; echo "FALSE_NEGATIVE_EXIT=$?"
0 defect(s)
FALSE_NEGATIVE_EXIT=0
````

`$S/fn/run.mjs` imports `checkRecords` from the worktree and runs it over that one document with empty
`tracked` and `changed` sets. A `grep` cannot print `GATE_EXIT=0`, and the `** TEST SUCCEEDED **` line
beneath it is unconstrained by any rule.

**Why it is a defect.** It is the exact class rule 3 claims to refuse, and it passes. It is contrived
as written, but the same hole is reached by ordinary means: any command line that greps or cats a
script containing echoes will license every label named in it. Worth recording as a stated blind spot
rather than fixed, since the honest two-step form the rule already accepts is nearly indistinguishable.

## Verdict

**REJECT.**

The engineering underneath is good, and this review wants to be clear about that: the four
non-vacuity proofs reproduce byte-for-byte, all 24 citation bindings are correct, the nine-stale-
citation table is accurate to the occurrence count, the 105-instance census figure and its
eleven-file spread are right, the baseline record reproduces on all eight gates that could be re-run,
and rule 2 genuinely caught nine real stale citations that three rounds of human reading missed. B is
a real demonstration of a real hazard.

It is rejected on three findings that are not cosmetic. F1: the document carrying all of this round's
evidence removes itself from three of the four rules by naming them in prose, and unfreezing it
surfaces 24 defects including nine unbound stale citations in the very table announcing that stale
citations have been eliminated. F3: the gate enforces the baseline's coverage as the round's, so it
refuses the tree's true coverage and accepts a superseded one - R3-1's shape, given the authority of a
gate. F5: rule 2's content binding is empty whenever `main` resolves to `HEAD`, so the round's answer
to R3-20 stops working the moment this branch is merged, and the same code path takes `npm run lint`
red where `main` is absent.

F2 and F7 compound them: the two transcripts that certify the commit and quantify the exemptions are
each unreproducible at the state they are published against, in a round whose thesis is that
transcripts must be single executions. F4, F6, F8, F9, F10 and F11 are individually small and none of
them alone would block, but every one is an instance of a shape this round was convened to end - a
wrong figure, a wrong file name, a finding named but never filed, a claim about a test suite that the
suite does not support, a count that adds one thing twice - and eight of the thirteen findings here
are in the single document that argues the class has been eliminated. That concentration is itself the
result: the gate is real and it works, but it does not yet cover the records this round produced, so
the class is not closed.

The remedy is small and mostly mechanical, which is the encouraging part: detect the marker regexes
matching inside backticks or code spans and refuse that rather than honouring it, move `FIGURES` to the
tip and re-measure it there, decide explicitly what rule 2 should do when `main` is not behind `HEAD`
instead of silently passing, and re-run the two transcripts in F2 and F7 at the commit they are
published against.

Not blocking, and offered as context rather than as findings: gate 5 was not re-run for the reason
given at the top, and `swiftformat` reports "2 files skipped" in a pristine worktree against the
record's "3 files skipped", which is untracked `ios/build/` output present in the developer's checkout
and not a discrepancy in the record.
