# REVIEW - round 2, stage 3 (`a3f5dee..7ac22db`)

**Verdict: PASS-WITH-FINDINGS**

The code in the range is sound and nothing regressed: all nine gates are green, the wiring change adds
two spec files without dropping any existing one, and three of the four non-vacuity proofs the range
records reproduce byte-for-byte. What does not hold up is the record around it. Two committed claims
are refuted by running them, one test does not constrain the property its own name and comment
announce, and the defect class the ledger re-triaged to **P1** is still open along its largest
dimension - the mutation the stage chose to demonstrate happens to be the one case a different gate
already caught, and the case no gate catches was not addressed.

None of that is a product defect, and none of it makes the range worse than what it replaced. It does
mean the ledger's `N3 | RESOLVED` row and two paragraphs of
[`reviews/ARTIFACTS-round2.md`](ARTIFACTS-round2.md) overstate what was measured, and should be
corrected before stage 4 builds on them.

---

## 1. What the range claims to do

Two commits:

| commit    | subject                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| `68e0716` | re-derive the offline proof the rebuilding lane invalidated and record the flaky gate |
| `7ac22db` | test the two tools that back the parity and E2E gates                                 |

```console
$ git diff --stat a3f5dee..7ac22db
 PROD-READINESS.md                     |  29 ++-
 angular.json                          |   3 +-
 reviews/ARTIFACTS-round2.md           | 241 +++++++++++++++++-
 reviews/REVIEW-round2-stage2.md       | 457 ++++++++++++++++++++++++++++++++++
 tools/export-parity-fixtures.spec.mjs | 153 ++++++++++++
 tools/serve-dist.spec.mjs             | 154 ++++++++++++
 6 files changed, 1025 insertions(+), 12 deletions(-)
```

The claims, read off the range itself:

1. **`68e0716`** - stage 2's "the dist lane rebuilds before serving" change silently invalidated
   stage 1's committed non-vacuity proof for N7 (which deleted `ngsw-worker.js` from `dist/`). The
   commit records that as regression **R2-3**, keeps the superseded transcript marked
   "valid only at `e3f8cba`", and re-derives the proof against a mutation the rebuild cannot undo. It
   also records **R2-4** (a dangling N5 cross-reference) and adds **M2**, an intermittent E2E failure,
   to NEXT ROUND.
2. **`7ac22db`** - closes **N3** ("nothing tested the tools that back two release gates") by adding
   `tools/serve-dist.spec.mjs` (5 tests) and `tools/export-parity-fixtures.spec.mjs` (8 tests), and
   wiring `tools/**` into the unit gate via a new `include` in `angular.json`'s test target. The
   ledger re-triages N3 from P2 to **P1** and marks it RESOLVED.

**Does it do it?** Mechanically, yes. The specs exist, they run inside `npm test`, and the gate counts
move exactly as recorded (65 files / 1533 tests -> 67 files / 1546 tests). The N7 re-derivation
reproduces. The narrative around the parity spec is where it comes apart; see F3-2 and F3-3.

**No-features rule: compliant.** The range adds no screen, route, endpoint, command, CLI flag,
database table or column, or user-facing setting. `angular.json` does gain one key
(`architect.test.options.include`), which is a build-tool option for the unit-test runner, not a
product config key, and it is the minimum wiring the fix requires. Disclosed rather than waved past.

---

## 2. State of all nine gates (re-run by me, on a clean tree at `7ac22db`)

Every one of these was run by me with the tool sandbox disabled. Exit codes are captured directly
(`cmd > log 2>&1; echo $?`), never through a pipe, because `$?` after a pipe is the last stage's.

| #   | gate                                               | exit                   | result                                        |
| --- | -------------------------------------------------- | ---------------------- | --------------------------------------------- |
| 1   | `npm run lint`                                     | **0**                  | typecheck + `prettier --check` clean          |
| 2   | `npm run build`                                    | **0**                  | 1 pre-existing budget warning                 |
| 3   | `npm test`                                         | **0**                  | 67 files, 1546 passed (3/3 runs)              |
| 4   | `npm run test:coverage`                            | **0**                  | 96.11 / 93.23 / 93.28 / 97.97                 |
| 5   | `E2E_SERVER=dist npm run e2e`                      | **0**                  | 111 passed (2/2 full runs) - but see **F3-6** |
| 6   | `npm run export:fixtures` + `git diff --exit-code` | **0**                  | no drift                                      |
| 7   | `swiftformat --lint .`                             | **0**                  | 0/105 files require formatting                |
| 8   | `swiftlint lint`                                   | **0**                  | 0 violations in 105 files                     |
| 9   | `xcodebuild ... build test`                        | `** TEST SUCCEEDED **` | 335 tests in 38 suites                        |

```console
$ npm run lint > "$TMPDIR/lint.log" 2>&1; echo "LINT_EXIT=$?"
LINT_EXIT=0

$ npm run build > "$TMPDIR/build.log" 2>&1; echo "BUILD_EXIT=$?"
BUILD_EXIT=0
▲ [WARNING] src/app/features/chart/chart-page.component.scss exceeded maximum budget. Budget 5.00 kB was not met by 368 bytes with a total of 5.37 kB.

$ npm test > "$TMPDIR/test1.log" 2>&1; echo "TEST_EXIT=$?"
TEST_EXIT=0
 Test Files  67 passed (67)
      Tests  1546 passed (1546)

$ npm run test:coverage > "$TMPDIR/cov.log" 2>&1; echo "COV_EXIT=$?"
COV_EXIT=0
Statements   : 96.11% ( 5290/5504 )
Branches     : 93.23% ( 2358/2529 )
Functions    : 93.28% ( 917/983 )
Lines        : 97.97% ( 4063/4147 )

$ CI=true npm run test:coverage > "$TMPDIR/cov-ci.log" 2>&1; echo "CI_COV_EXIT=$?"
CI_COV_EXIT=0        # same 67 / 1546 / same four percentages

$ lsof -nP -iTCP:4200 -sTCP:LISTEN; echo "port-free-exit=$?"
port-free-exit=1     # nothing listening, so the E2E results below are trustworthy

$ E2E_SERVER=dist npm run e2e > "$TMPDIR/e2e1.log" 2>&1; echo "E2E_EXIT=$?"
E2E_EXIT=0
  111 passed (35.8s)

$ npm run export:fixtures >/dev/null && git diff --exit-code -- ios/Fixtures; echo "ANTI_DRIFT=$?"
ANTI_DRIFT=0

$ cd ios && swiftformat --lint . ; echo "SWIFTFORMAT_EXIT=$?"
SWIFTFORMAT_EXIT=0
0/105 files require formatting, 3 files skipped.

$ swiftlint lint ; echo "SWIFTLINT_EXIT=$?"
SWIFTLINT_EXIT=0
Done linting! Found 0 violations, 0 serious in 105 files.

$ xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test
** TEST SUCCEEDED **
✔ Test run with 335 tests in 38 suites passed after 5.604 seconds.
```

Coverage is identical to the round-2 baseline **down to the raw counts** (5290/5504, 2358/2529,
917/983, 4063/4147), not merely to two decimals. That corroborates the artifact's explanation and is
worth noting for a reason it does not give; see **F3-10**.

---

## 3. Reproductions that DO hold

Recorded here because the instruction is to treat every transcript as an unverified claim, and these
four survived that treatment unchanged.

**The parity anti-drift gate really is blind to its own generator degrading.** Reproduced exactly,
including the `5`:

```console
$ perl -0pi -e "s/const systems = COUNTING_SYSTEMS\.map\(/const systems = COUNTING_SYSTEMS.slice(0, 5).map(/" tools/export-parity-fixtures.ts
$ npm run export:fixtures && git add ios/Fixtures
Wrote 7 parity fixtures to /Users/arthurzhang/dev/blackjack-trainer/ios/Fixtures
$ npm run export:fixtures >/dev/null && git diff --exit-code -- ios/Fixtures; echo "ANTI_DRIFT_EXIT=$?"
ANTI_DRIFT_EXIT=0
$ python3 -c "import json;print('systems in fixture:', json.load(open('ios/Fixtures/counting-systems.json'))['count'])"
systems in fixture: 5

$ npx ng test --include="../tools/**/*.spec.mjs" ; echo "TOOLS_SPEC_EXIT=$?"
TOOLS_SPEC_EXIT=1
     × exports every counting system the web app defines, in the same order
      Tests  1 failed | 12 passed (13)
```

**The B1 mutation.** Deleting the `try`/`catch` round 1 added to `tools/serve-dist.mjs` fails all five
serve-dist tests with `ECONNREFUSED`, exactly as recorded:

```console
$ npx ng test --include="../tools/**/*.spec.mjs" ; echo "MUTANT_EXIT=$?"
MUTANT_EXIT=1
     × 404s a malformed percent-escape instead of dying on it (B1)
     × 404s an encoded path traversal rather than serving outside the root
     × serves the shell for an extensionless route so client-side routing works
     × 404s a missing asset rather than falling back to the shell
     × serves a real asset with its content type
Error: connect ECONNREFUSED 127.0.0.1:52691
      Tests  5 failed | 8 passed (13)
```

**The one-row truncation**, down to the assertion text:

```console
$ python3 - <<'EOF'   # drop one element from deviation-vectors rows[0]
row 0 length before: 12
row 0 truncated to 11 of 12
EOF
$ npx ng test --include="../tools/**/*.spec.mjs" ; echo "EXIT=$?"
EXIT=1
     × keeps every deviation row the shape its own columns declare
AssertionError: deviation-vectors.rows: 1 rows are not 12 columns wide: expected 1 to be +0
$ git checkout -- ios/Fixtures && git diff --exit-code -- ios/Fixtures && echo "fixture restored, no drift"
fixture restored, no drift
```

**The re-derived N7 proof (`68e0716`), and the invalidation it was written for.** Both halves hold:

```console
$ ls dist/blackjack-trainer/browser/ngsw-worker.js && rm dist/blackjack-trainer/browser/ngsw-worker.js
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts ; echo "OLD_PROOF_EXIT=$?"
OLD_PROOF_EXIT=0
  2 passed (5.5s)                 # the superseded stage-1 transcript no longer reproduces - correct

$ python3 -c "...delete configurations.production.serviceWorker from angular.json..."
before: ngsw-config.json
serviceWorker key removed
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts ; echo "MUTANT_EXIT=$?"
MUTANT_EXIT=1
    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js
  2 failed
$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory

$ git checkout -- angular.json && npm run build ; echo "REBUILD_EXIT=$?"
REBUILD_EXIT=0
$ E2E_SERVER=dist npx playwright test e2e/smoke/offline.e2e.ts ; echo "GREEN_EXIT=$?"
GREEN_EXIT=0
  2 passed (4.6s)
```

The lane-name rejection from `a3f5dee` also still holds, which matters because the range's records
lean on it:

```console
$ E2E_SERVER=dsit npx playwright test e2e/smoke/offline.e2e.ts ; echo "TYPO_EXIT=$?"
TYPO_EXIT=1
Error: E2E_SERVER must be one of 'dist' | 'serve', got 'dsit'. Unset it to take the default ('dist' under CI, otherwise 'serve').
```

---

## 4. The `angular.json` question, answered directly

The brief asked specifically whether the test-target change could hide or drop existing tests rather
than add to them. **It does not drop any test that exists today, but it does narrow the discovery
rule**, and the narrowing is invisible.

The `@angular/build:unit-test` builder's schema default is two patterns, not one:

```console
$ node -e "console.log(JSON.stringify(require('./node_modules/@angular/build/src/builders/unit-test/schema.json').properties.include.default))"
["**/*.spec.ts","**/*.test.ts"]
```

The range replaces that default with `["**/*.spec.ts", "../tools/**/*.spec.mjs"]`, which silently
drops `**/*.test.ts`. Both patterns glob from `sourceRoot` (`src`), which is why `../tools/**` is the
correct spelling and `tools/**` is not - that part of the artifact is right and reproduces:

```console
$ npx ng test --list-tests --include="tools/**/*.spec.ts"
Discovered test files:
                                          # nothing
$ npx ng test --list-tests --include="../tools/**/*.spec.ts"
Discovered test files:
  tools/probe.spec.ts
```

See **F3-1** for the drop and its proof. No currently-tracked file matches `*.test.ts`
(`git ls-files | grep -E '\.test\.(ts|mts|mjs|js)$'` returns nothing), so the file and test counts
move purely upward: 65 -> 67 files, 1533 -> 1546 tests. Nothing was hidden.

---

## 5. Findings

Severity is about the finding, not about how hard it would be to fix.

### F3-1 - P2 - the new `include` silently drops the builder's `**/*.test.ts` default - INTRODUCED BY THE RANGE

`angular.json:75` replaces the unit-test builder's two-pattern default with an explicit two-pattern
list that keeps `**/*.spec.ts`, adds `../tools/**/*.spec.mjs`, and drops `**/*.test.ts`. A spec
written under the `.test.ts` convention - which the builder ships as a first-class default, and which
`test-discovery.js` still honours in `TEST_FILE_INFIXES = ['.spec', '.test']` - is from now on not run
and not reported as missing. That is the same silent-green shape the whole run exists to close.

**Verification.** I staged a probe file, listed the discovered set under each `angular.json`, and
restored:

```console
$ cat > src/app/zzprobe.test.ts <<'EOF'   # a normal passing vitest spec
EOF

# with the range's include (HEAD):
$ npx ng test --list-tests | grep zzprobe          # (no output)
$ npx ng test --list-tests | grep -c "spec.ts\|test.ts"
65

# with the pre-range angular.json:
$ git checkout a3f5dee -- angular.json
$ npx ng test --list-tests | grep zzprobe
  src/app/zzprobe.test.ts
PROBE_DISCOVERED=yes
$ npx ng test --list-tests | grep -c "\.ts$\|\.mjs$"
66

$ git checkout 7ac22db -- angular.json && rm -f src/app/zzprobe.test.ts
$ git status --porcelain --untracked-files=no
                                                   # clean
```

**Not a dropped test today** - no `*.test.ts` is tracked - but the fix is one token
(`"**/*.test.ts"` restored to the list), and leaving it out costs nothing to correct now and is
undetectable later.

### F3-2 - P1 - the artifact and the ledger both claim the iOS gate stays green on the degraded fixtures; it fails outright - INTRODUCED BY THE RANGE

`reviews/ARTIFACTS-round2.md` (N3, "Defect present, part 1") says:

> **53 of the app's 58 counting systems silently stopped being checked for parity, and the gate named
> after parity reported success.** The Swift target would also pass, because it asserts against the
> same weakened file.

and `PROD-READINESS.md` ("Why N3 was re-triaged P2 -> P1") says the anti-drift gate exited 0
"while 53 systems went unchecked **on both platforms**".

The first sentence is true (F3 section 3 above reproduces it). The claim about the Swift target is
false, and it is the claim the P1 re-triage rests on. `ios/Fixtures/counting-systems.json` is not only
a test fixture - `GameData.loadCountingSystems()` (`ios/BlackjackTrainer/Engine/GameData.swift:30`)
loads it as the app's shipping data - so the degraded export does not quietly weaken an assertion, it
crashes the app under test before a single test runs.

**Verification.** Same mutation, same staged fixtures, gate 9:

```console
$ perl -0pi -e "s/const systems = COUNTING_SYSTEMS\.map\(/const systems = COUNTING_SYSTEMS.slice(0, 5).map(/" tools/export-parity-fixtures.ts
$ npm run export:fixtures && git add ios/Fixtures
$ python3 -c "import json;print('counting-systems.json count =', json.load(open('ios/Fixtures/counting-systems.json'))['count'])"
counting-systems.json count = 5

$ cd ios && xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test
BlackjackTrainer/AppModel.swift:95: Fatal error: bundled game data failed to load or validate
Testing failed:
	BlackjackTrainer (17386) encountered an error (Early unexpected exit, operation never finished bootstrapping - no restart will be attempted. ...)
** TEST FAILED **
```

Independently, three Swift parity tests already pin the exact domain sizes the exporter must emit, so
they were never going to "pass against the same weakened file":

```console
$ grep -rnE "\.count == [0-9]{2,}" ios/BlackjackTrainerTests/*Parity*.swift
ios/BlackjackTrainerTests/DeviationParityTests.swift:19:        #expect(file.count == 62560)
ios/BlackjackTrainerTests/BasicStrategyParityTests.swift:15:        #expect(file.vectors.count == 2720)
ios/BlackjackTrainerTests/CountingParityTests.swift:14:        #expect(file.systems.count == 58)
```

The correct statement is narrower and still worth making: the _anti-drift gate_ is blind, and CI does
not run the iOS gates at all (`.github/workflows/ci.yml` has only `validate` and `e2e` jobs; no
`xcodebuild`, `swiftlint`, or `swiftformat` step), so in CI specifically nothing caught it. That is
the real argument for the fix. It is not the argument the records make.

### F3-3 - P1 - the fixture spec does not constrain the domain its own test name announces, and the largest dimension of N3's defect class is still open - INTRODUCED BY THE RANGE

`tools/export-parity-fixtures.spec.mjs:84` is named
`covers the whole basic-strategy domain it calls exhaustive`, and the file header says the checks
make the fixtures "cover the domains their descriptions claim". The description in question is
"Exhaustive basic-strategy decisions: every canonical **hand** x upcard x rule set x DAS x LS". The
test checks the upcard dimension (`dealers.size === 10`) and the rule-set dimension, and nothing else.
The hand dimension - by far the largest, 34 canonical hands - is unchecked, as are DAS and LS, and the
deviation file's true-count sweep (`-10..+12`) is unchecked in its spec too.

**Verification.** One-line mutation to the exporter's hand domain, which is the same shape of
degradation the artifact demonstrates with counting systems:

```console
$ perl -0pi -e "s/^const HANDS = representativeHands\(\);/const HANDS = representativeHands().slice(0, 1);/m" tools/export-parity-fixtures.ts
$ npm run export:fixtures
basic-strategy vectors BEFORE: 2720     AFTER: 80        # 97.1% gone
deviation rows        BEFORE: 62560     AFTER: 1840      # 97.1% gone

$ git add ios/Fixtures                                    # i.e. someone committed this
$ npm run export:fixtures >/dev/null && git diff --exit-code -- ios/Fixtures; echo "ANTI_DRIFT_EXIT=$?"
ANTI_DRIFT_EXIT=0

$ npx ng test --include="../tools/**/*.spec.mjs" ; echo "TOOLS_SPEC_EXIT=$?"
TOOLS_SPEC_EXIT=0
      Tests  13 passed (13)

$ npm test ; echo "FULL_UNIT_GATE_EXIT=$?"
FULL_UNIT_GATE_EXIT=0
 Test Files  67 passed (67)
      Tests  1546 passed (1546)
```

All 13 new tests pass. The unit gate passes. The anti-drift gate passes. `npm run lint` and
`npm run build` do not read `ios/Fixtures` at all (`.prettierignore` ignores `ios/`, and no file under
`src/` or `e2e/` references the directory - `grep -rn "ios/Fixtures" src/ e2e/` returns nothing), and
E2E does not either. So **every gate CI runs is green with 97% of the parity domain deleted**, after
the stage that was supposed to close exactly that.

The iOS gate does catch this one, via the hard-coded counts quoted in F3-2:

```console
$ cd ios && xcodebuild ... build test
✘ everyBasicStrategyVectorMatches() recorded an issue at BasicStrategyParityTests.swift:15:9: Expectation failed: (file.vectors.count → 80) == 2720
✘ everyDeviationVectorMatches() recorded an issue at DeviationParityTests.swift:19:9: Expectation failed: (file.count → 1840) == 62560
** TEST FAILED **
```

which is the point: the pre-existing Swift assertions already covered the three biggest fixtures
against exactly this attack, and the new web-side spec did not extend that coverage to the dimension
where CI is blind. Three lines in the spec would (`vectors.length` against
`HANDS.length * 10 * 2 * 2 * 2`, or simply asserting the hand-label set's size, and the analogous
count for the deviation rows). Until then, `N3 | RESOLVED` overstates the state: the instance that was
fixed was the instance another gate already caught, and the instance nothing catches remains.

### F3-4 - P2 - the traversal test passes with the guard it names removed, and misses the vector that actually escapes - INTRODUCED BY THE RANGE

`tools/serve-dist.spec.mjs:86` comments: "Outside the served root, so the traversal cases have
something real to reach for. **If `normalize()` ever stops collapsing `..`, they find it.**" They do
not. `tools/serve-dist.mjs:39` parses with `new URL(...)` before `normalize()`, and the WHATWG URL
parser already resolves both `..` and `%2e%2e` path segments, so the three vectors the test sends
never reach `normalize()` in a state where it matters.

**Verification, part 1 - remove the guard, tests stay green:**

```console
$ perl -0pi -e "s/path = normalize\(decodeURIComponent\(...\)\);/path = decodeURIComponent(...);/" tools/serve-dist.mjs
$ grep -n "path = " tools/serve-dist.mjs | head -1
39:    path = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
$ npx ng test --include="../tools/**/*.spec.mjs" ; echo "MUT_A_EXIT=$?"
MUT_A_EXIT=0
      Tests  13 passed (13)
```

**Verification, part 2 - the guard is load-bearing, and the test's vector set misses it.** Same
guard-free server, same throwaway tree the spec builds, one extra request using encoded slashes:

```console
$ node -e "...spawn the guard-free copy, GET each path..."
/%2e%2e/secret.txt                       -> 404 "not found"
/../secret.txt                           -> 404 "not found"
/cards%2f..%2f..%2f..%2f..%2fsecret.txt  -> 200 "do not serve me"
```

The third path reads a file outside the served root. `normalize()` is what stops it, and the shipped
server is not vulnerable:

```console
$ cp "$TMPDIR/serve-dist.orig" tools/serve-dist.mjs      # restore the real script
$ node -e "...same probe against the unmutated server..."
UNMUTATED /cards%2f..%2f..%2f..%2f..%2fsecret.txt -> 404 "not found"
```

So there is no product defect here - only a test that asserts a property it cannot observe, and a
comment that says otherwise. Adding `'/cards%2f..%2f..%2f..%2f..%2fsecret.txt'` to the existing loop
at `tools/serve-dist.spec.mjs:122` would make the test earn its name. Note also that the server is a
dev/E2E static server that is never deployed, so the traversal itself is a test-quality issue, not an
exposure.

### F3-5 - P2 - the stated reason both specs are JavaScript does not reproduce; the quoted compiler output is not output the compiler produces - INTRODUCED BY THE RANGE

The artifact's section "Why these two specs are JavaScript, not TypeScript" asserts that a `.spec.ts`
in `tools/` "fails to compile before it runs a line", and quotes:

```
✘ [ERROR] TS2591: Cannot find name 'node:child_process'. Do you need to install type definitions for node?
✘ [ERROR] TS2591: Cannot find name 'process'.
✘ [ERROR] TS2591: Cannot find name 'Buffer'.
```

The same claim is committed in both spec headers (`tools/serve-dist.spec.mjs:28-31`, "A `.spec.ts`
here fails to compile on `Cannot find name 'process'` before it runs a line"; and
`tools/export-parity-fixtures.spec.mjs:25-26`, "a `.spec.ts` here cannot resolve `node:fs`").

**Verification.** I wrote precisely that spec - `import { spawn } from 'node:child_process'`, plus
`process.cwd()` and `Buffer` - at `tools/probe.spec.ts` and ran it:

```console
$ npx ng test --include="../tools/probe.spec.ts" ; echo "PROBE_TS_EXIT=$?"
PROBE_TS_EXIT=0
▲ [WARNING] File 'tools/probe.spec.ts' not found in TypeScript compilation. [plugin angular-compiler]

  The file will be bundled and included in the output but will not be type-checked at build time. ...

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

It compiles, runs, and passes. The unit-test builder bundles with esbuild and only type-checks files
inside the TypeScript program, and `tsconfig.spec.json:9` scopes that program to `src/**`, so a
`tools/*.spec.ts` is bundled untyped with a warning - the opposite of the recorded outcome. The quoted
block is also not a diagnostic TypeScript emits: a failed module import is `TS2307`
("Cannot find module ... or its corresponding type declarations"), never `TS2591`
("Cannot find **name**"), and no TypeScript diagnostic names a module specifier as an identifier.

The _cost_ the same paragraph states - "these two files are not typechecked" - is true, and the
warning above is direct evidence for it. Choosing `.mjs` is a defensible call on other grounds
(`tools/` is plain Node; the files would be untyped either way). The recorded justification is simply
not what happens, and a record that quotes a transcript that cannot be produced is worse than one that
argues from preference.

### F3-6 - P2 - the ledger records M2 as unreproducible; it reproduces at roughly 1 run in 15 - PRE-EXISTING DEFECT, IN-RANGE RECORD

`PROD-READINESS.md` NEXT ROUND, row **M2**, states of the intermittent
`showdown.e2e.ts:65` failure: "**I could not reproduce it**: 25 isolated repeats
(`--repeat-each=25 --workers=4`, `25 passed`) and 3 further full-suite runs (`111 passed` each) were
all green, so this run neither confirms nor refutes the reviewer's transcript".

It reproduces. Port 4200 was confirmed free first.

```console
$ lsof -nP -iTCP:4200 -sTCP:LISTEN; echo "port-free-exit=$?"
port-free-exit=1

$ E2E_SERVER=dist npx playwright test e2e/smoke/showdown.e2e.ts \
    -g "returning to counting keeps the drill going" --repeat-each=20 --workers=4
FLAKE_PROBE_EXIT=1
  4 failed
  16 passed (23.4s)

  ✘  12 [chromium] › e2e/smoke/showdown.e2e.ts:65:7 › post-count showdown › returning to counting keeps the drill going (6.9s)
  ✘   9 [chromium] › ... (6.9s)
  ✘  17 [chromium] › ... (6.7s)
  ✘  19 [chromium] › ... (6.6s)

    Error: expect(locator).toBeHidden() failed
    Received: visible
        14 × locator resolved to <section class="showdown" aria-label="Showdown vs dealer">…</section>
```

Two further probes to pin the rate rather than over-claim on one sample:

```console
$ ... --repeat-each=20 --workers=4 ; echo $?      # identical command, second run
0
  20 passed (16.0s)
$ ... --repeat-each=20 --workers=1 ; echo $?
0
  20 passed (45.1s)
```

**4 failures in 60 repetitions (~7%)**, all four in one of three batches, all with the exact assertion
and the exact element the stage-2 reviewer reported. The failure mode is confirmed real, and the
severity note the ledger already draws - that every `111 passed` in this run's records is one
observation and not evidence of determinism - is understated rather than wrong. The record's
"I could not reproduce it" needs replacing with a rate, and the P2 rating deserves revisiting now that
a release gate is demonstrably non-deterministic.

The range did not introduce this: it touches no file under `src/` or `e2e/`, and my probe reproduces
against a spec unchanged since well before `a3f5dee`.

### F3-7 - P3 - the serve-dist spec leaks a temp directory on every run - INTRODUCED BY THE RANGE

`tools/serve-dist.spec.mjs:73` creates a tree with `mkdtempSync` and never removes it; `afterAll` kills
the server only. Every `npm test`, `npm run test:coverage`, and CI run leaves one behind, holding a
copy of `serve-dist.mjs` and four files.

```console
$ ls "$TMPDIR" | grep -c "serve-dist-spec-"
23
$ du -ch "$TMPDIR"/serve-dist-spec-* | tail -1
460K	total
```

Twenty-three directories accumulated during this review alone. Small, but it is state a test leaves
behind, and `afterAll` is already there to hold the `rmSync`.

### F3-8 - P3 - one assertion in the fixture spec constrains only itself, and its comment claims otherwise - INTRODUCED BY THE RANGE

`tools/export-parity-fixtures.spec.mjs:46-49`:

```js
// `main()` logs "Wrote 7 parity fixtures"; that number is only a log line
// unless something checks it.
expect(ALL).toHaveLength(7);
```

`ALL` is a seven-element array literal declared fifteen lines above, in the same file. The assertion
compares a constant to a constant and cannot fail for any change to `tools/export-parity-fixtures.ts`;
in particular the exporter's log line is a hard-coded string (`Wrote 7 parity fixtures`, line 876) that
no test reads, so it remains "only a log line" after the fix. The real check in that test is the
`readFileSync` in the loop below, which throws if a fixture stops being written - and that case is
already caught by the anti-drift gate, since `main()` does `rmSync(OUT_DIR)` first and a vanished file
shows up in `git diff`. Harmless, but the comment claims coverage the line does not provide.

### F3-9 - P3 - `freePort()` is a check-then-act race that would take all five serve-dist tests down together - INTRODUCED BY THE RANGE

`tools/serve-dist.spec.mjs:37-46` binds port 0, reads the assigned port, closes the listener, and only
then spawns the server on that number. Between the close and the child's `listen` the port is
unowned. If anything claims it, the child exits, `beforeAll` rejects with
`server exited at startup with code N`, and all five tests in the file fail at once - a load-dependent
failure of the kind the range's own R2-5 entry was written about.

**I did not observe this**, and I am not asserting a rate: 3 full `npm test` runs and roughly a dozen
isolated `--include` runs were all green. This is a code-reading finding about a window that exists,
not a reproduction. Recording it because the brief asks for load-dependent tests and because the
mitigation (retry the spawn on `EADDRINUSE`, or let the child bind port 0 and print it) is cheap.

### F3-10 - informational - the coverage gate cannot see the two files these specs exist to protect

`tools/export-parity-fixtures.ts` and `tools/serve-dist.mjs` contribute nothing to the coverage
denominator - the totals after the range are byte-identical to the round-2 baseline
(5290/5504, 2358/2529, 917/983, 4063/4147), not merely equal to two decimals. The artifact explains
this correctly (the server runs as a subprocess; the fixture spec re-uses already-covered source) but
draws no consequence from it. The consequence: the coverage floors in `vitest.config.ts` are and will
remain blind to `tools/`, so if these thirteen tests were deleted tomorrow the coverage gate would not
move. Not a defect, and not something the range should fix under a no-features rule - but it means
"the tools are covered now" is a statement about two spec files existing, not one the coverage gate
backs.

---

## 6. Things I could not verify, stated as such

- **R2-5's timing transcript.** The ledger records that the first version of
  `tools/export-parity-fixtures.spec.mjs` "passed in 1774 ms when the tools specs ran alone and
  **timed out at 5000 ms** under the full parallel `npm test`". That version was never committed, so
  there is nothing in the range to run. I can confirm only the after state: the committed version runs
  in 813 ms wall / 157 ms of test time isolated, and `npm test` was green on 3 of 3 runs at
  1546 passed. The claimed failure itself is unverifiable from the repository.
- **The stage-2 reviewer's original M2 rate** (2 of 7 full-suite runs, 1 of 24 isolated). I reproduced
  the failure but at a different rate on different hardware; I cannot confirm or refute their numbers.
- **CI behaviour.** Everything here was run locally. `.github/workflows/ci.yml` was read, not
  executed, so statements about what CI catches are derived from the workflow file plus locally
  reproduced gate behaviour, not from a CI run.
- **The `retries: 1` masking claim** in the M2 row (that a single occurrence would be hidden under CI)
  follows from `playwright.config.ts:20`, which I read; I did not run the suite with `CI=true` to
  observe a retry masking a real failure.

## 7. Repository left clean

Every scenario above modified tracked files (`angular.json`, `tools/export-parity-fixtures.ts`,
`tools/serve-dist.mjs`, `ios/Fixtures/*`) and, in three cases, the git index via `git add ios/Fixtures`.
All were restored, `dist/` was rebuilt after the `angular.json` mutation, and the fixtures were
regenerated and re-checked for drift after each one.

```console
$ git status --porcelain --untracked-files=no
                                        # no output
$ npm run export:fixtures >/dev/null && git diff --exit-code -- ios/Fixtures; echo "exit=$?"
exit=0
$ npm run build ; echo "REBUILD_EXIT=$?"
REBUILD_EXIT=0
```

The only file this review wrote is `reviews/REVIEW-round2-stage3.md`.

## 8. What would move this to PASS

1. Correct the two false claims - F3-2 (the Swift target does not stay green; the honest argument is
   that CI runs no iOS gate) and F3-5 (a `tools/*.spec.ts` runs fine, untype-checked).
2. Either extend the fixture spec to the hand and true-count dimensions or downgrade `N3` from
   RESOLVED to partially-resolved with F3-3's transcript attached. As it stands the ledger's P1
   justification and the fix's actual reach point in different directions.
3. Restore `"**/*.test.ts"` to the test target's `include` (F3-1).
4. Replace M2's "I could not reproduce it" with the measured rate (F3-6).

F3-4, F3-7, F3-8, F3-9 and F3-10 are worth fixing but none of them should block the stage.
