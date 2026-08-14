# REVIEW - round 4, stage 6

<!-- records: historical-file - an answered review. Its figures and transcripts were true at the tree it reviewed (the tip of `c024fec..HEAD`) and were checked by this gate when it was written; the remediation it prompted moved the unit-test count and the ledger lines it cites by line number. Rewriting a reviewer's evidence to match a later tree would destroy the record. Citations here are still resolved and bounds-checked. Marker added by the remediation that answered it, per the ledger's freezing principle. -->

Range reviewed: `c024fec..HEAD`, four commits, centred on `92c5ad0` ("delete the hand-rolled block
parser and ask the one prettier already runs"). The ledger's own closing section asked for this
review: the parser delegation is the largest single edit to the gate in the round and it landed
unreviewed, with the stated expectation that a sixth reviewer "would very likely find something, and
the honest expectation is a records defect rather than a hole in the gate."

Both halves of that expectation are met. The records defects are blocking; the holes in the gate are
latent, inherited from the base of the range, and none is a regression. This is the first cycle in
the round where the remediation left the gate strictly stronger than the commit before it on every
input I could construct, and the first where the recurring defect - a directive honoured where a
reader sees code - did not reappear.

## How I worked

I exported two read-only checkers into the scratchpad: `base/` at `06332d9` (the last `lines()`
checker) and `pin/` at `92c5ad0`, verified byte-identical to the file at `HEAD`. Every fixture below
runs against both, so "inherited" and "introduced" are measured rather than guessed. Each fixture is
also parsed by prettier's own CommonMark parser - the parser `parseDoc` now delegates to - and passed
through `prettier --check`, so I can say whether a fixture could survive `npm run lint`, which is
`typecheck && format:check && node tools/check-records.mjs` (`package.json:15`).

I mutation-tested the shipped spec twice: once guard-by-guard, and once by deleting the whole parse,
to establish which fixtures actually pin the delegation. I swept the live records for every hole I
found. And I re-measured every figure the range publishes: the unit-test count and coverage twice
end-to-end, the per-file checker quadruple twice by the artifact's own published reporter edit, the
gate's document count at all four commits, and the spec's size.

## What the parser delegation gets right

The three stage-5 escapes are closed at the tip and still open at the base, each confirmed by running
the stage-5 fixture shape against both checkers: an indented `transcript-literal` no longer disarms
rule 3, a fence with a two-word info string is a fence again, and a marker inside a blockquoted code
block is code. No fixture I constructed is accepted by the tip and refused by the base - the
regression direction that blocked stages 4 and 5 is empty this time.

The 17 escape-spelling fixtures are live, not decorative. Deleting the parse wholesale (every line
prose, every span unblanked) turns 24 of the 67 tests red, including all 17:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/0ddf9ae3-44fa-4ed7-8501-e7b6686d68ca/scratchpad; cd $S && node mutall.mjs | tail -2
 Test Files  1 failed (1)
      Tests  24 failed | 43 passed (67)
```

Guard-by-guard, nine of eleven targeted mutations are killed, among them every consumer of the parse:
`isCode`, `applied`, `directiveText`, `lastDirectiveLineBefore`, the rule-2 and rule-4 code-line
skips, and the `console`-only fence walks in rules 3 and 4. The two survivors are F7 below and one
mutation that makes the gate stricter rather than weaker, which is not a concern.

The figures the commit pins are the figures the tree produces. Two full runs:

```console
$ npm run test:coverage > $S/cov1.txt 2>&1; echo "COV1_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/cov1.txt | grep -E "Tests |Statements|Branches|Functions|Lines  "
COV1_EXIT=0
      Tests  1619 passed (1619)
Statements   : 96.05% ( 5582/5811 )
Branches     : 92.91% ( 2530/2723 )
Functions    : 93.48% ( 961/1028 )
Lines        : 97.86% ( 4303/4397 )
```

The second run repeated the count and printed 92.94% branches - the documented one-branch jitter,
inside the tolerance rule 4 carries for it. Both match `tools/check-records.mjs:63` and
`tools/check-records.mjs:64`. The lint chain is green end to end at `HEAD`:

```console
$ npm run lint > $S/lint1.txt 2>&1; echo "LINT_EXIT=$?"; tail -1 $S/lint1.txt
LINT_EXIT=0
records: 31 documents checked, no defects
```

That last line is also F1.

## F1 - the closing gate table is false at the tree it names, for the third commit running

**What is claimed.** `PROD-READINESS.md:755`, rewritten by `934f9e9`: "All nine re-run at `92c5ad0`".
The gate-1 row at `PROD-READINESS.md:782` reports "the records gate: 29 documents, no defects".

**What I did.** Counted the records documents at every commit in the range, and ran the gate.

```console
$ for c in aadd4b5 06332d9 92c5ad0 934f9e9; do echo "$c: $(git ls-tree -r $c --name-only | grep -cE '^(PROD-READINESS|LAUNCH-CHECKLIST)\.md$|^reviews/.*\.md$') docs"; done; node tools/check-records.mjs
aadd4b5: 29 docs
06332d9: 30 docs
92c5ad0: 31 docs
934f9e9: 31 docs
records: 31 documents checked, no defects
```

**Why it is a defect.** The row was true at `aadd4b5` and has been false at every commit since:
`06332d9` added the stage-4 review and `92c5ad0` added the stage-5 review, so the gate at the commit
the table now names prints 31, not 29. Stage-5 F6 reported exactly this figure at exactly this row
when it was one document stale; the R4-9 resolution row says "the figures re-measured", and this one
was not - it is now two documents stale in a table whose named tree moved forward past it. A closing
table that names its tree and then states another tree's output is the R4 defect class in one row.

## F2 - the commit that names the tree left the ledger naming two

**What is claimed.** `934f9e9`'s message is "name the tree the closing gate table measured". Its diff
replaces the section opening with "All nine re-run at `92c5ad0`" and "so only the single closing run
needed repeating here. That is the `115 passed` in the table above."

**What I did.** Read the section as it stands at `HEAD`, `PROD-READINESS.md:755` to
`PROD-READINESS.md:778`.

**Why it is a defect.** Three ways.

1. The paragraph `934f9e9` superseded was not removed. `PROD-READINESS.md:768` still opens "That
   distinction is here because the first version of this section did not make it" and retells the
   same stage-3 F1 story the new paragraph at `PROD-READINESS.md:762` tells ("This paragraph is the
   third attempt at it"), down to a shared closing sentence. The section now records its own second
   attempt as if it were still current, twice.
2. The two paragraphs contradict each other about the round's closing gate-5 run. The new one says
   all nine gates were re-run at `92c5ad0`; the leftover at `PROD-READINESS.md:776` says "The single
   closing run in the table above is at `c024fec`". Two trees are named for one measurement, by the
   commit whose one purpose was to name the tree, and nothing in the record says which is true. I
   also note the direction of travel: `aadd4b5` had carefully hedged that gates 7 to 9 last ran at
   `4ad4d24` with the evidence (`git diff --name-only 4ad4d24..HEAD -- ios/` empty, which I
   re-verified), and `934f9e9` replaced that hedge with the stronger unevidenced claim.
3. Both paragraphs say "the table above". The gate table is below both of them, at
   `PROD-READINESS.md:780`.

## F3 - the counts the rewrite left behind, including the suite size wrong for a fifth time

**What is claimed.** Four places in the ledger state counts about the round's own review history and
test suite.

**What I did.** Ran the suite and read the four places.

```console
$ npx vitest run tools/check-records.spec.mjs 2>&1 | grep "Tests "
      Tests  67 passed (67)
```

**Why it is a defect.** Each is contradicted by the tree or by the ledger itself:

- `PROD-READINESS.md:889` says "all 66 of the checker's own tests pass". The suite is 67, and the
  same ledger says so at `PROD-READINESS.md:796` ("67 for the records gate's own spec"). Stage-4 F1
  called the suite size "wrong for the fourth time"; this is the fifth, in the commit that answered
  stage 5.
- `PROD-READINESS.md:838` says "Four fresh reviewers, four REJECTs, four remediation cycles" directly
  above a stage table with five rows, the fifth added by `92c5ad0` itself.
- `PROD-READINESS.md:705` says the recurring defect "survived **two** fixes" and then enumerates
  three; `PROD-READINESS.md:708` says "It took **four** independent reviewers to close it" while the
  conclusions rewritten by `92c5ad0` say five reviewers found the escapes and that the fourth fix was
  not the one that closed the class. The paragraph describes the state of the round as of stage 4 and
  was left standing under conclusions that supersede it.

## F4 - the branch headroom is derived from a run the pin does not record

**What is claimed.** `PROD-READINESS.md:801`: "Branch headroom over the 92 floor is 0.94; finding
K6." The pinned branch figure two lines above, and in `FIGURES`, is 92.91. K6's own row at
`PROD-READINESS.md:722` says "0.91 points (92.91% against a floor of 92)".

**Why it is a defect.** 92.91 minus 92 is 0.91. The 0.94 is real arithmetic on a different run - my
second coverage run printed 92.94%, the one-branch jitter the tolerance exists for - so the ledger
derives the headroom from one run and pins the quadruple from another, three lines apart, and
disagrees with its own K6 row. Small, but it is the "two values for one figure" shape rule 4 exists
to refuse, in the one place rule 4 cannot see it.

## F5 - the per-file checker quadruple does not reproduce at any commit in the range

**What is claimed.** `PROD-READINESS.md:800`: the report gained `tools/check-records.mjs`, "covered
at 94.13 / 87.89 / 100 / 95.39". <!-- figure-historical -->

**What I did.** Ran the artifact's own published reporter edit twice at `HEAD`, whose
`tools/check-records.mjs` is byte-identical to `92c5ad0`'s.

```console
$ sed -i '' "s/reporter: \['text-summary'\],/reporter: ['text-summary', 'json-summary'],/" vitest.config.ts; npm run test:coverage > $S/cov2.txt 2>&1; echo "COVERAGE_EXIT=$?"; node -e '
const s=require("./coverage/blackjack-trainer/coverage-summary.json");
const k=Object.keys(s).find(f=>f.includes("check-records.mjs")); const m=s[k];
console.log("checker: "+m.statements.pct+" / "+m.branches.pct+" / "+m.functions.pct+" / "+m.lines.pct);
console.log("raw: statements "+m.statements.covered+" of "+m.statements.total);
'; git checkout -- vitest.config.ts; echo "REVERTED=$?"
COVERAGE_EXIT=0
checker: 94.11 / 87.89 / 100 / 95.33
raw: statements 272 of 289
REVERTED=0
```

**Why it is a defect.** Both runs print 94.11 / 87.89 / 100 / 95.33. No count over this file's 289
statements yields the stated 94.13, so the stated figure was not measured at this file - it was
measured at one of the intermediate working-tree states the stage-5 reviewer watched being rewritten,
and published against `92c5ad0`. The statement and lines components are wrong by hundredths and
nothing turns on them; what turns is that a figure in the closing section cannot be reproduced at any
commit that exists.

## F6 - the ledger's new freezing principle is violated by the commit that states it

**What is claimed.** `PROD-READINESS.md:874` to `PROD-READINESS.md:876`: "an answered review is
marked `historical-file`, because a reviewer's evidence was true when written and must not be
rewritten to match a later tree." `92c5ad0` added that marker to the stage-1 to stage-4 reviews.

**Why it is a defect.** `92c5ad0` also landed `reviews/REVIEW-round4-stage5.md` - an answered review;
the same commit is its answer - with no marker. The review cites the checker it reviewed by line
(`tools/check-records.mjs:141`, `:468`, `:477`, `:566` and others) and the same commit deleted that
implementation, so every one of those citations now resolves into unrelated lines of the rewritten
file. They pass rule 2 today only because the new file happens to be long enough to bounds-check. The
review that produced the round's final code change is the one review left exposed to exactly the
drift the marker exists to declare.

## F7 - one guard the rewrite carries is pinned by no fixture

**What is claimed.** R4-9's resolution row: "the guards are fixtured". The guard at
`tools/check-records.mjs:556` honours a `figure-historical` marker only on a line that is not code.

**What I did.** Mutated that guard to read the marker off the raw line, code or not, and reran the
shipped spec.

```console
$ cd $S && node mutate6.mjs 2>&1 | grep -E "figure-historical|rule 1:"
SURVIVED  | rule 4: honour figure-historical even on a code line | all green
SURVIVED  | rule 1: check links on code lines (strict direction control) | all green
```

**Why it is a defect.** The first survivor is a weakening no test notices: with the guard gone, a
non-`console` code block that prints the marker's text - a `diff` block quoting a marked line, the
R3-11 shape - exempts any stale figure sharing those lines, and the suite stays green. This is
stage-5 F4's finding reproduced against the rewrite: the one indentation-adjacent guard whose fixture
was omitted. The second survivor makes rule 1 stricter, not weaker, and is listed only for
completeness.

## F8 to F10 - three latent holes, all inherited, none exploited

All three are accepted identically by both ends of the range, so none is a regression, and I swept
the live records for all three: no live document exploits any of them.

```console
$ cd $S && node live6.mjs
leaked exemptions: 0, blockquoted labels: 0, cased console fences: 0
```

**F8.** Rule 3 cannot read a blockquoted transcript. Prettier hands `parseDoc` a blockquoted
` ```console ` block with its lang intact, so the block is walked - but every line in it starts with
`> `, so the prompt match at `tools/check-records.mjs:450` never sees a command and the label match
at `tools/check-records.mjs:461` never sees a label. A fabricated `> LINT_EXIT=0` under a
`> $ npm run lint` renders to a reader as a console transcript and is checked as nothing. The two
blockquoted console fences in the live records are both in `reviews/ARTIFACTS-round2.md`, which is
frozen, and neither contains a label.

**F9.** The walk at `tools/check-records.mjs:441` skips any block whose info string is not exactly
`console`. GitHub's highlighter is case-insensitive, so a ` ```Console ` fence renders identically to
a reader and is exempt from rule 3 - and from rule 4's transcript exemption, which at least fails
strict. Same shape as F8: the parser now answers "where is the code" correctly, and the rule applies
itself to the answer by a spelling the reader cannot distinguish.

**F10.** A `transcript-literal` exempts more than "the next fence".
`tools/check-records.mjs:483` walks upward skipping code and blank lines, so a marker above an honest
fence is also the nearest directive line above the _next_ fence when only code and blanks intervene -
one marker, two exempt fences, the second unmarked to any reader of the source. The base checker's
`previous` variable behaves identically, so this is inherited; no live marker sits in that
configuration.

These are the next enumeration. The parser closed "what is code"; "what does this transcript say" -
prompt lines, label lines, blockquote prefixes, info-string spellings, marker adjacency - is still
answered by hand-rolled line regexes inside the parser's blocks, and that is where the class now
lives. F12 lists two smaller instances.

## F11 - the limit section overstates what the deletion removed

`PROD-READINESS.md:890` says the change "removes the component every blocking finding in five reviews
was located in". Stage-1's blocking F3 was a wrong value in `FIGURES`; stage-1's blocking F5 was rule
2's git dependence; stage-2's blocking F3 was the quote scan in `continues()`, which is still
shipped. The sentence is true of the recurring escape class and false as written.

## F12 - two smaller instances of the F8 class, stated for the record

- A `console` fence indented inside a list item is walked, but `/^\$ /` cannot see its indented
  prompt lines, so an honest transcript whose echo is on the command line is refused as "output of no
  command" - a false positive both checkers share. The strict direction, but it will bite the first
  reviewer who writes a transcript in a list.
- Rule 4's quadruple regex requires four two-digit-dot components, so any quadruple containing a
  bare `100` - including the checker's own per-file coverage - is invisible to the sweep. F5 could
  not have been caught by the gate even in prose.

## What I checked and did not find a defect in

- **The delegation itself.** I attacked `parseDoc` with nested and mismatched fences, tilde output
  lines, longer-delimiter fences, indented blocks inside list items, blockquoted indented blocks,
  two-word and non-ASCII info strings, and markers inside all of them: every "where is the code"
  answer agreed with prettier's own parse, which is the property four hand-rolled attempts could not
  reach. The recurring defect of the round - a directive honoured where a reader sees code - did not
  reproduce anywhere I could spell it.
- **The spec rewrite drops nothing.** Diffing test titles between `06332d9` and `HEAD` shows renames
  and additions only; every old positive control survives, seven tests are new, and the delta of ten
  matches the pinned unit-test move.
- **The four `historical-file` markers** added to the answered stage-1 to stage-4 reviews lift
  exactly the rules the principle says they lift; those files' citations are still resolved and
  bounds-checked, and the gate stays green with them in place.
- **`npm run lint` ordering.** Prettier runs immediately before the gate, as the delegation's
  argument requires, and `prettier.__debug.parse` failing would throw the gate red rather than
  silent.
- **The K6 and K8 rows** added by `aadd4b5` describe real, re-measurable states; K8's six-instance
  history matches the review record it cites.

I did not run the E2E, build or iOS gates: nothing in this range touches `src/`, `e2e/`, `ios/` or
the Playwright configuration, and the range's own gate-5 claims are F2's subject rather than
something a re-run at my commit could confirm or refute.

## Verdict

**REJECT.**

F1, F2 and F3 are blocking, and all three are records. The closing gate table states another tree's
output while naming the tree it does not match (F1); the section that exists to name the measurement
tree names two and keeps its own superseded draft alongside the final one (F2); and the ledger
contradicts itself on the suite size and its own review count, the former for the fifth time in six
commits (F3). None of this is in the gate's code, which is what the ledger predicted, and none of it
was catchable by the gate, which is what the round's second conclusion predicted.

On the code, the result is the opposite of stages 3 to 5: the parser delegation is sound on every
input I could construct, strictly stronger than its base, honestly fixtured, and the fixtures
demonstrably pin it. F7 is a test gap against a claim of "the guards are fixtured", and F8 to F10
mark where the enumeration problem has moved - out of block classification, into line reading - which
belongs in the next round's brief rather than in a seventh unreviewed patch to this one. The gate is
good. The records about the gate are, once again, where the defects are.
