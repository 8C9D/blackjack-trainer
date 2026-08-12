# REVIEW - round 2, final (`7ac22db..HEAD`)

<!-- records: historical-file - a closed round's record. Its figures and transcripts were true at the commits that produced them; this round does not rewrite them, so the figures and transcript rules do not bind here. Citations are still resolved and bounds-checked. -->

**Verdict: PASS-WITH-FINDINGS**

The code in this range is sound and nothing regressed.
All nine gates are green at the tip, every gate figure in the artifact's "Gates after stage 4" table matched my own runs exactly, and each of the four remediations the range makes to `tools/` and `angular.json` is non-vacuous when I mutate the thing it claims to pin.
The range adds no user-visible capability, and neither does the branch as a whole: `git diff --stat 0856b7d..HEAD` touches no file under `src/` or `ios/` at all.

What does not hold up is, again, the record.
Three committed claims added by this range are not supported by the tree: an xcodebuild transcript attached to a mutation that cannot have produced it (FF-1), a browser measurement that does not reproduce at the viewport it names and whose correction points the wrong way (FF-2), and a recorded CI patch that would fail on every run for a reason unrelated to what it checks (FF-3).
FF-2 is the one that matters: it is the evidence behind the ledger's `N4 | DEFERRED - reproduces, and round 1's cited example does not`, and my measurement says round 1's example does reproduce and the defect is worse than recorded.

Everything I ran used the tool sandbox disabled.
Nothing was listening on `127.0.0.1:4200` before any E2E run (`lsof -nP -iTCP:4200 -sTCP:LISTEN`, exit 1, checked before each).
A stray `node` holds `[::1]:4321`; no gate uses it and I left it alone.
Two scenarios were staged by modifying tracked files (`ios/Fixtures/*.json`, `angular.json`); both were restored and `git status --porcelain --untracked-files=no` is empty, `dist/` rebuilt.

---

## 1. What the range claims to do, and whether it does it

Two commits.

| commit    | claim                                                                                                                                                                                                                                            | holds?                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `b5237b2` | Answer REVIEW-round2-stage3: pin the hand axis in the fixture spec, add a `%2f` traversal case, clean the temp tree, restore `**/*.test.ts`, read `ios/Fixtures` rather than a literal, strike the false Swift-parity claim, re-triage N3 to P2. | Yes for the code (all six verified below). The strike is right in substance; its evidence is not (FF-1).         |
| `4dc4aef` | Report and close the eight findings this run does not fix (N1, N2, N4, N5, N6, N9, D1, I1), and write the iCloud pre-condition into `LAUNCH-CHECKLIST.md` O2. Records only.                                                                      | Records only, confirmed. Six of eight re-verify cleanly; N4 does not (FF-2) and N5's patch does not work (FF-3). |

### The six code-level remediations, each re-derived by mutation

Every one of these was run by me against a fresh `git archive HEAD` tree with `node_modules` symlinked, or against the repository with the mutation staged and reverted.

**R2-7 - the hand axis is now pinned.**
Cutting `representativeHands()` to one hand (the 97% cut that used to pass):

```console
$ npx tsx tools/export-parity-fixtures.ts   # with `.slice(0, 1)` on HANDS
basic vectors: 80
deviation count: 1840 rows: 1840

$ npx ng test --include="../tools/export-parity-fixtures.spec.mjs"
AssertionError: only 1 canonical hands appear: expected 1 to be 34
AssertionError: only 1 canonical hands appear: expected 1 to be 34
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
```

`CANONICAL_HANDS = 10 + 9 + 15 = 34` matches `representativeHands()` in the exporter, and `34 * 10 * 2 * 2 * 2 = 2720` matches the committed fixture.

**R2-8 - the traversal test now needs the guard it names.**
With `normalize()` deleted from `tools/serve-dist.mjs`:

```console
$ npx ng test --include="../tools/serve-dist.spec.mjs"
AssertionError: /cards%2f..%2f..%2f..%2f..%2fsecret.txt escaped the served root: expected 200 to be 404
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

Exactly as recorded: the three original cases still pass without the guard, the `%2f` case does not.

**R2-9 - the "it would not compile" claim really is false.**
`tsconfig.spec.json` includes only `["src/**/*.d.ts", "src/**/*.spec.ts"]`.
A `tools/typeprobe.spec.ts` importing `node:child_process` and calling `process.cwd()` runs green, and the builder says why:

```console
$ npx ng test --include="../tools/typeprobe.spec.ts"
  The file will be bundled and included in the output but will not be type-checked at build time.
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

The rewritten comments in both spec headers are accurate.

**R2-10 - `**/*.test.ts` is collected again.**
Same tree, one added `src/zz-probe.test.ts`, `npx ng test` with and without the glob:

```console
with    ["**/*.spec.ts", "**/*.test.ts", "../tools/**/*.spec.mjs"]:  68 passed (68) / 1548 passed
without ["**/*.spec.ts", "../tools/**/*.spec.mjs"]:                  67 passed (67) / 1547 passed
```

**R2-11 - no temp trees leak.**
After the full unit gate, the coverage gate and four further isolated runs of the spec:

```console
$ ls -d ${TMPDIR}serve-dist-spec-* | wc -l
0
```

**F3-8 - the fixture list is read, not asserted against itself.**
Removing one fixture file:

```console
$ rm ios/Fixtures/charts.json && npx ng test --include="../tools/export-parity-fixtures.spec.mjs"
AssertionError: expected [ 'basic-strategy-vectors.json', …(5) ] to deeply equal [ 'basic-strategy-vectors.json', …(6) ]
      Tests  2 failed | 7 passed (9)
```

`rmSync(OUT_DIR, …)` is at `tools/export-parity-fixtures.ts:866`, so the comment's reasoning about a fixture disappearing rather than going stale is correct.

### And the mutation N3 was actually about

The 5-of-58 counting-system cut, which is what the artifact's N3 section degrades, is caught by the new web checks:

```console
$ npx tsx tools/export-parity-fixtures.ts   # COUNTING_SYSTEMS.slice(0, 5)
$ npx ng test --include="../tools/export-parity-fixtures.spec.mjs"
AssertionError: expected [ 'hi-lo', 'ko', 'omega-ii', …(2) ] to deeply equal [ 'hi-lo', 'ko', 'omega-ii', …(55) ]
AssertionError: expected [ { systemId: 'hi-lo', …(3) }, …(4) ] to have a length of 58 but got 5
      Tests  2 failed | 7 passed (9)
```

So the N3 remediation does close the hole it was written for.
The problem is only with how the correction box evidences the severity call (FF-1).

---

## 2. The nine gates

Run at `4dc4aef` with the sandbox disabled, from a clean tree.

| gate                                               | result                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run lint`                                     | exit **0** - `All matched files use Prettier code style!`                     |
| `npm run build`                                    | exit **0**, 1 budget warning (`chart-page.component.scss` 5.37 kB vs 5.00 kB) |
| `npm test`                                         | exit **0** - `Test Files 67 passed (67)`, `Tests 1547 passed (1547)`          |
| `npm run test:coverage`                            | exit **0** - 96.11 / 93.23 / 93.28 / 97.97                                    |
| `E2E_SERVER=dist npm run e2e`                      | exit **0** - `111 passed (38.1s)`                                             |
| `npm run export:fixtures` + `git diff --exit-code` | exit **0** / exit **0** - no drift                                            |
| `swiftformat --lint .`                             | exit **0** - `0/105 files require formatting`                                 |
| `swiftlint lint`                                   | exit **0** - `Found 0 violations, 0 serious in 105 files`                     |
| `xcodebuild … build test`                          | `** TEST SUCCEEDED **`, `Test run with 335 tests in 38 suites passed`         |

Every figure matches the artifact's "Gates after stage 4" table, including the `1547 passed (67 files)` the range corrected from `1546`.

The `111 passed` is one observation, and the ledger says so.
I reproduced M2 myself - see section 5.

---

## 3. The ledger's N9 bookkeeping claim

Checked against `git log --oneline 0856b7d..HEAD` and the four ranges in the artifact.
**The claim holds.**

| range              | commits in it        | reviewer                  |
| ------------------ | -------------------- | ------------------------- |
| `0856b7d..7010e8c` | `5e954f8`, `7010e8c` | `REVIEW-round2-stage1.md` |
| `7010e8c..a3f5dee` | `e3f8cba`, `a3f5dee` | `REVIEW-round2-stage2.md` |
| `a3f5dee..7ac22db` | `68e0716`, `7ac22db` | `REVIEW-round2-stage3.md` |
| `7ac22db..HEAD`    | `b5237b2`, `4dc4aef` | this file                 |

Eight commits, four ranges, two each, no overlap and no gap - each commit falls inside exactly one range.
Each review file's own header declares the same range the artifact assigns it (checked in all three).

The second half - no remediation commit reviewed by the reviewer it answers - also holds, and it is checkable from where each review file first appears:

```console
$ git log --oneline --diff-filter=A -- reviews/REVIEW-round2-stage1.md
e3f8cba keep the serve lane testing a real worker and strike two claims the tree did not support
$ git log --oneline --diff-filter=A -- reviews/REVIEW-round2-stage2.md
68e0716 re-derive the offline proof the rebuilding lane invalidated and record the flaky gate
$ git log --oneline --diff-filter=A -- reviews/REVIEW-round2-stage3.md
b5237b2 pin the domain axis the fixture spec only claimed to cover and strike a false parity claim
```

Each stage's review lands in the same commit as the remediation answering it, and that commit sits in the _next_ range - so stage 1's answer (`e3f8cba`) was reviewed by stage 2, stage 2's (`68e0716`) by stage 3, stage 3's (`b5237b2`) by me.
The residual, which the arrangement cannot remove and the artifact does not claim to: my own findings are the last, and nothing reviews the answer to them.

---

## 4. Findings

### FF-1 - the N3 correction quotes a transcript the mutation it describes cannot produce

**Severity: P2. Introduced by this range** (`b5237b2`, in `reviews/ARTIFACTS-round2.md` and `tools/export-parity-fixtures.spec.mjs:18-24`).

The N3 section degrades the exporter to 5 of 58 counting systems, shows the anti-drift gate staying green, and then adds:

> **Correction.** … confirmed here by running the iOS gate against the degraded fixtures:
> `Expectation failed: (file.vectors.count → 80) == 2720`
> `Expectation failed: (file.count → 1840) == 62560`

Those two fixtures are byte-identical under a counting-system cut.
Regenerating with `COUNTING_SYSTEMS.slice(0, 5)`:

```console
basic vectors: 2720
deviation count field: 62560 rows: 62560
counting-vectors systems: 5
counting-systems: 5
```

`80` and `1840` are the numbers from the **hand-axis** cut (F3-3/R2-7), which I confirmed by regenerating with `representativeHands().slice(0, 1)` - `basic vectors: 80`, `deviation count: 1840` - and then running the iOS gate against exactly those fixtures:

```console
$ xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test
✘ Test everyBasicStrategyVectorMatches() recorded an issue at BasicStrategyParityTests.swift:15:9: Expectation failed: (file.vectors.count → 80) == 2720
✘ Test everyDeviationVectorMatches() recorded an issue at DeviationParityTests.swift:19:9: Expectation failed: (file.count → 1840) == 62560
✘ Test run with 335 tests in 38 suites failed after 4.974 seconds with 2 issues.
** TEST FAILED **
```

Byte-for-byte the artifact's quote - from the other mutation.

Run against the mutation the section actually describes, the iOS gate fails for a different reason entirely, and reaches none of the three assertions the record names:

```console
$ cp <5-system counting-vectors.json, counting-systems.json> ios/Fixtures/
$ xcodebuild -scheme BlackjackTrainer -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build test
BlackjackTrainer/AppModel.swift:95: Fatal error: bundled game data failed to load or validate
Testing failed:
	BlackjackTrainer (29860) encountered an error (Early unexpected exit, operation never finished bootstrapping …)
** TEST FAILED **
```

`GameData.loadValidated()` rejects a 5-system file, `AppModel.loadEngines()` calls `preconditionFailure`, the host app dies before the test runner connects, and **zero** tests execute - so `CountingParityTests.swift:14`'s hard-coded `58`, which the record cites as the assertion that catches this, is never evaluated.

What survives: the iOS gate does report `** TEST FAILED **` under either mutation, so "the Swift target would also pass" really is false and **N3 = P2 is the right call**.
What does not survive is the evidence as recorded.
The same conflation is baked into the shipped source comment at `tools/export-parity-fixtures.spec.mjs:18-24` ("hard-code 2720, 62560 and 58, and a degraded export fails them").

**Verified by:** three exporter runs in an isolated `git archive HEAD` tree, and two full `xcodebuild` runs against staged fixtures in the repository (restored afterwards; `git status --porcelain --untracked-files=no` empty, checked between runs).

---

### FF-2 - the N4 measurement does not reproduce, and its correction points the wrong way

**Severity: P2. Introduced by this range** (`4dc4aef`, in `reviews/ARTIFACTS-round2.md` and the ledger's `N4` row).

The artifact records, at 375x700 on `/drill/basic-strategy`, `bannerRect: { top: 580.21875, bottom: 684, height: 103.78125 }`, five action controls, and the conclusion that Hit/Stand/Double "have their top ~17 px covered but their centres remain clickable, so round 1's specific claim about the Hit button is wrong as written".
The ledger carries that forward as `N4 | DEFERRED - reproduces, and round 1's cited example does not.`

I reproduced the method - serve the built bundle, inject the update-ready markup from `src/app/app.ts` into `app-root`, copy the `_ngcontent-*` scope attribute onto the node and every descendant, measure with the real stylesheet - and got different geometry and the opposite conclusion:

```json
{
  "scopeAttr": "_ngcontent-ng-c1058975690",
  "bannerPosition": "fixed",
  "bannerRect": { "top": 538.03125, "bottom": 684, "height": 145.96875 },
  "scroll": { "scrollHeight": 700, "clientHeight": 700 }
}
```

| control   | class                      | top | bottom | element at its centre   | inside `.update`? |
| --------- | -------------------------- | --- | ------ | ----------------------- | ----------------- |
| Hit       | `acts__btn`                | 543 | 597    | `STRONG`                | **yes**           |
| Stand     | `acts__btn`                | 543 | 597    | `STRONG`                | **yes**           |
| Double    | `acts__btn`                | 543 | 597    | `STRONG`                | **yes**           |
| Split     | `acts__btn acts__btn--off` | 605 | 660    | `DIV.update__actions`   | **yes**           |
| Surrender | `acts__btn acts__btn--off` | 605 | 660    | `BUTTON.update__reload` | **yes**           |
| Insurance | `acts__btn`                | 605 | 660    | `BUTTON.update__later`  | **yes**           |

Three differences, all in the same direction - the recorded version understates the defect:

1. **The banner is 145.97 px tall at 375 px, not 103.78.**
   `src/app/app.scss:118` is `@media (max-width: 34rem) { .update { flex-direction: column } }`, so at 375 px the banner stacks its copy over its buttons.
   The recorded 103.78 px requires row layout.
   I swept 375, 390, 500, 545, 560, 600, 700, 768 and 1024 px: column below 545 (145.97 / 128.97 px), row from 545 up (85.97 / 74.78 px).
   No width produced 103.78 px, and the arithmetic says none can - column layout is `90.8 + copyHeight` (needs a 12.98 px copy) and row layout is `30.8 + max(copyHeight, 44)` (needs a 4-line copy, which only happens in a banner too narrow to be in row layout).
   I could not determine what configuration produced the recorded numbers, and I am not asserting they were never observed - only that I cannot reproduce them here.
2. **All six action controls are unreachable at 375x700, not two.**
   `elementFromPoint` at the centre of Hit returns a `STRONG` that `aside.contains()` confirms is inside `.update` - so round 1's claim ("a `SPAN` inside `.update`") reproduces in substance, off only by the tag name, and the range's strike of it is not supported.
   The row layout the artifact appears to have measured is the only geometry in which Hit/Stand/Double stay clickable, and even there Insurance is covered, so "two controls" is wrong at every width I tried.
3. **The page renders six action controls; the artifact's table lists five.**
   Insurance is present, enabled, and covered.
   Round 1's "all six action controls" is the accurate count.

One smaller error in the same paragraph: at the recorded geometry (banner top 580.22, buttons 543-597) it is the **bottom** ~17 px of Hit/Stand/Double that is covered, not the top.

The finding N4 describes is real either way, and P2 may still be the right severity - but the ledger's stated reason for it ("round 1's cited example does not [reproduce]") is a negative claim my run refutes, and the graded evidence behind "it stays P2 rather than rising" is the part that does not hold.

**Verified by:** `node tools/serve-dist.mjs` on port 4399 against a freshly built `dist/`, driven by a Playwright/Chromium script; three separate scripted runs (single measurement, detailed run with `aside.contains()` on every hit, and a nine-width sweep). Read-only - nothing in the repository was modified.

---

### FF-3 - the recorded N5 patch would fail on every run, for a reason unrelated to what it checks

**Severity: P2. Introduced by this range** (`4dc4aef`, in `reviews/ARTIFACTS-round2.md`, section N5).
**Not applied** - I checked it as written, as instructed, and did not apply it.

The patch's second step runs:

```sh
node -e '
  const m = require("./'"$d"'/manifest.webmanifest");
  …
'
```

Node registers loaders for `.js`, `.json` and `.node` only; an unregistered extension falls back to the **JavaScript** loader, so a JSON manifest is parsed as a program and throws.
Run verbatim against the real base-href build:

```console
$ npm run build -- --base-href /blackjack-trainer/     # exit 0
$ bash patch2-step.sh
/Users/arthurzhang/dev/blackjack-trainer/dist/blackjack-trainer/browser/manifest.webmanifest:2
  "name": "Blackjack Trainer",
        ^
SyntaxError: Unexpected token ':'
    at wrapSafe (node:internal/modules/cjs/loader:1763:18)
STEP_EXIT=1
```

The proposed `pages-bundle` job is therefore permanently red and never evaluates the property it exists to check.
`JSON.parse(readFileSync(…, 'utf8'))` is the one-line fix; `import(…, { with: { type: 'json' } })` would not help either, since the assertion is keyed on the same extension.

Everything else in the patch is correct against this tree:

```console
$ grep -q '<base href="/blackjack-trainer/">' dist/blackjack-trainer/browser/index.html; echo $?
0
$ python3 - < dist/blackjack-trainer/browser/manifest.webmanifest
start_url ./
scope ./
icons ['favicon.ico', 'icons/icon-192.png', 'icons/icon-512.png']
```

- so the bundle satisfies the intent, and the check is the only broken part.
  Both the `grep` and the nested `'"$d"'` shell quoting work; `set -e` is redundant under Actions' default `bash -e {0}` but harmless.

**The N1 patch (`pages.yml`), by contrast, is sound.**
I built the patched file in a scratch directory and parsed it (`ruby -ryaml`): 12 steps in the `build` job, valid.
The step order is right - `npm ci`, lint, coverage, anti-drift, browser install, build, E2E, then the base-href build last, so the artifact uploaded by "Assemble the site" is the base-href one.
`- run: npm run build` before the E2E step is redundant now that the dist lane builds for itself (`playwright.config.ts`), but redundant is not wrong.
`needs: build` on the `deploy` job means a gate failure does stop the deploy, which is the point of N1.
I ran every command in the patch locally except `npx playwright install --with-deps chromium` and the Actions-specific plumbing; all exit 0.
I cannot test GitHub-runner behaviour from here and am not claiming it.

**Verified by:** running the recorded shell verbatim against a real `--base-href` build (then rebuilding `dist/` to restore it), and parsing both patched workflow files with a YAML parser.

---

### FF-4 - both recorded patches need re-indenting to be pasted

**Severity: P3, informational. Introduced by this range** (`4dc4aef`).

The `pages.yml` patch is described as "ready to paste" and is printed at column 0; the steps it replaces are indented 6 spaces.
The `ci.yml` job is printed with `pages-bundle:` at column 0; jobs under `jobs:` are indented 2.
Pasted verbatim either breaks the file.
Re-indented, both parse - which is how I checked FF-3.

---

### FF-5 - `ROUND 2 ASSUMPTIONS 4` does not cover a config file the run edited

**Severity: P3, informational. Pre-existing to this range** (introduced at `7ac22db`, carried unchanged).

Assumption 4 enumerates the files treated as editable test configuration: "`playwright.config.ts`, `e2e/**`, `tsconfig.spec.json` and `vitest.config.ts`".
The run also edited `angular.json` - `projects.blackjack-trainer.architect.test.options.include`, at `7ac22db` and again at `b5237b2`.
That is test configuration on any reasonable reading and is nowhere near `.github/workflows/*`, so this is a bookkeeping gap rather than a violated constraint.
Worth closing because the assumption is the run's own record of what it decided it was allowed to touch.

---

### FF-6 - the restored `**/*.test.ts` glob collects files that nothing typechecks

**Severity: P3, informational. Introduced by this range** (`b5237b2`), and a narrower instance of the pre-existing M1.

R2-10 is correct that the builder's `include` had dropped `**/*.test.ts`, and restoring it works (68 files vs 67, measured above).
What the record does not say is that `tsconfig.spec.json` includes only `src/**/*.d.ts` and `src/**/*.spec.ts`, so such a file is collected and executed but never typechecked.
The builder says so out loud:

```console
$ npx ng test    # with an added src/zz-probe.test.ts
▲ [WARNING] File 'src/zz-probe.test.ts' not found in TypeScript compilation. [plugin angular-compiler]
 Test Files  68 passed (68)
```

No such file exists today, so nothing is affected now.
It is the same shape as the gap the range corrected in the two spec headers - a file that runs with the look of typechecking and none of it - and is worth one line beside R2-10.

---

## 5. Claims I re-verified that do hold

Listed because "I checked and it was fine" is evidence too, and because the brief named several of these.

**M2, the gate-5 flake - reproduced, third independent time.**
The ledger records two reproductions (stage 2, stage 3) and one failure to reproduce.
Mine:

```console
$ E2E_SERVER=dist npx playwright test e2e/smoke/showdown.e2e.ts \
    -g "returning to counting keeps the drill going" --repeat-each=30 --workers=4 --retries=0
  1 failed
    [chromium] › e2e/smoke/showdown.e2e.ts:65:7 › post-count showdown › returning to counting keeps the drill going
  29 passed (21.7s)

    Error: expect(locator).toBeHidden() failed
    Locator:  getByRole('region', { name: 'Showdown vs dealer' })
    Expected: hidden
    Received: visible
    Timeout:  5000ms
      14 × locator resolved to <section class="showdown" … aria-label="Showdown vs dealer">…</section>
```

Same assertion, same element, at `showdown.e2e.ts:74` inside the test declared at `:65`.
1 in 30 is consistent with the recorded 2-in-7 full-suite and 4-in-60 isolated rates.
M2 is real, pre-existing, and correctly kept out of this run's scope.

**N7's re-derived non-vacuity proof still holds at the tip** - which mattered to check, because `b5237b2` edits `angular.json`, the file that proof mutates.
Deleting `configurations.production.serviceWorker` and running the dist lane:

```console
MUTANT_EXIT=1
    Error: no service worker took control of the page: the built bundle must ship and register ngsw-worker.js
  2 failed
$ ls dist/blackjack-trainer/browser/ngsw-worker.js
ls: dist/blackjack-trainer/browser/ngsw-worker.js: No such file or directory
```

`angular.json` restored, `dist/` rebuilt, worker back.

**N8's lane rejection** - `E2E_SERVER=dsit npx playwright test …` exits 1 with `Error: E2E_SERVER must be one of 'dist' | 'serve', got 'dsit'. Unset it to take the default ('dist' under CI, otherwise 'serve').`, the exact recorded message.

**The B1 mutation proof** - deleting the `try`/`catch` from `tools/serve-dist.mjs` gives `Tests 5 failed (5)` with `Error: connect ECONNREFUSED 127.0.0.1:59599`, exactly as recorded.

**N2's bundle-contents claim** - reproduces exactly:

```console
$ grep -rn "@angular/forms" src e2e tools            # exit 1, no matches
$ npm ls @angular/forms --omit=dev
└── @angular/forms@22.1.0
$ grep -c NgControl dist/blackjack-trainer/browser/main-*.js
1
$ grep -o 'NgControl[A-Za-z]*' main-*.js | sort | uniq -c
   4 NgControlFlow
$ for t in ReactiveFormsModule FormsModule NgModel FormControlDirective ɵNgNoValidate zod standard-schema ZodError; …
ReactiveFormsModule: files=0 occurrences=0        (…all eight: 0)
```

The single `grep -c` hit is one line, not one occurrence, and all four occurrences on it are `NgControlFlow`.
P3 and the **UNVERIFIED** on whether removal is safe are both honest: with the package still in `node_modules`, no local build can distinguish the two manifests.

**N5's premise** - `grep -rn "base-href" .github e2e src tools playwright.config.ts package.json angular.json` returns exactly one line, `.github/workflows/pages.yml:37`.
Nothing builds or serves the deployed configuration except the job that publishes it.

**N6** - `public/manifest.webmanifest` has keys `name, short_name, description, start_url, scope, display, orientation, background_color, theme_color, icons`; no `id`; `start_url` and `scope` are both `./`, so the "an `id` would now pin the correct identity" reasoning is right.

**D1** - `ios/AppStore/privacy.html:65` and `ios/AppStore/support.html:55` both carry `mailto:CONTACT_EMAIL_HERE`, and `pages.yml:42` copies both into the deployed site.

**I1** - every cited line is what the record says it is: `CloudKeyValueStore.swift:63` is `cloud.synchronize()`, `:66-72` is the adopt-or-`pushToCloud()` branch, `StatsStore.swift:78` is `stats = value`, `StatsStore.swift:63-65` is `persist()` calling `pushToCloud()`, `AppModel.swift:49-78` wires nine stores into `StatsCloudSync`, `PracticeDataSection.swift:16` is the **Reset practice data** button reaching `AppModel.swift:113`, and `LAUNCH-CHECKLIST.md:22` is the D2 answer saying provisioning turns sync on without an app update.
The argument that neither narrow fix is safe follows from those lines.
Whether the race actually fires needs two provisioned devices and Apple's servers; I did not test it and neither did the run, which is what CANNOT ASSESS records.

**M3** - consistent with the configuration: `vitest.config.ts` sets only `reporter: ['text-summary']` and thresholds, `serve-dist.mjs` runs as a subprocess and `export-parity-fixtures.ts` is imported by no test, and the four coverage figures are byte-identical before and after 14 tests landed.
I did not enumerate per-file coverage - the summary reporter emits none - so I confirm the reasoning, not a file list.

**No new user-visible capability, on the whole branch.**
`git diff --stat 0856b7d..HEAD` touches 15 files: five records, `README.md`, `e2e/README.md`, `angular.json`, `playwright.config.ts`, `e2e/fixtures/lane.ts`, `e2e/smoke/offline.e2e.ts`, and the two `tools/*.spec.mjs`.
Nothing under `src/`, `public/`, `ios/` or `.github/`.
`E2E_SERVER` is a pre-existing developer-only variable whose accepted spellings **narrowed** from "anything" to `dist | serve`.
No endpoint, screen, command, flag, table, column or config key is added to the product.
`angular.json` gains a `test.options.include` array, which is a builder option for the unit-test target, not a product config key - the only judgement call in this paragraph, and I record it as one.

---

## 6. What I could not verify

- **Whether the recorded N4 geometry was ever observed.** I can only say it does not reproduce here and that the stylesheet's own media query makes it arithmetically unreachable at any width from 375 to 1024 px. I did not try device emulation with a non-1 device pixel ratio, a real mobile browser, or a non-default font-loading state.
- **Either patch under GitHub Actions.** No runner is available. I checked YAML validity, step order and every shell command that can run locally; I did not check runner-specific behaviour (`--with-deps` privileges, cache keys, `deploy-pages` permissions).
- **The iCloud data-loss path (I1).** Needs two provisioned devices; the entitlement is not provisioned. Only the code path and its cited lines were checked.
- **Per-file coverage for `tools/` (M3).** The configured reporter emits a summary only.
- **The stray `[::1]:4321` listener.** Left alone, as instructed. No gate uses that port.

---

## 7. Repository state

```console
$ git status --porcelain --untracked-files=no
$ git status --porcelain
?? .agents/
?? .codex/
?? reviews/REVIEW-round2-final.md
```

Two scenarios were staged on tracked files and both were reverted: `ios/Fixtures/*.json` (twice, with `git checkout -- ios/Fixtures`) and `angular.json` (once).
`dist/` was rebuilt after the `--base-href` build and after the `serviceWorker` mutation; it now carries `<base href="/">` and `ngsw-worker.js`.
Everything else - exporter cuts, `normalize()` deletion, the `try`/`catch` deletion, the `.test.ts` and `.spec.ts` probes, the `angular.json` include rollback - was done in throwaway `git archive HEAD` trees outside the repository.
No file in the repository was edited except this one.
