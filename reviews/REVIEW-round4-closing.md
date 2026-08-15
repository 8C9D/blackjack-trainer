# REVIEW - round 4, closing

Range reviewed: `934f9e9..2ac2a68`, seven commits: the stage-6 review record itself (`296e71c`), the
K7 comment restatement (`abe1631`), the stage-6 remediation (`6dbd932`), the commit that names its
tree (`c728c68`), the K8 proposal (`f4fe4f9`), the merge of four rounds into `main` (`599da6c`), and
the citation re-resolution the merge forced (`2ac2a68`). None had been read by fresh eyes. The
ledger's own limit section asked for exactly this: "Whoever picks this up should read
REVIEW-round4-stage6 and diff the remediation commits against it before trusting either." That is
what this review does, plus the merge, which the limit section could not have anticipated.

The remediation is honest work: eleven of the twelve stage-6 findings are answered on the terms the
review stated them, every figure I re-measured reproduces at the named tree, and the one code change
does what its record says and nothing else. But the range then produced two new records defects of
the round's own defect class, one of them in the very row that files the answer to four stage-6
findings, and the merge landed on `main` with gate 1 red. Both are blocking.

**Naming.** Stage-6 findings are cited as `stage-6 F1` .. `F12`. My own findings are `F1` .. `F5`.

## How I worked

Everything below was measured in the live checkout at `2ac2a68` (= `HEAD`), whose `tools/`, `src/`,
`e2e/` and `ios/` trees are byte-identical to `6dbd932`'s - verified by an empty
`git diff 6dbd932 HEAD` over those paths - so a measurement here is a measurement at the tree the
gate table names. For per-commit claims I used detached worktrees, so the branch itself was never
switched. I re-ran gates 1 to 4 and 6 in full; I did not re-run gate 5 or gates 7 to 9, because
nothing in the range touches `src/`, `e2e/`, `playwright.config.ts`, `angular.json`, `public/` or
`ios/` (empty diffs, re-verified against `4ad4d24` for the iOS set), and the E2E and iOS rows carry
their own commits in the table.

Each stage-6 finding was verified against the source it names, not against R4-10's resolution text.
Where the remediation claims a measurement, I repeated it: the document count at every commit in the
range, the unit-test count and coverage twice over, the per-file checker quadruple by the artifact's
own published reporter edit, and the stage-6 F7 mutation against the shipped spec.

## The gates, re-run

| #   | gate          | exit | result                                                                     |
| --- | ------------- | ---- | -------------------------------------------------------------------------- |
| 1   | lint          | 0    | `tsc` x3 + prettier + the records gate: 33 documents, no defects at `HEAD` |
| 2   | build         | 0    | the inherited chart-page budget warning (P2-2), unchanged                  |
| 3   | unit tests    | 0    | 68 files, 1620 passed                                                      |
| 4   | coverage gate | 0    | 96.05 / 92.91 / 93.48 / 97.86                                              |
| 6   | parity        | 0    | `git diff --exit-code -- ios/Fixtures` clean                               |

```console
$ npm run lint > /tmp/claude/lint-hd.txt 2>&1; echo "LINT_EXIT=$?"; tail -1 /tmp/claude/lint-hd.txt
LINT_EXIT=0
records: 33 documents checked, no defects
```

The 33 is right for `HEAD`: `f4fe4f9` added the proposal under `reviews/`, which the gate reads. The
gate-1 row's 32 is right for the tree it names - see Q1. This review is itself a 34th document the
gate reads: the transcript above was taken before this file existed, and the same command re-run
with this file in the tree prints `records: 34 documents checked, no defects`, which is what the
commit carrying this review measures.

## Q1 - did `6dbd932` answer the twelve stage-6 findings on their own terms?

Eleven yes, one filed-but-invisible (F1 below). Each verified at the source:

**stage-6 F1** (gate table false at the tree it names): answered. The table now names `6dbd932`,
and the gate at that tree prints what the row says:

```console
$ for c in 934f9e9 296e71c 6dbd932 f4fe4f9 599da6c 2ac2a68; do echo "$c: $(git ls-tree -r $c --name-only | grep -cE '^(PROD-READINESS|LAUNCH-CHECKLIST)\.md$|^reviews/.*\.md$') docs"; done; node tools/check-records.mjs
934f9e9: 31 docs
296e71c: 32 docs
6dbd932: 32 docs
f4fe4f9: 33 docs
599da6c: 33 docs
2ac2a68: 33 docs
records: 33 documents checked, no defects
```

I also ran the checker in a worktree at every branch-side commit in the range: exit 0 at all six,
printing 32 at `296e71c`, `abe1631`, `6dbd932` and `c728c68`, 33 at `f4fe4f9` and `2ac2a68`. The
merge commit is the exception, and it is F2.

**stage-6 F2** (two trees named for one run, superseded paragraph kept, "table above" from above
the table): answered. One narrative stands (`PROD-READINESS.md:765` to `:777`); the second attempt
is deleted, not kept alongside; the `92c5ad0`-against-`c024fec` ambiguity is recorded as
unresolvable rather than silently picked; "the table above" now appears only inside the historical
description of the defect (`PROD-READINESS.md:773`).

**stage-6 F3** (counts): answered. "All 66" is gone and the limit section now states no volatile
figure; the regression table says ten (two refused, eight found) over ten rows; the protocol
section says six reviewers over a six-row table; the honest-split paragraph
(`PROD-READINESS.md:704` to `:711`) now counts four fixes, five reviewers and a sixth review,
which matches the record.

**stage-6 F4** (headroom from a jitter run): answered. 92.91 - 92 = 0.91, stated at
`PROD-READINESS.md:811`, and K6's row agrees.

**stage-6 F5** (per-file quadruple reproducible at no commit): answered. The artifact's published
reporter edit at `HEAD` - whose checker is byte-identical to `6dbd932`'s - prints exactly the
replacement figure:

```console
$ sed -i '' "s/reporter: \['text-summary'\],/reporter: ['text-summary', 'json-summary'],/" vitest.config.ts && npm run test:coverage > /tmp/claude/cov1.txt 2>&1; echo "COV_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' /tmp/claude/cov1.txt | grep -E "Test Files|Tests |Statements|Branches|Functions|Lines  "; node -e '
const s=require("./coverage/blackjack-trainer/coverage-summary.json");
const k=Object.keys(s).find(f=>f.includes("check-records.mjs")); const m=s[k];
console.log("checker: "+m.statements.pct+" / "+m.branches.pct+" / "+m.functions.pct+" / "+m.lines.pct);
'; git checkout -- vitest.config.ts; echo "REVERTED=$?"
COV_EXIT=0
 Test Files  68 passed (68)
      Tests  1620 passed (1620)
Statements   : 96.05% ( 5582/5811 )
Branches     : 92.91% ( 2530/2723 )
Functions    : 93.48% ( 961/1028 )
Lines        : 97.86% ( 4303/4397 )
checker: 94.11 / 87.89 / 100 / 95.33
REVERTED=0
```

This one run confirms the gate-3 row, the gate-4 row, the pin `FIGURES.unitTests` (moved from
1619 to 1620 - the one `FIGURES` edit in `6dbd932`, disclosed in the limit section), and the
per-file quadruple at `PROD-READINESS.md:808`.

**stage-6 F6** (stage-5 review unfrozen): answered. Both stage-5 and stage-6 now open with a
`historical-file` marker that names the remediation as the editor and states why the freeze
preserves rather than falsifies; citations stay resolved and bounds-checked, and the gate is green
with both in place.

**stage-6 F7** (one unfixtured guard): answered, and the fixture is live. Reapplying the stage-6
mutation - honour a `figure-historical` marker on the raw line, code or not, at
`tools/check-records.mjs:557` - is now killed by exactly the new test:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; cp tools/check-records.mjs $S/orig.mjs; node $S/mutate-f7.mjs; npx vitest run tools/check-records.spec.mjs 2>&1 | grep -E "does not honour|Tests  "; cp $S/orig.mjs tools/check-records.mjs; git diff --quiet -- tools; echo "RESTORED=$?"
     × does not honour a figure-historical marker printed inside a code block 6ms
 FAIL  tools/check-records.spec.mjs > rule 4: figures > does not honour a figure-historical marker printed inside a code block
      Tests  1 failed | 67 passed (68)
RESTORED=0
```

**stage-6 F8 to F10 and F12** (rule 3's line reading): recorded as K9 rather than patched, which
is what the round's rules require and what R4-10 says. But the filing itself is defective - F1
below - so I am not counting this one answered.

**stage-6 F11** (overclaim about the deletion): answered; the sentence is gone with the section
that carried it.

Beyond the twelve, R4-10's own resolution claims check out: the artifact's spec transcript was
re-run whole and prints the count the command prints today (`reviews/ARTIFACTS-round4.md:343`), the
"published wrong five times" enumeration now counts five, and R4-5's dragged figure cell is
restored: the test count and both quadruples in that cell byte-match the R4-5 text as `4ad4d24`
committed it, with the `figure-historical` marker and a sentence naming the drag.

## F1 - K9 is filed inside K8's table row and renders nowhere

**What is claimed.** `PROD-READINESS.md:752`: "Six findings discovered while verifying others (K4 to
K9) are in ROUND 4 NEXT ROUND". R4-10's resolution: "F8 to F10 and F12 are recorded as K9 rather
than patched unreviewed."

**What I did.** Counted cells in the NEXT ROUND table's source.

```console
$ awk 'NR==722' PROD-READINESS.md | grep -o '|' | wc -l | tr -d ' '; awk 'NR==726' PROD-READINESS.md | grep -o '|' | wc -l | tr -d ' '; awk 'NR==726' PROD-READINESS.md | grep -c 'K9' | tr -d ' '
5
10
1
```

**Why it is a defect.** The table has four columns, so a well-formed row has five pipes - K4's line
(`PROD-READINESS.md:722`) has exactly that. Line 726 has ten: `6dbd932` wrote the entire K9 row onto
the end of K8's line, as cells six through nine of a four-column row. GitHub-flavored markdown
ignores a row's cells beyond the header's count, so the rendered NEXT ROUND table has five rows, K4
to K8, and K9 - id, severity, all five measured holes, and the reason they are deferred - appears
nowhere on the rendered page. The sentence introducing the table promises six findings above a table
that shows five; the R4-10 row claims four stage-6 findings are "recorded" in a record a reader
cannot see; and the round-5 brief inherits a K9 that exists only for someone reading the raw source.
Neither machine check catches it - prettier accepts the line and the records gate has no rule about
table shape - which is the round's own first conclusion, demonstrated one more time. This is the
blocking shape stage-6 F1 and F2 were: the record asserting something the record does not do.

## F2 - "gate 1 is re-run and green at each" - it is measured red at the merge

**What is claimed.** `PROD-READINESS.md:762` to `:763`: "Any commit after the named one changes this
ledger only, and gate 1 - the one gate that reads records - is re-run and green at each."

**What I did.** Ran the records gate in a detached worktree at the merge commit.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; git worktree add --detach $S/wt599 599da6c > /dev/null 2>&1; ln -sfn "$PWD/node_modules" $S/wt599/node_modules; (cd $S/wt599 && node tools/check-records.mjs); echo "GATE_AT_599=$?"
records: 2 defect(s)
  PROD-READINESS.md:103: .github/workflows/ci.yml:79-81 no longer contains "E2E_SERVER: dist"
  PROD-READINESS.md:111: .github/workflows/ci.yml:19 no longer contains "- run: npm run lint"
GATE_AT_599=1
```

**Why it is a defect.** Both halves of the sentence are false at `HEAD`'s history. Gate 1 exits 1 at
`599da6c`: `abaa239` on `main` inserted a five-line concurrency block into `ci.yml` above line 9,
the merge carried it in, and the two bindings that pointed below it broke. `2ac2a68` re-resolved
them 43 seconds later - correctly, see Q3 - but the sentence claiming green-at-each was left
standing over a history that now contains a measured red commit, on `main`, where `ci.yml:24` runs
this very gate on every push. And "changes this ledger only" is also false twice over: `f4fe4f9`
adds a file under `reviews/`, and the merge brings in two workflow files, `.gitignore` and four
`.agents/` skill files. The sentence was true when `c728c68` committed it; nobody re-read it when
the range kept moving - which is stage-6 F1's mechanism ("a table whose named tree moved forward
past it"), reproduced in the remediation of the review that named it. Blocking, because it is a
false gate claim in the live ledger, not history: the ledger says every post-`6dbd932` commit held
gate 1 green, and one did not.

## F3 - the proposal calls the closing section a worked example of a rule the section breaks

**What is claimed.** `reviews/PROPOSAL-round5-volatile-figures.md:68` to `:70`: round 4's
remediation "practiced the discipline by hand instead - its closing table names `6dbd932`, its
prose points at the table, and the suite size lives in one transcript - so round 5 inherits both
the design and a worked example of the target state." K8's row (`PROD-READINESS.md:726`) repeats
it: "practiced it by hand in this ledger's closing section."

**Why it is a defect.** The design's own item 2 (`:33` to `:39`) allows volatile figures "only
there" - the marker-named gate table - "and in transcripts", and refuses "_any_ match of a volatile
pattern" elsewhere, "including a value that happens to be correct today". The closing section's
bullet list directly under the table (`PROD-READINESS.md:800` to `:812`) states, in prose outside
any table or fence: the unit-test count and its baseline, the E2E count move, the current and
baseline coverage quadruples, the per-file checker quadruple, and the branch headroom. Every one is
a volatile-pattern match the proposed rule would refuse (two would escape only through the bare-100
regex hole the same range files under K9). The limit section genuinely practices the discipline;
the bullets are the majority of the volatile figures in the closing section and they do not. "A
worked example of the target state" overclaims in a design record, the same shape as stage-6 F11.
Not blocking: the design itself is coherent, its migration-sweep paragraph even predicts these
bullets would need rewriting, and nothing false is stated about any figure's value.

## F4 - the merge's citation sweep stopped at the ledger

**What is claimed / what happened.** `2ac2a68` re-resolved both broken `ci.yml` bindings and both
prose citations in the ledger. `reviews/ARTIFACTS-round4.md:253` (the round's re-resolution table:
"`.github/workflows/ci.yml:48-50`" re-resolved to "`:79-81` - the CI job where `CI=true` disables
reuse") and the marker at `reviews/ARTIFACTS-round4.md:793` still name 79-81, which since the merge
is five lines short of the content.

**Why it is a defect.** The ledger's own convention updates these notes when the target moves again:
its `cite-historical` for `playwright.config.ts:6` says "the declaration is now at line 14". The
artifact's two 79-81 references are bare and unbound, so the gate cannot see them, and a reader sent
to 79-81 today lands inside the anti-drift step. Minor and not blocking - both sentences are true as
statements about what round 4 did - but it is drift the re-resolution commit was for, in the one
records file that logs re-resolutions.

## F5 - the round's change inventory misses its own last code edits

"What round 4 actually changed" (`PROD-READINESS.md:728` to `:744`) lists nine rows and none names
`tools/serve-dist.spec.mjs`, which `abe1631` - a round-4 branch commit inside this range - edited
for K7. The gates paragraph (`PROD-READINESS.md:757` to `:759`) describes `6dbd932` as "the round's
last commit that changes code or tests: it adds one fixture to the gate's own spec", although the
same commit also edits `tools/check-records.mjs` (the `FIGURES` pin). Both facts are stated
correctly elsewhere - the K7 row says the comment was taken, the limit section lists all three code
touches - so this is an incomplete inventory, not a false one. Not blocking.

## Q3 - the merge, judged as a merge

Sound, apart from F2 and F4. The main side was three commits: CI concurrency (`abaa239`), four
`.agents/` skill files (`692750a`), and a `.codex/` ignore (`ca67989`). Both true conflicts
(`ci.yml`, `.gitignore`) resolved to the union - the merged `ci.yml` keeps the concurrency block and
the round's E2E job; the merged `.gitignore` keeps `/site` (K1) and `.codex/`. On the citation
sweep: `abaa239` shifted everything in `ci.yml` from line 9 down by five, and the two re-resolutions
in `2ac2a68` are exactly right (`- run: npm run lint` is at 24; `E2E_SERVER: dist` sits in 84-86) -
verified at the file, not the diff. `ci.yml:3-7` (`pull_request:`) sits above the insertion and did
not move. `ios-ci.yml` also gained a concurrency block, but at line 15, below the `paths:` filter
the ledger cites at `ios-ci.yml:6` - the citation holds, verified at the file. `pages.yml` was
untouched by `main`. No tracked file outside the seven commits' stated scope changed, and the
skill files and `.codex/` are cited by no record.

## Q4 - the proposal against the ledger

Internally, the proposal's history section is accurate: its six-instance count matches K8's row, its
stage-6 additions (F1, F3, F5) match the review, and "Nothing here is implemented" is true -
`tools/check-records.mjs` at `HEAD` contains no gate-table marker logic, and the only `FIGURES`
change in the range is the unit-test pin moving with the new fixture. The one claim that does not
survive contact with the ledger is the worked-example sentence - F3 above.

## What I checked and did not find a defect in

- **The stage-6 review as a record** (`296e71c`): its transcripts' figures match the trees it names
  (31 documents at `934f9e9`; the checker suite one smaller than after the fixture landed), and the
  freezing marker added later correctly describes what moved.
- **K7's restatement** (`abe1631`): the new comment's load-bearing claim - `tsconfig.spec.json`
  includes only `src/**` - is true at `tsconfig.spec.json:14`; `@types/node` is a devDependency as
  M1 recorded; the K7 row's description of the new rationale matches the comment as shipped.
- **The freeze markers** on stage 5 and stage 6 lift only what the freezing principle lifts, and the
  gate stays green with them.
- **The one code change**: `6dbd932`'s diff to `tools/check-records.mjs` is the pin move and nothing
  else - "no line of the gate's logic changed" is exactly true - and the new fixture is live (the
  Q1 F7 transcript).
- **Gate rows I could reproduce** all reproduce exactly: gates 1 to 4 and 6 (table above), the
  document count at every commit, the per-file quadruple, the headroom, and the empty `ios/` diff
  since `4ad4d24`.
- **K9's content, live**: the first draft of this review put its transcripts inside an indented
  list, and the gate refused all three honest exit labels as printed by "no command" - stage-6
  F12's false positive, the fourth item in the K9 row nobody can render, biting the first reviewer
  after it was filed, exactly as the stage-6 review predicted. The fences in this file are top-level
  for that reason.
- **Out of range, for the next sweep**: `reviews/ARTIFACTS-round4.md:790`'s note says the CI
  retries citation was re-resolved "to 26", while the binding pins `playwright.config.ts:29` and
  the content is there; the note predates this range (`f538ad6`) and stopped being updated one move
  before F4's two did.

## Verdict

**REJECT.**

F1 and F2 are blocking, and both are records - which the ledger itself predicted: "six reviews have
shown where the defects live, and nothing about this remediation is exempt from that lesson." The
K9 filing, the remediation's answer to a third of the stage-6 findings, is written into a table
position that markdown renders as nothing, under a sentence promising six rows where five appear
(F1). The gates paragraph asserts gate 1 green at every commit after the named tree, and the merge
commit in that set fails it, measured, with two defects (F2). Everything else holds: eleven of
twelve stage-6 findings are answered on their stated terms with every re-measurable figure
reproducing at the named tree, the merge's conflict resolutions and citation re-resolutions are
correct and complete for the ledger, the one code change is exactly what the record says, and the
proposal is a sound design whose only defect is flattering the section next to it (F3). The
remediation to this review is small: render K9 as a row, restate the green-at-each sentence to what
the history now shows, and sweep the two artifact references the merge moved.
