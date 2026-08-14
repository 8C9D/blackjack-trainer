# REVIEW - round 3, stage 2

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

**Verdict: PASS-WITH-FINDINGS**

Range: `406a32e..b09470d`, two commits - `772e4a7` ("pool the before-rate the reviewer disproved and
stop calling a rescaled budget a removal") and `b09470d` ("gate the deploy on the checks CI runs, look
at the bundle it publishes, and typecheck the suites nothing typechecked"). Files touched:
`.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `PROD-READINESS.md`, `e2e/fixtures/flows.ts`,
`e2e/smoke/showdown.e2e.ts`, `package.json`, `package-lock.json`, `tsconfig.spec.json`,
`reviews/ARTIFACTS-round3.md`, `reviews/REVIEW-round3-stage1.md`.

Every transcript in the range was treated as an unverified assertion and re-run. The two applied
patches (N1, N5) are real, both are non-vacuous, and their PATCH-READY/RESOLVED line is drawn where
the ledger says it is. The M2 correction is not only right, it is corroborated by a third independent
sample I took here. The findings below are one substantive proof gap (F1), one overclaim reintroduced
by the commit that was written to remove that class of overclaim (F2), and five text/number defects
where a correction did not reach everywhere it says it reached.

## How these measurements were taken

A **later stage is working in this same checkout**, and it moved while I was measuring: `HEAD` advanced
from `b09470d` to `9aaac6b`, `src/`, `public/manifest.webmanifest`, `package.json`,
`.github/workflows/ci.yml`, `PROD-READINESS.md` and `reviews/ARTIFACTS-round3.md` all changed under me,
and none of that belongs to this range. So every gate result and mutation below was taken against a
**pristine export of the reviewed tip**, not the live tree:

```console
$ git archive b09470d | tar -x -C "$SCRATCH/tip"
$ ln -sfn /Users/arthurzhang/dev/blackjack-trainer/node_modules "$SCRATCH/tip/node_modules"
$ cd "$SCRATCH/tip" && git init -q . && git add -A && git commit -q -m base
$ git status --porcelain
(no output)
```

All file:line citations are against `b09470d`, read out of that export. All commands ran with the tool
sandbox disabled. `127.0.0.1:4200` answered nothing before each E2E result reported here; the one time
a listener was up it was another project's `ng serve` on `[::1]:4200` (PID 67768), and I waited for it
rather than touching it. The stray `node` on `[::1]:4321` was left alone.

## Findings

### F1 - M1's "second doorway" was already covered, and the widening leaves the gate wrong for a real test file

`reviews/ARTIFACTS-round3.md:849-851`:

> and `tsconfig.spec.json` picks up the second doorway REVIEW-round2-final (FF-6) named - the
> `**/*.test.ts` glob that `angular.json`'s test target collects (resolved against `sourceRoot`) and no
> tsconfig covered

and `reviews/ARTIFACTS-round3.md:895` ("A file the unit runner executes and no tsconfig covered is now
covered"), and the same claim in the committed comment at `tsconfig.spec.json:9-11`.

`tsconfig.app.json:9-10` includes `src/**/*.ts` and excludes **only** `src/**/*.spec.ts`, so
`src/**/*.test.ts` was already in the app project - which is precisely the project the pre-change
`npm run typecheck` ran, and the only one it ran. The artifact's own doorway file proves it, run
against the gate as it stood before this range:

```console
$ printf '// temporary doorway probe\nconst collectedButNeverTypechecked: number = %s;\nexport { collectedButNeverTypechecked };\n' "'not a number'" > src/app/doorway.test.ts

$ npx tsc --noEmit -p tsconfig.spec.json     # the new include
src/app/doorway.test.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.
NEW_SPEC_EXIT=2

$ npx tsc --noEmit -p tsconfig.app.json      # what `npm run typecheck` was at 406a32e
src/app/doorway.test.ts(2,7): error TS2322: Type 'string' is not assignable to type 'number'.
APP_EXIT=2
```

The artifact's proof (`reviews/ARTIFACTS-round3.md:887-893`) compares `tsconfig.spec.json` new-include
against `tsconfig.spec.json` old-include and stops there. For the `e2e/fixtures/lane.ts` mutation in the
same section it did run the old gate for comparison (`OLD_GATE_EXIT=0`, which I reproduced exactly, see
"Reproduced and held"); for the doorway it did not, and that is the one comparison that would have
shown the gap was not a gap.

This is not only a wording defect, because the app project's `types` is `[]`
(`tsconfig.app.json:7`). A realistic `src/**/*.test.ts` - one that uses the globals the unit runner
provides - now passes the project that was widened for it and fails the project nobody adjusted:

```console
$ cat src/app/doorway.test.ts
// temporary doorway probe: a realistic vitest file
describe('doorway', () => {
  it('is collected by the unit runner', () => {
    expect(1).toBe(1);
  });
});

$ npx tsc --noEmit -p tsconfig.spec.json     # types: ["vitest/globals"]
SPEC_EXIT=0

$ npx tsc --noEmit -p tsconfig.app.json      # types: [], still no *.test.ts exclude
src/app/doorway.test.ts(2,1): error TS2593: Cannot find name 'describe'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
src/app/doorway.test.ts(3,3): error TS2593: Cannot find name 'it'. Do you need to install type definitions for a test runner? Try `npm i --save-dev @types/jest` or `npm i --save-dev @types/mocha` and then add 'jest' or 'mocha' to the types field in your tsconfig.
src/app/doorway.test.ts(4,5): error TS2304: Cannot find name 'expect'.
APP_EXIT=2
```

So the first person who uses the `**/*.test.ts` naming the widening was added to protect takes
`npm run lint` red with three errors about a file that is correct. The missing half of the patch is
`"exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]` in `tsconfig.app.json`; without it the widening
closes nothing at this tree (`find src -name '*.test.ts'` returns 0 files) and makes the gate wrong the
moment it would have mattered.

One more file class is worth naming, because the sentence at `:895` is absolute. `angular.json:75`
collects `["**/*.spec.ts", "**/*.test.ts", "../tools/**/*.spec.mjs"]`, and the third glob really does
execute today - it is 2 of the 67 test files the coverage gate reports:

```console
$ find src -name '*.spec.ts' | wc -l
      65
$ find src -name '*.test.ts' | wc -l
       0
$ ls tools/*.spec.mjs
tools/export-parity-fixtures.spec.mjs
tools/serve-dist.spec.mjs
$ grep -oE "spec-tools-[a-z-]+" coverage.log | sort -u
spec-tools-export-parity-fixtures
spec-tools-serve-dist
```

Those two are covered by no tsconfig before or after this range. The `e2e/**` half of M1 is genuinely
fixed and genuinely proven; it is the "second doorway" half that does not hold.

### F2 - "a machine 2.5x slower will fail every time" is false against the band the same commit published

`reviews/ARTIFACTS-round3.md:436-438`, added by `772e4a7`:

> The same sentence bounds the fix, and is stated here rather than left for a reader to derive: a
> machine 2.5x slower than this one will fail every time **with** the fix.

and `PROD-READINESS.md:477` (R3-2's resolution column): "a machine 2.5x slower still fails every time."

The same commit widened the measured stream band to 2.68-3.08 s (`e2e/fixtures/flows.ts:64`,
`reviews/ARTIFACTS-round3.md:368`, `:455`). A machine `k` times slower fails only when `k x stream`
exceeds the 7600 ms budget, so "every time" needs `k` above `7600 / 2680`, not `7600 / 3080`:

```console
$ python3 -c "print('7600/3080 =', 7600/3080); print('7600/2678 =', 7600/2678); print('2678*2.5 =', 2678*2.5, 'vs budget 7600'); print('3080*2.5 =', 3080*2.5, 'vs budget 7600')"
7600/3080 = 2.4675324675324677
7600/2678 = 2.8379387602688574
2678*2.5 = 6695.0 vs budget 7600
3080*2.5 = 7700.0 vs budget 7600
```

At 2.5x the bottom of the published band is 6695 ms, comfortably inside the budget: that machine
passes. "Every time" starts at about 2.84x. The claim is quoted against one end of a two-ended band and
asserted over the whole of it, which is the same move R3-2 exists to correct.

The same commit also invalidates the sentence one line above it,
`reviews/ARTIFACTS-round3.md:435` ("on a machine 1.8x slower than this one it fails **every** time"),
which was true of the old 2.80-3.08 s band and is not true of the new one:

```console
$ python3 -c "print('2678*1.8 =', 2678*1.8, 'vs budget 5000')"
2678*1.8 = 4820.400000000001 vs budget 5000
```

That sentence was inherited, but it sits in the paragraph `772e4a7` rewrote, and the band it depends on
is what `772e4a7` changed. Both should read as thresholds ("a machine more than about 2.8x slower"),
not as properties.

### F3 - R3-1 says the rate was corrected in the artifact; three places still carry the disproved 3.0%

`PROD-READINESS.md:476`, R3-1's resolution column:

> The 3.0% sample is kept in the table, not deleted, and the rate is corrected in the artifact, the
> ledger and `showdown.e2e.ts`.

The section title, the summary table, the re-triage sentence at `:283-284` and the source comment were
indeed corrected. Three occurrences were not, and one of them is inside the sentence the same commit
rewrote:

```console
$ grep -n "The rate is 3% per execution\|1 run in 33 before that\|Measured at 2 of 60 seeds and 6 of 200" reviews/ARTIFACTS-round3.md
195:+  // is working correctly. Measured at 2 of 60 seeds and 6 of 200 unseeded runs.
280:release gate that is red roughly one run in four". The rate is 3% per execution, not 25% per run, and
508:1 run in 30 before this stage (M4) and 1 run in 33 before that (M2, per-execution 3.0%); it is now
```

- `:280` states "The rate is 3% per execution" three lines above the corrected "a 5%-per-execution
  flake" at `:284`, in the same paragraph.
- `:508` states "1 run in 33 before that (M2, per-execution 3.0%)" in the Gate 5 summary sentence that
  `772e4a7` edited - the diff changed the clause after the semicolon and left this one.
- `:195` is worse than stale: it is a `+` line of the `### Fix` diff block, so it publishes file content
  that the tree does not have. The committed comment reads differently, because the same commit changed
  it:

```console
$ sed -n '73,74p' e2e/smoke/showdown.e2e.ts
  // is working correctly. Measured at 2 of 60 seeds, and at 20 of 400 unseeded
  // runs across two independent samples (6/200 and 14/200).
```

### F4 - the ledger's link to the M2 artifact is broken by the same commit that renamed the heading

`PROD-READINESS.md:439` still points at the old slug, while `reviews/ARTIFACTS-round3.md:12` was renamed
from "thirty-three" to "twenty" by `772e4a7`. Anchors derived from the artifact's own `##` headings
against the anchors the ledger references:

```console
$ grep -n '^## ' reviews/ARTIFACTS-round3.md | while IFS= read -r l; do n=${l%%:*}; h=${l#*:## }; \
    a=$(printf '%s' "$h" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 -]//g' | sed 's/ /-/g'); echo "$n  #$a"; done
12  #m2---the-e2e-gate-is-red-about-one-run-in-twenty-and-it-is-the-test-that-is-wrong
303  #m4---a-second-different-intermittent-in-the-same-gate-found-by-measuring-m2
478  #gate-5-at-the-end-of-stage-1
514  #n1---a-red-ci-does-not-stop-the-deploy-and-now-it-is-asked-to
693  #n5---no-gate-builds-the-bundle-that-is-actually-deployed
788  #m1---nothing-typechecks-e2e-and-the-config-that-would-could-not-run

$ grep -on 'ARTIFACTS-round3\.md#[a-z0-9-]*' PROD-READINESS.md
439:ARTIFACTS-round3.md#m2---the-e2e-gate-is-red-about-one-run-in-thirty-three-and-it-is-the-test-that-is-wrong
440:ARTIFACTS-round3.md#m4---a-second-different-intermittent-in-the-same-gate-found-by-measuring-m2
441:ARTIFACTS-round3.md#n1---a-red-ci-does-not-stop-the-deploy-and-now-it-is-asked-to
442:ARTIFACTS-round3.md#n5---no-gate-builds-the-bundle-that-is-actually-deployed
443:ARTIFACTS-round3.md#m1---nothing-typechecks-e2e-and-the-config-that-would-could-not-run
```

Four of five resolve. The M2 row is the P1 the round opens with, and its "artifact in ..." link now
lands nowhere.

### F5 - the margins are still not on a consistent basis, and the docs disagree with the comment that shipped

`PROD-READINESS.md:481` (R3-6's resolution column) claims "both margins now quoted on a consistent basis
(1.6-1.8x -> 2.5-2.8x)", and `reviews/ARTIFACTS-round3.md:367`, `:456` and `:473` plus
`PROD-READINESS.md:454` and `:477` all say `1.6-1.8x`. The comment the same commit shipped says
something else:

```console
$ sed -n '63,68p' e2e/fixtures/flows.ts
  // under the full parallel suite on two machines-worth of runs, the 26-card
  // caller spends 2.68-3.08 s of it just streaming — so the old fixed budget was
  // 1.6-1.9x the stream, and one full-suite run in 30 exceeded the whole budget
  // and failed here. This raises the ceiling rather than removing it: the same
  // caller now has 2.5-2.8x. It is still not the same move as raising a timeout
  // to hide a race — the form is not racing anything, it arrives on a schedule
  // the test itself set, and the budget now scales with that schedule.

$ python3 -c "print(5000/3080, 5000/2678, 7600/3080, 7600/2678)"
1.6233766233766234 1.8670650485436893 2.4675324675324677 2.8379387602688574
```

`5000/2678 = 1.867` rounds to 1.9, which is what `flows.ts:65` says and what the three documents do not.
The consistent pair is `1.6-1.9x -> 2.5-2.8x`: the documents round the low-budget top end down while
rounding the high-budget top end up, which is the same asymmetry F6 of stage 1 objected to, in smaller
form. Nothing downstream depends on the third significant figure; the finding is that the sentence
claiming consistency is the one that is inconsistent, and that a committed source comment and the
artifact describing it now disagree.

### F6 - "about one time in twenty" for the two samples' disagreement is about one time in nine

`reviews/ARTIFACTS-round3.md:177-178`:

> Neither point estimate lies inside the other's interval, which is what a 200-trial sample of a ~5%
> event does about one time in twenty

Enumerated exactly, over all pairs of outcomes of two independent `Binomial(200, 0.05)` draws, with the
same Clopper-Pearson intervals the artifact uses:

```console
$ python3 exact-pair-probability.py
mass covered: 0.9999999999999569
P(neither point estimate inside the other's interval) = 0.10648621587791128 = 1 in 9.390886808735145
P(at least one outside)                                = 0.1789690590699271 = 1 in 5.587558012523708
```

About 1 in 9, not 1 in 20, on either reading. The direction is conservative for the argument being made
(the disagreement is more ordinary than the artifact claims, not less), which is why this is filed low;
but it is a published number that does not reproduce.

### F7 - one transcript shows a line the quoted command cannot emit, and the generator is not committed

`reviews/ARTIFACTS-round3.md:603-609`:

```console
$ CI=true E2E_SERVER=dist bash -e out/step09.sh
load before: 9.22 44.20 97.85
Running 111 tests using 1 worker
  111 passed (2.7m)
STEP9_EXIT=0
```

The same section, at `:574-576`, defines what `out/step09.sh` is: "a runner reads the workflow with a
YAML parser, writes each step's `run:` script to a file, and executes it with `bash -e`". Step 9's
`run:` is one line, so the script cannot print a load average:

```console
$ ruby -ryaml -e 'd=YAML.load_file(".github/workflows/pages.yml"); d["jobs"]["build"]["steps"].each_with_index { |s,i| File.write("out/pstep%02d.sh" % (i+1), s["run"]) if s["run"] }'
$ cat out/pstep09.sh
npm run e2e
$ CI=true E2E_SERVER=dist bash -e out/pstep09.sh   # my run of the same file
Running 111 tests using 1 worker
  111 passed (2.8m)
STEP9_EXIT=0
```

The measurement itself reproduces exactly, including the worker count and within 6 seconds of the
published duration, so the substance is sound and this is filed low. The objection is that the `$` line
and the output block do not belong to the same command, in a stage whose own R3-7 records three
transcripts written from memory. The same applies to `run-workflow-steps.rb`, which is not committed:
none of the `=== summary ===` blocks at `:579-595` and `:717-726` can be re-run as written, so I
regenerated the step files from the YAML myself, as above.

## Reproduced and held

Everything below is a claim from the range that I tried to break and could not.

**M2's pooled before-rate holds, on a third independent sample.** This is the central new number in
`772e4a7`, and it rests on a measurement taken by someone else, so I took my own. Exactly the one
argument the fix adds, reverted at `e2e/smoke/showdown.e2e.ts:77` and nothing else:

```console
$ git diff --stat
 e2e/smoke/showdown.e2e.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git diff
-    await runCountingRound(page, 1);
+    await runCountingRound(page);
$ E2E_SERVER=dist npx playwright test --grep "returning to counting keeps the drill going" --repeat-each=200
Running 200 tests using 6 workers
  13 failed
  187 passed (2.0m)
$ grep -oE "Error: expect\(locator\)\.[a-zA-Z]+\(\) failed" before200b.log | sort | uniq -c
  13 Error: expect(locator).toBeHidden() failed
```

13 / 200 = 6.50%, the same assertion in all thirteen. Clopper-Pearson, by bisection on the binomial
CDF:

| sample               | failures | rate  | exact 95% CI    |
| -------------------- | -------- | ----- | --------------- |
| artifact             | 6 / 200  | 3.00% | [1.11%, 6.42%]  |
| REVIEW-round3-stage1 | 14 / 200 | 7.00% | [3.88%, 11.47%] |
| this review          | 13 / 200 | 6.50% | [3.51%, 10.86%] |
| published pooled     | 20 / 400 | 5.00% | [3.08%, 7.62%]  |
| all three pooled     | 33 / 600 | 5.50% | [3.82%, 7.64%]  |

The published 5.0% sits inside my sample's interval and the three-sample pool sits inside the published
interval, so the correction is sound and, if anything, slightly conservative. The published interval
arithmetic reproduces exactly, as does the after-evidence power:

```console
$ python3 -c "print(0.95**460, 0.9692**460, 1/0.9692**460)"
5.66054741891586e-11 5.625569754589111e-07 1777597.7254290388
```

`5.7e-11`, `5.6e-7` and "about 1 in 1.8 million" all check out, and the four after-instruments in the
table at `reviews/ARTIFACTS-round3.md:217-222` do sum to 460.

**Warning for anyone re-running this.** My first attempt at that sample silently measured nothing: a
naive text replacement of `runCountingRound(page, 1);` plus the following `Play 2 hands vs the dealer`
click matches the _other_ seeded call site at line 49 (`boxes are played in order`) as well, and hit it
first. The run came back `200 passed`, which reads like a refutation of both published samples and is
in fact a null result. Pin the line number.

**N1's defect-present transcript reproduces exactly**, byte for byte:

```console
$ git show 772e4a7:.github/workflows/pages.yml | grep -n "on:\|branches\|run:\|needs:\|uses:"
12:on:
14:    branches: [main]
29:    runs-on: ubuntu-latest
31:      - uses: actions/checkout@v5
32:      - uses: actions/setup-node@v5
34:          node-version: 22
36:      - run: npm ci
37:      - run: npm run build -- --base-href /blackjack-trainer/
39:        run: |
44:      - uses: actions/upload-pages-artifact@v4
49:    needs: build
50:    runs-on: ubuntu-latest
56:        uses: actions/deploy-pages@v4
```

**The step listing reproduces exactly**, including the `env:` attaching to step 9 rather than to the
job, which is the thing worth checking:

```console
$ ruby -ryaml -e 'd = YAML.load_file(".github/workflows/pages.yml")
  d["jobs"]["build"]["steps"].each_with_index { |s, i| puts "#{i+1}. #{(s["name"] || s["run"] || s["uses"]).to_s.lines.first.strip}"; puts "     env: #{s["env"].inspect}" if s["env"] }
  puts "deploy needs: #{d["jobs"]["deploy"]["needs"].inspect}"'
1. actions/checkout@v5
2. actions/setup-node@v5
3. npm ci
4. npm run lint
5. CI=true npm run test:coverage
6. Verify parity fixtures are up to date (anti-drift gate)
7. npx playwright install --with-deps chromium
8. npm run build
9. npm run e2e
     env: {"E2E_SERVER" => "dist"}
10. npm run build -- --base-href /blackjack-trainer/
11. Assemble the site (app + legal pages + SPA fallback)
12. actions/upload-pages-artifact@v4
deploy needs: "build"
```

**Both patches are verbatim from round 2.** The `build`-job step block at `pages.yml:37-48` and the
`pages-bundle` job at `ci.yml:32-56` are byte-identical to the YAML recorded at
`reviews/ARTIFACTS-round2.md:737-748` and `:771-795`, including round 2's own correction of the
`require("….webmanifest")` snippet:

```console
$ diff <(awk 'NR>=737 && NR<=748' reviews/ARTIFACTS-round2.md | sed 's/^/      /') \
       <(awk 'NR>=37  && NR<=48'  .github/workflows/pages.yml)
IDENTICAL (round2:737-748 == pages.yml:37-48)
$ diff <(awk 'NR>=771 && NR<=795' reviews/ARTIFACTS-round2.md | sed 's/^/  /') \
       <(awk 'NR>=32  && NR<=56'  .github/workflows/ci.yml)
IDENTICAL
```

**N1's non-vacuity reproduces exactly**, running the anti-drift step verbatim out of the YAML against
the same one-line exporter mutation (`tools/export-parity-fixtures.ts:174`):

```console
$ cat out/pstep06.sh
npm run export:fixtures
git diff --exit-code -- ios/Fixtures

$ bash -e out/pstep06.sh                                    # clean tree
STEP6_EXIT_CLEAN=0

$ # COUNTING_SYSTEMS.map -> COUNTING_SYSTEMS.slice(0, 5).map
$ bash -e out/pstep06.sh
STEP6_EXIT_DEGRADED=1
-  "description": "All 58 counting systems with per-rank and per-color values.",
-  "count": 58,
+  "description": "All 5 counting systems with per-rank and per-color values.",
+  "count": 5,

$ git checkout -- tools/export-parity-fixtures.ts ios/Fixtures
$ bash -e out/pstep06.sh
STEP6_EXIT_RESTORED=0
```

**N5's defect-present transcript reproduces exactly:**

```console
$ git show 772e4a7:.github/workflows/ci.yml | grep -c "base-href"
0
$ grep -rn "base-href" e2e/ tools/ playwright.config.ts package.json
(no matches)
```

**N5's three mutations reproduce exactly**, each run against the check extracted verbatim from
`ci.yml`. Mutation B had to be redone after my own restore step failed silently, so all four results
below are from a manifest restored out of `git show b09470d:public/manifest.webmanifest`:

```console
$ npm run build -- --base-href /blackjack-trainer/ ; bash -e out/step05.sh
CHECK_EXIT=0

$ # A. "start_url": "./" -> "/"
$ bash -e out/step05.sh
start_url is /
CHECK_EXIT=1

$ # B. "src": "icons/icon-192.png" -> "/icons/icon-192.png"
$ bash -e out/step05.sh
icon /icons/icon-192.png
CHECK_EXIT=1

$ # C. npm run build, no --base-href
$ grep -o '<base href="[^"]*">' dist/blackjack-trainer/browser/index.html
<base href="/">
$ bash -e out/step05.sh
CHECK_EXIT=1

$ # restored
$ npm run build -- --base-href /blackjack-trainer/ ; bash -e out/step05.sh
CHECK_EXIT=0
```

The gate is real: it passes on the deployed configuration, and all three properties it names can turn it
red. `pages-bundle` has no `needs:`, as the artifact says, so it is a third independent job in `ci.yml`.

**M1's defect-present error reproduces**, by the only route left once `@types/node` is installed -
denying `tsc` the type root:

```console
$ npx tsc --noEmit -p tsconfig.e2e.json --typeRoots /nonexistent-types-root
error TS2688: Cannot find type definition file for 'node'.
  The file is in the program because:
    Entry point of type library 'node' specified in compilerOptions
TSC_E2E_NO_TYPES_EXIT=2
```

Same error code, same text, same exit 2 as `reviews/ARTIFACTS-round3.md:795-807`. The artifact's own
label on that block ("`ls` cannot reproduce them at the shipping commit") is honest.

**M1's `e2e/fixtures/lane.ts` mutation reproduces exactly**, including both exit codes:

```console
$ # export const SERVES_DIST -> export const SERVES_DIST: number
$ npm run lint
e2e/fixtures/lane.ts(30,14): error TS2322: Type 'boolean' is not assignable to type 'number'.
LINT_MUTANT_EXIT=2
$ npx tsc --noEmit -p tsconfig.app.json
OLD_GATE_EXIT=0
```

This half of M1 is the real one: a file that no gate typechecked is now typechecked by a gate that both
workflows already run.

**The dependency change does not reach further than claimed.** `@types/node` is the only addition in the
whole round, and it cannot leak into the app or unit projects, because both pin `types` explicitly
(`tsconfig.app.json:5` is `"types": []`, `tsconfig.spec.json:7` is `"types": ["vitest/globals"]`); only
`tsconfig.e2e.json:14` asks for `node`. It is reachable from the local cache, so the "no registry was
contacted" justification on M1's RESOLVED row stands:

```console
$ git diff d413a7b b09470d -- package.json | grep '^[+-]' | grep -v '^[+-][+-]'
-    "typecheck": "tsc --noEmit -p tsconfig.app.json",
+    "typecheck": "tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json && tsc --noEmit -p tsconfig.e2e.json",
+    "@types/node": "^26.1.2",
$ npm view @types/node version --offline
26.1.2
```

The `package-lock.json` diff adds exactly `@types/node@26.1.2` and its one dependency
`undici-types@8.3.0`, both `"dev": true`, and nothing else.

**The `playwright install --dry-run` transcript reproduces**, elisions aside:

```console
$ npx playwright install --dry-run chromium
Chrome for Testing 151.0.7922.34 (playwright chromium v1234)
  Install location:    /Users/arthurzhang/Library/Caches/ms-playwright/chromium-1234
  Download url:        https://cdn.playwright.dev/builds/cft/151.0.7922.34/mac-arm64/chrome-mac-arm64.zip
...
Chrome Headless Shell 151.0.7922.34 (playwright chromium-headless-shell v1234)
  Install location:    /Users/arthurzhang/Library/Caches/ms-playwright/chromium_headless_shell-1234
DRYRUN_EXIT=0
```

**The PATCH-READY line is drawn where the ledger says it is.** N1's five numbered UNVERIFIED items and
N5's one are each genuinely a GitHub-runner or repository-settings property, and neither section
asserts any of them. On the RESOLVED side, nothing depends on GitHub: M2 and M4 rest on local `--repeat-each`
and full-suite measurements, and M1 rests on `npm run lint` itself. The one sentence that comes close is
`reviews/ARTIFACTS-round3.md:899-901` ("`npm run lint` is already a step in `ci.yml`'s `validate` job,
and N1 has just added it to `pages.yml`'s `build` job"), and that is a file-content claim, which I
confirmed by reading both workflows; it does not assert that either step blocks anything. The present
tense that stage 1 objected to at F5 is gone: `reviews/ARTIFACTS-round3.md:283-288` now reads "is about
to put" and names ASSUMPTION 2 explicitly.

**All six gates at the reviewed tip.** Run in the pristine export, in the order `pages.yml` runs them:

```console
$ npm run lint
LINT_EXIT=0

$ npm run build -- --base-href /blackjack-trainer/
▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget. Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.
Application bundle generation complete. [3.623 seconds]
BUILD_EXIT=0

$ CI=true npm run test:coverage
 Test Files  67 passed (67)
      Tests  1547 passed (1547)
Statements   : 96.11% ( 5290/5504 )
Branches     : 93.23% ( 2358/2529 )
Functions    : 93.28% ( 917/983 )
Lines        : 97.97% ( 4063/4147 )
COVERAGE_EXIT=0

$ CI=true E2E_SERVER=dist bash -e out/pstep09.sh
Running 111 tests using 1 worker
  111 passed (2.8m)
STEP9_EXIT=0

$ bash -e out/pstep06.sh
STEP6_EXIT_CLEAN=0
```

Every figure in the artifact's closing table (`reviews/ARTIFACTS-round3.md:906-913`) matches: 67 files /
1547 passed, `96.11 / 93.23 / 93.28 / 97.97` to the digit, `111 passed` on one worker, the inherited
budget warning on an exit-0 build, and no parity drift.

## Tree state

I mutated nothing in the repository working tree except one temporary probe file
(`src/app/doorway.test.ts`, written and deleted while establishing F1); every other mutation was made in
the pristine export under the scratchpad, which is not the repository. `dist/` in the repository was not
touched by me, no `site/` tree was assembled here, and `ios/Fixtures` was never rewritten in the
repository - the anti-drift runs happened in the export.

```console
$ git status --porcelain
 M PROD-READINESS.md
 M e2e/fixtures/flows.ts
 M reviews/ARTIFACTS-round3.md
 M tsconfig.app.json
 M tsconfig.spec.json
?? .agents/
?? .codex/
?? reviews/REVIEW-round3-stage2.md
$ git rev-parse --short HEAD
9aaac6b
```

Of those, only `reviews/REVIEW-round3-stage2.md` is mine. `.agents/` and `.codex/` were untracked before
this review and were not touched. The five modified files are the later stage's in-progress work in this
shared checkout, along with the commit that advanced `HEAD` past `b09470d`; I left all of it exactly as I
found it, and none of it is part of the reviewed range.

Gate 1 for this file:

```console
$ npx prettier --check reviews/REVIEW-round3-stage2.md
Checking formatting...
All matched files use Prettier code style!
PRETTIER_EXIT=0

$ npm run lint
> tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.spec.json && tsc --noEmit -p tsconfig.e2e.json
> prettier --check .
Checking formatting...
All matched files use Prettier code style!
LINT_EXIT=0
```

## Verdict

**PASS-WITH-FINDINGS.** The two applied patches do what they say. N5's check refuses all three of the
properties it names and passes the configuration that is actually deployed; N1's added steps run, and
the one that guards this app's central claim exits non-zero when that claim is broken. Both are
correctly PATCH-READY rather than RESOLVED, and nothing on the RESOLVED side of that line leans on
GitHub. M1's `e2e/**` half closes a gate gap that was real, with a mutation proof that holds. The M2
re-pooling is not just defensible, it survived an independent third sample taken here.

F1 is the one worth acting on before the round closes: the "second doorway" the widening claims to close
was already covered by `tsconfig.app.json`, the proof omitted the one comparison that would have shown
it, and because `tsconfig.app.json` still does not exclude `src/**/*.test.ts`, the first real file using
that name will take `npm run lint` red with three spurious errors. F2 is the next: a bound stated as
"every time" that the same commit's own widened band contradicts, in the correction written to stop
exactly that. F3 to F7 are text and numbers that did not follow their corrections - a stale rate in
three places including a published diff of a file that says something else, a ledger link the same
commit broke, a "consistent basis" that is not consistent with the comment that shipped, a probability
off by a factor of two, and a transcript whose command cannot have produced one of its lines.
