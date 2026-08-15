# REVIEW - round 5, stage 1

<!-- records: historical-file - an answered review, its remediation verdict appended by its own reviewer. The review's figures and transcripts were true at `fa86106`, the tree it reviewed; the verdict's at `ad3c987`, the remediation it accepted; both were checked by this gate with the file unfrozen before this marker was added. The remediation rewrote the checker lines the review cites (the walk replaced the shortcut at the cited previousOf lines), which is exactly the drift the freezing principle names, so the marker is added with the verdict rather than left to the next pass. Citations here are still resolved and bounds-checked. -->

Range reviewed: `bde7d33..fa86106`, nine commits: the closing review's five findings remediated (`d542cf3`, `dd2d445`, `21a7cbc`, `71a9af0`), the K8 design implemented (`100cb8f`), the five K9 holes closed (`c099b1e`) and recorded (`554733f`), four workflow actions bumped (`d986aff`), and the N1/N5 limits discharged against an observed runner (`fa86106`).
This is the range the round-4 closing review asked for, plus two items it did not: the gate's rule 4 inverted from a pin to a refusal, and rule 3's line reading rebuilt to see through containers.
Both are gate-semantics changes, which is exactly the class the round's history says needs fresh eyes most: every fix to this gate has historically introduced a new hole or a stale figure, and a quieter gate looks identical to a cleaner tree.

**Naming.** The closing review's findings are cited as `closing F1` .. `F5`; stage-6's as `stage-6 F1` .. `F12`. My own findings are `F1` .. `F4`.

## How I worked

Everything was measured in the live checkout at `fa86106` (= `HEAD`), on the branch, never switched.
For per-commit claims I used detached worktrees.
I exported the checker at `bde7d33` and ran a 27-fixture battery through both ends of the range via the library API, so "the tip accepts what the base refused" - the regression direction that shipped twice in round 4 - is measured rather than guessed.
I mutation-tested all ten new guards myself, including the five K9 guards the implementer claims are individually pinned, because the implementer's own report admits one mutation run initially did not apply.
For the moved-table check I built a throwaway git repository and drove the checker's real default callbacks through the histories the fixture suite cannot express, because the spec injects `previousOf` and the shipped semantics live in the default.
I verified the two claimed CI run IDs against GitHub itself (`gh api`), not against the ledger's description of them.
I did not re-run gates 2, 5, or 7 to 9: `git diff --name-only bde7d33..fa86106` lists eight files, none under `src/`, `e2e/`, `ios/`, or the Playwright and Angular configuration, which matches the range's claim, and the two workflow files it does touch execute only on a runner.

## The gates, re-run

Gate 1, on the tree as I received it:

```console
$ npm run lint > /private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad/lint1.txt 2>&1; echo "LINT_EXIT=$?"; tail -3 /private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad/lint1.txt
LINT_EXIT=0
Checking formatting...
All matched files use Prettier code style!
records: 34 documents checked, no defects
```

That transcript was taken before this file existed; with this review in the tree the same command prints 35 documents, no defects, which is what the commit carrying this review measures.

Gates 3 and 4, with the artifact's published reporter edit to read the checker's own per-file coverage:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; sed -i '' "s/reporter: \['text-summary'\],/reporter: ['text-summary', 'json-summary'],/" vitest.config.ts && npm run test:coverage > $S/cov4.txt 2>&1; echo "COV_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/cov4.txt | grep -E "Test Files|Tests |Statements|Branches|Functions|Lines  "; node -e '
const s=require("./coverage/blackjack-trainer/coverage-summary.json");
const k=Object.keys(s).find(f=>f.includes("check-records.mjs")); const m=s[k];
console.log("checker: "+m.statements.pct+" / "+m.branches.pct+" / "+m.functions.pct+" / "+m.lines.pct);
console.log("checker branches covered: "+m.branches.covered+" of "+m.branches.total);
console.log("headroom: "+(s.total.branches.pct-92).toFixed(2));
'; git checkout -- vitest.config.ts; echo "REVERTED=$?"
COV_EXIT=0
 Test Files  68 passed (68)
      Tests  1635 passed (1635)
Statements   : 95.9% ( 5638/5879 )
Branches     : 92.73% ( 2566/2767 )
Functions    : 93.23% ( 965/1035 )
Lines        : 97.63% ( 4344/4449 )
checker: 91.87 / 86.32 / 93.47 / 92.36
checker branches covered: 202 of 234
headroom: 0.73
REVERTED=0
```

An earlier full run printed the branch line one branch lower, the documented jitter; both runs and the headroom they imply are the subject of F2.

## Q1 - did the range answer the closing review's five findings on their own terms?

Five yes, verified at the source rather than at the resolution text:

- **closing F1** (K9 filed in a table position markdown renders as nothing): answered.
  K8's row (`PROD-READINESS.md:726`) and K9's row (`PROD-READINESS.md:727`) each carry exactly five pipes, so the NEXT ROUND table renders six rows under the sentence promising six findings.
- **closing F2** (green-at-each false at the merge): answered, and the restatement is true.
  I re-ran gate 1 in detached worktrees at every commit the sentence covers: exit 0 at `c728c68`, `f4fe4f9` and `2ac2a68`, exit 1 at `599da6c` with exactly the two `ci.yml` binding defects the new sentence describes.

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; for c in c728c68 f4fe4f9 599da6c 2ac2a68; do git worktree add --detach $S/wt$c $c > /dev/null 2>&1; ln -sfn "$PWD/node_modules" $S/wt$c/node_modules; (cd $S/wt$c && node tools/check-records.mjs > $S/gate-$c.txt 2>&1); echo "$c: exit=$? $(grep -c 'PROD-READINESS' $S/gate-$c.txt) defect-lines"; git worktree remove --force $S/wt$c; done
c728c68: exit=0 0 defect-lines
f4fe4f9: exit=0 0 defect-lines
599da6c: exit=1 2 defect-lines
2ac2a68: exit=0 0 defect-lines
```

- **closing F3** (worked-example overclaim): answered in the direction the design allows - the closing section's bullets no longer state the unit-test count or any quadruple, the gate table carries the marker, and the proposal records that the sentence "was not true of the tree it was written at".
  But the re-enumeration is selective, and one figure the closing review listed still stands in prose and is now stale - F2 and F4 below.
- **closing F4** (artifact references stopped one move behind): answered.
  The re-resolution table's paragraph and both `cite-historical` notes now name the post-merge locations, both new bindings are pinned, and I verified the content at the files: the retries option sits at `playwright.config.ts:29` and `E2E_SERVER: dist` inside `.github/workflows/ci.yml:84-86`.
  The out-of-range "to 26" note the closing review flagged for the next sweep is also extended to the binding's line.
- **closing F5** (incomplete change inventory): answered.
  The inventory gains the `tools/serve-dist.spec.mjs` row and the gates paragraph now names both halves of `6dbd932`'s code change.

The closing review itself is frozen with a `historical-file` marker whose text correctly names what moved and who added it, per the freezing principle; it is an answered review, so the freeze is the principle applied, not an escape.

## Q2 - K8 as implemented, against the design and against the record

The implementation matches the proposal's "Implemented in round 5" section on every point I could test except one, and that one is F1.
`FIGURES` is the M2 sample alone; the tolerance went with the pin; the marker grammar, the blank-line rule, the malformed-marker refusals and the historical-section behavior are all as recorded and all fixtured.
The migration claim holds where the gate can see: the ledger's closing bullets state no count and no quadruple, the gate table carries `6dbd932` in a marker, and the table body is byte-identical to what the range inherited.
No new exemption marker was added to any live record in the range - the one `figure-historical` in the rewritten bullets was removed, not added - and the only `FIGURES` change is the deletion the design ordered, so the green is earned rather than keyed.

The differential battery, run through the checker at both ends of the range:

```console
$ cd $S && node diffbattery.mjs
fixture                                    base tip
prose-count-matching-old-pin               0    1
prose-count-stale                          1    1
prose-count-comma                          0    0
prose-count-passing                        0    0
prose-quad-matching-old-pin                0    1
prose-quad-stale                           1    1
prose-quad-bare100                         0    1
console-lower-stale-quad                   0    0
console-cased-stale-quad                   1    0  <-- TIP ACCEPTS WHAT BASE REFUSED
console-cased-fake-label                   0    1
blockquoted-fake-label                     0    1
blockquoted-honest                         0    0
list-indented-honest                       1    0  <-- TIP ACCEPTS WHAT BASE REFUSED
list-indented-fake                         1    1
literal-two-fences                         0    1
top-level-fake-label                       1    1
top-level-honest                           0    0
figure-historical-on-code                  1    1
marker-in-inline-code                      1    1
gate-table-marker-inline                   1    1
marked-table                               1    0  <-- TIP ACCEPTS WHAT BASE REFUSED
markerless-table-volatile                  1    1
marker-bad-commit-word                     1    2
marker-uppercase-hex                       1    2
marker-blesses-following-prose-pipe        2    0  <-- TIP ACCEPTS WHAT BASE REFUSED
m2-wrong-count                             1    1
m2-right-count                             0    0
```

Of the four accepted-by-tip rows, three are the point of the range and each is disclosed and fixtured: a case-spelled `Console` fence is now a transcript for rule 4 exactly because it is one for rule 3, the list-indented honest transcript was the false positive that bit the closing reviewer, and a marked gate table is the design.
The fourth is the marker's blast radius: the blessed region is any contiguous run of `|`-prefixed lines, so a marker over a single piped prose line blesses it too.
That requires writing a visible marker, which is the same trust the design already extends to a fabricated table body, so I record it as a latent property of the trust model rather than a defect - but "what ends a blessed table" is answered by "the first line that does not start with a pipe", not by "the table", and the next round should know that.

## Q3 - the five K9 holes, closed and pinned

Each hole was re-probed through the battery above (blockquoted fabricated label refused, cased fence walked and exempted consistently, one marker exempting one fence, list-indented honest transcript accepted, bare-100 quadruple swept) and each guard was mutation-checked individually, alongside the five K8 guards:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; cd /Users/arthurzhang/dev/blackjack-trainer; cp tools/check-records.mjs $S/orig-checker.mjs; for m in dequote caseconsole literalstop dedent bare100 malformed commitexists movedtable blesseverything notable; do cp $S/orig-checker.mjs tools/check-records.mjs; node $S/mutate.mjs $m || { echo "$m: APPLY FAILED"; continue; }; npx vitest run tools/check-records.spec.mjs > $S/mut-$m.txt 2>&1; ec=$?; line=$(sed 's/\x1b\[[0-9;]*m//g' $S/mut-$m.txt | grep -E "Tests  " | head -1); echo "$m: exit=$ec | $line"; done; cp $S/orig-checker.mjs tools/check-records.mjs; git diff --quiet -- tools; echo "RESTORED=$?"
MUTATION dequote: applied
dequote: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION caseconsole: applied
caseconsole: exit=1 |       Tests  2 failed | 81 passed (83)
MUTATION literalstop: applied
literalstop: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION dedent: applied
dedent: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION bare100: applied
bare100: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION malformed: applied
malformed: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION commitexists: applied
commitexists: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION movedtable: applied
movedtable: exit=1 |       Tests  1 failed | 82 passed (83)
MUTATION blesseverything: applied
blesseverything: exit=1 |       Tests  17 failed | 66 passed (83)
MUTATION notable: applied
notable: exit=1 |       Tests  1 failed | 82 passed (83)
RESTORED=0
```

Every mutation script verifies its pattern applied before running, because a broken sed reporting green is how one of the implementer's own runs went wrong.
All ten are killed, and I checked the failing test names: each mutation is killed by exactly the fixture written for it, not incidentally by a neighbor.

## F1 - the moved-table check forgets the defect one commit after it lands, and a rename blinds it entirely - against a record that claims more

**What is claimed.** `reviews/PROPOSAL-round5-volatile-figures.md:91-95`: the check "compares against the last committed version of the document that differs from the working tree - HEAD while the edit is uncommitted, HEAD's first parent once it lands - so a table edited without re-naming its tree is refused in both places the gate runs. Stricter than written, in the direction a records gate should fail."
The code comment at `tools/check-records.mjs:720-722` states the same, and the design's own item 4 says "a table edited without re-naming its tree is refused".

**What I did.** Built a throwaway git repository containing the shipped checker with its real default callbacks, a marked gate table committed at `c1`, then drove it through the histories the spec's injected `previousOf` cannot express.

```console
$ cd $S/wnd && sed -i '' 's/1547 passed/1533 passed/' reviews/A.md && node tools/check-records.mjs; echo "UNCOMMITTED=$?" && git add -A && git -c user.email=t@t -c user.name=t commit -qm c2 && node tools/check-records.mjs; echo "AT_C2=$?" && echo x > other.txt && git add other.txt && git -c user.email=t@t -c user.name=t commit -qm c3 && node tools/check-records.mjs; echo "AT_C3=$?"
records: 1 defect(s)
  reviews/A.md:5: the gate table changed but its marker still names `5b4179f`; a re-measured table re-names the tree it measured
UNCOMMITTED=1
records: 1 defect(s)
  reviews/A.md:5: the gate table changed but its marker still names `5b4179f`; a re-measured table re-names the tree it measured
AT_C2=1
records: 1 documents checked, no defects
AT_C3=0
```

```console
$ cd $S/wnd && git mv reviews/A.md reviews/B.md && sed -i '' 's/1533 passed/1200 passed/' reviews/B.md && node tools/check-records.mjs; echo "RENAMED_UNCOMMITTED=$?"; git -c user.email=t@t -c user.name=t commit -qam c4 && node tools/check-records.mjs; echo "RENAMED_COMMITTED=$?"
records: 1 documents checked, no defects
RENAMED_UNCOMMITTED=0
records: 1 documents checked, no defects
RENAMED_COMMITTED=0
```

**Why it is a defect.** Three ways, in descending order of what the record claims.

1. The description is false of the shipped code.
   `previousOf` (`tools/check-records.mjs:723-740`) reads HEAD, and if HEAD equals the working tree it reads HEAD's first parent - unconditionally, whether or not that version differs.
   At `c3` above, a committed version that differs exists (`c1`), the headline phrase promises it will be found, and the gate returns the non-differing `c2` and goes green.
   "The last committed version of the document that differs" describes a history walk the code does not perform.
2. The escape is reachable without anything unusual.
   An author who commits the bad edit and one more commit before running lint - or who pushes both in one push, since `ci.yml` runs once per push at the head commit - produces a history in which no gate anywhere ever saw the defect.
   The stage-6-F1 defect this check exists to mechanize ("the table false at the tree it names") then stands green forever, and the gate at `bde7d33` would have refused that table at every commit, because the pin checked values, not edits.
   This is the regression direction that shipped twice in round 4, reached by two ordinary commits.
3. The rename case fails even the narrow claim.
   `git mv` plus a table edit in one step is green both uncommitted and committed - measured above - because `previousOf` follows the path and a renamed path has no history.
   "Refused in both places the gate runs" is measurably false for that edit, and the design sentence "a table edited without re-naming its tree is refused" fails with the marker still naming `5b4179f` over a table now reading a third value.

The fixture suite cannot catch any of this: the spec injects `previousOf` as a constant, so the shipped window semantics are exercised by no test - which the coverage report confirms, the default callbacks being among the uncovered arms F2 counts.
**P2, blocking**: a live records document states gate semantics stronger than the gate has, in the round whose last review blocked on exactly that shape, and the honest fixes are either to implement the described walk (and follow renames, or refuse a marked table whose document has no history) or to restate the record to the one-commit window the code actually watches.

## F2 - the range moved the branch headroom and left both live statements of the old value standing

**What is claimed.** `PROD-READINESS.md:823-824`, in the round-4 closing bullets: "Branch headroom over the 92 floor is 0.91, derived from the pinned branch figure rather than from a jitter run (stage-6 F4); finding K6."
K6's row (`PROD-READINESS.md:724`): "The coverage gate's branch headroom is **0.91 points** (92.91% against a floor of 92)".

**Why it is a defect.** The gate code this range added is the least-covered thing in the report - the transcript above shows the checker's branches and the totals - and the headroom the two sentences state is now 0.73 on one run and 0.69 on another at `fa86106`, where 0.91 was measured at `6dbd932`.
Both sentences are present-tense in live, unfrozen sections; the same range added "Since" annotations to the N1, N5 and K9 rows while leaving K6's row asserting a measurement its own commits moved; and the bullet still derives its figure "from the pinned branch figure" - a pin that `100cb8f` deleted, so the stated derivation is no longer performable at the tree.
The gate is silent because a headroom is not one of rule 4's two volatile shapes, which is this round's own lesson - a quieter gate looks identical to a cleaner tree - operating on the range that invoked it.
On coverability: roughly a third of the checker's uncovered branch arms are the default repository callbacks (`tracked`, `commitExists`, `previousOf`) plus the lang-less-block and multi-line-inline-code arms in the parser, all reachable hermetically by a spec fixture that runs `git init` in its temp root and by two small parse fixtures; the CLI entry block is the inherent remainder.
Fixing F1 properly would cover the largest block of them as a side effect.
The floors themselves are K6 and owner-only; nothing here touches them.
**P3, not blocking** - but it belongs in the same remediation as F1, because the honest fix for the two sentences is the design's own: stop stating the moving figure and point at where it is measured.

## F3 - four workflow actions bumped with no record anywhere

`d986aff` edits `.github/workflows/ci.yml` and `.github/workflows/pages.yml` - `actions/cache` to v6, `upload-artifact` to v7, `upload-pages-artifact` to v5, `deploy-pages` to v5 - and no records document mentions the bump, its reason, or its verification.
I verified the substance myself: all four tags exist, three resolve to `node24` runtimes and `upload-pages-artifact@v5` is a composite, so the commit message's claim is sound.
But the round's own inventory discipline ("What round 4 actually changed", closing F5) says a change gets named with its evidence, and this one is invisible outside `git log`; moreover the bumped versions have never executed - the green runs the same range cites as N1/N5 evidence ran the v4 actions at `main`'s tip - so the tree now carries a deploy pipeline no runner has exercised, unrecorded.
**P3, not blocking**: the change is real and probably right, and the defect is that the records do not know it happened.

## F4 - the proposal restates the closing review's F3 minus the two items it did not fix

`reviews/PROPOSAL-round5-volatile-figures.md:99-105` says closing F3 found "the bullets under the gate table stated the unit-test count, both coverage quadruples and the per-file checker quadruple in prose", and concludes the worked-example sentence "is true of the tree that carries this section".
Closing F3's own enumeration had five items: those three, "the E2E count move", and "the branch headroom".
The restatement drops exactly the two the migration left standing - the E2E move and the headroom bullet, the latter now stale (F2).
Against the design as written the two dropped items are defensible, since neither matches the design's two named volatile shapes; against the reviewer's finding as stated, the paragraph quietly narrows what was found before declaring it answered, which is the shape stage-6 F11 and closing F3 were both filed for.
**P4, not blocking**, and folded into F2's remediation if the headroom sentence becomes a pointer.

## N1 and N5, verified at the source

Both run IDs resolve on GitHub to what the rows claim, checked against the API rather than the prose:

```console
$ gh api repos/:owner/:repo/actions/runs/31839195176 --jq '{id, name, head_sha, head_branch, status, conclusion, created_at, path}' 2>&1; gh api repos/:owner/:repo/actions/runs/31839195142 --jq '{id, name, head_sha, head_branch, status, conclusion, created_at, path}' 2>&1
{"conclusion":"failure","created_at":"2026-08-14T20:43:17Z","head_branch":"main","head_sha":"2ac2a6893f24f9b05b6ebe3b9890cdcfd4c90790","id":31839195176,"name":"Pages","path":".github/workflows/pages.yml","status":"completed"}
{"conclusion":"success","created_at":"2026-08-14T20:43:17Z","head_branch":"main","head_sha":"2ac2a6893f24f9b05b6ebe3b9890cdcfd4c90790","id":31839195142,"name":"CI","path":".github/workflows/ci.yml","status":"completed"}
```

The Pages run's `build` job succeeded at every step - lint, coverage, parity, build, E2E, assemble, upload - and its `deploy` job failed inside `deploy-pages` with "Failed to create deployment (status: 404) ... Ensure GitHub Pages has been enabled", which is O4 verbatim, exactly as the N1 row states.
The CI run's `pages-bundle`, `validate` and `e2e` jobs all succeeded, which is N5's claim.
Both rows correctly keep the finding open on the owner action and discharge only the round-3 UNVERIFIED limit; nothing is overclaimed.

## What I attacked that held

- **The inverted sweep.** A count matching the old pin, a quadruple matching the old pin, a bare-100 quadruple, figures beside the table, figures in inline code, figures in a non-console fence, a `figure-historical` printed on a code line, a markerless table: all refused at the tip, several of them accepted at the base.
  The refusal direction of the inversion is uniformly stricter in prose.
- **The marker grammar.** A wordy marker, an uppercase-hex marker, a marker with no table, a marker naming a commit the repository lacks: all refused, each by its own fixture, each mutation-killed.
  A marker mentioned in inline code or printed inside a transcript blesses nothing.
- **Rule 3 through containers.** Fabricated labels refused blockquoted, case-spelled, list-indented and top-level; honest transcripts accepted in all four spellings; one `transcript-literal` exempts exactly one fence.
  No input I could construct is accepted by the tip and refused by the base except the three disclosed, fixtured directions and the piped-prose blessing recorded in Q2.
- **The self-referential trap.** The gate's own spec quotes refused shapes only inside fixture strings the gate never reads, the proposal writes its marker example in inline code, and the ledger's gate table body is unchanged in the range while gaining its marker - I diffed the table bytes against `bde7d33` to check the marker was not used to slip a value.
- **The K9 sweep spellings that remain open**, for the next round rather than as findings: a count written with a thousands separator or followed by a word the regex does not know escapes the volatile sweep at both ends of the range, so the inversion's coverage of prose spellings is exactly its two regexes, no wider.

## The gate against this review

The new rule 4 shaped this document from the first draft: every suite size, quadruple and headroom above lives in a transcript because the sweep refuses them in prose, including in inline code, and that constraint was workable without touching the escape hatch once - no `figure-historical`, no `transcript-literal`, no marker of mine anywhere in this file.
The gate raised no false positive against any honest sentence I wanted to write; the two places I reworded (a fixture description that wanted to quote its own count, and this section's first draft naming the headroom in prose) are the rule working as designed, not the rule failing.
I also planted a fabricated exit label inside one of this file's own transcripts and watched the gate refuse it, so the green below is a walked green, not a skipped one.
That is one reviewer-hour of evidence that the inverted rule is livable, which round 4 could not have said of the pin.

## Verdict

**REJECT.**

F1 is blocking and it is both kinds of defect at once: a live record stating gate semantics the gate does not have, and a gate hole of the round's signature class - the moved-table check, the one mechanical answer to "the table false at the tree it names", goes permanently quiet one covering commit or one rename after the defect lands, while the gate at the base of the range would have refused the same table at every commit.
Everything else in the range is honest work that held under attack: all five closing findings answered on their terms and re-measured, all ten guard mutations killed by their own fixtures, the K9 holes genuinely closed with no regression I could construct beyond the disclosed trade-offs, the N1/N5 discharge verified at GitHub itself, and the migration to the new discipline performed without a single quiet exemption.
The remediation for F1 is small and has two honest shapes; F2 to F4 are records sweeps that can ride along with it.

## Remediation verdict - 2026-08-15, on `fa50f87..ad3c987`

The four findings above were remediated in four commits (`7f7f536`, `8220729`, `82e7439`, `ad3c987`), reviewed here by the reviewer who filed them.
Every claim was re-verified against the source and against fresh throwaway repositories, not against the remediation's description of itself.

| finding | verdict    | why                                                                                                                                                                                                                                                         |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | **ACCEPT** | `previousOf` now walks the file's history with renames followed; all three escape histories I measured are re-driven below and refused, a clean history is not falsely refused, and the record now describes the walk that shipped.                         |
| F2      | **ACCEPT** | both statements of the headroom are past-tense facts about `6dbd932` with pointers at where the moving value lives; "derived from the pinned branch figure" became "derived at the time from the then-pinned"; both parser-arm fixtures I named were added. |
| F3      | **ACCEPT** | a `# ROUND 5` section now carries the round's running inventory, and the `d986aff` row states in bold that the bumped actions have not executed on a runner.                                                                                                |
| F4      | **ACCEPT** | the proposal restates closing F3's enumeration whole, names the two standing items and the design reason they stand, and scopes the worked-example claim to what the sweep governs.                                                                         |

**Overall: ACCEPT.** One new finding came out of probing the walk, filed below as F5: it is not a failure of this remediation - it predates it, inside my own stage-1 range, and I missed it - but it is open, and it will turn CI red on the first push after this branch merges.

### F1, re-driven on its own terms

The three escapes, against the shipped checker's real default callbacks in fresh repositories:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; rm -rf $S/wnd2 && mkdir -p $S/wnd2/tools $S/wnd2/reviews && cd $S/wnd2 && git init -q . && cp /Users/arthurzhang/dev/blackjack-trainer/tools/check-records.mjs tools/ && ln -sfn /Users/arthurzhang/dev/blackjack-trainer/node_modules node_modules && git add tools && git -c user.email=t@t -c user.name=t commit -qm c0 && SHA=$(git rev-parse --short HEAD) && printf '# A\n\n<!-- gate-table: %s -->\n\n| # | gate | result |\n| --- | --- | --- |\n| 3 | unit tests | 1547 passed |\n' "$SHA" > reviews/A.md && git add reviews && git -c user.email=t@t -c user.name=t commit -qm c1 && node tools/check-records.mjs; echo "CLEAN_C1=$?"; sed -i '' 's/1547 passed/1533 passed/' reviews/A.md && git -c user.email=t@t -c user.name=t commit -qam c2 && echo x > other.txt && git add other.txt && git -c user.email=t@t -c user.name=t commit -qm c3 && node tools/check-records.mjs; echo "COVERING_COMMIT=$?"; echo y >> other.txt && git -c user.email=t@t -c user.name=t commit -qam c4 && node tools/check-records.mjs > /dev/null 2>&1; echo "TWO_COMMITS_LATER=$?"
records: 1 documents checked, no defects
CLEAN_C1=0
records: 1 defect(s)
  reviews/A.md:5: the gate table changed but its marker still names `26a55cc`; a re-measured table re-names the tree it measured
COVERING_COMMIT=1
TWO_COMMITS_LATER=1
```

```console
$ cd $S/wnd2 && git mv reviews/A.md reviews/B.md && sed -i '' 's/1533 passed/1200 passed/' reviews/B.md && node tools/check-records.mjs > $S/p-staged.txt 2>&1; echo "STAGED_RENAME=$?"; grep -c "re-names the tree" $S/p-staged.txt; git -c user.email=t@t -c user.name=t commit -qam c5 && node tools/check-records.mjs > $S/p-committed.txt 2>&1; echo "COMMITTED_RENAME=$?"; grep -c "re-names the tree" $S/p-committed.txt
STAGED_RENAME=1
1
COMMITTED_RENAME=1
1
```

The covering-commit escape and both rename escapes are closed, and the refusal persists at later trees instead of fading.
A doc touched by fifteen hundred commits keeps the gate fast, because the walk stops at the first version that differs:

```console
$ cd $S/deep && git rev-list --count HEAD; time node tools/check-records.mjs; echo "DEEP_EXIT=$?"
1502
records: 1 documents checked, no defects
node tools/check-records.mjs  0.23s user 0.05s system 147% cpu 0.192 total
DEEP_EXIT=0
```

I mutation-checked the walk myself, four ways - the stage-1 shortcut restored, `--follow` dropped, the staged-rename fallback disabled, the differs requirement removed - each verified applied on disk before running:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; cd /Users/arthurzhang/dev/blackjack-trainer; cp tools/check-records.mjs $S/orig2-checker.mjs; for m in shortcut nofollow nostaged nodiffer; do cp $S/orig2-checker.mjs tools/check-records.mjs; node $S/mutate2.mjs $m || { echo "$m: APPLY FAILED"; continue; }; npx vitest run tools/check-records.spec.mjs > $S/mut2-$m.txt 2>&1; ec=$?; line=$(sed 's/\x1b\[[0-9;]*m//g' $S/mut2-$m.txt | grep -E "Tests  " | head -1); echo "$m: exit=$ec | $line"; done; cp $S/orig2-checker.mjs tools/check-records.mjs; git diff --quiet -- tools; echo "RESTORED=$?"
MUTATION shortcut: applied
shortcut: exit=1 |       Tests  3 failed | 87 passed (90)
MUTATION nofollow: applied
nofollow: exit=1 |       Tests  1 failed | 89 passed (90)
MUTATION nostaged: applied
nostaged: exit=1 |       Tests  1 failed | 89 passed (90)
MUTATION nodiffer: applied
nodiffer: exit=1 |       Tests  2 failed | 88 passed (90)
RESTORED=0
```

All four are killed, each by exactly the real-repository fixture written for its history, none incidentally.

**One residual, recorded rather than filed.**
The walk refuses an honest revert forever: a bad table edit that lands and is then reverted to the marker's original body leaves the newest differing version being the bad one, so the gate stays red at every later tree even though the current table is true at the tree its marker names.

```console
$ cd $S/osc && node tools/check-records.mjs; echo "AFTER_REVERT=$?"; echo x > o.txt && git add o.txt && git -c user.email=t@t -c user.name=t commit -qm c4 && node tools/check-records.mjs > /dev/null 2>&1; echo "REVERT_PLUS_ONE=$?"
records: 1 defect(s)
  reviews/A.md:5: the gate table changed but its marker still names `cfac71f`; a re-measured table re-names the tree it measured
AFTER_REVERT=1
REVERT_PLUS_ONE=1
```

The letter of the new record covers this ("until the marker moves"), and the direction is strict, but the only exits are moving the marker - wrong, nothing was re-measured - or freezing the section.
Whoever next touches the gate should decide whether the comparison target ought to be the version at the marker's own commit rather than the newest differing version; that choice is a design change, not this remediation's debt.
A brand-new document carrying a fabricated marked table remains accepted, unchanged: with no history there is nothing to compare, which the design discloses as the trust it extends to a first measurement.

### F2 to F4, re-verified

The K6 row and the closing bullet now state 0.91 as a fact about `6dbd932`, the tree the round-4 gate table names; nothing in the records states the current headroom, which I confirmed by search; and the coverage run below shows the remediation's fixtures moved the branch figure up, because the git-default callback arms my F2 counted as uncovered are now driven by real repositories.
The `# ROUND 5` inventory names every change of the round including this review, and the actions-bump row carries the unexercised-pipeline disclosure.
The proposal's re-enumeration matches closing F3's five items word for word, and its scoping sentence is accurate: the two standing figures are outside the sweep's two shapes, and the E2E count is one the sweep declines on purpose.

### The gates, re-run at `ad3c987`

```console
$ npm run lint > $S/r-lint.txt 2>&1; echo "LINT_EXIT=$?"; tail -1 $S/r-lint.txt
LINT_EXIT=0
records: 35 documents checked, no defects
```

```console
$ for c in 7f7f536 8220729 82e7439 ad3c987; do git worktree add --detach $S/rwt$c $c > /dev/null 2>&1; ln -sfn "$PWD/node_modules" $S/rwt$c/node_modules; (cd $S/rwt$c && npm run lint > $S/rlint-$c.txt 2>&1); echo "$c: lint_exit=$? | $(tail -1 $S/rlint-$c.txt)"; git worktree remove --force $S/rwt$c; done
7f7f536: lint_exit=0 | records: 35 documents checked, no defects
8220729: lint_exit=0 | records: 35 documents checked, no defects
82e7439: lint_exit=0 | records: 35 documents checked, no defects
ad3c987: lint_exit=0 | records: 35 documents checked, no defects
```

```console
$ npm run test:coverage > $S/r-cov.txt 2>&1; echo "COV_EXIT=$?"; sed 's/\x1b\[[0-9;]*m//g' $S/r-cov.txt | grep -E "Test Files|Tests |Statements|Branches|Functions|Lines  "
COV_EXIT=0
 Test Files  68 passed (68)
      Tests  1642 passed (1642)
Statements   : 96.06% ( 5671/5903 )
Branches     : 92.96% ( 2589/2785 )
Functions    : 93.54% ( 971/1038 )
Lines        : 97.85% ( 4374/4470 )
```

Every figure the remediation claimed reproduces exactly.

## F5 - the gate is red in a shallow clone, and CI's checkout is shallow

**What happens.** `actions/checkout@v5` fetches depth 1 by default, and neither workflow sets `fetch-depth`; `ci.yml`'s `validate` job and `pages.yml`'s `build` job both run `npm run lint`.
In a depth-one clone the marker's commit does not exist as an object, so `commitExists` fails and the gate refuses the ledger's own gate table; the history walk, for its part, sees no history and silently skips.
Measured in a depth-one clone of this repository at `ad3c987`:

```console
$ S=/private/tmp/claude-501/-Users-arthurzhang-dev-blackjack-trainer/f476f314-0af6-45d4-b550-3b8110120231/scratchpad; rm -rf $S/shallow && git clone -q --depth 1 file:///Users/arthurzhang/dev/blackjack-trainer $S/shallow 2>/dev/null && cd $S/shallow && git rev-list --count HEAD; ln -sfn /Users/arthurzhang/dev/blackjack-trainer/node_modules node_modules; node tools/check-records.mjs; echo "SHALLOW_GATE_EXIT=$?"
1
records: 1 defect(s)
  PROD-READINESS.md:795: gate-table marker names `6dbd932`, which is not a commit in this repository
SHALLOW_GATE_EXIT=1
```

**Why it has not bitten yet.** The green runs the N1 and N5 rows cite ran at `2ac2a68`, where the gate had no gate-table logic; the K8 gate has never executed on a runner.
The first push after this branch merges turns the `validate` job and the Pages `build` job - the one N1's discharge relies on to stand between a push and a deploy - red on every push, with a false positive about a commit that is in the repository.

**Where it came from, honestly.** `100cb8f` introduced `commitExists`, inside the range my stage-1 review covered; I probed it with injected callbacks and full-history worktrees and never with a shallow clone, so I missed it, and the remediation under review here neither introduced nor touched it.
It fails strict - nothing escapes silently, CI is loudly red - but a gate that is red on every honest push is a broken gate.

**P2, blocking for the next push, not for this remediation.**
The remedy is a choice to make and record: `fetch-depth: 0` on the two checkouts (one line each, plus an inventory row), or a gate-side policy for repositories whose history is absent, in which case the walk's behavior there should be stated too.

## Verdict on the remediation

**ACCEPT.**
All four findings are closed on the terms they were filed on, with the escape histories pinned as fixtures that drive the checker's real git callbacks - the exact instrument whose absence let the shortcut ship - and the records now describe the gate that exists.
F5 stands open for the next remediation, filed above with its measurement.
