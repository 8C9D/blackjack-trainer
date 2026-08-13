# REVIEW - round 4, stage 2

Adversarial review of `b04d9f1..f538ad6` on `prod-readiness/round4-2026-08-12`: `5967002` (the K3
jsdom test), `74fc6f7` (site ignore, E2E port override, M3 re-measurement), `a33ec85` (D1/I1
re-verification), `d91f95b` (the round-4 ledger sections), `f538ad6` (the answer to the stage-1
REJECT).
Every figure, transcript and citation in the changed files was treated as an unverified claim and
re-derived here.
`reviews/REVIEW-round4-stage1.md` was read, and its findings were re-tested rather than assumed - both
the ones the range claims to have fixed and the ones it claims to have answered in prose.

- Date: 2026-08-12
- Reviewed at: `f538ad6`

## Method

The main session was committing to this checkout throughout, and its `HEAD` moved five commits past
`f538ad6` while this review was being written.
Every measurement below was therefore taken in a private worktree created with
`git worktree add --detach f538ad6`, with `node_modules` symlinked from the main checkout.
Nothing in the live checkout was modified except to add this file.

In every transcript below, `$S` stands for this session's scratch directory
(`/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad`)
and `$S/wt` for that worktree.
Each fence is one execution with that path substituted in: the `$` line and the lines under it
happened together.

Line references into `PROD-READINESS.md`, `reviews/ARTIFACTS-round4.md` and `reviews/BASELINE-round4.md`
are given as plain text pinned to `f538ad6` rather than as backticked citations, because the main
session is rewriting those files and a citation into them would be stale before anyone read it.

One operational note: a port probe for F6 started an `ng serve` that bound `127.0.0.1:4200`.
The port was checked with `lsof` and free first, the process was mine, and it was stopped again.
No listener belonging to anyone else was touched, and the finding is evidenced below by a config dump
that starts no server at all.

## What reproduced exactly

Re-run at the pinned commit, not taken on the record's word.

- `node tools/check-records.mjs` exits 0 over 27 documents, and `npm run lint` is green with the
  assembled `site/` tree still on disk. K1's fix is real.
- The census in `reviews/ARTIFACTS-round4.md` reproduces byte for byte at this commit, including the
  total, the 103 rule-3 hits, the 113 rule-4 hits and all eleven per-file counts in the same order.
  Stage-1 F7 and F8 are genuinely answered.
- The claim that none of those 103 fences contains an `echo` that could have produced the label holds
  for all 103, checked by extracting each reporting fence and searching it.
- Stage-1 F5 is fixed. In a fresh repository built from `git archive f538ad6` whose only branch is
  the checked-out head, the gate exits 0; renaming that branch to `main` so `main` resolves to `HEAD`
  and then breaking a binding gives two defects and exit 1, where the old code passed.
- Stage-1 F12 is fixed, and the dead link it found is repaired: line 6 of `reviews/ARTIFACTS-round3.md`
  now points at `BASELINE-round3.md`, and appending a link to a non-existent `.md` is refused.
- Stage-1 F4 is fixed. A `figure-historical` marker on the line exempts it; the same marker one line
  above does not; and a marker quoted inside backticks no longer exempts anything.
- Stage-1 F13 reproduces exactly as the artifact now documents it: a fence whose command is
  `grep -c "echo GATE_EXIT=" /dev/null` followed by `GATE_EXIT=0` is accepted. Documented, not hidden.
- Non-vacuity proof B still holds against the rewritten rule 2: moving the base-href citation back to
  the line it used to sit on gives the same three defects at the same three ledger lines, exit 1.
- K3's CSS half is non-vacuous. On my own port, `4 passed`; with the `calc()` deleted from the three
  screens and the `padding-bottom` from `app.scss`, `4 failed`; restored, `4 passed`.
- K3's ordering half is non-vacuous and reproduces to the exact assertion: 18 passed, and with
  `afterRenderEffect` mutated to `effect` the run is `1 failed | 17 passed (18)` with
  `AssertionError: expected '162px' to be '183px'`.
- K2's experiment reproduces: two dist-lane runs on one port kill one of the pair with
  `Error: listen EADDRINUSE: address already in use 127.0.0.1:4501`, and the same two runs on 4501 and
  4502 both exit 0.
- D1 and I1 reproduce line for line, including the nine stores in the `StatsCloudSync` array.
- `FIGURES` in `tools/check-records.mjs` matches the tree. Stage-1 F3 is fixed.

That is a lot of real work, and the findings below should be read against it.

## F1 - a marker inside a fenced code block re-freezes the round's own artifact from rules 3 and 4

**Claimed.** `reviews/ARTIFACTS-round4.md` line 64 states the fix for stage-1 F1 as
"**A marker only counts outside inline code.**" and "Markers inside backticks are now prose".
The ledger's R4-3 row says all three blocking findings are "fixed in the stage-2 commit".
The module comment above `markersIn` in `tools/check-records.mjs` says "Every marker this file reads is
filtered the same way".

**Checked.** `markersIn` strips inline-code spans and nothing else, and `exemptions()` calls it on
every line of the document without consulting the `fenced` flag it has already computed - `fenced` is
used only to decide whether a `# ` line resets the section.
Lines 216 and 217 of `reviews/ARTIFACTS-round4.md` are inside the census `console` fence and contain
the strip regex `<!-- records: historical[^>]*-->` as literal command text, outside backticks:

````console
$ cd $S/wt && node -e '
const {readFileSync,readdirSync}=require("fs");
function lines(md){let f=null;return md.split("\n").map((text,i)=>{const o=/^\s*```+ *([A-Za-z0-9_-]*)/.exec(text);if(o&&f===null){f=o[1]||"plain";return{text,no:i+1,fenced:true};}if(o&&f!==null){f=null;return{text,no:i+1,fenced:true};}return{text,no:i+1,fenced:f!==null};});}
const docs=["PROD-READINESS.md","LAUNCH-CHECKLIST.md",...readdirSync("reviews").filter(f=>f.endsWith(".md")).sort().map(f=>"reviews/"+f)];
for(const d of docs) for(const {text,no,fenced} of lines(readFileSync(d,"utf8"))){
  const prose=text.replace(/`[^`]*`/g,"");
  if(/<!-- records: (historical-file|historical)\b/.test(prose)&&fenced) console.log("APPLIED_AND_FENCED "+d+":"+no);
}
console.log("SCAN_DONE=1");
'; echo "SCAN_EXIT=$?"
APPLIED_AND_FENCED reviews/ARTIFACTS-round4.md:216
APPLIED_AND_FENCED reviews/ARTIFACTS-round4.md:217
SCAN_DONE=1
SCAN_EXIT=0
````

`active` is therefore set at line 216 and never reset, because every heading below it is `##` or
deeper.
Injecting the same fabricated exit label above that line and then below it:

````console
$ cd $S/wt && python3 -c "
p='reviews/ARTIFACTS-round4.md'; s=open(p).read().split('\n')
b=['','\`\`\`console','\$ ls','FABRICATED_EXIT=0','\`\`\`']
open(p,'w').write('\n'.join(s[:205]+b+s[205:]))
"; echo "INJECT_ABOVE_EXIT=$?"; node tools/check-records.mjs 2>&1 | grep FABRICATED || echo "  (accepted: no defect reported)"; git checkout -- reviews/ARTIFACTS-round4.md; python3 -c "
p='reviews/ARTIFACTS-round4.md'; s=open(p).read().split('\n')
b=['','\`\`\`console','\$ ls','FABRICATED_EXIT=0','\`\`\`','']
open(p,'w').write('\n'.join(s+b))
"; echo "INJECT_BELOW_EXIT=$?"; node tools/check-records.mjs 2>&1 | grep FABRICATED || echo "  (accepted: no defect reported)"; git checkout -- reviews/ARTIFACTS-round4.md; node tools/check-records.mjs; echo "RESTORED_EXIT=$?"
INJECT_ABOVE_EXIT=0
  reviews/ARTIFACTS-round4.md:209: a ```console block prints `FABRICATED_EXIT=` as output of `ls` (line 208), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
INJECT_BELOW_EXIT=0
  (accepted: no defect reported)
records: 27 documents checked, no defects
RESTORED_EXIT=0
````

Lines 216 to 666 are outside rules 3 and 4: three quarters of the document, and every proof block for
K3, K1, K2, M3, D1 and I1.
I also ran a copy of the checker patched to ignore markers on fenced lines: it reports 0 further
defects, so the escape is currently concealing nothing.

**Why it is a defect.** This is stage-1 F1, in the same document, one commit after it was reported as
fixed, reached by a different spelling of the same mistake.
The fix was written against the instance rather than the class: a marker must count only where a marker
can be written, and a fenced code block is as much "not prose" as an inline-code span.
The document's own blind-spot list now states the rule as "outside inline code", which is precisely the
incomplete rule, so a reader who checks the list is told the hole is closed.
That the escape happens to hide nothing today is luck, not design - it was luck last time too, except
last time it was hiding 24 defects.

## F2 - the round publishes a coverage quadruple and a test count that are not the tree's, and K6 is built on one of them

**Claimed.** `reviews/ARTIFACTS-round4.md` publishes a `npm run test:coverage` transcript under M3 and
a headroom table under it, giving statements 96.07, branches 92.89, functions 93.41, lines 97.89 and a
test count of 1594, with the branches headroom "**0.89**".
The ledger's K6 row states "The coverage gate's branch headroom is now **0.89 points** (92.89% against
a floor of 92)".
`vitest.config.ts` states the checker's own coverage as 94.14 / 86.45 / 100 / 95.69.

**Checked.** Measured three times in a row at the pinned commit, with a `json-summary` reporter added
and reverted inside the same execution:

```console
$ cd $S/wt && perl -0pi -e "s/reporter: \['text-summary'\]/reporter: ['text-summary','json-summary']/" vitest.config.ts; echo "REPORTER_ADDED_EXIT=$?"; for i in 1 2 3; do npm run test:coverage > $S/c$i.txt 2>&1; echo "run$i exit=$? $(sed 's/\x1b\[[0-9;]*m//g' $S/c$i.txt | grep -E 'Tests |Statements|Branches|Functions|Lines' | tr -s ' ' | tr '\n' ' ')"; done; node -e 'const s=require("./coverage/blackjack-trainer/coverage-summary.json");const f=Object.keys(s).filter(k=>k!=="total");const t=f.filter(x=>x.includes("/tools/"));console.log("FILE_COUNT="+f.length+" UNDER_TOOLS="+t.length);for(const x of t){const m=s[x];console.log("  "+x.replace(process.cwd()+"/","")+"  "+m.statements.pct+" / "+m.branches.pct+" / "+m.functions.pct+" / "+m.lines.pct);}'; git checkout -- vitest.config.ts; echo "REPORTER_REVERTED_EXIT=$?"
REPORTER_ADDED_EXIT=0
run1 exit=0  Tests 1593 passed (1593) Statements : 96.06% ( 5547/5774 ) Branches : 92.83% ( 2502/2695 ) Functions : 93.43% ( 954/1021 ) Lines : 97.89% ( 4286/4378 )
run2 exit=0  Tests 1593 passed (1593) Statements : 96.06% ( 5547/5774 ) Branches : 92.83% ( 2502/2695 ) Functions : 93.43% ( 954/1021 ) Lines : 97.89% ( 4286/4378 )
run3 exit=0  Tests 1593 passed (1593) Statements : 96.06% ( 5547/5774 ) Branches : 92.87% ( 2503/2695 ) Functions : 93.43% ( 954/1021 ) Lines : 97.89% ( 4286/4378 )
FILE_COUNT=75 UNDER_TOOLS=1
  tools/check-records.mjs  94.04 / 85.8 / 100 / 95.85
REPORTER_REVERTED_EXIT=0
```

Three of the four round-level numbers are wrong in the records, the test count is wrong, and all four
of the checker's own per-file numbers are wrong.
The denominators give the reason: the published block was measured against 5761 statements and 2688
branches, where the tree has 5774 and 2695, so it was taken before the stage-2 commit grew
`tools/check-records.mjs`.
The real branch headroom is 0.83, not 0.89, which is the number K6 carries to the next round as its
whole evidence.
`FILE_COUNT=75 UNDER_TOOLS=1` and the M3 conclusion are correct.

**Why it is a defect.** Rule 4 exists because round 3 corrected one figure "everywhere" four times and
was wrong each time, and the round has now done it again with its own coverage: `FIGURES` was moved to
the tip in answer to stage-1 F3, and the prose that quotes those figures was not.
Rule 4 cannot see any of it, because a quadruple written across markdown table cells does not match its
pattern and a `console` fence is exempt by design - so the round's most-quoted figure sits in exactly
the two places the gate does not look, and that is not in the "What it does not refuse" list either.
Two `<!-- figure-historical -->` markers, at lines 173 and 548 of the artifact, now sit alone on blank
lines and exempt nothing after the F4 fix narrowed the marker to its own line; the second is directly
above the headroom table that carries these figures, which suggests the table was meant to be marked
and no longer is.

## F3 - the fix for stage-1 F6 introduced a rule-3 false negative: an apostrophe turns the rule off for the rest of the fence

**Claimed.** The comment on `continues()` in `tools/check-records.mjs` says the quote scan is "A real
scan rather than counting quotes, so an apostrophe inside a double-quoted argument (`echo "I'm done"`)
does not read as an open quote."
The ledger's R4-4 row says F6 "was code and is fixed and tested".

**Checked.** The scan is correct for an apostrophe inside double quotes, and wrong for one outside
them, which is the far more common case in a shell comment or a `#`-annotated command.
A command line with an unpaired `'` makes `continues()` true, so every remaining line of the fence is
appended to the command instead of being read as output, and no output line is ever checked.
Two fences, identical except for one apostrophe:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; rm -rf $S/apo && mkdir -p $S/apo/reviews && printf '# A\n\n```console\n$ ls   # the app'"'"'s own output directory\nFAKE_EXIT=0\n```\n\n```console\n$ ls   # the output directory\nFAKE_EXIT=0\n```\n' > $S/apo/reviews/A.md && printf "import { checkRecords } from '%s/wt/tools/check-records.mjs';\nconst bad = checkRecords({ root: '%s/apo', docs: ['reviews/A.md'], tracked: new Set(['reviews/A.md']) });\nconsole.log('DEFECTS=' + bad.length);\nfor (const b of bad) console.log('  ' + b);\n" $S $S > $S/apo/run.mjs && node $S/apo/run.mjs; echo "PROBE_EXIT=$?"
DEFECTS=1
  reviews/A.md:10: a ```console block prints `FAKE_EXIT=` as output of `ls   # the output directory` (line 9), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
PROBE_EXIT=0
````

The same document against the checker as it stood at `b04d9f1`, before this range:

````console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/78347c13-379f-4b2c-a246-accecd2fa2b0/scratchpad; git show b04d9f1:tools/check-records.mjs > $S/apo/old-check.mjs; echo "EXTRACT_EXIT=$?"; printf "import { checkRecords } from '%s/apo/old-check.mjs';\nconst bad = checkRecords({ root: '%s/apo', docs: ['reviews/A.md'], tracked: new Set(['reviews/A.md']), changed: new Set() });\nconsole.log('OLD_DEFECTS=' + bad.length);\nfor (const b of bad) console.log('  ' + b);\n" $S $S > $S/apo/run-old.mjs; node $S/apo/run-old.mjs; echo "OLD_PROBE_EXIT=$?"
EXTRACT_EXIT=0
  reviews/A.md:5: a ```console block prints `FAKE_EXIT=` as output of `ls   # the app's own output directory` (line 4), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
  reviews/A.md:10: a ```console block prints `FAKE_EXIT=` as output of `ls   # the output directory` (line 9), which cannot print it: an exit label belongs to the echo that prints it, on the same command line
OLD_PROBE_EXIT=0
````

Sweeping the real records for command lines that leave a quote open at the end of their fence finds two
live instances, both in `reviews/REVIEW-round3-stage3.md` (lines 121 and 559), one of them opened by
the words "the app's".
Both sit in a `historical-file` document, so nothing is being hidden today.

**Why it is a defect.** It is a strict regression, introduced by the commit answering a review that
found a rule-3 false negative, and it is worse than the one it fixed: F13's hole needs a contrived
command that mentions a label after the word `echo`, whereas this one is opened by an apostrophe in a
comment and disables the rule for a whole fence rather than one label.
It is also undocumented - the blind-spot list was extended for F13 and not for this - and the
`continues()` comment asserts the opposite of the behaviour for the unquoted case.

## F4 - the gate's own test suite is given three different sizes, one of them by a transcript that cannot print it

**Claimed.** `reviews/ARTIFACTS-round4.md` line 255 says "`tools/check-records.spec.mjs`, 41 tests".
Lines 261 to 263 say "Counted from the file: 18 tests assert a refusal, 19 assert an acceptance ...,
and 5 are unit tests of the slug and anchor helpers that assert neither".
The block at lines 268 to 273 publishes `npx ng test --include="../tools/check-records.spec.mjs"`
printing `Tests  34 passed (34)`.
The ledger's "What round 4 actually changed" table says "the records gate and its 42 tests".

**Checked.**

```console
$ cd $S/wt && npx ng test --include="../tools/check-records.spec.mjs" > $S/spec.txt 2>&1; echo "SPEC_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/spec.txt | grep -E 'Test Files|Tests '; echo "IT_BLOCKS=$(grep -c '^  it(' tools/check-records.spec.mjs)"; echo "LEDGER_SAYS=$(grep -c 'the records gate and its 42 tests' PROD-READINESS.md)"; echo "ARTIFACT_SAYS=$(grep -c '\`tools/check-records.spec.mjs\`, 41 tests' reviews/ARTIFACTS-round4.md)"
SPEC_EXIT=0
 Test Files  1 passed (1)
      Tests  41 passed (41)
IT_BLOCKS=41
LEDGER_SAYS=1
ARTIFACT_SAYS=1
```

The suite is 41.
The prose sentence is right, the ledger is wrong, the breakdown sums to 42, and the transcript that is
supposed to settle it prints a number the command has not printed since the spec grew.
The breakdown's error is locatable: the test named "lifts the binding requirement for a frozen
document, but not the bounds check" asserts both an acceptance and a refusal, and is counted in both
buckets.

**Why it is a defect.** This is the round's answer to stage-1 F10, and F10 was itself a wrong count of
this same suite.
The correction replaced one wrong number with a partition that does not partition, left a contradictory
number in the ledger, and published a transcript that cannot be reproduced at the commit carrying it -
the R3-15 shape, in the section that argues the gate cannot silently rot.
Rule 4 does not know these numbers, which is the honest reason none of them was caught.

## F5 - the answer to stage-1 F2 points at a closing table that does not exist

**Claimed.** `reviews/ARTIFACTS-round4.md` lines 275 to 281, under the heading "Gates at the stage-1
commit", remove the block F2 objected to and say: "Rather than restate a figure that moves every time a
review lands, the round's gates are reported once, at the tip, in the closing table of this document,
and the per-stage numbers are not repeated."

**Checked.**

```console
$ cd $S/wt && sed -n '277,281p' reviews/ARTIFACTS-round4.md; echo "GATE_TABLE_ROWS=$(grep -cE '^\| *(gate|Gate) ' reviews/ARTIFACTS-round4.md)"; echo "LAST_HEADING=$(grep '^## ' reviews/ARTIFACTS-round4.md | tail -1)"; echo "TOTAL_LINES=$(wc -l < reviews/ARTIFACTS-round4.md)"
The block first published here reported `records: 25 documents checked`, which is the count at the
commit _before_ this artifact file existed: the gate counts `reviews/` from the filesystem, so at the
commit the block claims to certify the command prints a larger number. REVIEW-round4-stage1 F2 caught
it. Rather than restate a figure that moves every time a review lands, the round's gates are reported
once, at the tip, in the closing table of this document, and the per-stage numbers are not repeated.
GATE_TABLE_ROWS=0
LAST_HEADING=## I1 (P1) - the iCloud data-loss path, re-verified line by line
TOTAL_LINES=     666
```

The document's last section is I1, followed by the citation-binding comments.
There is no closing table, no gates section, and no gate row anywhere in the file.

**Why it is a defect.** It is stage-1 F9's shape - "a record says a thing was filed; the file has never
heard of it" - reproduced inside the answer to stage-1 F2.
The reader who follows the pointer to check what the gates actually reported at the tip finds nothing,
and the section is still headed "Gates at the stage-1 commit" while containing no gates at all.

## F6 - the `E2E_PORT` override is wired for one lane only, and the config's own comment advertises the other

**Claimed.** `playwright.config.ts` says, in the comment introducing the override, "`E2E_PORT=4300
npm run e2e` runs alongside a run on the default port".
The ledger's status table records K2 as RESOLVED, "`E2E_PORT` override; two concurrent runs measured
colliding on one port and green on two", and the changed-files table says "the port is `E2E_PORT`,
defaulting to 4200".

**Checked.** `npm run e2e` with no `E2E_SERVER` is the `serve` lane, whose `webServer.command` is
`npm start -- --host 127.0.0.1`.
Nothing passes the port to it, and `angular.json` sets none, so `ng serve` takes its default:

```console
$ cd $S/wt && E2E_PORT=4700 npx tsx -e 'import c from "./playwright.config.ts"; console.log("SERVE_LANE_URL="+c.use.baseURL); console.log("SERVE_LANE_COMMAND="+c.webServer.command);' 2>&1 | tail -2; echo "SERVE_LANE_EXIT=$?"; E2E_PORT=4700 E2E_SERVER=dist npx tsx -e 'import c from "./playwright.config.ts"; console.log("DIST_LANE_URL="+c.use.baseURL); console.log("DIST_LANE_COMMAND="+c.webServer.command);' 2>&1 | tail -2; echo "DIST_LANE_EXIT=$?"; echo "ANGULAR_PORT_KEYS=$(grep -c '\"port\"' angular.json)"
SERVE_LANE_URL=http://127.0.0.1:4700
SERVE_LANE_COMMAND=npm start -- --host 127.0.0.1
SERVE_LANE_EXIT=0
DIST_LANE_URL=http://127.0.0.1:4700
DIST_LANE_COMMAND=npm run build && PORT=4700 node tools/serve-dist.mjs
DIST_LANE_EXIT=0
ANGULAR_PORT_KEYS=0
```

Playwright would wait on 4700 for a server binding 4200 and time out after the 120 s `webServer`
timeout.
I confirmed the binding directly as well: with `E2E_PORT=4700` exported, `npm start -- --host
127.0.0.1` announced `Local: http://127.0.0.1:4200/`.

**Why it is a defect.** The exact command the config comment offers as the point of the change does not
work, and it fails in the slowest possible way - a two-minute timeout with no message naming the port
mismatch.
`e2e/README.md` gets it right, because its example carries `E2E_SERVER=dist`; the config comment,
which is the thing a developer reads when they open the file to find the knob, does not.
The fix is real for the dist lane and K2's measurement is honest, but "the port is `E2E_PORT`" is a
half-truth and RESOLVED overstates it.

## F7 - two transcripts published as reproduced at this commit do not reproduce at it

**Claimed.** `reviews/ARTIFACTS-round4.md` line 407 introduces K1's blocks with "The whole thing,
reproduced at this commit", and the "Absent" block ends `records: 26 documents checked, no defects`.
Line 303 says of K3's mutant block "That is the finding, reproduced at this commit rather than taken
from round 3's word", and that block prints a test count of 1586.

**Checked.**

```console
$ cd $S/wt && grep -n 'documents checked, no defects' reviews/ARTIFACTS-round4.md | tail -1; sed -n '299p;511p;512p;513p;514p' reviews/ARTIFACTS-round4.md; echo "PUBLISHED_GREP_EXIT=$?"; node tools/check-records.mjs; echo "GATE_EXIT=$?"; npm test > $S/t.txt 2>&1; echo "TEST_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/t.txt | grep -E 'Tests '
439:records: 26 documents checked, no defects
      Tests  1586 passed (1586)
      Tests  1594 passed (1594)
Statements   : 96.07% ( 5535/5761 )
Branches     : 92.89% ( 2497/2688 )
Functions    : 93.41% ( 951/1018 )
PUBLISHED_GREP_EXIT=0
records: 27 documents checked, no defects
GATE_EXIT=0
TEST_EXIT=0
      Tests  1593 passed (1593)
```

The gate reports 27 documents at this commit, because `f538ad6` is the commit that added
`reviews/REVIEW-round4-stage1.md` to `reviews/`.
`npm test` reports 1593, and the K3 mutation is a deletion from four `.scss` files, which cannot change
the count.

**Why it is a defect.** Stage-1 F2 was precisely "a transcript composed at an earlier tree state and
published against a later one", it was one of the three blocking findings, and the commit answering it
left two more of the same in the same document, both under sentences that say "at this commit".
The self-report of how many documents the gate looked at is also the one number a reader has for
checking whether the gate covered this round's own records, which is what F1 is about.

## F8 - stage-1 F11's correction reached the artifact and not the ledger

<!-- cite-historical: src/app/app.config.ts:38-41 - quoted only to identify which of the ledger's markers is being discussed. It names lines past the end of a 38-line file, which is the defect R0-2 records; resolving it would delete the thing under discussion. -->

**Claimed.** `reviews/ARTIFACTS-round4.md` line 199 now says "**Eight citations marked
`cite-historical` in the ledger**" and adds "The count was published as seven, which
REVIEW-round4-stage1 F11 corrected."
The ledger's changed-files table says the records work was "nine stale citations re-resolved, seven
marked historical".
The ledger's Citation bindings preamble still says a `cite-historical` entry names "the location a
finding described before it was fixed, or - twice - a location that never existed".

**Checked.**

```console
$ cd $S/wt && echo "LEDGER_CITE_HISTORICAL=$(grep -c '^<!-- cite-historical: ' PROD-READINESS.md)"; echo "LEDGER_ROW_SAYS_SEVEN=$(grep -c 'seven marked historical' PROD-READINESS.md)"; echo "ARTIFACT_SAYS_EIGHT=$(grep -c 'Eight citations marked' reviews/ARTIFACTS-round4.md)"; echo "TWICE_PREAMBLE=$(grep -c 'or - twice - a location that never existed' PROD-READINESS.md)"
LEDGER_CITE_HISTORICAL=8
LEDGER_ROW_SAYS_SEVEN=1
ARTIFACT_SAYS_EIGHT=1
TWICE_PREAMBLE=1
```

Reading the eight entries, exactly one names a location that never existed
(`src/app/app.config.ts:38-41` in a 38-line file); the other seven name content that moved or was
fixed.
The second out-of-bounds citation lives in `reviews/REVIEW-0.md`, whose markers this list does not
govern, which is the half of F11 the artifact does not mention.

**Why it is a defect.** Both halves of F11 were reported and the ledger's copy of both is unchanged, so
the ledger and its own artifact now state different counts for the same set of markers, and the
preamble still describes its list as containing two things it contains one of.
The ledger's R4-4 row asserts "All ten answered", which is not true of F11.

## F9 - the pinned branch-coverage figure is not deterministic

**Claimed.** The ledger's R4-3 row says the coverage figure was "measured at the tip and re-measured
three times to check it reproduces".
`FIGURES.coverage` pins the branch percentage to two decimals, and rule 4 refuses any live record that
states a different quadruple.

**Checked.** Twelve `npm run test:coverage` runs at this commit: eleven printed
`Branches     : 92.83% ( 2502/2695 )` and one printed `Branches     : 92.87% ( 2503/2695 )`.
The odd run is `run3` in the F2 transcript above, which is a single execution alongside two that
printed 92.83.
Statements, functions and lines were identical in the six runs where I captured all four; the other
six were captured for branches only.

**Why it is a defect.** The reproducibility claim is a three-sample check reported as a property, and
the property is false: the tree has no stable two-decimal branch figure.
Stage-1 F3 reported the same instability at a different commit and the round treated it as an artefact
of a mid-remediation tree.
The consequence is not hypothetical: a future record that states the coverage it just measured is
refused by rule 4 roughly one measurement in twelve, and the person who hits it will be told their true
number is wrong by a gate.
Pinning branches to one decimal, or to a range, would keep the rule and drop the flake.

## F10 - the spec header still carries the sentence stage-1 F10 disproved

**Claimed.** The ledger's R4-4 row lists F10 - "every one is a positive control" false for half the
suite - among the ten findings that were "All ten answered".
Stage-1 F10 states that the sentence appears both in the artifact and "in the spec's own header
comment".

**Checked.**

```console
$ cd $S/wt && echo "SPEC_HEADER_POSITIVE=$(grep -c 'Every test here is therefore a \*positive\* control' tools/check-records.spec.mjs)"; grep -n 'positive. control' tools/check-records.spec.mjs
SPEC_HEADER_POSITIVE=1
17: * Every test here is therefore a *positive* control: it builds a document with a
```

Classifying the 41 test bodies, 19 assert that the checker returns no defect at all, 17 assert a
refusal, and 5 exercise the slug, anchor and `recordsDocs` helpers without calling the checker.

**Why it is a defect.** The artifact was corrected and the source it quotes was not, so the false claim
survives in the file a maintainer actually reads before touching the suite - and it is the claim that
tells them the suite would catch a checker that stopped matching.
Half a correction to a claim about a gate's own protection is the same defect with a smaller audience.

## F11 - the M3 measurement block cannot run as published

**Claimed.** The M3 block is presented as one execution: `npm run test:coverage`, then a `node -e` that
reads `./coverage/blackjack-trainer/coverage-summary.json`.
The prose above it says the `json-summary` reporter was "added temporarily to `vitest.config.ts`
(added, measured, reverted with `git checkout --`)".

**Checked.** With the committed config, that path is never written:

```console
$ cd $S/wt && echo "REPORTERS=$(grep -n 'reporter:' vitest.config.ts | tr -s ' ')"; echo "SUMMARY_JSON_PRESENT=$(test -f coverage/blackjack-trainer/coverage-summary.json && echo yes || echo no)"
REPORTERS=35: reporter: ['text-summary'],
SUMMARY_JSON_PRESENT=no
```

I had to add the reporter myself to obtain the per-file numbers in F2, and I showed that edit inside my
own fence.

**Why it is a defect.** The fence presents two commands as one execution against the committed tree,
and the second cannot run there; the enabling edit is disclosed in prose but is invisible in the
transcript, which is the shape rule 3 exists to refuse and the shape the round's own thesis is about.
It is the mildest of the transcript findings because the edit is disclosed, but it is also the block
whose numbers turned out to be stale, and a reader who tried to re-run it would have discovered that.

## F12 - `.gitignore`'s justification miscounts what the assemble step leaves

**Claimed.** The comment added above `/site` in `.gitignore` says running the deploy's assemble step
locally "leaves 28 built files at the repository root".

**Checked.** After `npm run build -- --base-href /blackjack-trainer/` and the four commands of the
workflow's "Assemble the site" step:

```console
$ cd $S/wt && grep -n '28 built' .gitignore; echo "GITIGNORE_CLAIM_EXIT=$?"; echo "SITE_TOPLEVEL=$(ls site | wc -l | tr -d ' ') SITE_FILES=$(find site -type f | wc -l | tr -d ' ')"
10:# matters; run that step locally to verify the workflow and it leaves 28 built
GITIGNORE_CLAIM_EXIT=0
SITE_TOPLEVEL=34 SITE_FILES=93
```

The artifact's own K1 block prints `34` from `ls site | wc -l` two sections earlier.
28 is the number of files prettier flags, which the same block also prints, on the next command line.

**Why it is a defect.** A comment in a tracked config file states a measured quantity that the round's
own transcript contradicts on the same page, and it reads as the file count rather than the
prettier-warning count.
Small, but it is a number written from memory of a nearby number, which is the failure mode this round
was convened about.

## F13 - the re-triage answers a question about M2 with a table that has no M2 row

**Claimed.** Under "ROUND 4 status" the ledger says "Severity is re-triaged from scratch", and beneath
the table: "The brief asked whether round 3 was right to re-triage M2 to P1 and nothing else. Checked
here: every severity above is the one it was carried in at, because no evidence moved."

**Checked.**

```console
$ cd $S/wt && echo "M2_ROWS_IN_STATUS=$(sed -n '/^## ROUND 4 status/,/^## ROUND 4 regressions/p' PROD-READINESS.md | grep -c '^| M2')"; sed -n '/^## ROUND 4 status/,/^## ROUND 4 regressions/p' PROD-READINESS.md | grep -oE '^\| [A-Za-z0-9]+ ' | tr -d '| ' | tr '\n' ' '; echo "IDS_LISTED_EXIT=$?"
M2_ROWS_IN_STATUS=0
id records K3 N1 N5 K1 K2 M3 D1 I1
IDS_LISTED_EXIT=0
```

M2 is the round's inherited open P1 - an intermittent gate-5 failure - and it appears in no row of the
table the sentence points at.

**Why it is a defect.** The one re-triage question the paragraph says it was asked is answered by
appealing to a table that does not contain the finding in question, so "every severity above" is true
and beside the point.
Either M2 belongs in the status table with its severity restated, or the sentence should say M2 was out
of scope; as written it reads as a check that was performed and was not.

## F14 - "48 further bindings" matches no count of bindings

**Claimed.** `reviews/ARTIFACTS-round4.md` line 44 says rule 2 dropped git "at the price of 48 further
bindings", and the ledger's R4-3 row repeats "which cost 48 further bindings".

**Checked.** Counting `<!-- cite: -->` and `<!-- cite-historical: -->` marker lines in the two binding
documents across the range: `PROD-READINESS.md` goes from 24 to 57 bindings and 7 to 8 historical
markers, and `reviews/ARTIFACTS-round4.md` from 0 to 8 and 0 to 9.
That is 41 new bindings, or 51 new marker lines of both kinds, or 42 new bindings if only the final
commit is counted.
Counting instead the citation occurrences that newly require pinning because the git filter is gone -
citations in those two documents into files `git diff main...f538ad6` does not report as changed -
gives 44 occurrences over 42 distinct keys.
No reading gives 48.

**Why it is a defect.** It is a stated measurement in the round about records arithmetic that no
measurement produces, and rule 4 does not know it.
A later commit outside this range replaced the sentence with counted figures, which is the right
answer; within the reviewed range it is wrong in both documents that state it.

## Verdict

**REJECT.**

The engineering in this range is good and several of the hardest things in it are genuinely done.
Stage-1's three blocking findings are answered in substance: rule 2 no longer consults git and refuses
a broken binding in a repository where `main` resolves to `HEAD`; `FIGURES` is measured at the tip;
`figure-historical` no longer reaches a line nobody marked.
Rule 1 now sees links with no anchor and the dead one in the tree is repaired, the census reproduces
byte for byte including all eleven per-file counts, both halves of K3 are non-vacuous under mutation,
K2's concurrency experiment reproduces, and D1 and I1 re-verify line for line.
Nothing in `src/` is wrong here.

It is rejected on four findings.
F1: the document carrying every one of this round's proofs is once again silently outside rules 3 and 4
over three quarters of its length, one commit after that exact defect was reported as blocking, because
the fix was written against inline code instead of against "not prose"; the round's own blind-spot list
now states the incomplete rule as the rule.
F2: the round's published coverage quadruple, its test count and its checker's per-file coverage are a
commit stale in three documents, and the wrong branch figure is the entire evidence of the K6 finding
being carried to the next round - R3-1's shape, in the round built to end it, in the two places
(table cells and console fences) where rule 4 cannot look.
F3: the commit answering a rule-3 false negative introduced a worse one, opened by an apostrophe in a
shell comment, which disables the rule for an entire fence rather than for one label.
F4: the gate's own suite is given three different sizes across two live records, and the transcript
that should settle it prints a fourth number that the command has not printed since the spec grew.

F5, F7 and F11 compound them, and they are the same shape as F2 and F4: a pointer to a closing table
that was never written, two blocks published as "reproduced at this commit" that do not reproduce at
it, and a measurement block that cannot run as shown.
F6 is a real half-wired fix behind a RESOLVED.
F8, F9, F10, F12, F13 and F14 are individually small, and the reason they matter together is that six
of them are corrections that were applied to one document and not to the other, or measurements
asserted without being measured.

The pattern worth naming is not carelessness.
It is that the round trusts a gate to police the class, and the gate's four rules do not cover the
forms this round's own records actually use: a figure in a table cell, a count in prose, a transcript
whose staleness is a changed number rather than a fabricated label, a marker in a code fence.
Every finding above except F3 and F6 is invisible to `tools/check-records.mjs` today.
The remedy for the blocking four is small: treat a marker in any code context as prose and test it with
a fenced fixture; re-run the M3 measurement and propagate all four numbers plus the headroom to the
ledger; make `continues()` ignore a lone apostrophe or restrict the quote rule to a command that
visibly opens a heredoc-style argument; and re-run the spec transcript and pick one number for the
suite.
