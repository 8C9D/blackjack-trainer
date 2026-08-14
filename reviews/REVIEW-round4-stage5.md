# REVIEW - round 4, stage 5 (final)

<!-- records: historical-file - an answered review. Its figures and transcripts were true at the commit it reviewed and were checked by this gate when it was written; the remediation it prompted has since moved several of them, and its citations into `tools/check-records.mjs` name the implementation that remediation deleted. Rewriting a reviewer's evidence to match a later tree would destroy the record. Citations here are still resolved and bounds-checked. This marker was added by the stage-6 remediation (stage-6 F6): the commit that answered this review both rewrote the file it cites and omitted the freeze its own principle requires. -->

Range reviewed: `aadd4b5..06332d9`, one commit, "repair the fence model the last fix broke and stop
restating figures that move".
Ledger: `PROD-READINESS.md`.

This stage exists because the final remediation touches code, so the code is what I attacked. The
brief named the target precisely: the defect that has recurred through all four previous reviews is a
directive being honoured where a directive cannot be written, it has been fixed against a different
spelling three times, and the third fix made the gate weaker than the commit before it. My job was to
find a seventh spelling or to establish that there is not one.

There is a seventh. There is also an eighth, and both were introduced by this commit: the gate at
`06332d9` accepts documents that the gate at `aadd4b5` refused. That is the same shape as the stage-4
F6 finding this commit is the answer to.

## How I worked

`git worktree add` is refused by the tool sandbox in this repository (`could not create leading
directories of '.git/worktrees/wt': Operation not permitted`), so instead of a worktree I exported two
read-only trees into the scratchpad with `git archive` and `git show`: `pin/` at `06332d9`, and
`base/tools/check-records.mjs` at `aadd4b5`, each with `node_modules` symlinked. I verified after every
mutation run that `pin/tools/check-records.mjs` was still byte-identical to `06332d9`. I made no edit
to the live checkout; this file is the only thing I wrote.

Every finding below was produced by building a fixture document and running `checkRecords` against it,
not by reading the source. Each fixture runs against **both** checkers, so a difference between them is
a change this commit made rather than a property it inherited. Each fixture is also parsed by
prettier's own CommonMark parser, so "what a reader sees" is measured rather than asserted, and passed
through `prettier.format`, so I can say whether the fixture could survive `npm run lint`, which is
`typecheck && format:check && node tools/check-records.mjs`.

The harness:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && sed -n '1,12p;50,90p' probe5.mjs
// Stage-5 harness. Runs one named fixture against BOTH checkers - aadd4b5 (the
// base of the range) and 06332d9 (its tip) - against prettier's CommonMark
// parser, and against `prettier --check`. Usage: node probe5.mjs <id>
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import prettier from './pin/node_modules/prettier/index.mjs';
import * as TIP from './pin/tools/check-records.mjs';
import * as BASE from './base/tools/check-records.mjs';

const T = '```';

function run(mod, files, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'p5-'));
  try {
    mkdirSync(join(root, 'reviews'), { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), body);
    }
    return mod.checkRecords({
      root,
      docs: opts.docs ?? Object.keys(files).filter((f) => f.endsWith('.md')),
      tracked: opts.tracked ?? new Set(Object.keys(files)),
      figures: opts.figures ?? mod.FIGURES,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const id = process.argv[2];
const { files, opts } = FIXTURES[id];
const doc = files['reviews/A.md'];
const { ast } = await prettier.__debug.parse(doc, { parser: 'markdown' });
const seen = new Map();
const walk = (n) => {
  if (n.type === 'code' || n.type === 'inlineCode')
    for (let i = n.position.start.line; i <= n.position.end.line; i++) seen.set(i, n.type);
  for (const c of n.children ?? []) walk(c);
};
walk(ast);
console.log('fixture reviews/A.md, each line tagged as prettier CommonMark parses it:');
doc.split('\n').forEach((t, i) => console.log(`  | ${(seen.get(i + 1) ?? 'prose').padEnd(10)} | ${t}`.trimEnd()));
const formatted = await prettier.format(doc, { parser: 'markdown' });
console.log(`prettier --check on the fixture: ${formatted === doc ? 'clean' : 'reformats'}`);
for (const [tag, mod] of [['aadd4b5', BASE], ['06332d9', TIP]]) {
  const bad = run(mod, files, opts);
  console.log(`${tag} reports ${bad.length} defect(s):`);
  for (const b of bad) console.log(`  ${b}`);
}
````

The figures I quote are from my own runs, twice, because the branch percentage is not deterministic:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; npm run test:coverage > $S/cov3.txt 2>&1; npm run test:coverage > $S/cov4.txt 2>&1; sed 's/\x1b\[[0-9;]*m//g' $S/cov3.txt $S/cov4.txt | grep -E "Test Files|Tests |Statements|Branches|Functions|Lines  "
 Test Files  68 passed (68)
      Tests  1609 passed (1609)
Statements   : 96.1% ( 5559/5784 )
Branches     : 93.11% ( 2528/2715 )
Functions    : 93.46% ( 958/1025 )
Lines        : 97.9% ( 4295/4387 )
 Test Files  68 passed (68)
      Tests  1609 passed (1609)
Statements   : 96.1% ( 5559/5784 )
Branches     : 93.11% ( 2528/2715 )
Functions    : 93.46% ( 958/1025 )
Lines        : 97.9% ( 4295/4387 )
```

I ran it four times in all. Every run printed the same count and the same quadruple, and both match
what this commit pins in `FIGURES` at `tools/check-records.mjs:62` and `tools/check-records.mjs:63`,
so the commit's update of those two figures is correct. I state neither figure outside a transcript,
because both have moved again since I measured them: see the last section.

## F1 - a `transcript-literal` inside an indented code block disarms rule 3, and this commit is what made that true

**What is claimed.** `tools/check-records.mjs:158` to `tools/check-records.mjs:163` says the new
`indented` flag exists because "a directive written in one is a directive nobody can see rendered",
and that it "is reported separately from `fenced` and used for directives only". The ledger says the
recurring defect "was fixed against inline code, then against backtick fences, then against tilde
fences and indented blocks", and that only the fourth fix closed the class.

**What I did.** I built a document whose only marker is a `<!-- transcript-literal -->` indented by
four spaces, above a `console` fence claiming an exit label that `npm run lint` cannot print.

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node probe5.mjs F1
fixture reviews/A.md, each line tagged as prettier CommonMark parses it:
  | prose      | # A
  | prose      |
  | code       |     <!-- transcript-literal -->
  | prose      |
  | code       | ```console
  | code       | $ npm run lint
  | code       | LINT_EXIT=0
  | code       | ```
  | prose      |
prettier --check on the fixture: clean
aadd4b5 reports 1 defect(s):
  reviews/A.md:7: a ```console block prints `LINT_EXIT=` as output of `npm run lint` (line 6), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
06332d9 reports 0 defect(s):
````

The control, the same document with the indented line deleted, isolates the marker as the cause:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node probe5.mjs F1control
fixture reviews/A.md, each line tagged as prettier CommonMark parses it:
  | prose      | # A
  | prose      |
  | code       | ```console
  | code       | $ npm run lint
  | code       | LINT_EXIT=0
  | code       | ```
  | prose      |
prettier --check on the fixture: clean
aadd4b5 reports 1 defect(s):
  reviews/A.md:5: a ```console block prints `LINT_EXIT=` as output of `npm run lint` (line 4), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
06332d9 reports 1 defect(s):
  reviews/A.md:5: a ```console block prints `LINT_EXIT=` as output of `npm run lint` (line 4), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
````

**Why it is a defect.** Prettier's CommonMark parser tags the marker line `code`. A reader sees the
marker printed as code, exactly as they saw the `~~~` fence and the four-space block that stage 3 and
stage 4 reported. The checker honours it anyway and turns rule 3 off for the fence below, and the
fixture is byte-clean under `prettier --check`, so nothing else in `npm run lint` would stop it.

This is not an inherited gap. It is a regression this commit introduced, and the commit's own refactor
is the mechanism. `transcript-literal` is the one marker of the six read neither through `markersIn`
nor through `directiveText`: `tools/check-records.mjs:468` reads it off `previous`, and `previous` is
assigned at `tools/check-records.mjs:477` under the guard `!fenced`. At `aadd4b5`, `fenced` was
`fence !== null || indented`, so an indented line could not become `previous`. This commit redefined
`fenced` to mean the fence alone and threaded the new `indented` flag into three consumers -
`exemptions` at line 194, `directiveText` at line 246, `checkFigures` at line 566 - but not into the
fourth. Line 477 still reads `!fenced`, and `fenced` no longer means what it did.

So the seventh spelling was created by the fix for the sixth. That is the third consecutive cycle in
which the remediation weakened the gate in a dimension its new fixture table does not cover.

## F2 - a fence whose info string is not one bare word is not a fence at all, and rules 1, 2 and 3 go silent after it

**What is claimed.** `tools/check-records.mjs:136` to `tools/check-records.mjs:140` says the fence
model now works "the way CommonMark closes them", and that the version before it "made the gate
strictly weaker than before the fix".

**What I did.** The new opener at `tools/check-records.mjs:141` is anchored with `\s*$`: after an
optional one-word info string drawn from `[A-Za-z0-9_-]`, the line must end. Any other info string
means the line is not recognised as a fence delimiter at all. I built documents whose fence carries an
ordinary info string.

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node probe5.mjs F2a
fixture reviews/A.md, each line tagged as prettier CommonMark parses it:
  | prose      | # A
  | prose      |
  | code       | ```console title="gate 4"
  | code       | $ cat m
  | code       | <!-- records: historical-file -->
  | code       | ```
  | prose      |
  | prose      | The suite is 1547 passed.
  | prose      |
prettier --check on the fixture: clean
aadd4b5 reports 1 defect(s):
  reviews/A.md:8: unit-test count states 1547 where the round's unit-test count is 1600
06332d9 reports 0 defect(s):
````

The same holds for any info string containing a character outside that class, for example a language
tag with a `#` in it:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node probe5.mjs F2b
fixture reviews/A.md, each line tagged as prettier CommonMark parses it:
  | prose      | # A
  | prose      |
  | code       | ```C#
  | code       | <!-- records: historical-file -->
  | code       | ```
  | prose      |
  | prose      | The suite is 1547 passed.
  | prose      |
prettier --check on the fixture: clean
aadd4b5 reports 1 defect(s):
  reviews/A.md:7: unit-test count states 1547 where the round's unit-test count is 1600
06332d9 reports 0 defect(s):
````

The freeze is only half of it. Because the opener is invisible, the fence's closing delimiter is read
as an opening one and the checker's fence state is inverted for everything below. Rules 1, 2 and 3 all
begin by skipping fenced lines, so they stop looking:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node probe5.mjs F2c
fixture reviews/A.md, each line tagged as prettier CommonMark parses it:
  | prose      | # A
  | prose      |
  | code       | ```console title="gate 4"
  | code       | $ npm run lint
  | code       | LINT_EXIT=0
  | code       | ```
  | prose      |
  | prose      | ## Findings
  | prose      |
  | inlineCode | See [gone](reviews/A.md#no-such-heading) and `src/thing.ts:99`.
  | prose      |
  | code       | ```console
  | code       | $ npm run e2e
  | code       | E2E_EXIT=0
  | code       | ```
  | prose      |
prettier --check on the fixture: clean
aadd4b5 reports 4 defect(s):
  reviews/A.md:10: link target does not exist: reviews/reviews/A.md
  reviews/A.md:10: `src/thing.ts:99` is past the end of src/thing.ts (1 lines)
  reviews/A.md:5: a ```console block prints `LINT_EXIT=` as output of `npm run lint` (line 4), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
  reviews/A.md:14: a ```console block prints `E2E_EXIT=` as output of `npm run e2e` (line 13), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
06332d9 reports 0 defect(s):
````

**Why it is a defect.** Four real defects - a dead anchor, an out-of-bounds citation, and two exit
labels no command in their block can print - are refused by the base of this range and accepted by its
tip. One extra word of ordinary markdown does it, prettier does not object, and the document renders
identically for a reader. This is a false negative of exactly the kind the file's own header warns
about: a checker that stops matching does not fail, it passes.

It is a regression, and again the commit's own change is the cause. The opener at `aadd4b5` had no end
anchor, so it matched a prefix and recognised every one of these openers. The `\s*$` added at line 141
is what narrowed it. The commit correctly stopped a `~~~` line from closing a backtick fence and
correctly stopped a shorter run from closing a longer one - I confirmed both against both checkers, and
both are pinned by new fixtures - but it bought that by making the **opener** stricter than CommonMark
instead of the closer, and the openers it now rejects are ordinary ones.

## F3 - a blockquoted code block is invisible to the fence model as well

**What is claimed.** The same claim as F2, and the title of the new describe block at
`tools/check-records.spec.mjs:554`: that this is "the fence model a reader sees".

**What I did.**

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node probe5.mjs F3
fixture reviews/A.md, each line tagged as prettier CommonMark parses it:
  | prose      | # A
  | prose      |
  | code       | > ```console
  | code       | > $ cat m
  | code       | > <!-- records: historical-file -->
  | code       | > ```
  | prose      |
  | prose      | The suite is 1547 passed.
  | prose      |
prettier --check on the fixture: clean
aadd4b5 reports 0 defect(s):
06332d9 reports 0 defect(s):
````

**Why it is a defect.** The reader sees four lines of code; the checker sees four lines of prose and
honours the marker in the middle of them. A blockquoted indented block behaves the same way. Unlike F1
and F2 this is not a regression - `aadd4b5` accepts it too - so it is not blocking on its own. I report
it because it is the same class again, and because it is the cheapest evidence that the class cannot be
closed by adding a ninth spelling to the fixture table. `lines()` recognises a fence only when the
delimiter is the first non-space character on the line and the rest of the line is one bare word. Every
code block outside that shape is prose to this file, and that set is not enumerable by inspection.

## F4 - the spec does not pin two of the three guards this commit added

**What is claimed.** `PROD-READINESS.md:861` describes the change as "the fence model and the directive
filter" plus "nine new fixtures". The spec header at `tools/check-records.spec.mjs:16` says the suite
exists because a checker that silently stops matching "passes, on every document, forever", and
`tools/check-records.spec.mjs:560` says the fixtures are kept "as a set rather than one test because
the defect came back three times".

**What I did.** The fixture count is right: the spec runs 48 tests at `aadd4b5` and 57 at `06332d9`, a
delta of nine that matches the round's unit-test move. Then I mutation-tested. Each mutation applies
one change to a private copy of the checker and reruns the spec; a mutation the suite does not turn red
is a rule no fixture pins.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && ./mutate.sh
killed    | lines(): closing fence accepts any delimiter (revert stage-4 F6 fix) | 1 failed
SURVIVED  | directiveText(): drop the !indented filter | 1 passed
killed    | exemptions(): markersIn no longer told about indentation | 1 failed
SURVIVED  | checkFigures(): drop the !indented guard on figure-historical | 1 passed
killed    | lines(): indented always false (revert the whole indent model) | 1 failed
killed    | applied(): pair single backticks instead of runs (revert stage-3 F6) | 1 failed
killed    | COVERAGE_TOLERANCE 0.05 -> 0.23 (just under the largest baseline gap) | 1 failed
killed    | COVERAGE_TOLERANCE 0.05 -> 0.5 (swallows the round-3 baseline) | 1 failed
killed    | continues(): stop treating # as a comment (revert stage-2 F3) | 1 failed
killed    | noteEchoes(): count any NAME= on a command line, not just after echo | 1 failed
killed    | checkFigures(): exempt every fence, not only console | 1 failed
SURVIVED  | checkTranscripts(): let a fenced line set 'previous' | 1 passed
restored
```

A second batch, over rules this commit did not touch:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && ./mutate2.sh
SURVIVED  | resolvePath(): drop the bare-basename 'external' escape | 1 passed
killed    | exemptions(): a section marker never stops at the next h1 | 1 failed
SURVIVED  | EXIT_LABEL: match a NAME= anywhere in an output line, not just at its start | 1 passed
killed    | BINDING_DOCS: no document ever needs a content binding | 1 failed
killed    | checkCitations(): ignore cite-historical markers entirely | 1 failed
restored
```

**Why it is a defect.** Nine of twelve first-batch mutations are killed, which is a good suite, and both
coverage-tolerance mutations dying confirms the rewritten margin comment at `tools/check-records.mjs:78`
to `tools/check-records.mjs:86`. But two of the three survivors are guards this commit added: delete
`!line.indented` from `directiveText` at line 246, or `!indented` from `checkFigures` at line 566, and
the suite stays green. The commit's answer to stage-4 F7 is half-tested. The only indentation fixture in
the new table, at `tools/check-records.spec.mjs:579`, exercises `records: historical-file` alone, which
reaches the code through `markersIn`; that is why the third mutation, which reverts the indent model
wholesale, is killed while the two narrower ones survive. Five of the six markers the file reads have no
indentation fixture at all.

The third survivor is F1's mechanism stated as a test gap: nothing pins where `previous` may come from.
The fourth, in the second batch, is the bare-basename escape at `tools/check-records.mjs:327`, which
silently skips both the bounds check and the binding requirement for any citation naming an untracked
file with no slash in its path; that one is documented and pre-existing, and I list it only because the
mutation shows no fixture holds it. The `EXIT_LABEL` survivor is not a concern, because that mutation
makes the rule stricter rather than weaker.

## F5 - the comment that would have caught F1 states the opposite of what the code does

**What is claimed.** `tools/check-records.mjs:239` reads, verbatim: "All five markers this file reads
are collected from here and nowhere else". "Here" is `directiveText`.

**What I did.** I traced every read of every marker.

```console
$ grep -n "directiveText\|markersIn\|applied(" tools/check-records.mjs
194:    const live = markersIn(text, fenced || indented);
219:function markersIn(text, fenced) {
221:  return [...applied(text).matchAll(/<!-- records: (historical-file|historical)\b/g)].map(
233:function applied(text) {
244:function directiveText(doc) {
247:    .map((line) => applied(line.text))
348:    const directives = directiveText(body);
468:          exempt = applied(previous).includes('<!-- transcript-literal -->');
566:      if (!fenced && !indented && applied(text).includes('<!-- figure-historical -->')) return;
```

**Why it is a defect.** `directiveText` has exactly one caller, line 348, inside `checkCitations`. Two
markers are collected from it, `cite:` and `cite-historical:`. The other four are read elsewhere:
`historical-file` and `historical` through `markersIn` at line 194, `figure-historical` at line 566, and
`transcript-literal` at line 468. The file's own header lists six markers, not five. A reader auditing
the indentation fix by reading this comment would conclude that adding `!line.indented` at line 246
covered every marker, and would never look at line 477, which is precisely what F1 is.

The same claim was published as a record by this commit. `reviews/REVIEW-round4-stage4.md:71` says
"`cite:`, `cite-historical:` and `transcript-literal` all go through the same `directiveText` filter
now". They do not; `transcript-literal` never has. The sentence continues "and a `transcript-literal`
named in prose no longer disarms rule 3", which is also false and contradicts the suite: the fixture at
`tools/check-records.spec.mjs:473` asserts that a `transcript-literal` written in prose above a fence
does disarm rule 3, because that is the documented escape. I do not treat the wording of a previous
reviewer's report as a blocking defect in this commit, since the commit records it rather than authors
it. I record it because it is the direct reason F1 survived remediation: stage 4 signed off on a filter
that the marker in question does not pass through.

## F6 - the closing gate table states a document count that this commit made wrong

**What is claimed.** `PROD-READINESS.md:774` reports gate 1 as passing with "the records gate: 29
documents, no defects".

**What I did.** I ran the gate at this commit, before adding this file, and counted the records
documents at both ends of the range.

```console
$ node tools/check-records.mjs; grep -n "29 documents" PROD-READINESS.md
records: 30 documents checked, no defects
774:| 1   | lint              | 0    | `tsc` x3 projects + prettier + the records gate: 29 documents, no defects |
```

```console
$ echo "AADD4B5_DOCS=$(git ls-tree -r aadd4b5 --name-only | grep -cE '^(PROD-READINESS|LAUNCH-CHECKLIST)\.md$|^reviews/.*\.md$')"; echo "TIP_DOCS=$(git ls-tree -r 06332d9 --name-only | grep -cE '^(PROD-READINESS|LAUNCH-CHECKLIST)\.md$|^reviews/.*\.md$')"
AADD4B5_DOCS=29
TIP_DOCS=30
```

**Why it is a defect.** The row was true at `aadd4b5` and is false at `06332d9`, and the reason it is
false is that this commit added `reviews/REVIEW-round4-stage4.md`, the thirtieth document. The commit
message is "stop restating figures that move". It updated the two figures rule 4 sweeps, unit tests and
coverage, both correctly, and left the adjacent figure rule 4 does not sweep describing the tree as it
was before the commit. This is finding K8 reproducing inside the commit that names it. The count moves
again with this file present, to 31, so the row cannot be repaired by writing 30 either. I have not
edited it.

## F7 - the ledger records a review that had not happened

**What is claimed.** `PROD-READINESS.md:861` and `PROD-READINESS.md:862`, both added by this commit,
read: "Under this round's own rules that needs one more fresh review, and it got one - stage 5, over the
final range, reviewing the code change rather than re-litigating prose. Its verdict is recorded below
with the rest."

**What I did.**

```console
$ git ls-tree 06332d9 reviews/ --name-only | tail -3
reviews/REVIEW-round4-stage2.md
reviews/REVIEW-round4-stage3.md
reviews/REVIEW-round4-stage4.md
$ grep -n "stage 5" PROD-READINESS.md
861:that needs one more fresh review, and it got one - stage 5, over the final range, reviewing the code
```

The newest review in the tree at that commit is stage 4, and the one match for "stage 5" in the whole
ledger is the sentence claiming a stage-5 verdict is recorded. The stage table at
`PROD-READINESS.md:833` has rows for stages 1 to 4, and rows R4-3, R4-5, R4-7 and R4-8 record the
verdicts of stages 1 to 4. There is no stage-5 row anywhere below it.

**Why it is a defect.** At the commit that publishes it, the sentence asserts in the past tense that a
review happened and that its verdict is recorded, when the review did not exist and no verdict was
recorded. This is the R2-4 shape the round has already catalogued: a record pointing at a row that is
not there. It is not blocking on its own, since the sentence becomes half true the moment this file
lands, but a records gate whose ledger pre-records the outcome of its own audit is the claim in this
commit I would least want left standing.

## What I checked and did not find a defect in

- **Neither hole is exploited by the tree as it stands.** I re-implemented `lines()` from `06332d9` and
  swept all the records documents for two things: a line the checker treats as prose that begins with
  three or more backticks or tildes, and a `console` fence disarmed by an indented `transcript-literal`.

  ```console
  $ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node live.mjs
  unseen fence openers in the live records: 0
  console fences disarmed by an INDENTED transcript-literal: 0
  ```

  So `records: 30 documents checked, no defects` is an honest result for this tree. F1 and F2 are latent,
  not active. They are still blocking, because a gate's value is what it will refuse next round, and its
  author cannot know which info string a future reviewer will type.

- **The two things the commit set out to fix are genuinely fixed.** A `~~~` line printed inside a backtick
  `console` fence no longer ends it, a three-backtick line inside a four-backtick fence no longer ends it,
  and a citation on a four-space indented line is checked again. I ran each against both checkers:
  `aadd4b5` accepts all three, `06332d9` refuses all three, and each is pinned by a new fixture. Stage-4
  F6 and F7 are closed on their own terms.

- **The coverage tolerance and its rewritten comment are correct.** `COVERAGE_TOLERANCE` is 0.05; the
  largest component gap to the round-3 baseline quadruple is 0.24 and the smallest is 0.06, and refusal is
  governed by the largest. Both mutation directions confirm the window.

- **`continues()` and `noteEchoes()` are unchanged in this range** and both are pinned: the
  apostrophe-in-a-comment mutation and the environment-prefix mutation are both killed. The blind spot the
  artifact declares at `reviews/ARTIFACTS-round4.md:63`, where a command that merely mentions a label after
  the word `echo` is accepted, is still real and still declared; I did not treat a stated blind spot as a
  finding.

- **The one citation the commit repaired is right.** `LAUNCH-CHECKLIST.md` moved a reference from
  `chart-page.component.ts:53` to `chart-page.component.ts:60`; line 60 is the `HARD_KEYS` array running
  5 through 20, which supports the sentence it is cited for, and the paired `StrategyChart.swift:15` is
  `static let hardTotals = (5 ... 20).map(String.init)`.

I did not run the E2E, iOS or build gates. The brief scoped this stage to the checker, four previous
reviewers have measured those gates, and nothing in this range touches `src/`, `e2e/`, `ios/` or the
Playwright configuration.

## A change in the working tree that is not in this range

While I was writing this file, `tools/check-records.mjs` was rewritten in the working checkout by
something other than me: its mtime moved twice inside a minute, and it was briefly in a non-parsing
state. It is uncommitted, it is not part of `aadd4b5..06332d9`, and it is not what I reviewed. I did not
touch it and I did not revert it.

It is worth recording what it does, because it is decision-relevant. It replaces the hand-written
`lines()` scanner with `prettier.__debug.parse`, and it closes all three of F1, F2 and F3. It also
moves `FIGURES`, because rewriting the checker changes the repository's own coverage, so the count and
the quadruple in the transcripts above are the ones measured at `06332d9` and are no longer the values
the gate now pins. That is finding K8 again, and it is the reason this file states them only inside
transcripts.

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; cd $S && node wt.mjs
F1: working-tree checker reports 1 defect(s) (closed)
   reviews/A.md:7: a ```console block prints `LINT_EXIT=` as output of `npm run lint` (line 6), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
F2a: working-tree checker reports 1 defect(s) (closed)
   reviews/A.md:8: unit-test count states 1547 where the round's unit-test count is 1609
F2b: working-tree checker reports 1 defect(s) (closed)
   reviews/A.md:7: unit-test count states 1547 where the round's unit-test count is 1609
F3: working-tree checker reports 1 defect(s) (closed)
   reviews/A.md:8: unit-test count states 1547 where the round's unit-test count is 1609
````

That is the right shape of fix, and it is the one I recommend below. It is also code written after this
review's range, which under the round's own rule needs a review of its own; I have not given it one, and
nothing above should be read as approving it. My verdict is on the commit range I was asked to review.

For completeness, this file passes both gates, the one at the commit under review and the one now in the
working tree:

```console
$ node tools/check-records.mjs
records: 31 documents checked, no defects
```

## Verdict

**REJECT.**

F1 and F2 are blocking, for the same reason stage-4 F6 was blocking: the gate at the tip of this range
refuses less than the gate at its base. F1 hands back the escape rule 3 exists to prevent, to a marker
written where the reader sees code, and the commit's own `indented` refactor is what opened it. F2 turns
rules 1, 2 and 3 off for the remainder of any document containing an ordinary two-word fence info string,
and the commit's own anchoring of the opener regex is what opened that. Both fixtures are clean under
`prettier --check`, so `npm run lint` would not catch either.

F4 explains why neither was caught before it shipped: two of the three guards this commit adds are pinned
by no fixture, and the one indentation fixture in the new table covers one marker out of six. F5 is the
comment that made the omission invisible to review. F6 and F7 are records defects in the same commit, one
of them a figure this commit itself invalidated.

I want to be exact about what I am not saying. The gate is good, and much better than no gate: it refuses
all four of round 3's defect shapes, nine of my twelve first-batch mutations, and every spelling stage 3
and stage 4 reported. Nothing in `src/` is implicated, and nothing in the live records exploits either
hole today. The tree is shippable. What is not sound is the claim that the class is closed.

The recommendation, and the reason I do not think a fifth remediation cycle of the current shape ends
this: six spellings were found by six people reading a regex, each fix added the spelling that had just
been found, and three of the last four fixes introduced a new one. `lines()` is a hand-written
approximation of a markdown block parser being asked to agree with a real one on every input, and that is
not a property a fixture table can establish. Prettier is already a dependency and already runs
immediately before this gate in `npm run lint`. Asking its parser which lines are code, once, and
deleting `lines()` closes F1, F2 and F3 together and makes the ninth spelling unreachable rather than
unlisted. The uncommitted change described above does exactly that, which I take as agreement about the
direction rather than as evidence that the range under review is sound.
